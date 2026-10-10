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
from uuid import UUID, uuid5

from pydantic import BaseModel, ConfigDict, Field, field_validator


# FICHA_FIX_TURNO_CAJA_USUARIO_ID (7 Oct 2026) — Espacio de nombres fijo para
# derivar un UUID DETERMINISTA a partir del id NUMÉRICO del ERP (p. ej. `1`).
# El mismo id del ERP produce SIEMPRE el mismo UUID, así que la identidad del
# cajero es estable entre turnos, cortes y reportes. El valor es arbitrario
# pero INMUTABLE: cambiarlo reasignaría la identidad de todos los cajeros.
ESPACIO_IDS_ERP = UUID("6f2a1c9e-0b7d-4e3a-9c5f-1d8b2a4e6f70")


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


class SesionTerminalEntrada(BaseModel):
    """Entrada de `POST /pos/sessions` — abrir (o reutilizar) la sesión.

    Paridad con el viejo POS: al seleccionar una terminal se abre su sesión.
    El endpoint es idempotente, así que basta con el `terminal_id`.
    """

    terminal_id: str = Field(min_length=1, description="Id de la terminal (ej. TERM-04)")


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

    F12.21 — Los campos `order_*` viajan desde FASE 12.21 para que el ticket
    IMPRESO al cobrar pueda decidir la DOBLE COPIA (copia CLIENTE + copia
    COMERCIO) de un PEDIDO y pintar su sección de datos de entrega. Antes, el
    cobro devolvía un ticket SIN `order_type`, así que el POS no podía saber si
    era un pedido y siempre imprimía copia única. Es una PROYECCIÓN (O-23), no
    una tabla: solo los campos que el papel necesita.
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
    # F12.21 — Datos de pedido para la impresión (doble copia + sección de
    # entrega). En una VENTA_DIRECTA viajan con sus defaults (`order_type`
    # = 'VENTA_DIRECTA' y el resto `None`).
    order_type: str = "VENTA_DIRECTA"
    delivery_type: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    committed_at: datetime | None = None
    packaging_type: str | None = None
    delivery_address: str | None = None
    order_notes: str | None = None


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

    # BUG-08 — El turno de caja de la terminal que COBRA (no la de origen del
    # ticket). Una terminal con turno abierto puede cobrar cuentas de OTRAS
    # terminales; el dinero debe contarse en la caja que lo recibió (RN-53).
    # Opcional por retrocompatibilidad: si falta, el backend cae al
    # comportamiento anterior (turno de la terminal del ticket). El backend
    # VALIDA el turno recibido (E-13): existe + OPEN (RN-55) + su terminal
    # tiene sesión activa (RN-24).
    cash_session_id: UUID | None = None


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


class ActualizarPedidoEntrada(BaseModel):
    """Entrada del contrato 31: actualizar la programación de un ticket YA creado.

    ─────────────────────────────────────────────────────────────────────────────
    Por qué existe este contrato
    ─────────────────────────────────────────────────────────────────────────────
    El flujo REAL del POS es "productos primero, pedido después": el cajero
    agrega productos (el ticket nace como VENTA_DIRECTA por el contrato 29) y
    LUEGO abre el modal 📌 para programarlo como PEDIDO. Antes de este contrato,
    `guardarPedido` solo guardaba el bloque en memoria y, como el ticket ya
    existía, NUNCA lo persistía: el `order_type` se quedaba en VENTA_DIRECTA y
    el post-it del pizarrón no se distinguía de una cuenta normal.

    Este contrato cierra ese hueco: permite ACTUALIZAR los 9 campos `order_*`
    de un ticket OPEN ya creado y re-proyectar el pedido (contrato 15) en la
    MISMA transacción. Es la contraparte de escritura del contrato 29 (que solo
    fija la programación al CREAR).

    Todos los campos son OPCIONALES: solo se aplican los que vienen con valor
    (semántica PATCH). Un campo ausente NO se toca; un campo presente con `null`
    limpia el valor (permite revertir un pedido a venta directa).

    `version` es obligatorio: la actualización es una escritura y valida
    concurrencia optimista (RN-25). Si no coincide, el servidor responde 409.
    """

    version: int = Field(ge=0, description="Version esperado (RN-25)")

    # ── Programación de pedido (los 9 campos del modelo Ticket) ───────────
    order_type: str | None = None
    order_status: str | None = None
    delivery_type: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    committed_at: datetime | None = None
    packaging_type: str | None = None
    delivery_address: str | None = None
    order_notes: str | None = None


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


