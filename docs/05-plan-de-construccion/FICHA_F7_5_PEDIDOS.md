# FICHA F7.5 — El puente POS → Pedidos (proyección ticket → order)

> **Fase:** 7 (Voz + Visión IA + Selector de Temas) — Sub-fase **7.5a**
> **Estado:** ✅ CERRADA — puerta en verde
> **Fecha:** 2026-09-30
> **Commit:** _(se registra al final de esta ficha)_
> **Plan de abordaje:** [`PLAN_DE_ABORDAJE_FASE_7_5_PEDIDOS.md`](../../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_7_5_PEDIDOS.md) §5

---

## 1. Por qué existe esta sub-fase

El **diagnóstico de la Fase 7.5** detectó, con evidencia, que el **puente
POS → Pedidos → Producción** estaba **documentado en 4 lugares** del plan
maestro pero **omitido en la ejecución**:

- El POS viejo **violaba A-02 / P-01**: importaba el modelo `Order` y escribía
  la tabla `orders` **directamente** desde el frontend.
- El POS nuevo, al reescribirse, **no construyó el puente**: un ticket con
  `order_type = PEDIDO` se guardaba en `tickets.order_*` pero **nunca se
  proyectaba** a la tabla `orders` que consume el módulo de Pedidos/Producción.

Sin este puente, un pedido programado en el POS **no llegaba a la cocina**.
La F7.5a construye la frontera **de adentro hacia afuera**: primero el contrato
y la proyección (backend), luego el hook y el modal (frontend), y al final el
cableado en la pantalla viva.

### 1.1 La REGLA DURA 2 ("verificar, no asumir") en acción

El plan v3.0 **asumía** que la tabla `system_settings` existía (DT-06.2). La
autocrítica v3.0 lo verificó contra el código y descubrió que **no existía**:
`models/__init__.py` declaraba 17 modelos y ninguno era `SystemSetting`. La
v3.1 corrigió el plan y la F7.5.1a **creó la tabla** antes de usarla.

Durante la ejecución de esta misma sub-fase, el gate de la F7.5.6 **atrapó un
`ReferenceError` real**: [`RetailVisionPOS.jsx`](../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx:564)
referenciaba una variable `ticket` que **no existía** en el ámbito (el
componente usa `ticketId`). El bug habría desmontado el árbol de React en
producción. **El gate lo detectó antes del commit** — exactamente para lo que
existe.

---

## 2. Qué se construyó (sub-fases F7.5.0 → F7.5.7)

### 2.1 F7.5.0 — Extender `POST /pos/tickets` con los campos de pedido

**Archivos:** [`schemas.py`](../NUEVO-POS/apps/api/schemas.py:100),
[`routers/pos.py`](../NUEVO-POS/apps/api/routers/pos.py:245).

- `CrearTicketEntrada` se extendió con **9 campos** de pedido (contrato 15):
  `order_type`, `order_status`, `delivery_type`, `customer_name`,
  `customer_phone`, `committed_at`, `packaging_type`, `delivery_address`,
  `order_notes`.
- `crear_ticket` los persiste en el `Ticket` y usa `flush()` + `commit()` final
  (sin commit temprano — D-5 de la autocrítica v3.0).
- `cobrar_ticket` también usa `flush()` + `commit()` final.

### 2.2 F7.5.1a — La tabla `system_settings` (DT-06.2)

**Archivos:** [`models/settings.py`](../NUEVO-POS/apps/api/models/settings.py:1),
[`models/__init__.py`](../NUEVO-POS/apps/api/models/__init__.py:1),
[`migrations/versions/0002_system_settings.py`](../NUEVO-POS/apps/api/migrations/versions/0002_system_settings.py:1).

- Modelo `SystemSetting` (clave/valor) — la **capa de almacenamiento** de la
  configuración transversal (DT-06.2).
- Registrado en `models/__init__.py` (**17 → 18 modelos**).
- Migración `0002_system_settings` (`down_revision = "0001_initial_schema"`).

### 2.3 F7.5.1b — El lector de política (DT-06 / DT-07)

**Archivos:** [`services/__init__.py`](../NUEVO-POS/apps/api/services/__init__.py:1),
[`services/settings_service.py`](../NUEVO-POS/apps/api/services/settings_service.py:1).

