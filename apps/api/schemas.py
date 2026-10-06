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

    F12.9.1 — `items` puede venir VACÍO: el ticket nace sin líneas y se llena
    después por el contrato atómico 18 (`pos.añadir_item`). Este es el flujo
    REAL del POS: `asegurarTicket` crea la cuenta vacía (para obtener folio y
    `account_num`) y cada producto entra luego, uno a uno. El caso de uso
    primario es la CUENTA VACÍA que se envía al pizarrón y se cobra más tarde,
    pero la capacidad es GENERAL: todo ticket puede nacer sin líneas. Un ticket
    vacío es válido (total `0.00`); el POS lo muestra en el pizarrón y lo
    completa cuando el cliente agrega productos.
    """

    terminal_id: str
    channel: str = "PANADERIA"
    # F12.9.1 — Lista vacía por defecto (no `min_length=1`): el ticket puede
    # nacer sin líneas. El POS crea la cuenta vacía primero y la llena después
    # vía el contrato atómico 18. Ver la garantía del contrato `pos.crear_ticket`.
    items: list[LineaEntrada] = Field(default_factory=list)

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

    # ── Trazabilidad (F12.6) ──────────────────────────────────────────────
    # El POS envía el NOMBRE del capturista (no el UUID): el backend lo
    # persiste desnormalizado en `tickets.captured_by_name` (patrón F10.5).
    # Es una foto histórica, no un valor vivo; sin JOIN, sin leer `employees`.
    capturista_nombre: str | None = None


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

    `payment_details` viaja desde FASE 9.1.4 para que el ticket IMPRESO pueda
    desglosar los N pagos del cobro mixto (antes el dato se persistía pero
    nunca llegaba al cliente, así que el papel no podía mostrar el desglose).
    Es `None` mientras el ticket no se ha cobrado.
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
    payment_details: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Cobro — Contrato 5: POST /pos/tickets/{id}/pay
# ---------------------------------------------------------------------------

class CobrarTicketEntrada(BaseModel):
    """Entrada del contrato 5: cobrar un ticket.

    `payment_details` es libre (JSONB) pero tiene una FORMA CANÓNICA desde
    FASE 9.1 (pagos mixtos)::

        {
          "pagos": [
            {"metodo": "EFECTIVO", "monto": "40.00", "recibido": "50.00", "cambio": "10.00"},
            {"metodo": "TARJETA",  "monto": "60.00", "tipo": "DEBITO"}
          ],
          "cajero": "Nombre"
        }

    La suma de `monto` debe cuadrar EXACTAMENTE el total del ticket (RN-94) y
    cada `metodo` debe ser válido (RN-95). El router normaliza la forma vieja
    (`{metodo, recibido, cambio}`) a `pagos[]` por retrocompatibilidad.

    `version` es obligatorio: el cobro es una escritura y valida concurrencia
    optimista (RN-25). Si no coincide, el servidor responde 409.
    """

    payment_details: dict[str, Any] = Field(default_factory=dict)
    version: int = Field(ge=0, description="Version esperado (RN-25)")

    # F12.6 — Trazabilidad: el POS envía el NOMBRE del cobrador (no el UUID).
    # El backend lo persiste desnormalizado en `tickets.cashed_by_name`.
    cobrador_nombre: str | None = None


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

    FASE 10.5 — PARIDAD DE DATOS DE CAJA. El viejo POS enviaba
    `employee_name` al abrir la sesión y lo persistía en
    `cash_sessions.employee_name`; el corte y el reporte diario lo mostraban.
    El nuevo POS solo enviaba `usuario_id`, así que el nombre del cajero se
    perdía (se guardaba el UUID como nombre). `usuario_nombre` restaura ese
    dato. Es OPCIONAL para no romper a un consumidor que aún no lo envíe: si
    falta, el router cae al `usuario_id` (comportamiento anterior).
    """

    terminal_id: str
    usuario_id: UUID
    monto_inicial: Decimal = Field(default=Decimal("0.00"), ge=0)
    usuario_nombre: str | None = None


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


