"""Esquemas Pydantic de la capa HTTP — P2.7 (cierre de la puerta P2).

Estos esquemas son la frontera entre el mundo HTTP y el dominio. NO contienen
lógica de negocio: solo declaran la forma de la entrada y de la salida de los
4 endpoints que el frontend mínimo (P2.1–P2.6) consume.

Contratos que materializan (FASE 2, `contracts/registry.py`):
  - Contrato 1  `catalogo.productos_para_venta`  → GET  /catalog/products-for-sale
  - Contrato 9  `caja.sesion_activa`             → GET  /pos/session-active
  - Contrato 3  `pos.crear_ticket`               → POST /pos/tickets
  - Contrato 5  `pos.cobrar_ticket`              → POST /pos/tickets/{id}/pay

Reglas duras que respetan:
  - C-03  el dinero viaja como Decimal (Numeric(12,2)), nunca Float.
  - RN-09 la identidad es `id` (UUID); el folio es `account_num` (presentación).
  - RN-10 el folio visible tiene formato V####.
  - RN-15/RN-25 el `version` viaja en la entrada y en la salida (concurrencia).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Catálogo — Contrato 1: GET /catalog/products-for-sale
# ---------------------------------------------------------------------------

class CategoriaParaVenta(BaseModel):
    """Una categoría tal como la ve el POS (proyección, no la fila completa)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    icon: str | None = None
    position: int = 0


class ProductoParaVenta(BaseModel):
    """Un producto tal como lo ve el POS.

    Proyección del contrato 1: solo lo que la pantalla necesita. El precio ya
    viene resuelto (RN-18 lo congela al agregarlo a la línea).
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sku: str
    barcode: str | None = None
    name: str
    price: Decimal
    image_url: str | None = None
    category_id: UUID | None = None
    nature: str = "MANUFACTURADO"


class CatalogoParaVenta(BaseModel):
    """Salida del contrato 1: `{productos, categorias}`."""

    productos: list[ProductoParaVenta]
    categorias: list[CategoriaParaVenta]


# ---------------------------------------------------------------------------
# Sesión de terminal — Contrato 9: GET /pos/session-active
# ---------------------------------------------------------------------------

class SesionActiva(BaseModel):
    """La sesión de terminal abierta, o `null` si no hay ninguna (RN-01)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    terminal_id: str
    is_active: bool


# ---------------------------------------------------------------------------
# Tickets — Contrato 3: POST /pos/tickets
# ---------------------------------------------------------------------------

class LineaEntrada(BaseModel):
    """Una línea del carrito tal como la envía el frontend.

    Solo `product_id` y `quantity`: el `unit_price` y el `subtotal` los resuelve
    el servidor contra el catálogo (RN-18, RN-19). El cliente no dicta precios.
    """

    product_id: UUID
    quantity: int = Field(ge=1, description="Entero positivo (RN-20)")


class CrearTicketEntrada(BaseModel):
    """Entrada del contrato 3: crear un ticket OPEN con sus líneas.

    FASE 7.5.0 — El ticket puede nacer como PEDIDO PROGRAMADO. Los 9 campos
    de programación son OPCIONALES: si no vienen, el ticket es una venta
    directa de mostrador (comportamiento intacto desde la Fase 3).

    El POS guarda su copia de trabajo en `tickets.order_*` (los 9 campos del
    modelo `Ticket`). La proyección a `orders` la gobierna el módulo Pedidos
    (contrato 15), no el POS (A-02: frontera por contratos).
    """

    terminal_id: str
    channel: str = "PANADERIA"
    items: list[LineaEntrada] = Field(min_length=1)

    # ── Programación de pedido (opcional) ─────────────────────────────────
    order_type: str = "VENTA_DIRECTA"
    order_status: str | None = None
    delivery_type: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    committed_at: datetime | None = None
    packaging_type: str | None = None
    delivery_address: str | None = None
    order_notes: str | None = None


class LineaSalida(BaseModel):
    """Una línea persistida del ticket."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    quantity: int
    unit_price: Decimal
    subtotal: Decimal


class TicketSalida(BaseModel):
    """Salida del contrato 3 y del contrato 5: el ticket persistido.

    `account_num` es el folio (presentación, RN-10); `id` es la identidad
    (RN-09). `version` viaja para que el cliente pueda cobrar con concurrencia
    optimista (RN-15, RN-25).
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    account_num: str
    status: str
    total: Decimal
    version: int
    terminal_id: str | None = None
    channel: str
    items: list[LineaSalida] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Cobro — Contrato 5: POST /pos/tickets/{id}/pay