- `leer_valor(db, clave)` — lectura tolerante (devuelve `None` si falta).
- `leer_politica_pago(db)` — devuelve `PAGO_COMPLETO` **por defecto** (DT-07:
  la ausencia de configuración degrada al comportamiento más conservador, nunca
  bloquea la venta).

### 2.4 F7.5.2 — La proyección `ticket → order` (contrato 15)

**Archivo:** [`services/orders_service.py`](../NUEVO-POS/apps/api/services/orders_service.py:1).

- `proyectar_pedido(db, ticket, *, forzar=False)` — proyección **idempotente**
  por `ticket_id` (RN-58).
- **Salta** si el ticket no es PEDIDO (`order_type == "VENTA_DIRECTA"`, RN-59).
- Si `not forzar`, lee la política y solo proyecta cuando corresponde.
- `_mapear_estado`: `PAID → PAGADO`, resto → `TENTATIVO` (vía
  `rn69_catorce_estados`).
- Hace `flush()` pero **NO** `commit()` — la transacción la cierra el router.
- **Cableado:** `crear_ticket` llama `proyectar_pedido(db, ticket)`;
  `cobrar_ticket` llama `proyectar_pedido(db, ticket, forzar=True)`.
- **Bug corregido:** faltaba el `import` de `proyectar_pedido` en `pos.py`.

### 2.5 F7.5.3 — Los endpoints de pedidos (contrato 16)

**Archivos:** [`schemas.py`](../NUEVO-POS/apps/api/schemas.py:418),
[`routers/orders.py`](../NUEVO-POS/apps/api/routers/orders.py:1),
[`main.py`](../NUEVO-POS/apps/api/main.py:1).

- `PedidoDelTicketSalida` (10 campos, `from_attributes=True`).
- `GET /orders/by-ticket/{ticket_id}` → proyección explícita campo por campo
  (O-23); 404 si no hay pedido.
- Registrado en `main.py` (`app.include_router(orders.router)`).
- **249 tests de API en verde.**

### 2.6 F7.5.4 — El servicio y el hook (frontend)

**Archivos:** [`api/client.js`](../NUEVO-POS/apps/pos/src/api/client.js:1),
[`services/ordersService.js`](../NUEVO-POS/apps/pos/src/services/ordersService.js:1),
[`hooks/useOrderProgramming.js`](../NUEVO-POS/apps/pos/src/hooks/useOrderProgramming.js:1).

- `getPedidoDelTicket(ticketId)` en `client.js`.
- `obtenerPedidoDelTicket(ticketId)` → `{outcome, reason, data}`; mapea
  404→`sin_pedido`, 422→`datos_invalidos`, 0→`sin_conexion`.
- `useOrderProgramming` exporta `TIPOS_PEDIDO`, `TIPOS_ENTREGA`, `TIPOS_EMPAQUE`,
  `construirBloquePedido(formulario)` (pura; devuelve `{}` para VENTA_DIRECTA) y
  el hook `useOrderProgramming({ticketId, servicioPedidos})`.

### 2.7 F7.5.5 — El modal heredado (§6.8)

**Archivo:** [`components/OrderProgrammingModal.jsx`](../NUEVO-POS/apps/pos/src/components/OrderProgrammingModal.jsx:1).

- **UX heredada del viejo POS** (`ProgramacionPedidoModal.jsx`), **implementación
  reescrita** con los tokens del POS nuevo (§6.8).
- Props: `{ lineas, numeroCuenta, datosIniciales, onGuardar, onCerrar }`.
- Exporta `calcularAnticipacionMaxima`, `aIsoLocal`, `formatearFechaHora`.
- Selectores clave: `aria-label="Programación del pedido"` (dialog),
  `id="input-customer-name"`, `id="input-customer-phone"`,
  `id="input-committed-at"`, `id="btn-guardar-pedido"`.
- Dinero con `Number()` (DT-02); targets táctiles ≥44px (R-04).

### 2.8 F7.5.6 — El cableado en la pantalla viva