class EliminarMovimientoSalida(BaseModel):
    """Salida del contrato 29: el movimiento eliminado (FASE 10.6.2).

    El viejo POS ya permitía borrar un movimiento mientras la caja estuviera
    abierta (RN-52); el nuevo POS lo había OMITIDO. Esta salida confirma el
    borrado para que el POS refresque el resumen sin adivinar.
    """

    eliminado: bool = True


class MovimientoResumen(BaseModel):
    """Un movimiento dentro del resumen del turno (contrato 12).

    FASE 10.6.2 — PARIDAD DE OPERACIÓN. Se añade `movement_id` para que el POS
    pueda ofrecer el botón ✕ de eliminar sobre cada movimiento (contrato 29).
    Sin el id, el cajero veía la lista pero no podía corregir un error de
    captura — la operación existía en el viejo POS y aquí faltaba.

    FASE 10.6.3 — PARIDAD DE OPERACIÓN. Se añaden `creado_en` (la hora del
    movimiento) y `motivo` (el concepto). El viejo POS mostraba, por cada
    movimiento, su concepto y su hora; el nuevo POS solo mostraba tipo y monto,
    así que el cajero no podía saber POR QUÉ se movió el dinero ni ubicarlo en
    el tiempo. La hora viaja en UTC (RN-78) y el POS la formatea a hora local.
    """

    movement_id: UUID
    tipo: str
    monto: Decimal
    motivo: str
    creado_en: datetime


class ResumenTurnoSalida(BaseModel):
    """Salida del contrato 12: la PROYECCIÓN del turno, no la tabla.

    `esperado` es el efectivo que debería haber en la caja (RN-53):
    fondo + entradas − salidas + ventas en efectivo.

    FASE 10.5 — PARIDAD DE DATOS DE CAJA. El viejo POS exponía
    `CashSummaryResponse` con 8 campos (`efectivo_esperado`, `total_credito`,
    `total_debito`, `total_ventas`, `num_transacciones`, `fondo_inicial`,
    `total_entradas`, `total_salidas`). El nuevo POS solo exponía 2
    (`esperado`, `movimientos`): el desglose que el cajero veía al cerrar el
    turno se había perdido. Estos 7 campos restauran ese desglose. Siguen
    siendo una PROYECCIÓN (no la tabla): se calculan con las reglas RN-53 y
    RN-58, no se leen columnas crudas.
    """

    esperado: Decimal
    movimientos: list[MovimientoResumen] = Field(default_factory=list)
    # --- Desglose de paridad (F10.5) ---
    fondo_inicial: Decimal = Decimal("0.00")
    total_entradas: Decimal = Decimal("0.00")
    total_salidas: Decimal = Decimal("0.00")
    total_credito: Decimal = Decimal("0.00")
    total_debito: Decimal = Decimal("0.00")
    total_ventas: Decimal = Decimal("0.00")
    num_transacciones: int = 0


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

    RESPUESTA LIGERA: una PROYECCIÓN de campos escalares explícitos (Regla 15).
    NO incluye las líneas: leer las líneas es responsabilidad del contrato 21.

    F12.6 — PARIDAD DE PRESENTACIÓN: el pizarrón del viejo POS mostraba, en
    cada post-it, el folio, la terminal, el cliente, el capturista, la hora y
    el tipo de pedido. Para que el nuevo pizarrón tenga PARIDAD REAL, el
    contrato 23 amplía su proyección con esos campos. Siguen siendo escalares
    (nada de tablas ni de `SELECT *`): la frontera A-02 / O-23 se respeta.
    `captured_by_name` viaja DESNORMALIZADO (foto histórica, patrón F10.5).
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    account_num: str
    status: str
    total: Decimal
    version: int
    # ── Paridad de presentación con el viejo POS (F12.6) ──────────────────
    terminal_id: str | None = None
    captured_by_name: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    order_type: str = "VENTA_DIRECTA"
    delivery_type: str | None = None
    created_at: datetime | None = None


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
