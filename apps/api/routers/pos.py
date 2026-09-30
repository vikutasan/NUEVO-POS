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

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from models import CashSession, Product, TerminalSession, Ticket, TicketItem
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
)
from services.orders_service import proyectar_pedido
from schemas import (
    AnadirItemEntrada,
    CambiarCantidadEntrada,
    CobrarTicketEntrada,
    CrearTicketEntrada,
    CuentaAbiertaSalida,
    CuentasAbiertasSalida,
    LineaAtomicaSalida,
    LineaSalida,
    QuitarItemEntrada,
    SesionActiva,
    TicketAtomicoSalida,
    TicketLigeroSalida,
    TicketSalida,
    VerificarEnvioEntrada,
    VerificarEnvioSalida,
)

router = APIRouter(prefix="/pos", tags=["pos"])


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


async def _siguiente_folio(db: AsyncSession) -> str:
    """Calcula el siguiente folio V#### a partir del máximo consecutivo (RN-10).

    El folio es una PRESENTACIÓN, no una identidad (RN-09). Se deriva del
    conteo de tickets existentes + 1. En producción esto se haría con una
    secuencia atómica; aquí basta para la prueba en paralelo.
    """
    total = (await db.execute(select(func.count(Ticket.id)))).scalar_one()
    return rn10_formato_de_folio(int(total) + 1)


def _ticket_a_salida(ticket: Ticket) -> TicketSalida:
    """Proyecta el modelo ORM al esquema de salida (con sus líneas)."""
    return TicketSalida(
        id=ticket.id,
        account_num=ticket.account_num,
        status=ticket.status,
        total=ticket.total,
        version=ticket.version,
        terminal_id=ticket.terminal_id,
        channel=ticket.channel,
        items=[LineaSalida.model_validate(i) for i in ticket.items],
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


def _recalcular_total(ticket: Ticket) -> Decimal:
    """Recalcula el total del ticket como la suma de sus subtotales (RN-16)."""
    return rn16_total_es_suma_de_subtotales(
        [{"subtotal": item.subtotal} for item in ticket.items]
    )


# ---------------------------------------------------------------------------
# Contrato 9 — GET /pos/session-active
# ---------------------------------------------------------------------------

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

    # FASE 4.0 / RN-49: el cobro exige un turno de caja abierto en la terminal
    # del ticket. Si no lo hay, `_sesion_caja_activa_o_400` lanza ReglaViolada
    # (400) con el motivo "No hay turno de caja abierto para esta terminal".
    sesion_caja = await _sesion_caja_activa_o_400(db, ticket.terminal_id)

    # RN-14: el cobro lleva el ticket a PAID. RN-27: incrementa el version.
    ticket.status = rn14_ciclo_de_vida("PAID")
    ticket.version = rn27_incrementar_version(ticket.version)
    ticket.payment_details = entrada.payment_details
    # FASE 4.0: liga el ticket a su turno de caja para que el arqueo lo cuente.
    ticket.cash_session_id = sesion_caja.id

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
    """
    ticket = await _ticket_con_items_o_404(db, ticket_id)

    persistidos = {str(i.product_id) for i in ticket.items}
    item_ids_persistidos = [i for i in entrada.item_ids if i in persistidos]
    faltantes = [i for i in entrada.item_ids if i not in persistidos]

    return VerificarEnvioSalida(
        existe=True,
        item_ids_persistidos=item_ids_persistidos,
        faltantes=faltantes,
    )


# ---------------------------------------------------------------------------
# Contrato 23 — GET /pos/open-accounts?terminal_id=
# ---------------------------------------------------------------------------

@router.get("/open-accounts", response_model=CuentasAbiertasSalida)
async def cuentas_abiertas(
    terminal_id: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
) -> CuentasAbiertasSalida:
    """Lista las cuentas OPEN de una terminal (contrato 23, FASE 5.0).

    Es de SOLO LECTURA y devuelve una PROYECCIÓN (O-23): nunca la tabla
    `tickets`. Respeta la Regla 15 (respuesta ligera): cada cuenta expone
    EXACTAMENTE 5 campos escalares.

    Solo devuelve cuentas de la terminal pedida (RN-31), ordenadas por
    `created_at` ascendente (la más antigua primero, como un corcho real).
    """
    if not terminal_id or not terminal_id.strip():
        raise HTTPException(status_code=400, detail="terminal_id es obligatorio")

    filas = (
        await db.execute(
            select(Ticket)
            .where(Ticket.terminal_id == terminal_id)
            .where(Ticket.status == "OPEN")
            .order_by(Ticket.created_at.asc())
        )
    ).scalars().all()

    return CuentasAbiertasSalida(
        cuentas=[CuentaAbiertaSalida.model_validate(t) for t in filas]
    )