**Archivos:** [`RetailVisionPOS.jsx`](../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx:80),
[`components/POSHeader.jsx`](../NUEVO-POS/apps/pos/src/components/POSHeader.jsx:47),
[`hooks/useTicketActions.js`](../NUEVO-POS/apps/pos/src/hooks/useTicketActions.js:34).

- `RetailVisionPOS.jsx`: estado `pedidoAbierto` / `bloquePedido`;
  `asegurarTicket(bloque)`; handler `guardarPedido(bloque)`; el
  `<OrderProgrammingModal>` renderizado tras el panel de voz.
- `POSHeader.jsx`: props `onAbrirPedido` / `pedidoProgramado`; botón 📌 con
  `aria-label="Programar pedido"` y `min-h-tactil min-w-tactil`.
- `useTicketActions.js`: `crearTicket(items, bloquePedido = null)` inyecta el
  bloque en el cuerpo de `crearVenta` **solo si tiene claves**.
- **Bug corregido por el gate:** `numeroCuenta={ticket?.folio || ticket?.id}`
  → `numeroCuenta={ticketId || null}` (la variable `ticket` no existía).

### 2.9 F7.5.7 — El gate + el cierre

**Archivo:** [`RetailVisionPOS.f7_5a.test.jsx`](../NUEVO-POS/apps/pos/src/RetailVisionPOS.f7_5a.test.jsx:1).

Gate de integración con **7 criterios / 11 tests**:

| # | Criterio | Tests |
|---|---|---|
| 1 | El header expone el botón 📌 "Programar pedido" (con target táctil) | 2 |
| 2 | Tocar 📌 abre el modal (arranca en PICKUP/PROPIO; guardar deshabilitado) | 3 |
| 3 | El bloque de pedido viaja en `POST /pos/tickets` (y omite dirección en PICKUP) | 2 |
| 4 | La venta directa **no** lleva campos de pedido (RN-59) | 1 |
| 5 | Frontera por contratos: no llama a `/orders/from-ticket` ni a `/settings` | 1 |
| 6 | Cerrar el modal (✕) no rompe la pantalla | 1 |
| 7 | El modal es fluido (R-03: sin ancho fijo en px) | 1 |

---

## 3. Evidencia de la puerta

### 3.1 Gate de la F7.5a (11/11 en verde)

```
✓ Criterio 1 — el botón 📌 "Programar pedido" está presente
✓ Criterio 1 — el botón 📌 tiene target táctil (min-h-tactil, R-04)
✓ Criterio 2 — el modal de programación aparece al tocar el botón
✓ Criterio 2 — el modal arranca en PICKUP y con el empaque PROPIO (RN-56/RN-57)
✓ Criterio 2 — el botón de guardar está deshabilitado hasta completar los obligatorios
✓ Criterio 3 — al guardar el pedido, el cuerpo de crearVenta incluye los campos del pedido
✓ Criterio 3 — el bloque NO incluye la dirección cuando el tipo de entrega es PICKUP
✓ Criterio 4 — agregar un producto sin programar pedido crea el ticket sin `order_type`
✓ Criterio 5 — la pantalla no llama a /orders/from-ticket ni a /settings
✓ Criterio 6 — el botón ✕ cierra el modal y el POS sigue usable
✓ Criterio 7 — el contenedor del modal no usa un ancho fijo en px sin max-/min-

Test Files  1 passed (1)
     Tests  11 passed (11)
```

### 3.2 CI completo (verde)

```
=== LINT (F0) ===
Archivos en la obra: 233
Lint OK: 0 errores.

=== TESTS ===
  ✅ Tests de Node      : 3/3 archivo(s) en verde
  ✅ Tests de componentes: PASA
  ✅ Tests de API       : PASA
  ✅ RESULTADO: TODOS LOS TESTS EN VERDE.

=== GUARDIANES DE ESTÁNDARES ===
[OK] E-05 — Silencios en ruta crítica → 0 coincidencia(s)
[OK] A-04 — Silencios en la ruta crítica de guardianes → 0 coincidencia(s)
[OK] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
[OK] E-15 — TODOs sin formato declarado → 0 coincidencia(s)
[OK] R-01 — Ancho fijo en la superficie → 0 coincidencia(s)
[OK] E-09 — Dinero en Float → 0 coincidencia(s)
[OK] E-10 — Tiempo naive → 0 coincidencia(s)
```

