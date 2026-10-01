"""Puerta de FASE 5.0 — Pizarrón de cuentas abiertas (contrato 23).

El Plan Maestro §7 (Fase 5) promete un "Pizarrón de Cuentas Abiertas": varias
cuentas en paralelo sobre la misma terminal. La autocrítica del plan de Fase 5
(D-1) detectó que el contrato 23 NO existía: el frontend no tenía forma de
preguntar "¿qué cuentas están abiertas en esta terminal?" sin leer la tabla
`tickets` (prohibido por A-02).

Esta puerta verifica CUATRO cosas (Plan de Abordaje Fase 5 §4.0.3):

  ✓ test_contrato_23_declarado
      El contrato 23 existe en el registro, con su firma y su operación.

  ✓ test_lista_solo_las_cuentas_open_de_la_terminal  (positivo)
      Devuelve SOLO las cuentas OPEN de la terminal pedida, y NO las de otra
      terminal ni las ya cobradas (RN-31).

  ✓ test_respuesta_ligera_campos_escalares  (Regla 15)
      Cada cuenta expone una PROYECCIÓN de campos escalares explícitos (nunca
      las líneas ni un `SELECT *`). FASE 5.0: 5 campos. FASE 12.6 amplió la
      proyección a 12 campos para la paridad de presentación con el viejo POS
      (terminal, capturista, cliente, teléfono, tipo de pedido, hora).

  ✓ test_terminal_id_vacio_es_400  (negativo)
      Un `terminal_id` vacío responde 400, no una lista silenciosa.

La evidencia es la RESPUESTA HTTP real contra la app FastAPI montada sobre
PostgreSQL, más una lectura directa de la BD para confirmar el filtro.

Aislamiento de event loop: cada test crea su PROPIO engine async (ligado al
loop de ese test) y sobreescribe la dependencia `get_db` de FastAPI, igual
que las puertas de FASE 3.2 y FASE 4.0.
"""

from __future__ import annotations

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

TERMINAL_A = "TEST-F50-A"
TERMINAL_B = "TEST-F50-B"


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
    """Borra los datos de prueba de AMBAS terminales.

    El orden importa: primero los ítems (referencian el ticket), luego los
    tickets, luego las sesiones de terminal y al final los productos.
    """
    terminales = (TERMINAL_A, TERMINAL_B)
    async with ent.Session() as db:
        await db.execute(
            delete(TicketItem).where(
                TicketItem.ticket_id.in_(
                    select(Ticket.id).where(Ticket.terminal_id.in_(terminales))
                )
            )
        )
        await db.execute(delete(Ticket).where(Ticket.terminal_id.in_(terminales)))
        await db.execute(
            delete(TerminalSession).where(TerminalSession.terminal_id.in_(terminales))
        )
        await db.execute(delete(Product).where(Product.sku.like("TEST-F50-%")))
        await db.commit()


async def _sembrar(ent: _Entorno) -> uuid.UUID:
    """Crea una sesión de terminal activa y un producto. Devuelve el id."""
    async with ent.Session() as db:
        sesion = TerminalSession(terminal_id=TERMINAL_A, is_active=True)
        producto = Product(
            sku=f"TEST-F50-{uuid.uuid4().hex[:8]}",
            name="Producto F5.0",
            price=Decimal("10.00"),
            cost=Decimal("5.00"),
            active=True,
        )
        db.add_all([sesion, producto])
        await db.commit()
        return producto.id


async def _crear_ticket(ent: _Entorno, terminal_id: str) -> uuid.UUID:
    """Inserta un ticket OPEN directamente en la BD. Devuelve su id.

    Se inserta directo (no vía HTTP) para poder sembrar cuentas de DOS
    terminales distintas sin depender de dos sesiones de terminal activas.

    `account_num` es NOT NULL en el esquema (es el folio, RN-10): hay que
    dárselo explícitamente al insertar por fuera del contrato 3.
    """
    async with ent.Session() as db:
        ticket = Ticket(
            terminal_id=terminal_id,
            account_num=f"F50-{uuid.uuid4().hex[:8]}",
            channel="PANADERIA",
            status="OPEN",
            total=Decimal("10.00"),
        )
        db.add(ticket)
        await db.commit()
        return ticket.id


def _cliente() -> httpx.AsyncClient:
    """Cliente HTTP async contra la app ASGI (sin red real)."""
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


# ---------------------------------------------------------------------------
# Criterio 1 — el contrato 23 está declarado
# ---------------------------------------------------------------------------

def test_contrato_23_declarado():
    """El contrato 23 existe, con su firma y su operación HTTP (A-02)."""
    contrato = next((c for c in CONTRATOS if c.numero == 23), None)
    assert contrato is not None, "El contrato 23 no está declarado"
    assert contrato.nombre == "pos.cuentas_abiertas"
    assert contrato.operacion == "GET /pos/open-accounts"
    assert contrato.consumidor == "POS"
    assert contrato.proveedor == "POS"
    assert contrato.entrada, "El contrato 23 no declara entrada"
    assert contrato.salida, "El contrato 23 no declara salida"


