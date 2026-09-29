"""Puerta de FASE 3.2 — Backend atómico (contratos 18–22).

Verifica los 6 criterios de la puerta (Plan de Abordaje §4 FASE 3.2):

  ✓ test_contratos_18_a_22_declarados         (frontera A-02)
  ✓ test_idempotencia_item_no_duplica         (2× POST = mismo estado)
  ✓ test_concurrencia_optimista_409           (version obsoleto → 409)
  ✓ test_respuesta_ligera_max_5_campos        (≤5 campos escalares)
  ✓ test_verificacion_post_envio              (el ticket existe en BD)
  ✓ test_anti_degradacion_rechaza_50pct       (RN-37)

La evidencia es la RESPUESTA HTTP real contra la app FastAPI montada sobre
PostgreSQL, no la intención. Se siembra un producto y una sesión de terminal,
se ejercitan los 5 endpoints atómicos y se limpia al terminar.

Aislamiento de event loop: cada test crea su PROPIO engine async (ligado al
loop de ese test) y sobreescribe la dependencia `get_db` de FastAPI. Así se
evita el error "Future attached to a different loop" que aparece cuando un
engine module-level se reutiliza entre loops distintos.

Regla A-02: ningún endpoint existe sin contrato. El primer test lo afirma.
"""

from __future__ import annotations

import os
import uuid
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from contracts import CONTRATOS
from core.database import DATABASE_URL, get_db
from main import app
from models import Product, TerminalSession, Ticket, TicketItem

# Los 5 contratos atómicos de la FASE 3.2.
CONTRATOS_ATOMICOS = {
    18: "pos.añadir_item",
    19: "pos.cambiar_cantidad",
    20: "pos.quitar_item",
    21: "pos.leer_ticket",
    22: "pos.verificar_envio",
}

TERMINAL_ID = "TEST-F32"


# ---------------------------------------------------------------------------
# Aislamiento por test: engine propio ligado al loop del test
# ---------------------------------------------------------------------------

class _Entorno:
    """Engine + fábrica de sesiones ligados al loop del test en curso."""

    def __init__(self) -> None:
        self.engine = create_async_engine(DATABASE_URL, pool_pre_ping=True, future=True)
        self.Session = async_sessionmaker(
            bind=self.engine, class_=AsyncSession, expire_on_commit=False
        )

    async def cerrar(self) -> None:
        await self.engine.dispose()


@pytest.fixture
async def entorno():
    """Engine por test + override de `get_db` para que la app use ese engine."""
    ent = _Entorno()

    async def _get_db_override() -> AsyncSession:
        async with ent.Session() as session:
            yield session

    app.dependency_overrides[get_db] = _get_db_override
    try:
        yield ent
    finally:
        app.dependency_overrides.pop(get_db, None)
        await ent.cerrar()


# ---------------------------------------------------------------------------
# Utilidades de siembra y limpieza (usan el engine del test)
# ---------------------------------------------------------------------------

async def _limpiar(ent: _Entorno) -> None:
    """Borra los datos de prueba (tickets, ítems, sesión y producto)."""
    async with ent.Session() as db:
        await db.execute(
            delete(TicketItem).where(
                TicketItem.ticket_id.in_(select(Ticket.id).where(Ticket.terminal_id == TERMINAL_ID))
            )
        )
        await db.execute(delete(Ticket).where(Ticket.terminal_id == TERMINAL_ID))
        await db.execute(
            delete(TerminalSession).where(TerminalSession.terminal_id == TERMINAL_ID)
        )
        await db.execute(delete(Product).where(Product.sku.like("TEST-F32-%")))
        await db.commit()


async def _sembrar(ent: _Entorno) -> tuple[uuid.UUID, uuid.UUID]:
    """Crea una sesión de terminal activa y 2 productos. Devuelve sus ids."""
    async with ent.Session() as db:
        sesion = TerminalSession(terminal_id=TERMINAL_ID, is_active=True)
        p1 = Product(
            sku=f"TEST-F32-{uuid.uuid4().hex[:8]}",
            name="Producto F3.2 A",
            price=Decimal("10.00"),
            cost=Decimal("5.00"),
            active=True,
        )
        p2 = Product(
            sku=f"TEST-F32-{uuid.uuid4().hex[:8]}",
            name="Producto F3.2 B",
            price=Decimal("20.00"),
            cost=Decimal("8.00"),
            active=True,
        )
        db.add_all([sesion, p1, p2])
        await db.commit()
        return p1.id, p2.id


def _cliente() -> httpx.AsyncClient:
    """Cliente HTTP async contra la app ASGI (sin red real)."""
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


