"""Router de Caja — FASE 4.1 (contratos 9–14).

Materializa los 6 contratos de la caja declarados en la FASE 2:

  Contrato 9  `caja.sesion_activa`       → GET  /cash/active-session
  Contrato 10 `caja.abrir_turno`         → POST /cash/open-session
  Contrato 11 `caja.registrar_movimiento`→ POST /cash/movements
  Contrato 12 `caja.resumen_del_turno`   → GET  /cash/session-summary/{id}
  Contrato 13 `caja.cerrar_turno`        → POST /cash/close-session
  Contrato 14 `caja.reporte_diario`      → GET  /cash/daily-report/{fecha}

Este router es la ÚNICA puerta por la que el POS lee y escribe la caja. El POS
NUNCA toca la tabla `cash_sessions` (garantía del contrato 9): pregunta por
estos endpoints. Así la frontera por contratos (A-02) se respeta.

Reglas aplicadas, en orden:
  - RN-49  una sola sesión de caja OPEN por terminal.
  - RN-50  el fondo inicial no puede ser negativo.
  - RN-51  los movimientos son ENTRADA o SALIDA, con monto y concepto.
  - RN-52  un movimiento solo se elimina si la sesión está abierta.
  - RN-53  efectivo esperado = fondo + entradas − salidas + ventas en efectivo.
  - RN-54  el cierre registra el conteo físico, crédito y débito.
  - RN-55  una sesión cerrada es inmutable.
  - RN-57  los pagos se clasifican por método.
  - RN-58  la clasificación alimenta el resumen y el reporte diario.
  - RN-59  el reporte diario usa el día LOCAL, no UTC.
  - RN-60  el resumen distingue efectivo esperado de efectivo contado.

El vínculo ticket → caja (`Ticket.cash_session_id`) lo puebla el cobro del POS
(FASE 4.0). Este router lo LEE para calcular las ventas en efectivo del turno.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import CashMovement, CashSession, Ticket
from rules import ReglaViolada
from rules.registry import (
    rn49_una_sesion_caja_por_terminal,
    rn50_opening_float,
    rn51_movimiento_entrada_o_salida,
    rn52_movimiento_eliminable_si_abierta,
    rn53_efectivo_esperado,
    rn54_cierre_registra_conteos,
    rn55_sesion_cerrada_inmutable,
    rn57_clasificar_por_metodo,
    rn58_clasificacion_alimenta_resumen,
    rn59_reporte_usa_dia_local,
)
from schemas import (
    AbrirTurnoEntrada,
    AbrirTurnoSalida,
    CerrarTurnoEntrada,
    CerrarTurnoSalida,
    EliminarMovimientoSalida,
    LineaReporteDiario,
    MovimientoEntrada,
    MovimientoResumen,
    MovimientoSalida,
    ReporteDiarioSalida,
    ResumenTurnoSalida,
    SesionCajaActiva,
)

router = APIRouter(prefix="/cash", tags=["caja"])


# ---------------------------------------------------------------------------
# Utilidades internas
# ---------------------------------------------------------------------------

async def _sesion_o_404(db: AsyncSession, cash_session_id: UUID) -> CashSession:
    """Devuelve la sesión de caja o lanza 404 (contratos 12 y 13)."""
    sesion = (
        await db.execute(select(CashSession).where(CashSession.id == cash_session_id))
    ).scalars().first()
    if sesion is None:
        raise HTTPException(status_code=404, detail="Sesión de caja inexistente")
    return sesion


async def _clasificar_ventas_del_turno(
    db: AsyncSession, cash_session_id: UUID
) -> dict:
    """Clasifica las ventas del turno por método (RN-53, RN-57, RN-58).

    El cobro del POS (FASE 4.0) liga cada ticket a su caja. Aquí se leen esos
    tickets y se clasifican por método (RN-57): solo el EFECTIVO entra al
    esperado de la caja física. Crédito/débito/transferencia no son efectivo.

    FASE 9.1.1 — PAGOS MIXTOS (corrección crítica). Antes se leía
    `payment_details["metodo"]` como un único string y se sumaba `t.total`
    completo: un ticket pagado $40 en efectivo + $60 con tarjeta habría metido
    los $100 al efectivo esperado (inflando la caja en $60). Ahora se lee la
    forma canónica `pagos[]` y se suma SOLO el `monto` de cada abono. Se
    mantiene la retrocompatibilidad con el cobro viejo (`{metodo, monto}` sin
    `pagos[]`).

    FASE 10.5 — PARIDAD DE DATOS DE CAJA. Antes esta función devolvía solo el
    EFECTIVO (un Decimal). El viejo POS exponía el desglose completo
    (efectivo, crédito, débito, total de ventas y número de transacciones) en
    su resumen de caja. Ahora devuelve el diccionario COMPLETO de la
    clasificación (RN-58) más el conteo de tickets, para que el resumen del
    turno (contrato 12) pueda reconstruir ese desglose sin leer columnas
    crudas. El llamador que solo necesita el efectivo usa `["EFECTIVO"]`.
    """
    tickets = (
        await db.execute(select(Ticket).where(Ticket.cash_session_id == cash_session_id))
    ).scalars().all()

    pagos: list[dict] = []
    for t in tickets:
        detalles = t.payment_details or {}
        # Forma canónica (FASE 9.1): `pagos[]` con el monto de cada abono.
        abonos = detalles.get("pagos")
        if isinstance(abonos, list) and abonos:
            for abono in abonos:
                metodo = str(abono.get("metodo", "")).upper()
                # RN-57: un método desconocido no se clasifica; se ignora.
                if metodo in {"EFECTIVO", "CREDITO", "DEBITO", "TRANSFERENCIA"}:
                    pagos.append({"metodo": metodo, "monto": abono.get("monto", "0.00")})
            continue
        # Retrocompatibilidad: cobro viejo de un solo método. El monto es el
        # total del ticket (el POS viejo no enviaba `monto` por abono).
        metodo = str(detalles.get("metodo", "")).upper()
        if metodo in {"EFECTIVO", "CREDITO", "DEBITO", "TRANSFERENCIA"}:
            pagos.append({"metodo": metodo, "monto": detalles.get("monto", t.total)})

    clasificado = rn58_clasificacion_alimenta_resumen(pagos)
    # RN-58 devuelve {EFECTIVO, CREDITO, DEBITO, TRANSFERENCIA}. Se añade el
    # conteo de tickets para el desglose de paridad (F10.5).
    clasificado["num_transacciones"] = len(tickets)
    return clasificado


async def _movimientos_del_turno(
    db: AsyncSession, cash_session_id: UUID
) -> list[CashMovement]:
    """Devuelve los movimientos del turno, del más antiguo al más reciente."""
    return (
        await db.execute(
            select(CashMovement)
            .where(CashMovement.cash_session_id == cash_session_id)
            .order_by(CashMovement.created_at)
        )
    ).scalars().all()


def _sumar_movimientos(movimientos: list[CashMovement]) -> tuple[Decimal, Decimal]:
    """Separa los movimientos en (entradas, salidas) sumadas."""
    entradas = Decimal("0.00")
    salidas = Decimal("0.00")
    for m in movimientos:
        monto = Decimal(str(m.amount))
        if m.movement_type == "ENTRADA":
            entradas += monto
        else:
            salidas += monto
    return entradas, salidas


# ---------------------------------------------------------------------------
# Contrato 9 — GET /cash/active-session
# ---------------------------------------------------------------------------

@router.get("/active-session", response_model=SesionCajaActiva)
async def sesion_activa(
    terminal_id: str = Query(..., description="Terminal a consultar"),
    db: AsyncSession = Depends(get_db),
) -> SesionCajaActiva:
    """Devuelve la sesión de caja abierta de la terminal, o vacío.

    El POS NO lee la tabla `cash_sessions` (garantía del contrato 9). Si no hay
    turno abierto, responde `cash_session_id = None` — no es un error.
    """
    sesion = (
        await db.execute(
            select(CashSession).where(
                CashSession.terminal_id == terminal_id,
                CashSession.status == "OPEN",
            )
        )
    ).scalars().first()

    if sesion is None:
        return SesionCajaActiva(cash_session_id=None, abierta_en=None)
    return SesionCajaActiva(cash_session_id=sesion.id, abierta_en=sesion.opened_at)


# ---------------------------------------------------------------------------
# Contrato 10 — POST /cash/open-session
# ---------------------------------------------------------------------------

@router.post("/open-session", response_model=AbrirTurnoSalida, status_code=201)
async def abrir_turno(
    entrada: AbrirTurnoEntrada,
    db: AsyncSession = Depends(get_db),
) -> AbrirTurnoSalida:
    """Abre un turno de caja para la terminal (RN-49, RN-50).

    RN-49: solo puede haber UNA sesión OPEN por terminal. Si ya hay una, la
    regla lanza 409 (el contrato 10 declara 409 para este caso).
    RN-50: el fondo inicial no puede ser negativo.
    """
    abiertas = (
        await db.execute(
            select(CashSession).where(
                CashSession.terminal_id == entrada.terminal_id,
                CashSession.status == "OPEN",
            )
        )
    ).scalars().all()

    # RN-49: si ya hay una caja abierta, no se abre otra. El contrato 10
    # declara 409 para este caso (no 400): es un conflicto de estado.
    if abiertas:
        raise ReglaViolada(
            "RN-49",
            f"La terminal {entrada.terminal_id} ya tiene un turno de caja abierto",
            409,
        )

    # RN-50: el fondo inicial no puede ser negativo.
    fondo = rn50_opening_float(entrada.monto_inicial)

    # FASE 10.5 — PARIDAD DE DATOS DE CAJA. El viejo POS persistía el NOMBRE
    # del cajero (`employee_name`); el nuevo guardaba el UUID como nombre, así
    # que el corte y el reporte diario mostraban un UUID. Si el POS envía
    # `usuario_nombre`, se usa; si no, se cae al `usuario_id` (comportamiento
    # anterior) para no romper a un consumidor que aún no lo envíe.
    nombre_cajero = entrada.usuario_nombre or str(entrada.usuario_id)

    sesion = CashSession(
        terminal_id=entrada.terminal_id,
        employee_id=entrada.usuario_id,
        employee_name=nombre_cajero,
        opening_float=fondo,
        status="OPEN",
    )
    db.add(sesion)
    await db.commit()
    await db.refresh(sesion)

    return AbrirTurnoSalida(cash_session_id=sesion.id, abierta_en=sesion.opened_at)


# ---------------------------------------------------------------------------
# Contrato 11 — POST /cash/movements
# ---------------------------------------------------------------------------

@router.post("/movements", response_model=MovimientoSalida, status_code=201)
async def registrar_movimiento(
    entrada: MovimientoEntrada,
    db: AsyncSession = Depends(get_db),
) -> MovimientoSalida:
    """Registra una entrada o salida de efectivo del turno (RN-51, RN-55).

    RN-55: una sesión CLOSED es inmutable — no acepta movimientos (400).
    RN-51: el tipo es ENTRADA o SALIDA, con monto y concepto.
    """
    sesion = await _sesion_o_404(db, entrada.cash_session_id)

    # RN-55: una caja cerrada no acepta movimientos.
    rn55_sesion_cerrada_inmutable(sesion.status)

    # RN-51: valida tipo, monto y concepto. Devuelve el movimiento normalizado.
    normalizado = rn51_movimiento_entrada_o_salida(
        entrada.tipo, entrada.monto, entrada.motivo
    )

    movimiento = CashMovement(
        cash_session_id=sesion.id,
        movement_type=normalizado["tipo"],
        amount=normalizado["monto"],
        concept=normalizado["concepto"],
    )
    db.add(movimiento)
    await db.commit()
    await db.refresh(movimiento)

    return MovimientoSalida(movement_id=movimiento.id)


# ---------------------------------------------------------------------------
# Contrato 29 — DELETE /cash/movements/{movement_id}  (FASE 10.6.2)
# ---------------------------------------------------------------------------

@router.delete("/movements/{movement_id}", response_model=EliminarMovimientoSalida)
async def eliminar_movimiento(
    movement_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> EliminarMovimientoSalida:
    """Elimina un movimiento de efectivo del turno (RN-52).

    PARIDAD DE OPERACIÓN (F10.6.2). El viejo POS permitía borrar un movimiento
    mal capturado mientras la caja estuviera abierta
    (`DELETE /cash/sessions/{id}/movements/{mid}`). El nuevo POS lo había
    OMITIDO: el cajero no podía corregir un error de captura. Este endpoint
    restaura esa operación, con la misma regla de negocio (RN-52) que ya
    existía en el registro de reglas pero que ningún endpoint usaba.

    RN-52: solo se elimina si la sesión está ABIERTA. Una sesión CLOSED es
    inmutable (RN-55) → 400.
    """
    movimiento = (
        await db.execute(select(CashMovement).where(CashMovement.id == movement_id))
    ).scalars().first()
    if movimiento is None:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    # RN-52: la sesión del movimiento debe estar abierta para poder borrarlo.
    sesion = await _sesion_o_404(db, movimiento.cash_session_id)
    rn52_movimiento_eliminable_si_abierta(sesion.status)

    await db.delete(movimiento)
    await db.commit()

    return EliminarMovimientoSalida(eliminado=True)


# ---------------------------------------------------------------------------
# Contrato 12 — GET /cash/session-summary/{cash_session_id}
# ---------------------------------------------------------------------------

@router.get("/session-summary/{cash_session_id}", response_model=ResumenTurnoSalida)
async def resumen_del_turno(
    cash_session_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ResumenTurnoSalida:
    """Devuelve la PROYECCIÓN del turno, no la tabla (RN-53, RN-58, RN-60).

    `esperado` = fondo + entradas − salidas + ventas en efectivo (RN-53).

    FASE 10.5 — PARIDAD DE DATOS DE CAJA. Además del `esperado`, se expone el
    desglose que el viejo POS mostraba al cerrar el turno: fondo inicial,
    totales de entradas/salidas, ventas por método (efectivo/crédito/débito),
    total de ventas y número de transacciones. Todo se calcula con las reglas
    (RN-53, RN-58); no se leen columnas crudas de la tabla.
    """
    sesion = await _sesion_o_404(db, cash_session_id)

    movimientos = await _movimientos_del_turno(db, cash_session_id)
    entradas, salidas = _sumar_movimientos(movimientos)
    clasificado = await _clasificar_ventas_del_turno(db, cash_session_id)

    ventas_efectivo = clasificado.get("EFECTIVO", Decimal("0.00"))
    total_credito = clasificado.get("CREDITO", Decimal("0.00"))
    total_debito = clasificado.get("DEBITO", Decimal("0.00"))
    total_transferencia = clasificado.get("TRANSFERENCIA", Decimal("0.00"))
    # El "total de ventas" del viejo POS sumaba los cuatro métodos.
    total_ventas = ventas_efectivo + total_credito + total_debito + total_transferencia

    esperado = rn53_efectivo_esperado(
        Decimal(str(sesion.opening_float)), entradas, salidas, ventas_efectivo
    )

    return ResumenTurnoSalida(
        esperado=esperado,
        movimientos=[
            MovimientoResumen(
                movement_id=m.id,
                tipo=m.movement_type,
                monto=Decimal(str(m.amount)),
            )
            for m in movimientos
        ],
        fondo_inicial=Decimal(str(sesion.opening_float)),
        total_entradas=entradas,
        total_salidas=salidas,
        total_credito=total_credito,
        total_debito=total_debito,
        total_ventas=total_ventas,
        num_transacciones=clasificado.get("num_transacciones", 0),
    )


# ---------------------------------------------------------------------------
# Contrato 13 — POST /cash/close-session
# ---------------------------------------------------------------------------

@router.post("/close-session", response_model=CerrarTurnoSalida)
async def cerrar_turno(
    entrada: CerrarTurnoEntrada,
    db: AsyncSession = Depends(get_db),
) -> CerrarTurnoSalida:
    """Cierra el turno con el conteo físico y devuelve el descuadre (RN-54).

    RN-55: una sesión ya cerrada no se vuelve a cerrar (400).
    RN-54: se registran el efectivo contado, el crédito y el débito.
    `diferencia` = capturado − esperado (positivo = sobrante).
    """
    sesion = await _sesion_o_404(db, entrada.cash_session_id)

    # RN-55: una caja ya cerrada es inmutable.
    rn55_sesion_cerrada_inmutable(sesion.status)

    movimientos = await _movimientos_del_turno(db, entrada.cash_session_id)
    entradas, salidas = _sumar_movimientos(movimientos)
    # F10.5: la clasificación por método (RN-58) alimenta el esperado con el
    # EFECTIVO del turno. Antes se llamaba `_ventas_en_efectivo`; el refactor
    # de paridad la generalizó a `_clasificar_ventas_del_turno`. RN-58 solo
    # incluye las claves de los métodos PRESENTES: sin ventas en efectivo la
    # clave no existe, por eso se usa `.get` con cero.
    clasificacion = await _clasificar_ventas_del_turno(db, entrada.cash_session_id)
    ventas_efectivo = clasificacion.get("EFECTIVO", Decimal("0.00"))

    esperado = rn53_efectivo_esperado(
        Decimal(str(sesion.opening_float)), entradas, salidas, ventas_efectivo
    )

    # RN-54: registra el conteo físico, crédito y débito.
    conteos = rn54_cierre_registra_conteos(
        entrada.montos_fisicos, entrada.credito, entrada.debito
    )

    sesion.status = "CLOSED"
    sesion.closed_at = datetime.now(tz=sesion.opened_at.tzinfo)
    sesion.physical_cash = conteos["physical_cash"]
    sesion.physical_credit = conteos["credito"]
    sesion.physical_debit = conteos["debito"]
    await db.commit()
    await db.refresh(sesion)

    capturado = Decimal(str(sesion.physical_cash))
    return CerrarTurnoSalida(
        esperado=esperado,
        capturado=capturado,
        diferencia=capturado - esperado,
    )


# ---------------------------------------------------------------------------
# Contrato 14 — GET /cash/daily-report/{fecha}
# ---------------------------------------------------------------------------

@router.get("/daily-report/{fecha}", response_model=ReporteDiarioSalida)
async def reporte_diario(
    fecha: date,
    db: AsyncSession = Depends(get_db),
) -> ReporteDiarioSalida:
    """Reporte del día LOCAL agrupado por canal y cajero/terminal (RN-59).

    RN-59: el día de negocio es el LOCAL, no el UTC. Se agrupan los tickets
    cobrados ese día por (canal, cajero, terminal) y se suma su total.
    """
    # RN-59: se usa el día local. El filtro por rango se hace en Python para
    # no hardcodear el offset (RN-81): `rn59_reporte_usa_dia_local` lo resuelve.
    tickets = (
        await db.execute(select(Ticket).where(Ticket.status == "PAID"))
    ).scalars().all()

    # Agrupa por (canal, cajero, terminal) solo los tickets del día local.
    agrupado: dict[tuple[str, str, str], Decimal] = {}
    for t in tickets:
        if t.created_at is None:
            continue
        if rn59_reporte_usa_dia_local(t.created_at) != fecha.isoformat():
            continue
        detalles = t.payment_details or {}
        cajero = str(detalles.get("cajero", "—"))
        clave = (t.channel, cajero, t.terminal_id or "—")
        agrupado[clave] = agrupado.get(clave, Decimal("0.00")) + Decimal(str(t.total))

    return ReporteDiarioSalida(
        fecha=fecha.isoformat(),
        reporte=[
            LineaReporteDiario(canal=canal, cajero=cajero, terminal=terminal, total=total)
            for (canal, cajero, terminal), total in sorted(agrupado.items())
        ],
    )