---

## 4. Trazabilidad regla → sub-fase (verificada)

| Regla / Directriz | Sub-fase que la cumple |
|---|---|
| **A-02 / P-01** (frontera por contratos) | F7.5.2 (proyección interna) + F7.5.6 (el frontend no llama a Pedidos) |
| **DT-06** (configuración en Vista General) | F7.5.1a (crear `system_settings`) + F7.5.1b (el POS **lee**, no define) |
| **DT-06.2** (capa de almacenamiento) | F7.5.1a (la tabla `system_settings`) |
| **DT-06.3.2** (un solo lugar de declaración) | F7.5.1b (el POS no tiene selector de política) |
| **DT-07** (la venta nunca se bloquea) | F7.5.1b (default seguro) + F7.5.2 |
| **Política `PAGO_COMPLETO`** (default seguro) | F7.5.1b + F7.5.2 |
| **RN-55** (el pedido se deriva del ticket) | F7.5.2 (mapeo del estado) |
| **RN-56** (PICKUP por defecto) | F7.5.4 + F7.5.5 |
| **RN-57** (PROPIO por defecto) | F7.5.4 + F7.5.5 |
| **RN-58** (proyección idempotente) | F7.5.2 |
| **RN-59** (VENTA_DIRECTA no genera pedido) | F7.5.2 + F7.5.6 (criterio 4) |
| **RN-67..RN-70** (el puente del pedido) | F7.5.2 + F7.5.3 |
| **DT-02** (dinero STRING en el cable) | F7.5.3 + F7.5.5 |
| **§6.8** (UX heredada del viejo POS) | F7.5.5 + F7.5.6 |
| **R-04** (target ≥44px) | F7.5.5 + F7.5.6 (criterio 1) |
| **A-01** (regla con su test) | Todas las sub-fases |
| **Contrato 15** (los 10 campos) | F7.5.0 + F7.5.2 + F7.5.3 |
| **F3.2 / F4.0** (atomicidad y caja) | F7.5.2 (los gates siguen verdes) |

---

## 5. Lo que queda diferido (F7.5b)

La **F7.5b** queda **explícitamente diferida** hasta que exista el módulo
**Vista General**:

- Hoy el POS **lee** la política `order_payment_policy` con un default seguro
  (`PAGO_COMPLETO`). Cuando Vista General exista, el POS leerá la política
  **real** declarada por el dueño — **sin tocar el POS** (la frontera ya está
  construida).

---

## 6. Archivos tocados (resumen)

| Capa | Archivo | Sub-fase |
|---|---|---|
| API · esquemas | `apps/api/schemas.py` | F7.5.0, F7.5.3 |
| API · router POS | `apps/api/routers/pos.py` | F7.5.0, F7.5.2 |
| API · modelo | `apps/api/models/settings.py` | F7.5.1a |
| API · modelo | `apps/api/models/__init__.py` | F7.5.1a |
| API · migración | `apps/api/migrations/versions/0002_system_settings.py` | F7.5.1a |
| API · servicio | `apps/api/services/settings_service.py` | F7.5.1b |
| API · servicio | `apps/api/services/orders_service.py` | F7.5.2 |
| API · router | `apps/api/routers/orders.py` | F7.5.3 |
| API · entrada | `apps/api/main.py` | F7.5.3 |
| POS · cliente | `apps/pos/src/api/client.js` | F7.5.4 |
| POS · servicio | `apps/pos/src/services/ordersService.js` | F7.5.4 |
| POS · hook | `apps/pos/src/hooks/useOrderProgramming.js` | F7.5.4 |
| POS · componente | `apps/pos/src/components/OrderProgrammingModal.jsx` | F7.5.5 |
| POS · pantalla | `apps/pos/src/RetailVisionPOS.jsx` | F7.5.6 |
| POS · componente | `apps/pos/src/components/POSHeader.jsx` | F7.5.6 |
| POS · hook | `apps/pos/src/hooks/useTicketActions.js` | F7.5.6 |
| POS · gate | `apps/pos/src/RetailVisionPOS.f7_5a.test.jsx` | F7.5.7 |

---

## 7. Commit

_(se registra al final de esta ficha)_