async def _crear_ticket(cliente: httpx.AsyncClient, product_id: uuid.UUID) -> dict:
    """Crea un ticket OPEN con una línea vía el contrato 3."""
    res = await cliente.post(
        "/pos/tickets",
        json={
            "terminal_id": TERMINAL_ID,
            "channel": "PANADERIA",
            "items": [{"product_id": str(product_id), "quantity": 1}],
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


# ---------------------------------------------------------------------------
# Criterio 1 — Frontera A-02: los contratos 18–22 están declarados
# ---------------------------------------------------------------------------

def test_contratos_18_a_22_declarados():
    """Ningún endpoint atómico existe sin contrato (regla A-02)."""
    por_numero = {c.numero: c for c in CONTRATOS}
    for numero, nombre in CONTRATOS_ATOMICOS.items():
        assert numero in por_numero, f"Falta el contrato #{numero} ({nombre})"
        assert por_numero[numero].nombre == nombre, (
            f"El contrato #{numero} se llama '{por_numero[numero].nombre}', no '{nombre}'"
        )
        # Un contrato es una OPERACIÓN, no una tabla (O-23).
        assert por_numero[numero].tabla_expuesta is None
        assert por_numero[numero].operacion.startswith(
            ("GET ", "POST ", "PATCH ", "DELETE ")
        ), f"El contrato #{numero} no declara una operación HTTP"


# ---------------------------------------------------------------------------
# Criterio 2 — Idempotencia por `item_id`
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_idempotencia_item_no_duplica(entorno):
    """2× POST del mismo `item_id` deja el ticket en el MISMO estado."""
    await _limpiar(entorno)
    p1, _ = await _sembrar(entorno)
    try:
        async with _cliente() as cliente:
            ticket = await _crear_ticket(cliente, p1)
            ticket_id = ticket["id"]
            version = ticket["version"]

            cuerpo = {
                "item_id": "linea-1",
                "product_id": str(p1),
                "quantity": 1,
                "version": version,
            }
            # Primer POST: añade la línea.
            r1 = await cliente.post(f"/pos/tickets/{ticket_id}/items", json=cuerpo)
            assert r1.status_code == 200, r1.text
            estado1 = r1.json()

            # Segundo POST con el MISMO item_id y el version NUEVO: idempotente.
            cuerpo2 = dict(cuerpo, version=estado1["version"])
            r2 = await cliente.post(f"/pos/tickets/{ticket_id}/items", json=cuerpo2)
            assert r2.status_code == 200, r2.text
            estado2 = r2.json()

            # El número de líneas NO creció (no se duplicó).
            assert len(estado2["lineas"]) == len(estado1["lineas"]), (
                "El POST idempotente duplicó la línea"
            )
            # El total tampoco cambió.
            assert Decimal(str(estado2["total"])) == Decimal(str(estado1["total"]))
    finally:
        await _limpiar(entorno)


# ---------------------------------------------------------------------------
# Criterio 3 — Concurrencia optimista (version obsoleto → 409)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_concurrencia_optimista_409(entorno):
    """Un `version` obsoleto responde 409 y NO escribe (RN-25/RN-26)."""
    await _limpiar(entorno)
    p1, _ = await _sembrar(entorno)
    try:
        async with _cliente() as cliente:
            ticket = await _crear_ticket(cliente, p1)
            ticket_id = ticket["id"]

            # Escritura con un version que no existe (obsoleto).
            res = await cliente.patch(
                f"/pos/tickets/{ticket_id}/items/{p1}",
                json={"quantity": 5, "version": 999},
            )
            assert res.status_code == 409, (
                f"Se esperaba 409 por version obsoleto, llegó {res.status_code}: {res.text}"
            )
    finally:
        await _limpiar(entorno)


# ---------------------------------------------------------------------------
# Criterio 4 — Respuesta ligera (≤5 campos escalares)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_respuesta_ligera_max_5_campos(entorno):
    """`GET /pos/tickets/{id}` devuelve EXACTAMENTE 5 campos escalares (Regla 15)."""
    await _limpiar(entorno)
    p1, _ = await _sembrar(entorno)
    try:
        async with _cliente() as cliente:
            ticket = await _crear_ticket(cliente, p1)
            res = await cliente.get(f"/pos/tickets/{ticket['id']}")
            assert res.status_code == 200, res.text
            cuerpo = res.json()

            assert len(cuerpo) <= 5, f"La respuesta ligera tiene {len(cuerpo)} campos: {cuerpo}"
            assert set(cuerpo) == {"id", "account_num", "status", "total", "version"}
            # Ningún campo es una lista (no devuelve las líneas).
            for valor in cuerpo.values():
                assert not isinstance(valor, (list, dict)), (
                    f"La respuesta ligera incluye una estructura: {valor!r}"
                )
    finally:
        await _limpiar(entorno)


# ---------------------------------------------------------------------------
# Criterio 5 — Verificación post-envío (el ticket existe en BD)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_verificacion_post_envio(entorno):
    """`POST /verify` confirma en BD que el ticket y sus ítems existen (v6.1 $453)."""
    await _limpiar(entorno)
    p1, _ = await _sembrar(entorno)
    try:
        async with _cliente() as cliente:
            ticket = await _crear_ticket(cliente, p1)
            ticket_id = ticket["id"]

            # El cliente cree haber enviado la línea p1 y una fantasma.
            res = await cliente.post(
                f"/pos/tickets/{ticket_id}/verify",
                json={"item_ids": [str(p1), "fantasma-999"]},
            )
            assert res.status_code == 200, res.text
            cuerpo = res.json()

            assert cuerpo["existe"] is True
            assert str(p1) in cuerpo["item_ids_persistidos"]
            assert "fantasma-999" in cuerpo["faltantes"], (
                "La verificación no detectó el ítem fantasma"
            )
    finally:
        await _limpiar(entorno)


# ---------------------------------------------------------------------------
# Criterio 6 — Anti-degradación (RN-37)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_anti_degradacion_rechaza_50pct(entorno):
    """Quitar una línea cuando solo hay 1 reduce el 100% → 400 (RN-37)."""
    await _limpiar(entorno)
    p1, _ = await _sembrar(entorno)
    try:
        async with _cliente() as cliente:
            ticket = await _crear_ticket(cliente, p1)
            ticket_id = ticket["id"]

            # Con 1 sola línea, quitarla reduce el 100% (> 50%) → rechazo.
            res = await cliente.request(
                "DELETE",
                f"/pos/tickets/{ticket_id}/items/{p1}",
                json={"version": ticket["version"]},
            )
            assert res.status_code == 400, (
                f"Se esperaba 400 por anti-degradación, llegó {res.status_code}: {res.text}"
            )
            assert "RN-37" in res.text or "degradaci" in res.text.lower()
    finally:
        await _limpiar(entorno)
