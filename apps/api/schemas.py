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
    """Entrada del contrato 3: crear un ticket OPEN con sus líneas."""

    terminal_id: str
    channel: str = "PANADERIA"
    items: list[LineaEntrada] = Field(min_length=1)


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
