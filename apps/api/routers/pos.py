"""Router del POS — P2.7 (cierre de la puerta P2).

Materializa 3 contratos de la FASE 2:

  Contrato 9  `caja.sesion_activa`   → GET  /pos/session-active?terminal_id=
  Contrato 3  `pos.crear_ticket`     → POST /pos/tickets
  Contrato 5  `pos.cobrar_ticket`    → POST /pos/tickets/{id}/pay

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
  - RN-23  un ticket PAID no se puede volver a cobrar.
  - RN-25  el cobro valida el `version` recibido (concurrencia optimista).
  - RN-27  cada escritura exitosa incrementa el `version`.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from models import Product, TerminalSession, Ticket, TicketItem
from rules import ReglaViolada
from rules.registry import (
    rn10_formato_de_folio,
    rn14_ciclo_de_vida,
    rn18_unit_price_congelado,
    rn19_subtotal_de_linea,
    rn20_cantidad_entero_positivo,
    rn21_producto_inexistente,
    rn22_producto_inactivo,
    rn23_no_modificar_paid,
    rn24_sesion_activa,
    rn25_validar_version,
    rn27_incrementar_version,
)
from schemas import (
    CobrarTicketEntrada,
    CrearTicketEntrada,
    LineaSalida,
    SesionActiva,
    TicketSalida,
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
    ticket = Ticket(
        account_num=await _siguiente_folio(db),
        status=rn14_ciclo_de_vida("OPEN"),
        total=total,
        version=0,
        terminal_id=entrada.terminal_id,
        channel=entrada.channel or "PANADERIA",
        session_id=sesion.id,
        items=lineas,
    )
    db.add(ticket)
    await db.commit()

    # Recargar con las líneas ya persistidas para proyectar la salida completa.
    ticket = (
        await db.execute(
            select(Ticket).options(selectinload(Ticket.items)).where(Ticket.id == ticket.id)
        )
    ).scalars().one()

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
    """Cobra un ticket: valida versión, lo pasa a PAID y guarda el pago."""
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

    # RN-14: el cobro lleva el ticket a PAID. RN-27: incrementa el version.
    ticket.status = rn14_ciclo_de_vida("PAID")
    ticket.version = rn27_incrementar_version(ticket.version)
    ticket.payment_details = entrada.payment_details

    await db.commit()
    await db.refresh(ticket)

    return _ticket_a_salida(ticket)
