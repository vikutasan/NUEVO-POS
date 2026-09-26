"""Registro de los 17 contratos — FASE 2 (Frontera).

Cada contrato se declara aquí con su firma completa (entrada/salida) y su
proveedor. El registro es la fuente única de verdad: el test de la puerta F2
lo recorre y verifica que ningún contrato exponga una tabla.

Matriz de contratos (Documento 9 §10):

  #   Contrato                            Consumidor          Proveedor    Estado hoy
  1   catalogo.productos_para_venta       POS                 Catálogo     Ya existe (parcial)
  2   almacenes.consumir_por_venta        POS                 Almacenes    Deuda
  3   almacenes.disponibilidad            POS                 Almacenes    Deuda
  4   produccion.disponible_para_vender   POS                 Producción   Deuda
  5   pos.eventos_auditables              Auditoría           POS          Cicatriz
  6   pos.resumen_de_venta                Estadísticas        POS          Deuda
  7   seguridad.identidad_del_empleado    POS                 Seguridad    Deuda
  8   seguridad.validar_pin               POS                 Seguridad    Deuda
  9   caja.sesion_activa                  POS                 Caja         Ya existe
  10  caja.abrir_turno                    POS                 Caja         Ya existe
  11  caja.registrar_movimiento           POS                 Caja         Ya existe
  12  caja.resumen_del_turno              POS                 Caja         Ya existe
  13  caja.cerrar_turno                   POS                 Caja         Ya existe
  14  caja.reporte_diario                 POS / Estadísticas  Caja         Ya existe
  15  pedidos.registrar_desde_ticket      POS                 Pedidos      Deuda
  16  pedidos.pedido_del_ticket           POS                 Pedidos      Deuda
  17  vision.reconocer_producto           POS                 Visión       Deuda
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Contrato:
    """Un contrato entre módulos.

    Un contrato es una OPERACIÓN, no una tabla. Por eso `operacion` es
    obligatoria y `tabla_expuesta` debe ser siempre `None` (regla O-23).
    """

    numero: int
    nombre: str
    consumidor: str
    proveedor: str
    operacion: str
    entrada: dict[str, str]
    salida: dict[str, str]
    garantias: tuple[str, ...] = field(default_factory=tuple)
    errores: tuple[str, ...] = field(default_factory=tuple)
    estado_hoy: str = "Deuda"
    # Un contrato NUNCA expone una tabla. Este campo existe para poder
    # afirmarlo explícitamente en el test de la puerta.
    tabla_expuesta: None = None

    @property
    def firma(self) -> str:
        """La firma legible: `proveedor.operacion(entrada) -> salida`."""
        ent = ", ".join(f"{k}: {v}" for k, v in self.entrada.items())
        sal = ", ".join(f"{k}: {v}" for k, v in self.salida.items())
        return f"{self.nombre}({ent}) -> {{{sal}}}"


CONTRATOS: tuple[Contrato, ...] = (
    # ── §1 Catálogo ────────────────────────────────────────────────────────
    Contrato(
        numero=1,
        nombre="catalogo.productos_para_venta",
        consumidor="POS",
        proveedor="Catálogo",
        operacion="GET /catalog/products-for-sale",
        entrada={"channel": "String", "include_hidden": "Boolean = false"},
        salida={
            "productos": "List[ProductoParaVenta]",
            "categorias": "List[CategoriaParaVenta]",
        },
        garantias=(
            "Devuelve una PROYECCIÓN de venta, no la fila completa (O-23).",
            "Solo incluye productos visibles para el canal pedido.",
            "El precio ya viene resuelto por el proveedor.",
        ),
        errores=("400 si el canal es inválido.",),
        estado_hoy="Ya existe (parcial)",
    ),
    # ── §2 Almacenes ───────────────────────────────────────────────────────
    Contrato(
        numero=2,
        nombre="almacenes.consumir_por_venta",
        consumidor="POS",
        proveedor="Almacenes",
        operacion="POST /warehouse/consume-for-sale",
        entrada={
            "evento_id": "UUID",
            "items": "List[{item_id: String, item_type: String, cantidad: Numeric}]",
            "ticket_id": "UUID",
        },
        salida={"aplicado": "Boolean", "movimientos": "List[UUID]"},
        garantias=(
            "Idempotente por `evento_id` (patrón Outbox, A-04 / O-19).",
            "El POS NO escribe `products.stock` ni `stock_almacen`.",
            "Se ejecuta en la MISMA transacción del guardado del ticket.",
        ),
        errores=(
            "409 si el `evento_id` ya fue aplicado con otro contenido.",
            "422 si algún item no existe.",
        ),
    ),
    Contrato(
        numero=3,
        nombre="almacenes.disponibilidad",
        consumidor="POS",
        proveedor="Almacenes",
        operacion="GET /warehouse/availability",
        entrada={"item_ids": "List[String]", "almacen_id": "UUID NULL"},
        salida={"disponibilidad": "List[{item_id, item_type, cantidad_disponible: Numeric}]"},
        garantias=(
            "Devuelve una PROYECCIÓN, no la tabla `stock_almacen` (O-23).",
            "El POS NO lee `products.stock` (columna eliminada en F1).",
        ),
        errores=("400 si la lista de items está vacía.",),
    ),
    # ── §3 Producción ──────────────────────────────────────────────────────
    Contrato(
        numero=4,
        nombre="produccion.disponible_para_vender",
        consumidor="POS",
        proveedor="Producción",
        operacion="GET /production/available-to-sell",
        entrada={"fecha": "Date (hora local)", "channel": "String"},
        salida={"disponibles": "List[{producto_id, cantidad: Numeric}]"},
        garantias=(
            "Usa la fecha LOCAL, no UTC (corrige D-28 / O-20).",
            "El POS NO lee la tabla `doughs`.",
        ),
        errores=("400 si el formato de fecha es inválido.",),
    ),
    # ── §4 Auditoría (POS es PROVEEDOR) ────────────────────────────────────
    Contrato(
        numero=5,
        nombre="pos.eventos_auditables",
        consumidor="Auditoría",
        proveedor="POS",
        operacion="GET /pos/auditable-events",
        entrada={"desde": "DateTime(timezone=True)", "hasta": "DateTime(timezone=True)"},
        salida={"eventos": "List[{tipo, ticket_id, usuario_id, timestamp, detalle}]"},
        garantias=(
            "El POS expone un RESUMEN de eventos, nunca su tabla `tickets`.",
            "Es una cicatriz: ya existe y se conserva.",
        ),
        errores=("400 si el rango de fechas es inválido.",),
        estado_hoy="Cicatriz",
    ),
    # ── §5 Estadísticas (POS es PROVEEDOR) ─────────────────────────────────
    Contrato(
        numero=6,
        nombre="pos.resumen_de_venta",
        consumidor="Estadísticas",
        proveedor="POS",
        operacion="GET /pos/sales-summary",
        entrada={"desde": "Date (hora local)", "hasta": "Date (hora local)"},
        salida={
            "total_ventas": "Numeric(12,2)",
            "numero_tickets": "Integer",
            "por_canal": "List[{canal, total: Numeric(12,2)}]",
        },
        garantias=(
            "El POS expone un RESUMEN, nunca su tabla `tickets` (O-23).",
            "Usa la fecha LOCAL, no UTC.",
        ),
        errores=("400 si el rango de fechas es inválido.",),
    ),
    # ── §6 Seguridad ───────────────────────────────────────────────────────
    Contrato(
        numero=7,
        nombre="seguridad.identidad_del_empleado",
        consumidor="POS",
        proveedor="Seguridad",
        operacion="GET /security/employees/{employee_id}",
        entrada={"employee_id": "UUID"},
        salida={
            "employee_id": "UUID",
            "nombre": "String",
            "perfil": "String",
            "permisos": "List[String]",
        },
        garantias=(
            "Devuelve una PROYECCIÓN, no la tabla `employees` (O-23).",
            "El POS NO lee `employees` directamente.",
        ),
        errores=("404 si el empleado no existe.",),
    ),
    Contrato(
        numero=8,
        nombre="seguridad.validar_pin",
        consumidor="POS",
        proveedor="Seguridad",
        operacion="POST /security/employees/validate-pin",
        entrada={"pin": "String"},
        salida={"valido": "Boolean", "employee_id": "UUID NULL"},
        garantias=(
            "Único contrato que expone un secreto en tránsito (O-21).",
            "Exige HTTPS y rate-limit obligatorio (O-21).",
        ),
        errores=(
            "429 si se excede el rate-limit.",
            "401 si el PIN es inválido.",
        ),
    ),
    # ── §7 Caja (ya existe, completo) ──────────────────────────────────────
    Contrato(
        numero=9,
        nombre="caja.sesion_activa",
        consumidor="POS",
        proveedor="Caja",
        operacion="GET /cash/active-session",
        entrada={"terminal_id": "UUID"},
        salida={"cash_session_id": "UUID NULL", "abierta_en": "DateTime(timezone=True) NULL"},
        garantias=("El POS NO lee la tabla `cash_sessions`.",),
        errores=(),
        estado_hoy="Ya existe",
    ),
    Contrato(
        numero=10,
        nombre="caja.abrir_turno",
        consumidor="POS",
        proveedor="Caja",
        operacion="POST /cash/open-session",
        entrada={"terminal_id": "UUID", "usuario_id": "UUID", "monto_inicial": "Numeric(12,2)"},
        salida={"cash_session_id": "UUID", "abierta_en": "DateTime(timezone=True)"},
        garantias=("Una sola sesión abierta por terminal.",),
        errores=("409 si ya hay una sesión abierta en la terminal.",),
        estado_hoy="Ya existe",
    ),
    Contrato(
        numero=11,
        nombre="caja.registrar_movimiento",
        consumidor="POS",
        proveedor="Caja",
        operacion="POST /cash/movements",
        entrada={
            "cash_session_id": "UUID",
            "tipo": "String",
            "monto": "Numeric(12,2)",
            "motivo": "Text NULL",
        },
        salida={"movement_id": "UUID"},
        garantias=("Una sesión CLOSED ya no acepta movimientos.",),
        errores=("400 si la sesión está cerrada.",),
        estado_hoy="Ya existe",
    ),
    Contrato(
        numero=12,
        nombre="caja.resumen_del_turno",
        consumidor="POS",
        proveedor="Caja",
        operacion="GET /cash/session-summary/{cash_session_id}",
        entrada={"cash_session_id": "UUID"},
        salida={
            "esperado": "Numeric(12,2)",
            "movimientos": "List[{tipo, monto: Numeric(12,2)}]",
        },
        garantias=("Devuelve una PROYECCIÓN, no la tabla `cash_movements`.",),
        errores=("404 si la sesión no existe.",),
        estado_hoy="Ya existe",
    ),
    Contrato(
        numero=13,
        nombre="caja.cerrar_turno",
        consumidor="POS",
        proveedor="Caja",
        operacion="POST /cash/close-session",
        entrada={
            "cash_session_id": "UUID",
            "montos_fisicos": "Numeric(12,2)",
        },
        salida={
            "esperado": "Numeric(12,2)",
            "capturado": "Numeric(12,2)",
            "diferencia": "Numeric(12,2)",
        },
        garantias=(
            "Marca la sesión como CLOSED y guarda los montos físicos capturados.",
            "Devuelve la diferencia (descuadre) para que el cajero la vea.",
            "Una sesión CLOSED ya no acepta movimientos.",
        ),
        errores=("400 si la sesión ya está cerrada.",),
        estado_hoy="Ya existe",
    ),
    Contrato(
        numero=14,
        nombre="caja.reporte_diario",
        consumidor="POS / Estadísticas",
        proveedor="Caja",
        operacion="GET /cash/daily-report/{fecha}",
        entrada={"fecha": "Date (hora local)"},
        salida={"reporte": "List[{canal, cajero, terminal, total: Numeric(12,2)}]"},
        garantias=(
            "Agrupa por canal y por cajero/terminal.",
            "Usa la fecha LOCAL, no UTC.",
        ),
        errores=("400 si el formato de fecha es inválido.",),
        estado_hoy="Ya existe",
    ),
    # ── §8 Pedidos ─────────────────────────────────────────────────────────
    Contrato(
        numero=15,
        nombre="pedidos.registrar_desde_ticket",
        consumidor="POS",
        proveedor="Pedidos",
        operacion="POST /orders/from-ticket",
        entrada={
            "ticket_id": "UUID",
            "order_type": "String",
            "status_ticket": "String",
            "delivery_type": "String",
            "customer_name": "String NULL",
            "customer_phone": "String NULL",
            "committed_at": "DateTime(timezone=True) NULL",
            "packaging_type": "String",
            "delivery_address": "Text NULL",
            "notes": "Text NULL",
        },
        salida={
            "order_id": "UUID",
            "status": "String",
            "earliest_ready_at": "DateTime(timezone=True)",
        },
        garantias=(
            "Idempotente por `ticket_id`: si el pedido ya existe, lo ACTUALIZA.",
            "El mapeo de estado es del proveedor: OPEN → TENTATIVO, PAID → PAGADO.",
            "Pedidos calcula `earliest_ready_at`; el POS no lo inventa.",
            "Se ejecuta en la MISMA transacción del guardado del ticket.",
        ),
        errores=(
            "404 si el ticket no existe.",
            "409 si el ticket no es de tipo PEDIDO.",
        ),
    ),
    Contrato(
        numero=16,
        nombre="pedidos.pedido_del_ticket",
        consumidor="POS",
        proveedor="Pedidos",
        operacion="GET /orders/by-ticket/{ticket_id}",
        entrada={"ticket_id": "UUID"},
        salida={
            "order_id": "UUID",
            "delivery_type": "String",
            "status": "String",
            "customer_name": "String NULL",
            "customer_phone": "String NULL",
            "committed_at": "DateTime(timezone=True) NULL",
            "packaging_type": "String",
            "delivery_address": "Text NULL",
            "delivery_fee": "Numeric(12,2) NULL",
            "notes": "Text NULL",
        },
        garantias=(
            "Devuelve el pedido asociado al ticket, o 404 si no tiene.",
            "Devuelve una PROYECCIÓN, no la fila completa (O-23).",
        ),
        errores=("404 si el ticket no existe o no tiene pedido.",),
    ),
    # ── §9 Visión ──────────────────────────────────────────────────────────
    Contrato(
        numero=17,
        nombre="vision.reconocer_producto",
        consumidor="POS",
        proveedor="Visión",
        operacion="POST /vision/predict",
        entrada={"frame_base64": "String", "channel": "String", "top_k": "Integer = 3"},
        salida={
            "detecciones": "List[{sku, nombre, confianza: Float(0..1), bbox}]",
            "modelo_version": "String",
        },
        garantias=(
            "Devuelve hasta `top_k` candidatos ordenados por confianza.",
            "Si no reconoce nada, devuelve lista vacía (200), no error.",
            "El POS decide qué hacer con la detección: Visión solo sugiere.",
        ),
        errores=(
            "400 si `frame_base64` está vacío o excede 5 MB.",
            "503 si el modelo no está cargado.",
        ),
    ),
)


def listar_contratos() -> tuple[Contrato, ...]:
    """Devuelve los 17 contratos del registro."""
    return CONTRATOS
