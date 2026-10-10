"""Router del POS — P2.7 (cierre de la puerta P2) + FASE 3.2 (atómico) + FASE 5.0.

Materializa 9 contratos: 3 de la FASE 2, 5 atómicos de la FASE 3.2 y 1 de F5.0.

  Contrato 9  `caja.sesion_activa`      → GET    /pos/session-active?terminal_id=
  Contrato 3  `pos.crear_ticket`        → POST   /pos/tickets
  Contrato 5  `pos.cobrar_ticket`       → POST   /pos/tickets/{id}/pay
  Contrato 18 `pos.añadir_item`         → POST   /pos/tickets/{id}/items
  Contrato 19 `pos.cambiar_cantidad`    → PATCH  /pos/tickets/{id}/items/{item_id}
  Contrato 20 `pos.quitar_item`         → DELETE /pos/tickets/{id}/items/{item_id}
  Contrato 21 `pos.leer_ticket`         → GET    /pos/tickets/{id}
  Contrato 22 `pos.verificar_envio`     → POST   /pos/tickets/{id}/verify
  Contrato 23 `pos.cuentas_abiertas`    → GET    /pos/open-accounts?terminal_id=

Este router es la ÚNICA puerta por la que el frontend escribe. Aplica las
reglas de negocio de la FASE 3 en el orden correcto y traduce cada
`ReglaViolada` a su código HTTP (el manejador global vive en `main.py`).

Reglas aplicadas, en orden:
  - RN-24  la sesión de la terminal debe estar activa para operar.
  - RN-20  la cantidad de cada línea es un entero positivo.
  - RN-21  un producto inexistente es 404.
  - RN-22  un producto inactivo es 400.
  - RN-18  el unit_price se congela desde el catálogo (el cliente no dicta precio).
  - RN-19  el subtotal es unit_price × quantity.
  - RN-16  el total es la suma de los subtotales.
  - RN-10  el folio visible tiene formato V####.
  - RN-14  el status nace OPEN y solo pasa a PAID por el cobro.
  - RN-23  un ticket PAID no se puede volver a cobrar ni modificar.
  - RN-25  toda escritura valida el `version` recibido (concurrencia optimista).
  - RN-26  un `version` obsoleto responde 409.
  - RN-27  cada escritura exitosa incrementa el `version`.
  - RN-37  anti-degradación: quitar >50% de las líneas se rechaza.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from models import (
    CashSession,
    PosAuditLog,
    Product,
    TerminalSession,
    Ticket,
    TicketItem,
)
from rules import ReglaViolada
from rules.registry import (
    rn10_formato_de_folio,
    rn14_ciclo_de_vida,
    rn16_total_es_suma_de_subtotales,
    rn17_un_producto_una_vez,
    rn18_unit_price_congelado,
    rn19_subtotal_de_linea,
    rn20_cantidad_entero_positivo,
    rn21_producto_inexistente,
    rn22_producto_inactivo,
    rn23_no_modificar_paid,
    rn24_sesion_activa,
    rn25_validar_version,
    rn26_version_obsoleta,
    rn27_incrementar_version,
    rn37_umbral_anti_degradacion,
    rn49_una_sesion_caja_por_terminal,
    rn78_timestamps_en_utc,
    rn94_suma_de_pagos_cuadra_total,
    rn95_metodos_de_pago_validos,
)
from services.orders_service import proyectar_pedido
from schemas import (
    ActualizarPedidoEntrada,
    AnadirItemEntrada,
    CambiarCantidadEntrada,
    CobrarTicketEntrada,
    CrearTicketEntrada,
    CuentaAbiertaSalida,
    CuentasAbiertasSalida,
    EventoAuditableSalida,
    EventosAuditablesSalida,
    LineaAtomicaSalida,
    LineaSalida,
    LineasTicketSalida,
    QuitarItemEntrada,
    SesionActiva,
    SesionTerminalEntrada,
    TicketAtomicoSalida,
    TicketLigeroSalida,
    TicketSalida,
    VerificarEnvioEntrada,
    VerificarEnvioSalida,
)

router = APIRouter(prefix="/pos", tags=["pos"])


# ---------------------------------------------------------------------------
# DEUDA-BUG08 (Observación 2) — El fallback silencioso deja de ser silencioso.
# ---------------------------------------------------------------------------
# Cuando el cliente NO declara `cash_session_id`, el backend cae al turno de la
# terminal del ticket (retrocompatibilidad). Ese fallback es legítimo, pero
# SILENCIOSO: si el frontend olvida enviar el turno, el cobro "funciona" y el
# dinero se cuenta en la caja equivocada sin que nadie se entere. Para que el
# fallback sea OBSERVABLE:
#   1. SIEMPRE se escribe un asiento en `pos_audit_log` (RN-75) marcando que se
#      usó el fallback, con el turno elegido y la terminal de origen.
#   2. Si `POS_ESTRICTO_TURNO_CAJA` está activo, el fallback deja de ser
#      tolerado: se rechaza con 400 para que un frontend que olvida el turno
#      falle ruidosamente en vez de cobrar en la caja equivocada.
# El flag es OPT-IN (default off) para no romper la retrocompatibilidad.
def _estricto_turno_caja() -> bool:
    """True si `POS_ESTRICTO_TURNO_CAJA` exige que el cliente declare el turno."""
    return os.environ.get("POS_ESTRICTO_TURNO_CAJA", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


# ---------------------------------------------------------------------------
# Utilidades internas
# ---------------------------------------------------------------------------

async def _sesion_activa_o_404(db: AsyncSession, terminal_id: str) -> TerminalSession:
    """Devuelve la sesión abierta de la terminal, o lanza 400 (RN-24)."""
    sesion = (
        await db.execute(
            select(TerminalSession).where(
                TerminalSession.terminal_id == terminal_id,
                TerminalSession.is_active.is_(True),
            )
        )
    ).scalars().first()

    # RN-24: sin sesión activa no se puede operar. El contrato de error es 400.
    rn24_sesion_activa("OPEN" if sesion is not None else "CLOSED")
    return sesion  # type: ignore[return-value]


async def _sesion_caja_activa_o_400(db: AsyncSession, terminal_id: str) -> CashSession:
    """Devuelve el turno de caja OPEN de la terminal, o lanza 400 (RN-49).

    FASE 4.0 — Prerrequisito del arqueo: un cobro SIN turno de caja abierto
    dejaría el ticket huérfano y el corte saldría en cero. Por eso el cobro
    EXIGE un turno abierto y liga el ticket a él (`Ticket.cash_session_id`).

    RN-49: solo puede haber UNA sesión de caja OPEN por terminal. Si hay más
    de una, la regla lanza `ReglaViolada` (400) — es un estado imposible.
    """
    sesiones = (
        await db.execute(
            select(CashSession).where(
                CashSession.terminal_id == terminal_id,
                CashSession.status == "OPEN",
            )
        )
    ).scalars().all()

    # RN-49: una sola sesión de caja por terminal. Si hay 0, el cobro falla
    # con un motivo claro (no un 500): "No hay turno de caja abierto".
    # La regla espera dicts con `terminal_id` y `estado` (no el ORM).
    rn49_una_sesion_caja_por_terminal(
        [{"terminal_id": s.terminal_id, "estado": s.status} for s in sesiones],
        terminal_id,
    )
    if not sesiones:
        raise ReglaViolada(
            "RN-49", "No hay turno de caja abierto para esta terminal", 400
        )
    return sesiones[0]


async def _sesion_caja_por_id_o_400(db: AsyncSession, cash_session_id: UUID) -> CashSession:
    """Valida un turno de caja DECLARADO por el cliente (E-13) y lo devuelve.

    BUG-08 — La terminal que COBRA declara su turno; el backend NO lo confía.
    Tres validaciones (E-13: el backend es la autoridad):
      1. El turno existe.
      2. Está OPEN (RN-55: una sesión cerrada es inmutable).
      3. La terminal del turno tiene una sesión de terminal activa (RN-24).

    El `terminal_id` del ticket NUNCA se toca: el turno solo decide en qué caja
    se cuenta el dinero (RN-53); el origen del ticket es trazabilidad inmutable
    (RN-12).
    """
    sesion = (
        await db.execute(select(CashSession).where(CashSession.id == cash_session_id))
    ).scalars().first()
    if sesion is None:
        raise ReglaViolada("RN-49", "El turno de caja indicado no existe", 400)
    if sesion.status != "OPEN":
        raise ReglaViolada("RN-55", "El turno de caja indicado está cerrado", 400)
    # RN-24: la terminal del turno debe tener una sesión de terminal activa.
    await _sesion_activa_o_404(db, sesion.terminal_id)
    return sesion


async def _siguiente_folio(db: AsyncSession) -> str:
    """Calcula el siguiente folio V#### a partir del máximo consecutivo (RN-10).

    El folio es una PRESENTACIÓN, no una identidad (RN-09). Se deriva del
    conteo de tickets existentes + 1. En producción esto se haría con una
    secuencia atómica; aquí basta para la prueba en paralelo.
    """
    total = (await db.execute(select(func.count(Ticket.id)))).scalar_one()
    return rn10_formato_de_folio(int(total) + 1)


def _ticket_a_salida(ticket: Ticket) -> TicketSalida:
    """Proyecta el modelo ORM al esquema de salida (con sus líneas).

    F9.1.4 — `payment_details` viaja al cliente para que el ticket impreso
    pueda desglosar los N pagos del cobro mixto. Es `None` antes del cobro.

    F12.21 — Los campos `order_*` viajan al cliente para que el ticket IMPRESO
    al cobrar decida la DOBLE COPIA de un PEDIDO y pinte su sección de entrega.
    Es una PROYECCIÓN (O-23): solo los campos que el papel necesita.
    """
    return TicketSalida(
        id=ticket.id,
        account_num=ticket.account_num,
        status=ticket.status,
        total=ticket.total,
        version=ticket.version,
        terminal_id=ticket.terminal_id,
        channel=ticket.channel,
        items=[LineaSalida.model_validate(i) for i in ticket.items],
        payment_details=ticket.payment_details,
        order_type=ticket.order_type,
        delivery_type=ticket.delivery_type,
        customer_name=ticket.customer_name,
        customer_phone=ticket.customer_phone,
        committed_at=ticket.committed_at,
        packaging_type=ticket.packaging_type,
        delivery_address=ticket.delivery_address,
        order_notes=ticket.order_notes,
    )


def _lineas_atomicas(ticket: Ticket) -> list[LineaAtomicaSalida]:
    """Proyecta las líneas del ticket a la salida atómica (contratos 18–20).

    `item_id` es la clave de idempotencia que el cliente envió. Como el modelo
    `TicketItem` no la persiste todavía (deuda D-9), se deriva del `product_id`
    de forma determinista: así repetir el POST con el mismo `item_id` es
    idempotente aunque el modelo no guarde el campo.
    """
    return [
        LineaAtomicaSalida(
            item_id=str(item.product_id),
            product_id=item.product_id,
            quantity=item.quantity,
            unit_price=item.unit_price,
            subtotal=item.subtotal,
        )
        for item in ticket.items
    ]


def _ticket_atomico(ticket: Ticket, item_id: str) -> TicketAtomicoSalida:
    """Salida común de los contratos 18, 19 y 20."""
    return TicketAtomicoSalida(
        ticket_id=ticket.id,
        item_id=item_id,
        version=ticket.version,
        total=ticket.total,
        lineas=_lineas_atomicas(ticket),
    )


async def _ticket_con_items_o_404(db: AsyncSession, ticket_id: UUID) -> Ticket:
    """Carga un ticket con sus líneas, o lanza 404 si no existe."""
    ticket = (
        await db.execute(
            select(Ticket).options(selectinload(Ticket.items)).where(Ticket.id == ticket_id)
        )
    ).scalars().first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket inexistente")
    return ticket


def _normalizar_pagos(payment_details: dict, total: Decimal | None = None) -> dict:
    """FASE 9.1 — Normaliza `payment_details` a la forma canónica `pagos[]`.

    Retrocompatibilidad: un cobro viejo (`{metodo, recibido, cambio}`) se
    convierte en `{pagos: [{metodo, monto, recibido, cambio}]}`. Un cobro nuevo
    (`{pagos: [...]}`) se respeta tal cual. Así el arqueo (F9.1.1) siempre puede
    leer `pagos[]` sin ramificar por forma.

    El POS viejo NO enviaba `monto` en el pago único: cobraba el total exacto y
    solo mandaba `recibido`/`cambio`. Por eso, cuando falta `monto`, se usa el
    `total` del ticket como monto del abono (el pago único cubre el total). Si
    tampoco hay `total`, se deja sin `monto` para que RN-94 lo detecte.

    FICHA_FIX_SUMA_NO_CUADRA_VUELTO (3ª vuelta, 7 Oct 2026) — DEFENSA DE
    FRONTERA: en el pago único, `monto` es lo que se APLICA al total y `recibido`
    es el efectivo que el cliente entrega (el excedente es CAMBIO, no pago). Un
    cliente viejo/obsoleto podía enviar `monto = recibido` (p. ej. $150 sobre un
    total de $100) → la suma (150) no cuadraba el total (100) → RN-94 →
    `suma_no_cuadra` y el cobro se abortaba aunque el cliente SÍ había cubierto
    el total. Aquí se ACOTA `monto` al total: si `monto > total`, se usa el total
    (el excedente queda como cambio). Así un vuelto legítimo NUNCA rompe el
    cobro, sin importar la versión del cliente. El cobro de MENOS sigue
    detectándose (la suma < total → RN-94).
    """
    detalles = dict(payment_details or {})
    if "pagos" in detalles:
        return detalles
    metodo = detalles.get("metodo")
    if metodo is None:
        return detalles
    pago: dict = {"metodo": str(metodo).upper()}
    # El monto del pago único es el total cobrado. El POS viejo no lo enviaba:
    # se reconstruye desde el total del ticket (retrocompatibilidad F4.x).
    if "monto" in detalles:
        pago["monto"] = detalles["monto"]
    elif total is not None:
        pago["monto"] = str(total)
    # DEFENSA (3ª vuelta): acota `monto` al total. Un `monto` mayor al total es
    # un vuelto mal etiquetado (el excedente es cambio, no pago). Sin esto, un
    # cliente obsoleto que mande `monto = recibido` provoca `suma_no_cuadra`.
    if total is not None and "monto" in pago:
        try:
            monto_dec = Decimal(str(pago["monto"]))
            total_dec = Decimal(str(total))
            if monto_dec > total_dec:
                pago["monto"] = str(total_dec)
        except (InvalidOperation, ValueError, TypeError):
            # Si el monto no es parseable, se deja tal cual: RN-94 lo rechazará
            # con un motivo claro en vez de enmascarar el error.
            pass
    if "recibido" in detalles:
        pago["recibido"] = detalles["recibido"]
    if "cambio" in detalles:
        pago["cambio"] = detalles["cambio"]
    normalizado = {k: v for k, v in detalles.items() if k not in {"metodo", "recibido", "cambio", "monto"}}
    normalizado["pagos"] = [pago]
    return normalizado


def _evento_auditable(fila: PosAuditLog) -> EventoAuditableSalida:
    """Proyecta una fila de `pos_audit_log` al resumen del contrato 5 (O-23).

    Expone solo los 5 campos que Auditoría necesita. NO expone `id` (clave
    interna), `payload` crudo ni `extras` (internos del POS). El `tipo` se
    deriva del `endpoint` auditado; el `detalle` se arma con el `codigo` y el
    `payload` (que ya es un resumen, no la fila del ticket).
    """
    return EventoAuditableSalida(
        tipo=fila.endpoint,
        ticket_id=(fila.payload or {}).get("ticket_id"),
        usuario_id=fila.usuario_id,
        timestamp=fila.timestamp,
        detalle={
            "codigo": fila.codigo,
            "payload": fila.payload or {},
            "extras": fila.extras or {},
        },
    )


def _recalcular_total(ticket: Ticket) -> Decimal:
    """Recalcula el total del ticket como la suma de sus subtotales (RN-16)."""
    return rn16_total_es_suma_de_subtotales(
        [{"subtotal": item.subtotal} for item in ticket.items]
    )


# ---------------------------------------------------------------------------
# Contrato 9 — GET /pos/session-active
# ---------------------------------------------------------------------------

@router.post("/sessions", response_model=SesionActiva, status_code=201)
async def abrir_sesion(
    entrada: SesionTerminalEntrada,
    db: AsyncSession = Depends(get_db),
) -> TerminalSession:
    """Abre (o reutiliza) la sesión de terminal — paridad con el viejo POS.

    El viejo POS crea la `TerminalSession` al seleccionar la terminal
    (`POST /pos/sessions`). El nuevo POS tomaba el candado pero NUNCA creaba la
    sesión, así que cualquier terminal distinta de la que ya tenía una sesión
    fallaba con RN-24 al primer ticket (BUG-01).

    Este endpoint es IDEMPOTENTE: si la terminal ya tiene una sesión activa, la
    devuelve tal cual (200→201 con la misma fila); si no, crea una nueva. Así el
    frontend puede llamarlo sin miedo cada vez que se selecciona una terminal,
    sin duplicar sesiones (RN-01: una sola sesión activa por terminal).

    No se reabre una sesión cerrada: se crea una fila nueva, preservando el
    histórico de aperturas/cierres (auditoría).
    """
    terminal_id = entrada.terminal_id.strip()
    if not terminal_id:
        raise ReglaViolada("RN-24", "El terminal_id es obligatorio", 400)

    # Idempotencia: si ya hay una sesión activa, se devuelve sin crear otra.
    existente = (
        await db.execute(
            select(TerminalSession).where(
                TerminalSession.terminal_id == terminal_id,
                TerminalSession.is_active.is_(True),
            )
        )
    ).scalars().first()
    if existente is not None:
        return existente

    sesion = TerminalSession(terminal_id=terminal_id, is_active=True)
    db.add(sesion)
    await db.commit()
    await db.refresh(sesion)
    return sesion


@router.get("/session-active", response_model=SesionActiva | None)
async def session_active(
    terminal_id: str = Query(..., description="Identificador de la terminal"),
    db: AsyncSession = Depends(get_db),
) -> SesionActiva | None:
    """Devuelve la sesión abierta de la terminal, o `null` si no hay ninguna."""
    sesion = (
        await db.execute(
            select(TerminalSession).where(
                TerminalSession.terminal_id == terminal_id,
                TerminalSession.is_active.is_(True),
            )
        )
    ).scalars().first()

    if sesion is None:
        return None
    return SesionActiva.model_validate(sesion)


# ---------------------------------------------------------------------------
# Contrato 3 — POST /pos/tickets
# ---------------------------------------------------------------------------

@router.post("/tickets", response_model=TicketSalida, status_code=201)
async def crear_ticket(
    entrada: CrearTicketEntrada,
    db: AsyncSession = Depends(get_db),
) -> TicketSalida:
    """Crea un ticket OPEN con sus líneas, resolviendo precios contra el catálogo."""
    # RN-24: la terminal debe tener una sesión activa.
    sesion = await _sesion_activa_o_404(db, entrada.terminal_id)

    # Resolver cada producto del catálogo y congelar su precio (RN-18).
    lineas: list[TicketItem] = []
    total = Decimal("0.00")

    for linea in entrada.items:
        rn20_cantidad_entero_positivo(linea.quantity)

        producto = (
            await db.execute(select(Product).where(Product.id == linea.product_id))
        ).scalars().first()

        # RN-21: producto inexistente → 404. RN-22: inactivo → 400.
        rn21_producto_inexistente(
            None if producto is None else {"id": str(producto.id)}
        )
        rn22_producto_inactivo({"activo": bool(producto.active)})  # type: ignore[union-attr]

        unit_price = rn18_unit_price_congelado(producto.price, None)  # type: ignore[union-attr]
        subtotal = rn19_subtotal_de_linea(unit_price, linea.quantity)
        total += subtotal

        lineas.append(
            TicketItem(
                product_id=linea.product_id,
                quantity=linea.quantity,
                unit_price=unit_price,
                subtotal=subtotal,
            )
        )

    # RN-14: el ticket nace OPEN. RN-10: folio V####. RN-15: version inicial 0.
    # FASE 7.5.0 — El ticket guarda su copia de trabajo de la programación en
    # `tickets.order_*` (los 9 campos del modelo). Si el cliente no los manda,
    # se usan los defaults del modelo (VENTA_DIRECTA / PROGRAMADO...).
    ticket = Ticket(
        account_num=await _siguiente_folio(db),
        status=rn14_ciclo_de_vida("OPEN"),
        total=total,
        version=0,
        terminal_id=entrada.terminal_id,
        channel=entrada.channel or "PANADERIA",
        session_id=sesion.id,
        items=lineas,
        order_type=entrada.order_type or "VENTA_DIRECTA",
        order_status=entrada.order_status or "PROGRAMADO PARA SER PREPARADO",
        delivery_type=entrada.delivery_type,
        customer_name=entrada.customer_name,
        customer_phone=entrada.customer_phone,
        committed_at=entrada.committed_at,
        packaging_type=entrada.packaging_type,
        delivery_address=entrada.delivery_address,
        order_notes=entrada.order_notes,
        # F12.6 — Trazabilidad: el nombre del capturista se congela en el
        # ticket (foto histórica, patrón F10.5). Sin JOIN, sin leer `employees`.
        captured_by_name=entrada.capturista_nombre,
    )
    db.add(ticket)
    # FASE 7.5.0 / D-5 — NO se hace commit aquí. El ticket se `flush()`ea para
    # obtener su `id`, y el commit lo hace el llamador (o el endpoint) DESPUÉS
    # de proyectar el pedido. Así el ticket y su pedido nacen en la MISMA
    # transacción: o existen los dos, o no existe ninguno (atomicidad).
    await db.flush()

    # Recargar con las líneas ya persistidas para proyectar la salida completa.
    ticket = (
        await db.execute(
            select(Ticket).options(selectinload(Ticket.items)).where(Ticket.id == ticket.id)
        )
    ).scalars().one()

    # FASE 7.5.2 — Proyección del pedido (contrato 15) en la MISMA transacción.
    # Si la política de pago es SIN_PAGO, el pedido nace aquí (TENTATIVO). Si es
    # ANTICIPO o PAGO_COMPLETO, `proyectar_pedido` no hace nada al crear: el
    # pedido nacerá al cobrar. Una venta directa nunca proyecta.
    await proyectar_pedido(db, ticket)

    # FASE 7.5.0 / D-5 — El commit se hace AQUÍ, al final del endpoint, DESPUÉS
    # de proyectar el pedido. Así el ticket y su pedido nacen juntos: o existen
    # los dos, o no existe ninguno (atomicidad).
    await db.commit()

    return _ticket_a_salida(ticket)


# ---------------------------------------------------------------------------
# Contrato 5 — POST /pos/tickets/{id}/pay
# ---------------------------------------------------------------------------

@router.post("/tickets/{ticket_id}/pay", response_model=TicketSalida)
async def cobrar_ticket(
    ticket_id: UUID,
    entrada: CobrarTicketEntrada,
    db: AsyncSession = Depends(get_db),
) -> TicketSalida:
    """Cobra un ticket: valida versión, lo pasa a PAID y guarda el pago.

    FASE 4.0 — El cobro EXIGE un turno de caja abierto (RN-49) y liga el
    ticket a ese turno (`Ticket.cash_session_id`). Sin este vínculo el arqueo
    del corte saldría en cero: el ticket existiría pero no pertenecería a
    ninguna caja. Si no hay turno abierto, el cobro falla con un motivo claro
    (`{outcome:'error', reason:'No hay turno de caja abierto...'}`).
    """
    ticket = (
        await db.execute(
            select(Ticket).options(selectinload(Ticket.items)).where(Ticket.id == ticket_id)
        )
    ).scalars().first()

    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket inexistente")

    # RN-23: un ticket PAID no se vuelve a cobrar. RN-25: el version debe coincidir.
    rn23_no_modificar_paid(ticket.status)
    rn25_validar_version(entrada.version, ticket.version)

    # FASE 4.0 / RN-49 + BUG-08: el turno de caja lo determina la terminal que
    # COBRA, no la de origen del ticket. "Toda terminal es una caja en
    # potencia": una terminal con turno abierto puede cobrar cuentas de OTRAS
    # terminales, y el dinero se cuenta en la caja que lo recibió (RN-53).
    #
    # Si el cliente DECLARA su turno (`cash_session_id`), se VALIDA (E-13: el
    # backend es la autoridad) con `_sesion_caja_por_id_o_400` (existe + OPEN +
    # su terminal tiene sesión activa). Si no lo declara, se cae al
    # comportamiento retrocompatible: el turno de la terminal del ticket.
    #
    # El `terminal_id` del ticket NUNCA se sobreescribe (RN-12): el origen es
    # trazabilidad inmutable; el turno solo decide dónde se cuenta el dinero.
    if entrada.cash_session_id is not None:
        sesion_caja = await _sesion_caja_por_id_o_400(db, entrada.cash_session_id)
        uso_fallback = False
    else:
        # DEUDA-BUG08 (Obs. 2): el fallback es legítimo pero OBSERVABLE. Si el
        # modo estricto está activo, un cliente que olvida declarar el turno
        # falla ruidosamente (400) en vez de cobrar en la caja equivocada.
        if _estricto_turno_caja():
            raise HTTPException(
                status_code=400,
                detail=(
                    "POS_ESTRICTO_TURNO_CAJA activo: el cobro exige declarar "
                    "`cash_session_id` (el turno de la caja que cobra)."
                ),
            )
        sesion_caja = await _sesion_caja_activa_o_400(db, ticket.terminal_id)
        uso_fallback = True

    # FASE 9.1 — Pagos mixtos: se normaliza `payment_details` a la forma canónica
    # `pagos[]` (retrocompatibilidad con el cobro viejo de un solo método) y se
    # valida RN-94 (la suma cuadra el total) + RN-95 (cada método es válido)
    # ANTES de guardar. Así el arqueo (F9.1.1) siempre lee `pagos[]` y un cobro
    # mal formado nunca llega a la base de datos.
    detalles_normalizados = _normalizar_pagos(entrada.payment_details, ticket.total)
    pagos = detalles_normalizados.get("pagos", [])
    rn95_metodos_de_pago_validos(pagos)
    rn94_suma_de_pagos_cuadra_total(pagos, ticket.total)

    # RN-14: el cobro lleva el ticket a PAID. RN-27: incrementa el version.
    ticket.status = rn14_ciclo_de_vida("PAID")
    ticket.version = rn27_incrementar_version(ticket.version)
    ticket.payment_details = detalles_normalizados
    # FASE 4.0: liga el ticket a su turno de caja para que el arqueo lo cuente.
    ticket.cash_session_id = sesion_caja.id
    # F12.6 — Trazabilidad: el nombre del cobrador se congela al cobrar
    # (foto histórica, patrón F10.5). Sin JOIN, sin leer `employees`.
    ticket.cashed_by_name = entrada.cobrador_nombre

    # FASE 7.5.0 / D-5b — `flush()` en vez de `commit()`: el cobro deja el ticket
    # PAID en la transacción abierta. En F7.5.2 la proyección del pedido (que al
    # pasar a PAID cambia su estado a PAGADO) se insertará aquí, y el commit
    # final lo hará el endpoint. Así el cobro y la actualización del pedido son
    # atómicos: o se cobra y el pedido queda PAGADO, o no pasa ninguno de los dos.
    await db.flush()
    await db.refresh(ticket)

    # FASE 7.5.2 — Proyección del pedido en el COBRO (contrato 15). El cobro ES
    # la señal de que el pedido puede prepararse: se proyecta con `forzar=True`
    # para que la política `PAGO_COMPLETO` (la default segura) no lo bloquee.
    # Si el pedido ya existía (política SIN_PAGO/ANTICIPO), se ACTUALIZA a
    # PAGADO en vez de duplicarse (idempotencia por `ticket_id`, RN-68).
    await proyectar_pedido(db, ticket, forzar=True)

    # DEUDA-BUG08 (Obs. 2) — El fallback deja de ser silencioso: si el cliente
    # NO declaró el turno, se escribe un asiento de auditoría (RN-75) que lo
    # deja constancia. El asiento vive en la MISMA transacción que el cobro: si
    # el commit falla, el asiento se va con él (no se audita lo que no ocurrió).
    if uso_fallback:
        db.add(
            PosAuditLog(
                endpoint="POST /pos/tickets/{id}/pay",
                payload={
                    "ticket_id": str(ticket.id),
                    "terminal_origen": ticket.terminal_id,
                    "cash_session_id": str(sesion_caja.id),
                    "terminal_caja": sesion_caja.terminal_id,
                },
                codigo=200,
                terminal_id=sesion_caja.terminal_id,
                usuario_id=None,
                extras={
                    "motivo": "fallback_turno_de_la_terminal_del_ticket",
                    "observacion": "DEUDA-BUG08-OBS2",
                },
                timestamp=datetime.now(timezone.utc),
            )
        )

    # FASE 7.5.0 / D-5b — El commit se hace AQUÍ, al final del endpoint, DESPUÉS
    # de proyectar el pedido. Así el cobro y el paso del pedido a PAGADO son
    # atómicos: o se cobra y el pedido queda PAGADO, o no pasa ninguno de los dos.
    await db.commit()

    return _ticket_a_salida(ticket)


# ---------------------------------------------------------------------------
# Contrato 18 — POST /pos/tickets/{id}/items
# ---------------------------------------------------------------------------

@router.post("/tickets/{ticket_id}/items", response_model=TicketAtomicoSalida)
async def anadir_item(
    ticket_id: UUID,
    entrada: AnadirItemEntrada,
    db: AsyncSession = Depends(get_db),
) -> TicketAtomicoSalida:
    """Añade un ítem. IDEMPOTENTE por `item_id` (contrato 18).

    Reglas: RN-24 (sesión activa), RN-23 (no PAID), RN-25 (version),
    RN-20 (cantidad positiva), RN-21/RN-22 (producto existe y activo),
    RN-18 (precio congelado), RN-19 (subtotal), RN-17 (un producto una vez),
    RN-27 (incrementa version).

    IDEMPOTENCIA (contrato 18): el `item_id` identifica la INTENCIÓN del
    cliente. Si el mismo `item_id` se reenvía (reintento de red, doble clic),
    la operación es un NO-OP y devuelve el estado actual. Los `item_id` ya
    procesados se registran en `payment_details["_item_ids"]` (JSONB), sin
    necesidad de migración. Deuda D-9: cuando `ticket_items` tenga su propia
    columna `item_id`, este ledger se reemplaza por una restricción única.
    """
    ticket = await _ticket_con_items_o_404(db, ticket_id)

    # RN-24: la sesión de la terminal del ticket debe estar activa.
    await _sesion_activa_o_404(db, ticket.terminal_id or "")
    # RN-23: no se modifica un ticket PAID.
    rn23_no_modificar_paid(ticket.status)
    # RN-20: cantidad entero positivo.
    rn20_cantidad_entero_positivo(entrada.quantity)

    # IDEMPOTENCIA por `item_id`: si esta intención ya se procesó, NO-OP.
    detalles = dict(ticket.payment_details or {})
    item_ids_procesados: list[str] = list(detalles.get("_item_ids", []))
    if entrada.item_id in item_ids_procesados:
        # Reintento del mismo `item_id`: devuelve el estado SIN escribir.
        return _ticket_atomico(ticket, entrada.item_id)

    # RN-25: concurrencia optimista (solo en la escritura real).
    rn25_validar_version(entrada.version, ticket.version)

    # RN-17: un producto aparece una sola vez; si ya está, se incrementa.
    existente = next(
        (i for i in ticket.items if str(i.product_id) == str(entrada.product_id)), None
    )
    if existente is not None:
        existente.quantity += entrada.quantity
        existente.subtotal = rn19_subtotal_de_linea(existente.unit_price, existente.quantity)
    else:
        producto = (
            await db.execute(select(Product).where(Product.id == entrada.product_id))
        ).scalars().first()
        # RN-21: inexistente → 404. RN-22: inactivo → 400.
        rn21_producto_inexistente(None if producto is None else {"id": str(producto.id)})
        rn22_producto_inactivo({"activo": bool(producto.active)})  # type: ignore[union-attr]

        unit_price = rn18_unit_price_congelado(producto.price, None)  # type: ignore[union-attr]
        ticket.items.append(
            TicketItem(
                product_id=entrada.product_id,
                quantity=entrada.quantity,
                unit_price=unit_price,
                subtotal=rn19_subtotal_de_linea(unit_price, entrada.quantity),
            )
        )

    # Registra el `item_id` procesado (ledger de idempotencia).
    item_ids_procesados.append(entrada.item_id)
    detalles["_item_ids"] = item_ids_procesados
    ticket.payment_details = detalles

    # RN-16: el total es la suma de los subtotales. RN-27: incrementa version.
    ticket.total = _recalcular_total(ticket)
    ticket.version = rn27_incrementar_version(ticket.version)

    await db.commit()
    ticket = await _ticket_con_items_o_404(db, ticket_id)
    return _ticket_atomico(ticket, entrada.item_id)


# ---------------------------------------------------------------------------
# Contrato 19 — PATCH /pos/tickets/{id}/items/{item_id}
# ---------------------------------------------------------------------------

@router.patch("/tickets/{ticket_id}/items/{item_id}", response_model=TicketAtomicoSalida)
async def cambiar_cantidad(
    ticket_id: UUID,
    item_id: str,
    entrada: CambiarCantidadEntrada,
    db: AsyncSession = Depends(get_db),
) -> TicketAtomicoSalida:
    """Cambia la cantidad de una línea. Bloqueo optimista por `version` (contrato 19).

    Reglas: RN-23 (no PAID), RN-25/RN-26 (version), RN-20 (cantidad positiva),
    RN-18 (precio congelado, no se recalcula), RN-19 (subtotal), RN-27.
    """
    ticket = await _ticket_con_items_o_404(db, ticket_id)

    rn23_no_modificar_paid(ticket.status)
    rn25_validar_version(entrada.version, ticket.version)
    rn26_version_obsoleta(entrada.version, ticket.version)
    rn20_cantidad_entero_positivo(entrada.quantity)

    linea = next((i for i in ticket.items if str(i.product_id) == item_id), None)
    if linea is None:
        raise HTTPException(status_code=404, detail="Ítem inexistente")

    # RN-18: el unit_price NO se recalcula. RN-19: subtotal = unit_price × quantity.
    linea.quantity = entrada.quantity
    linea.subtotal = rn19_subtotal_de_linea(linea.unit_price, entrada.quantity)

    ticket.total = _recalcular_total(ticket)
    ticket.version = rn27_incrementar_version(ticket.version)

    await db.commit()
    ticket = await _ticket_con_items_o_404(db, ticket_id)
    return _ticket_atomico(ticket, item_id)


# ---------------------------------------------------------------------------
# Contrato 20 — DELETE /pos/tickets/{id}/items/{item_id}
# ---------------------------------------------------------------------------

@router.delete("/tickets/{ticket_id}/items/{item_id}", response_model=TicketAtomicoSalida)
async def quitar_item(
    ticket_id: UUID,
    item_id: str,
    entrada: QuitarItemEntrada,
    db: AsyncSession = Depends(get_db),
) -> TicketAtomicoSalida:
    """Quita una línea. Anti-degradación RN-37 (contrato 20).

    Reglas: RN-23 (no PAID), RN-25 (version), RN-37 (no reducir >50%),
    RN-16 (recalcula total), RN-27 (incrementa version).
    """
    ticket = await _ticket_con_items_o_404(db, ticket_id)

    rn23_no_modificar_paid(ticket.status)
    rn25_validar_version(entrada.version, ticket.version)

    linea = next((i for i in ticket.items if str(i.product_id) == item_id), None)
    if linea is None:
        raise HTTPException(status_code=404, detail="Ítem inexistente")

    # RN-37: anti-degradación. Si quitar esta línea reduce el total de líneas
    # en más del 50%, la operación se rechaza.
    total_actual = len(ticket.items)
    total_nuevo = total_actual - 1
    rn37_umbral_anti_degradacion(total_actual, total_nuevo)

    ticket.items.remove(linea)
    await db.delete(linea)

    ticket.total = _recalcular_total(ticket)
    ticket.version = rn27_incrementar_version(ticket.version)

    await db.commit()
    ticket = await _ticket_con_items_o_404(db, ticket_id)
    return _ticket_atomico(ticket, item_id)


# ---------------------------------------------------------------------------
# Contrato 21 — GET /pos/tickets/{id}
# ---------------------------------------------------------------------------

@router.get("/tickets/{ticket_id}", response_model=TicketLigeroSalida)
async def leer_ticket(
    ticket_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> TicketLigeroSalida:
    """Lee un ticket con RESPUESTA LIGERA: 5 campos escalares (contrato 21).

    Regla 15: la respuesta ligera NO incluye las líneas. Leer las líneas es
    responsabilidad de otro contrato.
    """
    ticket = (
        await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ).scalars().first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket inexistente")
    return TicketLigeroSalida.model_validate(ticket)


# ---------------------------------------------------------------------------
# Contrato 22 — POST /pos/tickets/{id}/verify
# ---------------------------------------------------------------------------

@router.post("/tickets/{ticket_id}/verify", response_model=VerificarEnvioSalida)
async def verificar_envio(
    ticket_id: UUID,
    entrada: VerificarEnvioEntrada,
    db: AsyncSession = Depends(get_db),
) -> VerificarEnvioSalida:
    """Verificación POST-ENVÍO (contrato 22, cicatriz v6.1 $453).

    Confirma en la BASE DE DATOS que el ticket y sus ítems existen ANTES de que
    el frontend limpie el carrito. Es de SOLO LECTURA.

    Si `faltantes` no está vacío, el frontend NO debe limpiar el carrito.

    F12.16 — El `item_id` que envía el cliente es la INTENCIÓN de escritura
    (contrato 18), no el `product_id`. `anadir_item` la registra en el ledger
    de idempotencia `payment_details["_item_ids"]`. Comparar contra
    `product_id` (como se hacía antes) marcaba TODOS los ítems como faltantes
    y bloqueaba el envío de la cuenta al pizarrón.

    F12.18 — El ledger SOLO cubre los ítems añadidos en ESTA sesión. Cuando el
    operador RECUPERA una cuenta del pizarrón, `leer_lineas` (contrato 30)
    devuelve las líneas con `item_id = str(product_id)` (ver `_lineas_atomicas`),
    NO la intención original. Esos `item_id` NUNCA estuvieron en el ledger.

    BUG-06 (TERM-06) — La verificación por IDENTIDAD EXACTA era frágil: tras una
    carrera de versión (409), el carrito puede quedar con `item_id` que ya no
    coinciden ni con el ledger ni con el `product_id` de las líneas actuales
    (son `product_id` de líneas que ya no existen). Aun así el ticket SÍ tenía
    sus líneas persistidas, y el modal "hay productos sin guardar en el
    servidor. Verifique la conexión WiFi." bloqueaba el envío de la cuenta.

    La pregunta correcta NO es "¿coincide cada `item_id`?" sino "¿se perdió
    alguna línea?". Por eso la verificación es por COBERTURA. La identidad de
    cada línea es irrelevante para esa pregunta.

    BUG-07 (CAJA) — La cobertura por NÚMERO DE LÍNEAS seguía siendo frágil por
    RN-17: el servidor FUSIONA los productos repetidos en UNA sola fila de
    `ticket_items` (incrementando su `quantity`). Un carrito con el mismo
    producto agregado 2× tiene 2 líneas (2 `item_id`) pero el servidor tiene 1
    fila → `n_lineas_servidor (1) < n_afirmadas (2)` → falso déficit → el modal
    "hay productos sin guardar en el servidor" bloqueaba el envío aunque NADA se
    hubiera perdido. La pregunta correcta es por UNIDADES, no por filas: el
    servidor debe tener al menos tantas UNIDADES como el carrito afirma.

    Se conserva la forma del contrato (`item_ids_persistidos` / `faltantes`)
    para no romper al cliente: cuando hay cobertura, `faltantes` va vacío y
    todos los `item_id` se reportan como persistidos. Cuando el servidor tiene
    MENOS unidades de las que el carrito afirma, se reporta el déficit como
    `faltantes` (la cicatriz v6.1 $453 sigue protegida: nunca un "siempre OK").
    """
    ticket = await _ticket_con_items_o_404(db, ticket_id)

    # Unidades REALES en el servidor (RN-17 fusiona duplicados en una fila).
    n_unidades_servidor = sum(int(item.quantity) for item in ticket.items)

    # Unidades que el carrito AFIRMA. Si el cliente envía `cantidades` (BUG-07),
    # se suman; si no (cliente viejo), se degrada al conteo de líneas (BUG-06).
    if entrada.cantidades:
        n_unidades_afirmadas = sum(int(c) for c in entrada.cantidades)
    else:
        n_unidades_afirmadas = len(entrada.item_ids)

    # Cobertura: el servidor tiene al menos tantas UNIDADES como el carrito
    # afirma → no se perdió nada. La identidad de cada `item_id` es irrelevante.
    if n_unidades_servidor >= n_unidades_afirmadas:
        return VerificarEnvioSalida(
            existe=True,
            item_ids_persistidos=list(entrada.item_ids),
            faltantes=[],
        )

    # Déficit real: el carrito afirma más UNIDADES de las que el servidor tiene.
    # Se reportan como faltantes las últimas líneas afirmadas (no se puede saber
    # cuáles por identidad, pero el conteo prueba que algo se perdió).
    deficit = n_unidades_afirmadas - n_unidades_servidor
    n_lineas_afirmadas = len(entrada.item_ids)
    n_lineas_persistidas = max(0, n_lineas_afirmadas - deficit)
    item_ids_persistidos = list(entrada.item_ids[:n_lineas_persistidas])
    faltantes = list(entrada.item_ids[n_lineas_persistidas:])

    return VerificarEnvioSalida(
        existe=True,
        item_ids_persistidos=item_ids_persistidos,
        faltantes=faltantes,
    )


# ---------------------------------------------------------------------------
# Contrato 30 — GET /pos/tickets/{id}/items
# ---------------------------------------------------------------------------

@router.get("/tickets/{ticket_id}/items", response_model=LineasTicketSalida)
async def leer_lineas(
    ticket_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> LineasTicketSalida:
    """Lee las LÍNEAS de un ticket (contrato 30, FASE 12.10).

    Cierra el hueco A-02 que dejó abierto la Regla 15: el contrato 21 devuelve
    EXACTAMENTE 5 campos escalares y NO las líneas, así que recuperar una cuenta
    del pizarrón no podía hidratar el carrito. Este contrato es de SOLO LECTURA
    y devuelve una PROYECCIÓN (O-23): nunca la tabla `ticket_items`.

    Devuelve además `version` y `total` para que el cliente adopte la identidad
    completa de la cuenta (concurrencia optimista, RN-25) al hidratar el carrito.
    """
    ticket = await _ticket_con_items_o_404(db, ticket_id)
    return LineasTicketSalida(
        ticket_id=ticket.id,
        version=ticket.version,
        total=ticket.total,
        lineas=_lineas_atomicas(ticket),
    )


# ---------------------------------------------------------------------------
# Contrato 31 — PATCH /pos/tickets/{id}/order
# ---------------------------------------------------------------------------

@router.patch("/tickets/{ticket_id}/order", response_model=TicketSalida)
async def actualizar_pedido(
    ticket_id: UUID,
    entrada: ActualizarPedidoEntrada,
    db: AsyncSession = Depends(get_db),
) -> TicketSalida:
    """Actualiza la programación de un ticket OPEN ya creado (contrato 31).

    ─────────────────────────────────────────────────────────────────────────────
    Por qué existe este endpoint
    ─────────────────────────────────────────────────────────────────────────────
    El flujo REAL del POS es "productos primero, pedido después": el cajero
    agrega productos (el ticket nace como VENTA_DIRECTA por el contrato 29) y
    LUEGO abre el modal 📌 para programarlo como PEDIDO. Antes de este contrato,
    `guardarPedido` (RetailVisionPOS.jsx) solo guardaba el bloque en memoria y,
    como el ticket ya existía, NUNCA lo persistía: el `order_type` se quedaba en
    VENTA_DIRECTA y el post-it del pizarrón no se distinguía de una cuenta
    normal. Este endpoint cierra ese hueco.

    ─────────────────────────────────────────────────────────────────────────────
    Garantías
    ─────────────────────────────────────────────────────────────────────────────
    - Solo se aplican los campos PRESENTES en la entrada (semántica PATCH). Un
      campo ausente NO se toca; un campo presente con `null` limpia el valor.
    - Valida concurrencia optimista (RN-25): `version` debe coincidir, si no 409.
    - Un ticket PAID no se modifica (RN-23): el pedido ya se preparó/cobró.
    - Re-proyecta el pedido (contrato 15) en la MISMA transacción, para que el
      cambio de `order_type` se refleje en `orders` de inmediato (idempotencia
      por `ticket_id`, RN-68). El commit es único y atómico.
    """
    ticket = await _ticket_con_items_o_404(db, ticket_id)

    # RN-23: un ticket PAID ya no se modifica. RN-25: el version debe coincidir.
    rn23_no_modificar_paid(ticket.status)
    rn25_validar_version(entrada.version, ticket.version)

    # Semántica PATCH: solo se aplican los campos que el cliente envió. Se usa
    # `model_fields_set` (Pydantic v2) para distinguir "ausente" de "null".
    enviados = entrada.model_fields_set

    if "order_type" in enviados:
        ticket.order_type = entrada.order_type or "VENTA_DIRECTA"
    if "order_status" in enviados:
        ticket.order_status = entrada.order_status or "PROGRAMADO PARA SER PREPARADO"
    if "delivery_type" in enviados:
        ticket.delivery_type = entrada.delivery_type
    if "customer_name" in enviados:
        ticket.customer_name = entrada.customer_name
    if "customer_phone" in enviados:
        ticket.customer_phone = entrada.customer_phone
    if "committed_at" in enviados:
        ticket.committed_at = entrada.committed_at
    if "packaging_type" in enviados:
        ticket.packaging_type = entrada.packaging_type
    if "delivery_address" in enviados:
        ticket.delivery_address = entrada.delivery_address
    if "order_notes" in enviados:
        ticket.order_notes = entrada.order_notes

    # RN-27: toda escritura incrementa el version (concurrencia optimista).
    ticket.version = rn27_incrementar_version(ticket.version)

    await db.flush()

    # FASE 7.5.2 — Re-proyección del pedido (contrato 15) en la MISMA
    # transacción. Si el ticket pasó a PEDIDO, nace/actualiza su `Order`; si
    # volvió a VENTA_DIRECTA, `proyectar_pedido` no hace nada (no hay pedido).
    await proyectar_pedido(db, ticket)

    await db.commit()

    # Recargar con las líneas para proyectar la salida completa (contrato 3/5).
    ticket = await _ticket_con_items_o_404(db, ticket_id)
    return _ticket_a_salida(ticket)


# ---------------------------------------------------------------------------
# Contrato 23 — GET /pos/open-accounts?terminal_id=
# ---------------------------------------------------------------------------

@router.get("/open-accounts", response_model=CuentasAbiertasSalida)
async def cuentas_abiertas(
    terminal_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> CuentasAbiertasSalida:
    """Lista las cuentas OPEN de una terminal (contrato 23, FASE 5.0).

    Es de SOLO LECTURA y devuelve una PROYECCIÓN (O-23): nunca la tabla
    `tickets`. Respeta la Regla 15 (respuesta ligera): cada cuenta expone
    campos escalares explícitos (nada de tablas ni de `SELECT *`).

    F12.6 — PARIDAD DE PRESENTACIÓN: la proyección se amplió con los campos
    que el pizarrón del viejo POS mostraba en cada post-it (terminal, cliente,
    capturista, teléfono, tipo de pedido, tipo de entrega y hora). Siguen
    siendo escalares: la frontera A-02 / O-23 se respeta.

    FICHA_FIX_PIZARRON_422 (7 Oct 2026) — `terminal_id` es OPCIONAL:
      - Si viene, devuelve SOLO las cuentas OPEN de esa terminal (RN-31).
      - Si se OMITE, devuelve TODAS las cuentas OPEN de TODAS las terminales
        (modo CAJA — D1, paridad con el viejo POS `getOpenTickets()`).

    POR QUÉ el bug: el frontend en modo CAJA llama `listarCuentasAbiertas('')`,
    que produce la URL `/pos/open-accounts` SIN el query param. El endpoint
    declaraba `terminal_id: str = Query(..., min_length=1)` (OBLIGATORIO), así
    que FastAPI respondía **422** ("Los datos recibidos no son válidos") y el
    pizarrón quedaba vacío. El contrato documentaba un 400, pero el 422 lo
    emitía la validación de FastAPI ANTES de entrar al handler.

    Ordenadas por `created_at` ascendente (la más antigua primero, como un
    corcho real).
    """
    consulta = (
        select(Ticket)
        .where(Ticket.status == "OPEN")
        .order_by(Ticket.created_at.asc())
    )

    # FICHA_FIX_PIZARRON_422 — filtro por terminal SOLO si se pidió una.
    # Un `terminal_id` vacío/espacios se trata como "sin filtro" (modo CAJA),
    # no como error: el frontend envía '' para pedir TODAS las cuentas.
    if terminal_id is not None and terminal_id.strip():
        consulta = consulta.where(Ticket.terminal_id == terminal_id)

    filas = (await db.execute(consulta)).scalars().all()

    return CuentasAbiertasSalida(
        cuentas=[CuentaAbiertaSalida.model_validate(t) for t in filas]
    )


# ---------------------------------------------------------------------------
# Contrato 5 — GET /pos/auditable-events?desde=&hasta=
# ---------------------------------------------------------------------------

@router.get("/auditable-events", response_model=EventosAuditablesSalida)
async def eventos_auditables(
    desde: datetime = Query(..., description="Inicio del rango (ISO-8601, UTC)"),
    hasta: datetime = Query(..., description="Fin del rango (ISO-8601, UTC)"),
    db: AsyncSession = Depends(get_db),
) -> EventosAuditablesSalida:
    """Expone un RESUMEN de los eventos auditables del POS (contrato 5, F13.1).

    Es de SOLO LECTURA y devuelve una PROYECCIÓN (O-23): nunca la tabla
    `tickets` ni la fila cruda de `pos_audit_log`. Cada evento expone solo los
    5 campos que Auditoría necesita para reconstruir qué pasó (tipo, ticket_id,
    usuario_id, timestamp, detalle).

    Es una cicatriz: ya existe y se conserva (garantía del contrato 5).

    Reglas aplicadas:
      - RN-77  la consulta se filtra por rango de fechas.
      - RN-78  los timestamps se normalizan a UTC antes de comparar.

    Errores:
      - 400 si el rango de fechas es inválido (desde > hasta).
    """
    desde_utc = rn78_timestamps_en_utc(desde)
    hasta_utc = rn78_timestamps_en_utc(hasta)

    if desde_utc > hasta_utc:
        raise HTTPException(
            status_code=400,
            detail="El rango de fechas es inválido: 'desde' es posterior a 'hasta'.",
        )

    filas = (
        await db.execute(
            select(PosAuditLog)
            .where(PosAuditLog.timestamp >= desde_utc)
            .where(PosAuditLog.timestamp <= hasta_utc)
            .order_by(PosAuditLog.timestamp.asc())
        )
    ).scalars().all()

    return EventosAuditablesSalida(
        eventos=[_evento_auditable(f) for f in filas]
    )