# ---------------------------------------------------------------------------

class CobrarTicketEntrada(BaseModel):
    """Entrada del contrato 5: cobrar un ticket.

    `payment_details` es libre (JSONB): método, monto recibido, cambio, etc.
    `version` es obligatorio: el cobro es una escritura y valida concurrencia
    optimista (RN-25). Si no coincide, el servidor responde 409.
    """

    payment_details: dict[str, Any] = Field(default_factory=dict)
    version: int = Field(ge=0, description="Version esperado (RN-25)")


# ---------------------------------------------------------------------------
# POS atómico — Contratos 18–22 (FASE 3.2)
# ---------------------------------------------------------------------------

class LineaAtomicaSalida(BaseModel):
    """Una línea del ticket en la proyección atómica.

    `item_id` es la clave de idempotencia que envía el cliente (contrato 18).
    El `unit_price` viene congelado (RN-18); el `subtotal` es unit_price ×
    quantity (RN-19).
    """

    model_config = ConfigDict(from_attributes=True)

    item_id: str
    product_id: UUID
    quantity: int
    unit_price: Decimal
    subtotal: Decimal


class TicketAtomicoSalida(BaseModel):
    """Salida común de los contratos 18, 19 y 20.

    Devuelve la proyección de las líneas (no la tabla `ticket_items`, O-23) y
    el `version` nuevo para que el cliente pueda encadenar la siguiente
    escritura con concurrencia optimista (RN-25/RN-27).
    """

    ticket_id: UUID
    item_id: str
    version: int
    total: Decimal
    lineas: list[LineaAtomicaSalida] = Field(default_factory=list)


class AnadirItemEntrada(BaseModel):
    """Entrada del contrato 18: añadir (o incrementar) un ítem.

    `item_id` es la clave de IDEMPOTENCIA: repetir el POST con el mismo
    `item_id` deja el ticket en el MISMO estado (no duplica la línea).
    """

    item_id: str = Field(min_length=1, description="Clave de idempotencia")
    product_id: UUID
    quantity: int = Field(ge=1, description="Entero positivo (RN-20)")
    version: int = Field(ge=0, description="Version esperado (RN-25)")


class CambiarCantidadEntrada(BaseModel):
    """Entrada del contrato 19: cambiar la cantidad de una línea."""

    quantity: int = Field(ge=1, description="Entero positivo (RN-20)")
    version: int = Field(ge=0, description="Version esperado (RN-25)")


class QuitarItemEntrada(BaseModel):
    """Entrada del contrato 20: quitar una línea del ticket."""

    version: int = Field(ge=0, description="Version esperado (RN-25)")


