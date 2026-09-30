"""Puerta de FASE 7.7 — Router de terminales (el hueco de la Fase 1).

La Fase 1 (Selector de Terminales) se construyó SOLO en el frontend: existían
el modelo `TerminalLock`, las reglas RN-03..RN-07 y el hook `useTerminals`,
pero nunca se escribió la puerta HTTP. El selector recibía 404 en cada llamada
y ninguna terminal abría. Esta puerta blinda el router que cierra ese hueco.

Cubre DOS contratos que conviven:

  Fase 1 — `terminalService.js` (el selector / landing):
    GET  /pos/terminals/status
    POST /pos/terminals/lock      (body: terminal_id, user_id)
    POST /pos/terminals/unlock    (body: terminal_id, user_id)
    GET  /pos/terminals/config
    POST /pos/terminals/config    (body: terminals)

  Fase 3.4 — `client.js` (heartbeat OMEGA, dentro del POS):
    POST /pos/terminals/{id}/lock       (body: usuario_id)
    POST /pos/terminals/{id}/unlock     (body: usuario_id)
    POST /pos/terminals/{id}/heartbeat  (body: usuario_id)

Reglas verificadas: RN-03 (exclusivo), RN-04 (TTL), RN-05 (solo el dueño),
RN-06 (admin fuerza), RN-07 (heartbeat renueva).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.database import DATABASE_URL, get_db
from main import app
from models import TerminalLock

# ---------------------------------------------------------------------------
# Entorno de prueba (mismo patrón que las puertas F4/F5).
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


async def _limpiar(ent: _Entorno) -> None:
    """Borra todos los candados de prueba (deja la tabla limpia)."""
    async with ent.Session() as db:
        await db.execute(delete(TerminalLock))
        await db.commit()


async def _sembrar_candado(
    ent: _Entorno,
    terminal_id: str,
    usuario_id: str,
    *,
    edad_minutos: int = 0,
) -> uuid.UUID:
    """Inserta un candado directamente en la BD. Devuelve el occupier_id.

    `edad_minutos` permite simular un candado vencido (RN-04).
    """
    occupier = uuid.uuid5(uuid.NAMESPACE_URL, f"pos-usuario:{usuario_id}")
    instante = datetime.now(timezone.utc) - timedelta(minutes=edad_minutos)
    async with ent.Session() as db:
        db.add(
            TerminalLock(
                terminal_id=terminal_id,
                occupier_id=occupier,
                occupier_name=str(usuario_id),
                locked_at=instante,
            )
        )
        await db.commit()
    return occupier


def _cliente() -> httpx.AsyncClient:
    """Cliente HTTP en proceso (ASGI), sin red real."""
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    )


# ---------------------------------------------------------------------------
# Criterio 1 — El router existe y responde (el hueco de la Fase 1).
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_criterio1_status_responde_200(entorno):
    """`GET /pos/terminals/status` responde 200 (antes: 404)."""
    await _limpiar(entorno)
    async with _cliente() as cliente:
        r = await cliente.get("/pos/terminals/status")
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), dict)


@pytest.mark.asyncio
async def test_criterio1_config_responde_200(entorno):
    """`GET /pos/terminals/config` responde 200 con la lista de terminales."""
    await _limpiar(entorno)
    async with _cliente() as cliente:
        r = await cliente.get("/pos/terminals/config")
    assert r.status_code == 200, r.text
    datos = r.json()
    assert isinstance(datos, list) and datos
    assert {"id", "name", "icon"} <= set(datos[0].keys())


# ---------------------------------------------------------------------------
# Criterio 2 — El status proyecta el mapa de ocupación que consume el frontend.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_criterio2_status_libre_tiene_occupier_none(entorno):
    """Una terminal sin candado aparece libre (occupier_id = None)."""
    await _limpiar(entorno)
    async with _cliente() as cliente:
        r = await cliente.get("/pos/terminals/status")
    estado = r.json()
    assert "T1" in estado
    assert estado["T1"]["occupier_id"] is None
    assert estado["T1"]["stale_session"] is False


@pytest.mark.asyncio
async def test_criterio2_status_ocupada_expone_occupier(entorno):
    """Una terminal con candado vigente expone occupier_id y locked_at."""
    await _limpiar(entorno)
    await _sembrar_candado(entorno, "T2", "7")
    async with _cliente() as cliente:
        r = await cliente.get("/pos/terminals/status")
    estado = r.json()
    assert estado["T2"]["occupier_id"] is not None
    assert estado["T2"]["occupier_name"] == "7"
    assert estado["T2"]["locked_at"] is not None


@pytest.mark.asyncio
async def test_criterio2_status_expone_occupier_ref_original(entorno):
    """El status expone `occupier_ref` con el id ORIGINAL del usuario.

    Regresión del bloqueo de entrada: el frontend identifica al usuario con su
    id original (`1`, `cajero-1`), no con el UUID derivado. Si el status solo
    expone el UUID, el dueño no se reconoce a sí mismo y su propia terminal se
    pinta como "ocupada por otro" — impidiendo entrar.
    """
    await _limpiar(entorno)
    await _sembrar_candado(entorno, "T3", "1")
    async with _cliente() as cliente:
        r = await cliente.get("/pos/terminals/status")
    estado = r.json()
    # El UUID canónico sigue presente (C-01)...
    assert estado["T3"]["occupier_id"] != "1"
    # ...pero además se expone el id original para que el frontend compare.
    assert estado["T3"]["occupier_ref"] == "1"


@pytest.mark.asyncio
async def test_criterio2_occupier_ref_es_none_si_libre(entorno):
    """Una terminal libre expone `occupier_ref` en None (no un UUID fantasma)."""
    await _limpiar(entorno)
    async with _cliente() as cliente:
        r = await cliente.get("/pos/terminals/status")
    estado = r.json()
    assert estado["T1"]["occupier_ref"] is None


@pytest.mark.asyncio
async def test_criterio2_occupier_ref_sobrevive_al_lock(entorno):
    """Tras un lock real, `occupier_ref` devuelve el id que envió el cliente."""
    await _limpiar(entorno)
    async with _cliente() as cliente:
        await cliente.post(
            "/pos/terminals/lock", json={"terminal_id": "T4", "user_id": "1"}
        )
        r = await cliente.get("/pos/terminals/status")
    estado = r.json()
    assert estado["T4"]["occupier_ref"] == "1"
    assert estado["T4"]["occupier_id"] != "1"


# ---------------------------------------------------------------------------
# Criterio 3 — RN-03: el candado es exclusivo (409 si está ocupada).
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_criterio3_lock_ocupada_por_otro_da_409(entorno):
    """Tomar una terminal ocupada por otro responde 409 (RN-03)."""
    await _limpiar(entorno)
    await _sembrar_candado(entorno, "T1", "7")
    async with _cliente() as cliente:
        r = await cliente.post(
            "/pos/terminals/lock", json={"terminal_id": "T1", "user_id": "9"}
        )
    assert r.status_code == 409, r.text
    assert r.json().get("regla") == "RN-03"


@pytest.mark.asyncio
async def test_criterio3_lock_libre_da_200(entorno):
    """Tomar una terminal libre responde 200 y crea el candado."""
    await _limpiar(entorno)
    async with _cliente() as cliente:
        r = await cliente.post(
            "/pos/terminals/lock", json={"terminal_id": "T3", "user_id": "7"}
        )
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True
    async with _cliente() as cliente:
        estado = (await cliente.get("/pos/terminals/status")).json()
    assert estado["T3"]["occupier_name"] == "7"


# ---------------------------------------------------------------------------
# Criterio 4 — RN-04: el candado vence por TTL y la terminal vuelve a estar libre.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_criterio4_candado_vencido_se_reporta_libre(entorno):
    """Un candado más viejo que el TTL se reporta como libre (RN-04)."""
    await _limpiar(entorno)
    await _sembrar_candado(entorno, "T4", "7", edad_minutos=60)
    async with _cliente() as cliente:
        estado = (await cliente.get("/pos/terminals/status")).json()
    assert estado["T4"]["occupier_id"] is None


@pytest.mark.asyncio
async def test_criterio4_candado_vencido_lo_toma_otro(entorno):
    """Un candado vencido puede ser tomado por otro usuario (RN-04)."""
    await _limpiar(entorno)
    await _sembrar_candado(entorno, "T5", "7", edad_minutos=60)
    async with _cliente() as cliente:
        r = await cliente.post(
            "/pos/terminals/lock", json={"terminal_id": "T5", "user_id": "9"}
        )
    assert r.status_code == 200, r.text
    async with _cliente() as cliente:
        estado = (await cliente.get("/pos/terminals/status")).json()
    assert estado["T5"]["occupier_name"] == "9"


# ---------------------------------------------------------------------------
# Criterio 5 — RN-05 / RN-06: solo el dueño libera; un admin puede forzar.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_criterio5_no_dueno_no_libera_403(entorno):
    """Un usuario que no es dueño no puede liberar (RN-05, 403)."""
    await _limpiar(entorno)
    await _sembrar_candado(entorno, "T1", "7")
    async with _cliente() as cliente:
        r = await cliente.post(
            "/pos/terminals/unlock", json={"terminal_id": "T1", "user_id": "9"}
        )
    assert r.status_code == 403, r.text
    assert r.json().get("regla") == "RN-05"


@pytest.mark.asyncio
async def test_criterio5_dueno_libera_200(entorno):
    """El dueño del candado lo libera con 200 (RN-05)."""
    await _limpiar(entorno)
    await _sembrar_candado(entorno, "T1", "7")
    async with _cliente() as cliente:
        r = await cliente.post(
            "/pos/terminals/unlock", json={"terminal_id": "T1", "user_id": "7"}
        )
    assert r.status_code == 200, r.text
    async with _cliente() as cliente:
        estado = (await cliente.get("/pos/terminals/status")).json()
    assert estado["T1"]["occupier_id"] is None


@pytest.mark.asyncio
async def test_criterio5_admin_fuerza_desbloqueo(entorno):
    """Un administrador puede forzar el desbloqueo (RN-06)."""
    await _limpiar(entorno)
    await _sembrar_candado(entorno, "T1", "7")
    async with _cliente() as cliente:
        r = await cliente.post(
            "/pos/terminals/unlock", json={"terminal_id": "T1", "user_id": "admin1"}
        )
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Criterio 6 — RN-07: el heartbeat renueva el TTL del dueño.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_criterio6_heartbeat_del_dueno_renueva(entorno):
    """El dueño renueva su candado con el heartbeat (RN-07, 200)."""
    await _limpiar(entorno)
    await _sembrar_candado(entorno, "T1", "7", edad_minutos=10)
    async with _cliente() as cliente:
        r = await cliente.post(
            "/pos/terminals/T1/heartbeat", json={"usuario_id": "7"}
        )
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True


@pytest.mark.asyncio
async def test_criterio6_heartbeat_ajeno_da_409(entorno):
    """El latido de un usuario que no es dueño no resucita el candado (RN-07)."""
    await _limpiar(entorno)
    await _sembrar_candado(entorno, "T1", "7")
    async with _cliente() as cliente:
        r = await cliente.post(
            "/pos/terminals/T1/heartbeat", json={"usuario_id": "9"}
        )
    assert r.status_code == 409, r.text
    assert r.json().get("regla") == "RN-07"


@pytest.mark.asyncio
async def test_criterio6_heartbeat_sin_candado_da_409(entorno):
    """El latido sobre una terminal sin candado responde 409 (RN-07)."""
    await _limpiar(entorno)
    async with _cliente() as cliente:
        r = await cliente.post(
            "/pos/terminals/T6/heartbeat", json={"usuario_id": "7"}
        )
    assert r.status_code == 409, r.text


# ---------------------------------------------------------------------------
# Criterio 7 — El contrato de la Fase 3.4 (por id) convive con el de la Fase 1.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_criterio7_lock_por_id_equivale_al_de_fase1(entorno):
    """`POST /{id}/lock` (Fase 3.4) crea el mismo candado que el de Fase 1."""
    await _limpiar(entorno)
    async with _cliente() as cliente:
        r = await cliente.post("/pos/terminals/T2/lock", json={"usuario_id": "7"})
    assert r.status_code == 200, r.text
    async with _cliente() as cliente:
        estado = (await cliente.get("/pos/terminals/status")).json()
    assert estado["T2"]["occupier_name"] == "7"


@pytest.mark.asyncio
async def test_criterio7_unlock_por_id_libera(entorno):
    """`POST /{id}/unlock` (Fase 3.4) libera el candado del dueño."""
    await _limpiar(entorno)
    await _sembrar_candado(entorno, "T2", "7")
    async with _cliente() as cliente:
        r = await cliente.post("/pos/terminals/T2/unlock", json={"usuario_id": "7"})
    assert r.status_code == 200, r.text
    async with _cliente() as cliente:
        estado = (await cliente.get("/pos/terminals/status")).json()
    assert estado["T2"]["occupier_id"] is None


# ---------------------------------------------------------------------------
# Criterio 8 — La configuración se guarda y se relee.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_criterio8_guardar_y_releer_config(entorno):
    """`POST /config` persiste y `GET /config` devuelve lo guardado."""
    await _limpiar(entorno)
    nuevas = [
        {"id": "C1", "name": "Caja 1", "icon": "🧁"},
        {"id": "C2", "name": "Caja 2", "icon": "🍰"},
    ]
    async with _cliente() as cliente:
        r = await cliente.post("/pos/terminals/config", json={"terminals": nuevas})
        assert r.status_code == 200, r.text
        leidas = (await cliente.get("/pos/terminals/config")).json()
    assert [t["id"] for t in leidas] == ["C1", "C2"]
    # Restaurar la configuración por defecto para no contaminar otros tests.
    async with _cliente() as cliente:
        await cliente.post(
            "/pos/terminals/config",
            json={
                "terminals": [
                    {"id": f"T{n}", "name": f"Terminal {n}", "icon": "🖥️"}
                    for n in range(1, 7)
                ]
            },
        )


# ---------------------------------------------------------------------------
# Criterio 9 — Entradas inválidas se rechazan (422), no fallan en silencio.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_criterio9_terminal_id_vacio_es_rechazado(entorno):
    """Un `terminal_id` vacío es rechazado con 422 (no crea un candado fantasma)."""
    await _limpiar(entorno)
    async with _cliente() as cliente:
        r = await cliente.post(
            "/pos/terminals/lock", json={"terminal_id": "", "user_id": "7"}
        )
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_criterio9_usuario_id_vacio_es_rechazado(entorno):
    """Un `usuario_id` vacío es rechazado con 422."""
    await _limpiar(entorno)
    async with _cliente() as cliente:
        r = await cliente.post("/pos/terminals/T1/lock", json={"usuario_id": ""})
    assert r.status_code == 422, r.text
