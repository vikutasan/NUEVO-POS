"""Núcleo transaccional del POS — FASE 1 (Sección 1 del Documento 8).

Tablas: `terminal_sessions`, `tickets`, `ticket_items`, `terminal_locks`.

Nota de identidad (C-01): el `id` es UUID (identidad global). El folio
`account_num` es local y de presentación; NUNCA se usa como identidad.
"""

from __future__ import annotations

import uuid

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.base import Base
from core.timestamps import utcnow


class TerminalSession(Base):
    """El turno de una terminal. Agrupa los tickets de una jornada."""

    __tablename__ = "terminal_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    terminal_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    opened_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    closed_at: Mapped[object | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    tickets: Mapped[list["Ticket"]] = relationship(back_populates="session")

    __table_args__ = (
        # Índice compuesto: la consulta "¿hay turno abierto en esta terminal?"
        # es la más frecuente del POS.
        {"comment": "ix_terminal_sessions_terminal_active (terminal_id, is_active)"},
    )


class Ticket(Base):
    """El ticket de venta. La entidad central del POS."""

    __tablename__ = "tickets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Folio local V#### — NO es identidad (C-01). Único por sucursal (O-15).
    account_num: Mapped[str] = mapped_column(String, nullable=False, index=True)
    total: Mapped[object] = mapped_column(
        Numeric(12, 2), nullable=False, default=0
    )
    payment_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    status: Mapped[str] = mapped_column(String, nullable=False, default="OPEN")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    order_type: Mapped[str] = mapped_column(
        String, nullable=False, default="VENTA_DIRECTA"
    )
    order_status: Mapped[str] = mapped_column(
        String, nullable=False, default="PROGRAMADO PARA SER PREPARADO"
    )
    delivery_type: Mapped[str | None] = mapped_column(String, nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String, nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    committed_at: Mapped[object | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    packaging_type: Mapped[str | None] = mapped_column(String, nullable=True)
    delivery_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    terminal_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    channel: Mapped[str] = mapped_column(
        String, nullable=False, default="PANADERIA", index=True
    )
    customer_group_name: Mapped[str | None] = mapped_column(String, nullable=True)

    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("terminal_sessions.id"), nullable=True
    )
    cash_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cash_sessions.id"), nullable=True
    )
    # Auditoría: quién capturó y quién cobró. Es una cicatriz valiosa (CA-14).
    captured_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    cashed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    session: Mapped["TerminalSession | None"] = relationship(back_populates="tickets")
    items: Mapped[list["TicketItem"]] = relationship(back_populates="ticket")

    __table_args__ = (
        # O-15: el folio es único POR SUCURSAL, no global. En F1 no hay tabla
        # `sucursales` todavía (llega con O-18); se deja la unicidad del folio
        # y se documenta la corrección pendiente.
        UniqueConstraint("account_num", name="uq_tickets_account_num"),
    )


class TicketItem(Base):
    """Las líneas del ticket. Cada producto agregado al carrito."""

    __tablename__ = "ticket_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tickets.id"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # `unit_price` se congela al momento de la venta: no se recalcula desde el
    # producto. Eso es correcto y se mantiene.
    unit_price: Mapped[object] = mapped_column(Numeric(12, 2), nullable=False)
    subtotal: Mapped[object] = mapped_column(Numeric(12, 2), nullable=False)

    ticket: Mapped["Ticket"] = relationship(back_populates="items")
    components: Mapped[list["TicketItemComponent"]] = relationship(
        back_populates="ticket_item"
    )


class TerminalLock(Base):
    """Candado persistente de terminal.

    Reemplaza el diccionario en RAM que se perdía con los reinicios: esa era
    la causa del bug de terminales bloqueadas. Es una cicatriz, no deuda.
    """

    __tablename__ = "terminal_locks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    terminal_id: Mapped[str] = mapped_column(
        String, nullable=False, unique=True, index=True
    )
    occupier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    occupier_name: Mapped[str] = mapped_column(String, nullable=False)
    locked_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