# ---------------------------------------------------------------------------
# Criterio 2 — solo las cuentas OPEN de la terminal pedida (RN-31)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_lista_solo_las_cuentas_open_de_la_terminal(entorno):
    """Devuelve SOLO las cuentas OPEN de la terminal pedida (RN-31)."""
    ent: _Entorno = entorno
    await _limpiar(ent)
    try:
        await _sembrar(ent)
        # Dos cuentas OPEN en la terminal A, una en la terminal B.
        id_a1 = await _crear_ticket(ent, TERMINAL_A)
        id_a2 = await _crear_ticket(ent, TERMINAL_A)
        await _crear_ticket(ent, TERMINAL_B)

        async with _cliente() as cliente:
            res = await cliente.get(
                "/pos/open-accounts", params={"terminal_id": TERMINAL_A}
            )
        assert res.status_code == 200, res.text
        cuerpo = res.json()
        ids = {c["id"] for c in cuerpo["cuentas"]}

        assert ids == {str(id_a1), str(id_a2)}, (
            f"Se esperaban solo las cuentas de {TERMINAL_A}: {ids}"
        )
    finally:
        await _limpiar(ent)


@pytest.mark.asyncio
async def test_no_devuelve_cuentas_cobradas(entorno):
    """Una cuenta PAID no aparece en el pizarrón (solo status OPEN)."""
    ent: _Entorno = entorno
    await _limpiar(ent)
    try:
        await _sembrar(ent)
        id_open = await _crear_ticket(ent, TERMINAL_A)
        id_paid = await _crear_ticket(ent, TERMINAL_A)

        # Marcamos una como PAID directamente en la BD.
        async with ent.Session() as db:
            ticket = await db.get(Ticket, id_paid)
            ticket.status = "PAID"
            await db.commit()

        async with _cliente() as cliente:
            res = await cliente.get(
                "/pos/open-accounts", params={"terminal_id": TERMINAL_A}
            )
        assert res.status_code == 200, res.text
        ids = {c["id"] for c in res.json()["cuentas"]}

        assert str(id_open) in ids, "La cuenta OPEN debe aparecer"
        assert str(id_paid) not in ids, "La cuenta PAID NO debe aparecer"
    finally:
        await _limpiar(ent)


# ---------------------------------------------------------------------------
# Criterio 3 — respuesta ligera: proyección de campos escalares (Regla 15)
# ---------------------------------------------------------------------------

# FASE 5.0: la proyección eran 5 campos. FASE 12.6 la amplió a 12 para la
# paridad de presentación con el viejo POS (corcho + post-it con terminal,
# capturista, cliente, teléfono, tipo de pedido y hora). Regla 15 NO exige
# "5 campos para siempre": exige una PROYECCIÓN de campos escalares explícitos
# — nunca las líneas, nunca un `SELECT *` (frontera A-02 / O-23).
CAMPOS_ESPERADOS = {
    "id",
    "account_num",
    "status",
    "total",
    "version",
    "terminal_id",
    "captured_by_name",
    "customer_name",
    "customer_phone",
    "order_type",
    "delivery_type",
    "created_at",
}


@pytest.mark.asyncio
async def test_respuesta_ligera_campos_escalares(entorno):
    """Cada cuenta expone la proyección de campos escalares explícitos (Regla 15).

    FASE 12.6: la proyección es de 12 campos (paridad de presentación con el
    viejo POS). Lo que la Regla 15 prohíbe sigue prohibido: NO se exponen las
    líneas del ticket (eso es del contrato 21) ni un volcado de la tabla.
    """
    ent: _Entorno = entorno
    await _limpiar(ent)
    try:
        await _sembrar(ent)
        await _crear_ticket(ent, TERMINAL_A)

        async with _cliente() as cliente:
            res = await cliente.get(
                "/pos/open-accounts", params={"terminal_id": TERMINAL_A}
            )
        assert res.status_code == 200, res.text
        cuentas = res.json()["cuentas"]
        assert len(cuentas) == 1, "Se esperaba exactamente una cuenta"

        campos = set(cuentas[0].keys())
        assert campos == CAMPOS_ESPERADOS, (
            f"La respuesta ligera debe exponer la proyección de F12.6 "
            f"({len(CAMPOS_ESPERADOS)} campos), tiene: {campos}"
        )
        # NO debe exponer las líneas (eso es del contrato 21).
        assert "items" not in campos
        assert "lineas" not in campos
    finally:
        await _limpiar(ent)


# ---------------------------------------------------------------------------
# Criterio 4 — terminal_id vacío es 400 (negativo)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_terminal_id_vacio_es_rechazado(entorno):
    """Un `terminal_id` vacío es rechazado, no devuelve una lista silenciosa.

    FastAPI valida `Query(..., min_length=1)` ANTES de entrar al cuerpo del
    handler, así que la respuesta es 422 (error de validación estándar), no
    400. Lo importante es que NO devuelva 200 con una lista vacía: un
    `terminal_id` vacío jamás debe confundirse con "esta terminal no tiene
    cuentas".
    """
    ent: _Entorno = entorno
    await _limpiar(ent)
    try:
        async with _cliente() as cliente:
            res = await cliente.get("/pos/open-accounts", params={"terminal_id": ""})
        assert res.status_code == 422, res.text
    finally:
        await _limpiar(ent)


@pytest.mark.asyncio
async def test_terminal_sin_cuentas_devuelve_lista_vacia(entorno):
    """Una terminal sin cuentas abiertas devuelve una lista vacía, no 404."""
    ent: _Entorno = entorno
    await _limpiar(ent)
    try:
        async with _cliente() as cliente:
            res = await cliente.get(
                "/pos/open-accounts", params={"terminal_id": "TEST-F50-VACIA"}
            )
        assert res.status_code == 200, res.text
        assert res.json()["cuentas"] == []
    finally:
        await _limpiar(ent)