class TicketLigeroSalida(BaseModel):
    """Salida del contrato 21: EXACTAMENTE 5 campos escalares (Regla 15).

    NO incluye las líneas: leer las líneas es responsabilidad de otro contrato.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    account_num: str
    status: str
    total: Decimal
    version: int


class VerificarEnvioEntrada(BaseModel):
    """Entrada del contrato 22: verificar que el ticket y sus ítems existen.

    `item_ids` es lo que el cliente CREE haber enviado. El servidor responde
    qué de eso está realmente persistido.
    """

    item_ids: list[str] = Field(default_factory=list)


class VerificarEnvioSalida(BaseModel):
    """Salida del contrato 22: verificación post-envío (v6.1 $453).

    Si `faltantes` no está vacío, el frontend NO debe limpiar el carrito.
    """

    existe: bool
    item_ids_persistidos: list[str] = Field(default_factory=list)
    faltantes: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Caja — Contratos 9–14 (FASE 4.1)
# ---------------------------------------------------------------------------

class SesionCajaActiva(BaseModel):
    """Salida del contrato 9: la sesión de caja abierta de una terminal.

    El POS NO lee la tabla `cash_sessions`: pregunta por este contrato. Si no
    hay turno abierto, `cash_session_id` es `None` (no es un error).
    """

    cash_session_id: UUID | None = None
    abierta_en: datetime | None = None


class AbrirTurnoEntrada(BaseModel):
    """Entrada del contrato 10: abrir un turno de caja.

    `monto_inicial` es el fondo con el que arranca el cajero (RN-50: no puede
    ser negativo). `usuario_id` es el empleado que abre el turno.
    """

    terminal_id: str
    usuario_id: UUID
    monto_inicial: Decimal = Field(default=Decimal("0.00"), ge=0)


class AbrirTurnoSalida(BaseModel):
    """Salida del contrato 10: el turno recién abierto."""

    cash_session_id: UUID
    abierta_en: datetime


class MovimientoEntrada(BaseModel):
    """Entrada del contrato 11: registrar una entrada o salida de efectivo.

    `tipo` es ENTRADA o SALIDA (RN-51). `motivo` es el concepto (obligatorio).
    """

    cash_session_id: UUID
    tipo: str
    monto: Decimal
    motivo: str


class MovimientoSalida(BaseModel):
    """Salida del contrato 11: el movimiento persistido."""

    movement_id: UUID


class MovimientoResumen(BaseModel):
    """Un movimiento dentro del resumen del turno (contrato 12)."""

    tipo: str
    monto: Decimal


class ResumenTurnoSalida(BaseModel):
    """Salida del contrato 12: la PROYECCIÓN del turno, no la tabla.

    `esperado` es el efectivo que debería haber en la caja (RN-53):
    fondo + entradas − salidas + ventas en efectivo.
    """

    esperado: Decimal
    movimientos: list[MovimientoResumen] = Field(default_factory=list)


class CerrarTurnoEntrada(BaseModel):
    """Entrada del contrato 13: cerrar el turno con el conteo físico.

    `montos_fisicos` es el efectivo contado; `credito` y `debito` son los
    vouchers contados (RN-54).
    """

    cash_session_id: UUID
    montos_fisicos: Decimal
    credito: Decimal = Field(default=Decimal("0.00"))
    debito: Decimal = Field(default=Decimal("0.00"))


class CerrarTurnoSalida(BaseModel):
    """Salida del contrato 13: el arqueo con su descuadre.

    `diferencia` = capturado − esperado. Positivo = sobrante; negativo = faltante.
    """

    esperado: Decimal
    capturado: Decimal
    diferencia: Decimal


class LineaReporteDiario(BaseModel):
    """Una línea del reporte diario (contrato 14), agrupada por canal/cajero."""

    canal: str
    cajero: str
    terminal: str
    total: Decimal


class ReporteDiarioSalida(BaseModel):
    """Salida del contrato 14: el reporte del día local (RN-59)."""

    fecha: str
    reporte: list[LineaReporteDiario] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Cuentas abiertas — Contrato 23 (FASE 5.0)
# ---------------------------------------------------------------------------

class CuentaAbiertaSalida(BaseModel):
    """Una cuenta abierta del pizarrón (contrato 23).

    RESPUESTA LIGERA: EXACTAMENTE 5 campos escalares (Regla 15). NO incluye las
    líneas: leer las líneas es responsabilidad del contrato 21.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    account_num: str
    status: str
    total: Decimal
    version: int


class CuentasAbiertasSalida(BaseModel):
    """Salida del contrato 23: las cuentas OPEN de una terminal (RN-31).

    Solo cuentas de la terminal pedida, ordenadas por `created_at` ascendente
    (la más antigua primero, como un corcho real).
    """

    cuentas: list[CuentaAbiertaSalida] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Pedidos — Contrato 16 (FASE 7.5.3)
# ---------------------------------------------------------------------------

class PedidoDelTicketSalida(BaseModel):
    """El pedido asociado a un ticket (contrato 16).

    Es una PROYECCIÓN, no la fila completa de `orders` (O-23): expone solo los
    10 campos que el POS necesita para mostrar la programación. NO expone
    `delivery_lat`/`delivery_lng`/`delivery_distance_km` (internos de Reparto)
    ni `created_at`/`updated_at` (auditoría).
    """

    model_config = ConfigDict(from_attributes=True)

    order_id: UUID
    delivery_type: str
    status: str
    customer_name: str | None = None
    customer_phone: str | None = None
    committed_at: datetime | None = None
    packaging_type: str
    delivery_address: str | None = None
    delivery_fee: Decimal | None = None
    notes: str | None = None
