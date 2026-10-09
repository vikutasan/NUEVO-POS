"""Router de terminales — FASE 1 (Selector de Terminales) + FASE 3.4 (OMEGA).

Este router FALTABA. La Fase 1 se construyó solo en el frontend: existían el
modelo `TerminalLock`, las reglas RN-03..RN-07 y el hook `useTerminals`, pero
nunca se escribió la puerta HTTP que los materializa. Resultado: el selector de
terminales recibía 404 en cada llamada y ninguna terminal abría.

Materializa DOS contratos del frontend, que conviven:

  Fase 1 — `terminalService.js` (el selector / landing):
    GET  /pos/terminals/status          → mapa de ocupación de todas las terminales
    POST /pos/terminals/lock            → tomar el candado (body: terminal_id, user_id)
    POST /pos/terminals/unlock          → liberar el candado (body: terminal_id, user_id)
    GET  /pos/terminals/config          → configuración (lista + iconos)
    POST /pos/terminals/config          → guardar configuración

  Fase 3.4 — `client.js` (heartbeat OMEGA, ya dentro del POS):
    POST /pos/terminals/{id}/heartbeat  → renovar el TTL del candado del dueño
    POST /pos/terminals/{id}/lock       → tomar el candado (body: usuario_id)
    POST /pos/terminals/{id}/unlock     → liberar el candado (body: usuario_id)

Reglas aplicadas:
  - RN-03  el candado es exclusivo: solo un ocupante a la vez (409 si ocupada).
  - RN-04  el candado vence por TTL (15 min); al vencer se considera libre.
  - RN-05  solo el dueño libera su candado (403 si no lo es).
  - RN-06  un administrador puede forzar el desbloqueo.
  - RN-07  el heartbeat renueva el TTL del dueño.

Cicatriz OMEGA: el candado es PERSISTENTE (tabla `terminal_locks`), no un
diccionario en RAM. Un reinicio del API no deja terminales fantasma; el TTL
las libera solas si la pestaña murió sin despedirse.

La configuración de terminales (lista + iconos) se persiste en un archivo JSON
junto al API, porque es una preferencia de despliegue, no una entidad de
negocio. El POS viejo la guardaba igual (`terminal_status.json`).
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import CashSession, TerminalLock
from rules import ReglaViolada
from rules.registry import (
    rn03_candado_exclusivo,
    rn04_ttl_del_candado,
    rn05_solo_el_dueno_libera,
    rn06_admin_fuerza_desbloqueo,
    rn07_heartbeat_renueva_ttl,
)

router = APIRouter(prefix="/pos/terminals", tags=["terminales"])

# ---------------------------------------------------------------------------
# Configuración de terminales (lista + iconos) — preferencia de despliegue.
# ---------------------------------------------------------------------------

# Ruta del archivo de configuración, junto al paquete del API.
_RUTA_CONFIG = Path(__file__).resolve().parent.parent / "terminal_config.json"

# Configuración por defecto: 6 terminales con el icono de monitor.
#
# F7.7d — UNIFICACIÓN DE LOS DOS ESPACIOS DE ID.
#   Antes, la configuración emitía `T1..T6` mientras las sesiones, los tickets y
#   los candados vivían en `TERM-01..TERM-06` (el vocabulario de `seed_demo.py`).
#   Eran DOS vocabularios para la MISMA terminal física, y eso rompía:
#     - RN-49 (una sesión de caja por terminal): la regla compara `terminal_id`,
#       pero el candado y la sesión nunca compartían clave.
#     - RN-59 (reporte diario por terminal): la misma terminal aparecía dos veces.
#   La corrección es alinear la CONFIGURACIÓN al vocabulario de la semilla.
#   NO es un renombrado de terminales existentes: RN-12 prohíbe mutar el id de
#   una terminal que ya tiene datos, y aquí no se muta nada — se elige la
#   convención de nombres ANTES de que existan datos. Ver FICHA_F7_7d.
CONFIG_POR_DEFECTO: list[dict[str, str]] = [
    {"id": f"TERM-{n:02d}", "name": f"Terminal {n}", "icon": "🖥️"}
    for n in range(1, 7)
] + [
    # CAJA es una terminal configurable más (decisión del usuario, 9 Oct 2026).
    # Las cuentas creadas en CAJA llevan `terminal_id = "CAJA"`, así que su
    # post-it se pinta con el color que aquí se configure.
    {"id": "CAJA", "name": "Caja", "icon": "💰"},
]

# Catálogo de colores válidos para el post-it de cada terminal.
#
# Espejo EXACTO de `PALETA_POST_ITS` del frontend
# (`apps/pos/src/constants/paletaPostIts.js`). El backend valida contra esta
# lista para no aceptar clases Tailwind arbitrarias (R3 del plan). Si se cambia
# la paleta, hay que cambiar AMBOS lados.
PALETA_POST_ITS: tuple[str, ...] = (
    "bg-blue-400", "bg-blue-300", "bg-cyan-300", "bg-sky-200", "bg-violet-400",
    "bg-purple-300", "bg-fuchsia-200", "bg-pink-300", "bg-rose-400",
    "bg-pink-400", "bg-pink-200", "bg-red-400", "bg-red-300", "bg-orange-400",
    "bg-orange-300", "bg-yellow-200", "bg-amber-300", "bg-yellow-300",
    "bg-green-400", "bg-lime-300", "bg-emerald-300",
)

# TTL del candado en minutos (RN-04). Un candado más viejo se considera libre.
TTL_MINUTOS = 15


# ---------------------------------------------------------------------------
# Esquemas de entrada/salida (frontera HTTP — sin lógica de negocio).
# ---------------------------------------------------------------------------

class TerminalConfigItem(BaseModel):
    """Una terminal configurada: id, nombre visible, icono y color de post-it.

    `color` es OPCIONAL (decisión del usuario, 9 Oct 2026): las terminales
    arrancan SIN color (el pizarrón las pinta amarillas, `bg-yellow-100`) hasta
    que el usuario asigne uno desde el gestor. Cuando viene, debe pertenecer a
    `PALETA_POST_ITS` y NO puede repetirse entre terminales (se valida en
    `guardar_config`).
    """

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    icon: str = "🖥️"
    color: str | None = None


class GuardarConfigEntrada(BaseModel):
    """Cuerpo de `POST /pos/terminals/config`."""

    terminals: list[TerminalConfigItem]


class LockEntrada(BaseModel):
    """Cuerpo de `POST /pos/terminals/lock` (Fase 1: terminal_id + user_id)."""

    terminal_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)


class UnlockEntrada(BaseModel):
    """Cuerpo de `POST /pos/terminals/unlock` (Fase 1)."""

    terminal_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)


class LockPorIdEntrada(BaseModel):
    """Cuerpo de `POST /pos/terminals/{id}/lock` (Fase 3.4: usuario_id)."""

    usuario_id: str = Field(min_length=1)


class HeartbeatEntrada(BaseModel):
    """Cuerpo de `POST /pos/terminals/{id}/heartbeat` (Fase 3.4)."""

    usuario_id: str = Field(min_length=1)


class ResultadoSimple(BaseModel):
    """Respuesta uniforme de las acciones de candado."""

    success: bool
    message: str = ""


# ---------------------------------------------------------------------------
# Utilidades internas.
# ---------------------------------------------------------------------------

def _ahora() -> datetime:
    """Instante actual en UTC (aware)."""
    return datetime.now(timezone.utc)


def _es_admin(usuario_id: str) -> bool:
    """¿El usuario es administrador?

    El POS nuevo aún no tiene tabla de empleados (vive en el ERP). Hasta que
    exista el contrato de identidad, el rol se resuelve por convención: los
    IDs que empiezan con `admin` son administradores. Es una decisión
    explícita y documentada, no un descuido.
    """
    return str(usuario_id).lower().startswith("admin")


def _a_uuid(valor: str) -> UUID:
    """Convierte un id de usuario a UUID; si no lo es, deriva uno estable.

    El frontend usa ids numéricos o de texto. `TerminalLock.occupier_id` es
    UUID (C-01). Para no romper la frontera, un id no-UUID se mapea a un UUID
    determinista (uuid5) — el mismo usuario produce siempre el mismo UUID.
    """
    try:
        return UUID(str(valor))
    except (ValueError, AttributeError, TypeError):
        import uuid as _uuid

        return _uuid.uuid5(_uuid.NAMESPACE_URL, f"pos-usuario:{valor}")


def _leer_config() -> list[dict[str, str]]:
    """Lee la configuración de terminales; si falta o está corrupta, la default.

    Tolerante a la ausencia de `color` (R2 del plan): un `terminal_config.json`
    escrito ANTES de esta feature no tiene el campo. Se normaliza cada item para
    que SIEMPRE traiga las cuatro claves (`id`, `name`, `icon`, `color`), con
    `color = None` cuando falte. Así el frontend recibe una forma estable.
    """
    datos: list[dict[str, str]] | None = None
    try:
        if _RUTA_CONFIG.exists():
            leido = json.loads(_RUTA_CONFIG.read_text(encoding="utf-8"))
            if isinstance(leido, list) and leido:
                datos = leido
    except (OSError, json.JSONDecodeError):
        pass
    if datos is None:
        datos = CONFIG_POR_DEFECTO
    return [
        {
            "id": item.get("id", ""),
            "name": item.get("name", ""),
            "icon": item.get("icon", "🖥️"),
            "color": item.get("color"),
        }
        for item in datos
    ]


def _escribir_config(terminals: list[dict[str, str]]) -> None:
    """Persiste la configuración de terminales (best effort)."""
    try:
        _RUTA_CONFIG.write_text(
            json.dumps(terminals, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except OSError:
        # Si no se puede escribir, la configuración es de sesión. No rompe la UI.
        pass


def _candado_vigente(candado: TerminalLock, ahora: datetime) -> bool:
    """¿El candado sigue vigente según su TTL (RN-04)?"""
    return rn04_ttl_del_candado(candado.locked_at, ahora, TTL_MINUTOS)


def _a_estado(
    candado: TerminalLock | None,
    ahora: datetime,
    caja_habilitada: bool = False,
) -> dict[str, object]:
    """Proyecta un candado al mapa de estado que consume el frontend.

    Forma: `{ occupier_id, occupier_ref, occupier_name, locked_at,
    stale_session, caja_habilitada }`.
    Un candado vencido se reporta como libre (occupier_id = None).

    `occupier_id` es el UUID canónico (C-01) que vive en la tabla. Pero el
    frontend identifica al usuario con su id ORIGINAL (p. ej. `1` o `cajero-1`),
    no con el UUID derivado. Por eso se expone además `occupier_ref`: el id tal
    como lo envió el cliente (guardado en `occupier_name`). Sin este campo, el
    dueño de la terminal no se reconocía a sí mismo y su propia terminal se
    pintaba como "ocupada por otro" — el bloqueo que impedía entrar.

    `caja_habilitada` (FIX "habilitar caja" — paridad con el viejo POS §6.8):
    indica si la terminal tiene un turno de caja ABIERTO (RN-49). El candado y
    la caja son DOS estados independientes: una terminal puede estar libre (sin
    candado) pero con la caja habilitada, o al revés. El landing los pinta por
    separado. Antes el landing NO sabía nada de la caja, así que una terminal
    con turno abierto aparecía como si no tuviera caja — el bug reportado.
    """
    if candado is None or not _candado_vigente(candado, ahora):
        return {
            "occupier_id": None,
            "occupier_ref": None,
            "occupier_name": None,
            "locked_at": None,
            "stale_session": False,
            "caja_habilitada": caja_habilitada,
        }
    return {
        "occupier_id": str(candado.occupier_id),
        "occupier_ref": candado.occupier_name,
        "occupier_name": candado.occupier_name,
        "locked_at": candado.locked_at.isoformat(),
        "stale_session": False,
        "caja_habilitada": caja_habilitada,
    }


async def _candado_de(db: AsyncSession, terminal_id: str) -> TerminalLock | None:
    """Devuelve el candado de una terminal, o None si no existe."""
    resultado = await db.execute(
        select(TerminalLock).where(TerminalLock.terminal_id == terminal_id)
    )
    return resultado.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Fase 1 — Selector de terminales.
# ---------------------------------------------------------------------------

@router.get("/status")
async def estado_terminales(db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    """Estado de ocupación de TODAS las terminales configuradas.

    Devuelve un mapa `{ "TERM-01": {occupier_id, occupier_name, locked_at,
    stale_session, caja_habilitada}, ... }`. Una terminal sin candado vigente
    aparece libre.

    FIX "habilitar caja" (paridad con el viejo POS §6.8): además del candado
    (quién ocupa la terminal), se reporta `caja_habilitada` — si la terminal
    tiene un turno de caja ABIERTO (RN-49). Son DOS estados independientes y el
    landing los pinta por separado. Antes el landing no sabía nada de la caja,
    así que una terminal con turno abierto aparecía como si no tuviera caja.
    """
    ahora = _ahora()
    candados = (await db.execute(select(TerminalLock))).scalars().all()
    por_terminal = {c.terminal_id: c for c in candados}

    # Turnos de caja ABIERTOS por terminal (RN-49: a lo sumo uno por terminal).
    sesiones_abiertas = (
        await db.execute(
            select(CashSession).where(CashSession.status == "OPEN")
        )
    ).scalars().all()
    caja_por_terminal = {s.terminal_id for s in sesiones_abiertas}

    estado: dict[str, object] = {}
    for terminal in _leer_config():
        tid = terminal["id"]
        estado[tid] = _a_estado(
            por_terminal.get(tid),
            ahora,
            caja_habilitada=tid in caja_por_terminal,
        )
    return estado


@router.get("/config")
async def leer_config() -> list[dict[str, str | None]]:
    """Configuración de terminales: lista de `{id, name, icon, color}`.

    `color` puede ser `None` (terminal sin color asignado). Por eso el tipo de
    retorno admite `None` — si se anota como `str`, FastAPI rechaza la respuesta
    con `ResponseValidationError` al encontrar un `None`.
    """
    return _leer_config()


@router.post("/config")
async def guardar_config(entrada: GuardarConfigEntrada) -> ResultadoSimple:
    """Guarda la configuración de terminales (lista + iconos + color de post-it).

    Valida DOS invariantes antes de persistir (decisiones del usuario, 9 Oct 2026):

      1. **Catálogo:** cada `color` presente debe pertenecer a `PALETA_POST_ITS`.
         Un color fuera del catálogo responde 400 (no se aceptan clases
         Tailwind arbitrarias).
      2. **Unicidad:** un mismo color NO puede estar asignado a dos terminales.
         Si se repite, responde 400 indicando qué terminal ya lo usa.

    Un `color = None` (sin asignar) es válido y NO cuenta para la unicidad:
    varias terminales pueden estar "sin color" a la vez.
    """
    colores_vistos: dict[str, str] = {}
    for terminal in entrada.terminals:
        color = terminal.color
        if color is None:
            continue
        if color not in PALETA_POST_ITS:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"El color '{color}' de la terminal '{terminal.id}' no "
                    "pertenece a la paleta de post-its."
                ),
            )
        if color in colores_vistos:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"El color '{color}' ya está en uso por la terminal "
                    f"'{colores_vistos[color]}'. Elige otro color."
                ),
            )
        colores_vistos[color] = terminal.id

    _escribir_config([t.model_dump() for t in entrada.terminals])
    return ResultadoSimple(success=True, message="Configuración guardada")


@router.post("/lock")
async def tomar_lock(entrada: LockEntrada, db: AsyncSession = Depends(get_db)) -> ResultadoSimple:
    """Toma el candado exclusivo de una terminal (RN-03).

    Si la terminal está ocupada por otro, responde 409. Si el candado venció
    por TTL (RN-04), se reemplaza por el nuevo ocupante.
    """
    ahora = _ahora()
    candado = await _candado_de(db, entrada.terminal_id)

    if candado is not None and _candado_vigente(candado, ahora):
        # RN-03: exclusivo. Si el mismo usuario vuelve, es idempotente.
        rn03_candado_exclusivo(str(candado.occupier_id), str(_a_uuid(entrada.user_id)))
        # Mismo ocupante: renueva el TTL y responde éxito.
        candado.locked_at = ahora
    elif candado is not None:
        # Candado vencido: lo reasigna el nuevo ocupante.
        candado.occupier_id = _a_uuid(entrada.user_id)
        candado.occupier_name = str(entrada.user_id)
        candado.locked_at = ahora
    else:
        db.add(
            TerminalLock(
                terminal_id=entrada.terminal_id,
                occupier_id=_a_uuid(entrada.user_id),
                occupier_name=str(entrada.user_id),
                locked_at=ahora,
            )
        )

    await db.commit()
    return ResultadoSimple(success=True, message=f"Terminal {entrada.terminal_id} bloqueada")


@router.post("/unlock")
async def liberar_lock(entrada: UnlockEntrada, db: AsyncSession = Depends(get_db)) -> ResultadoSimple:
    """Libera el candado de una terminal (RN-05 / RN-06)."""
    candado = await _candado_de(db, entrada.terminal_id)
    if candado is None:
        # Nada que liberar: idempotente.
        return ResultadoSimple(success=True, message="La terminal ya estaba libre")

    solicitante = str(_a_uuid(entrada.user_id))
    es_admin = _es_admin(entrada.user_id)
    # RN-05: solo el dueño libera; RN-06: un admin puede forzar.
    rn05_solo_el_dueno_libera(str(candado.occupier_id), solicitante, es_admin)

    await db.delete(candado)
    await db.commit()
    return ResultadoSimple(success=True, message=f"Terminal {entrada.terminal_id} liberada")


# ---------------------------------------------------------------------------
# Fase 3.4 — Candado por id + heartbeat (OMEGA).
# ---------------------------------------------------------------------------

@router.post("/{terminal_id}/lock")
async def tomar_lock_por_id(
    terminal_id: str, entrada: LockPorIdEntrada, db: AsyncSession = Depends(get_db)
) -> ResultadoSimple:
    """Toma el candado de `{terminal_id}` (Fase 3.4, body: usuario_id)."""
    return await tomar_lock(
        LockEntrada(terminal_id=terminal_id, user_id=entrada.usuario_id), db
    )


@router.post("/{terminal_id}/unlock")
async def liberar_lock_por_id(
    terminal_id: str, entrada: LockPorIdEntrada, db: AsyncSession = Depends(get_db)
) -> ResultadoSimple:
    """Libera el candado de `{terminal_id}` (Fase 3.4, body: usuario_id)."""
    return await liberar_lock(
        UnlockEntrada(terminal_id=terminal_id, user_id=entrada.usuario_id), db
    )


@router.post("/{terminal_id}/heartbeat")
async def latir(
    terminal_id: str, entrada: HeartbeatEntrada, db: AsyncSession = Depends(get_db)
) -> ResultadoSimple:
    """Renueva el TTL del candado del dueño (RN-07).

    Si el candado no existe o es de otro, responde 409: el latido de un
    usuario que no es dueño no debe resucitar un candado ajeno.
    """
    ahora = _ahora()
    candado = await _candado_de(db, terminal_id)
    if candado is None:
        raise ReglaViolada("RN-07", f"La terminal {terminal_id} no tiene candado", 409)

    solicitante = str(_a_uuid(entrada.usuario_id))
    if str(candado.occupier_id) != solicitante:
        raise ReglaViolada("RN-07", f"{entrada.usuario_id} no es dueño del candado", 409)

    candado.locked_at = rn07_heartbeat_renueva_ttl(candado.locked_at, ahora)
    await db.commit()
    return ResultadoSimple(success=True, message="Latido registrado")