class LineasTicketSalida(BaseModel):
    """Salida del contrato 30: las líneas de un ticket (FASE 12.10).

    Cierra el hueco A-02 que dejó abierto la Regla 15: el contrato 21 devuelve
    EXACTAMENTE 5 campos escalares y NO las líneas, así que recuperar una cuenta
    del pizarrón no podía hidratar el carrito. Este contrato es de SOLO LECTURA
    y devuelve una PROYECCIÓN (O-23): nunca la tabla `ticket_items`.

    `item_id` es la clave de idempotencia que el cliente envió (contrato 18).
    Como el modelo `TicketItem` no la persiste todavía (deuda D-9), se deriva
    del `product_id` de forma determinista — igual que `_lineas_atomicas`.
    """

    ticket_id: UUID
    version: int
    total: Decimal
    lineas: list[LineaAtomicaSalida] = Field(default_factory=list)


class VerificarEnvioEntrada(BaseModel):
    """Entrada del contrato 22: verificar que el ticket y sus ítems existen.

    `item_ids` es lo que el cliente CREE haber enviado. El servidor responde
    qué de eso está realmente persistido.

    BUG-07 — `cantidades` (opcional): la cantidad de UNIDADES de cada línea del
    carrito, en el MISMO orden que `item_ids`. Es necesaria porque RN-17 fusiona
    los productos repetidos en UNA sola fila de `ticket_items` (incrementando su
    `quantity`). Comparar el NÚMERO DE LÍNEAS del carrito contra el NÚMERO DE
    FILAS del servidor daba un falso déficit: un carrito con el mismo producto
    agregado 2× (2 líneas) contra 1 fila fusionada parecía "perder" una línea.
    La pregunta correcta es por UNIDADES: el servidor debe tener al menos tantas
    unidades como el carrito afirma. Si `cantidades` se omite (cliente viejo),
    se degrada al conteo de líneas (comportamiento previo, BUG-06).
    """

    item_ids: list[str] = Field(default_factory=list)
    cantidades: list[int] = Field(default_factory=list)


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

    FICHA_FIX_TURNO_CAJA_USUARIO_ID (7 Oct 2026) — TOLERANCIA AL ID DEL ERP.
    El ERP autentica al cajero con un id NUMÉRICO (`currentUser.id = 1`), no
    con un UUID. Declarar `usuario_id: UUID` hacía que Pydantic v2 rechazara
    la petición con 422 (`uuid_type`) y el turno NUNCA se abría. Es la misma
    clase de bug que F7.7c (el id del ERP es un número, no un UUID).

    La corrección NO relaja la frontera: el contrato sigue exigiendo un
    identificador de empleado, pero acepta `str | int | UUID` y lo normaliza
    a un UUID DETERMINISTA (mismo id → mismo UUID) en un validador. Así el
    POS puede enviar `1` y el backend lo persiste como un UUID estable, sin
    romper a un consumidor que ya envíe un UUID real.
    """

    terminal_id: str
    usuario_id: str | int | UUID
    monto_inicial: Decimal = Field(default=Decimal("0.00"), ge=0)
    usuario_nombre: str | None = None

    @field_validator("usuario_id", mode="before")
    @classmethod
    def _normalizar_usuario_id(cls, valor: object) -> UUID:
        """Normaliza el id del empleado a un UUID determinista.

        - Si ya es un `UUID`, se respeta tal cual.
        - Si es un UUID en texto, se parsea.
        - Si es un id numérico del ERP (p. ej. `1`), se deriva un UUID
          determinista con `uuid5` sobre un espacio de nombres fijo, de modo
          que el MISMO id del ERP produzca SIEMPRE el MISMO UUID (trazabilidad
          estable entre turnos, cortes y reportes).
        """
        if isinstance(valor, UUID):
            return valor
        if isinstance(valor, str):
            try:
                return UUID(valor)
            except (ValueError, AttributeError):
                # No es un UUID en texto: se trata como id del ERP.
                return uuid5(ESPACIO_IDS_ERP, valor)
        if isinstance(valor, int):
            return uuid5(ESPACIO_IDS_ERP, str(valor))
        raise ValueError("usuario_id debe ser un UUID o un id de empleado")


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
    # ── BUG-04 (10 Oct 2026) — Contexto de pedido COMPLETO ────────────────
    # Al recuperar un PEDIDO del pizarrón, el cliente reconstruye su bloque
    # `order_*` desde el post-it (contrato 23). Antes faltaban estos cuatro
    # campos, así que la fecha compromiso de entrega (`committed_at`), el
    # empaque, la dirección y las notas se PERDÍAN del estado local al
    # recuperar la cuenta (solo sobrevivían si nunca se salía de la terminal).
    # Siguen siendo escalares (Regla 15): la frontera A-02 se respeta.
    committed_at: datetime | None = None
    packaging_type: str | None = None
    delivery_address: str | None = None
    order_notes: str | None = None


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


# ---------------------------------------------------------------------------
# Auditoría — Contrato 5 (FASE 13.1)
# ---------------------------------------------------------------------------

class EventoAuditableSalida(BaseModel):
    """Un evento auditable del POS (contrato 5).

    Es una PROYECCIÓN, no la fila completa de `pos_audit_log` (O-23): expone
    solo los 5 campos que Auditoría necesita para reconstruir qué pasó. NO
    expone `id` (clave interna), `payload` crudo ni `extras` (internos del POS).
    """

    model_config = ConfigDict(from_attributes=True)

    tipo: str
    ticket_id: str | None = None
    usuario_id: str | None = None
    timestamp: datetime
    detalle: dict = Field(default_factory=dict)


class EventosAuditablesSalida(BaseModel):
    """La lista de eventos auditables en un rango (contrato 5).

    El POS expone un RESUMEN de eventos, nunca su tabla `tickets` (garantía del
    contrato 5). Es una cicatriz: ya existe y se conserva.
    """

    model_config = ConfigDict(from_attributes=True)

    eventos: list[EventoAuditableSalida] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Notificaciones — Contrato 27 (FASE 12.22)
# ---------------------------------------------------------------------------

class EncolarTicketEntrada(BaseModel):
    """Entrada del contrato 27: encolar el envío del ticket (Outbox).

    La firma está ALINEADA con lo que el POS realmente envía
    (`notificationsService.encolarTicket` → `TicketDeliveryPanel`). El contrato
    declarado originalmente (`{ticket_id, canal, destino, payload}`) describía
    una operación de UN canal; el POS encola VARIOS canales de una vez, así que
    la entrada real es `{evento_id, ticket_uuid, canales[], destinatario,
    payload}`.

    Reglas que respeta:
      - RN-86: `evento_id` es la clave de idempotencia. Obligatorio.
      - RN-89: cada canal debe ser WHATSAPP o EMAIL.
      - RN-90: el destino debe corresponder al canal (teléfono o email).
    """

    evento_id: str = Field(min_length=1)
    ticket_uuid: UUID | None = None
    canales: list[str] = Field(default_factory=list)
    destinatario: dict[str, Any] = Field(default_factory=dict)
    payload: dict[str, Any] = Field(default_factory=dict)


class MensajeEncoladoSalida(BaseModel):
    """El resultado del encolado de UN canal."""

    canal: str
    estado: str
    envio_id: UUID


class EncolarTicketSalida(BaseModel):
    """Salida del contrato 27: el resultado del encolado.

    `encolado` es True si al menos un canal quedó en la cola. `mensajes` detalla
    cada canal con su `envio_id` (el id de la fila del outbox), para que el POS
    pueda trazarlo si el worker reporta un fallo después.
    """

    encolado: bool
    mensajes: list[MensajeEncoladoSalida] = Field(default_factory=list)
