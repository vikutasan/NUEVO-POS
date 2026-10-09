# FICHA F12.6 — PARIDAD DE PRESENTACIÓN DEL PIZARRÓN

**Fase:** 12.6 (Rescate de UX del viejo POS — paridad de presentación)
**Estado:** ✅ CERRADA
**Fecha:** 1 Oct 2026
**Compuertas:** `OpenAccountsCorkboard.f12_6.test.jsx` (12) + `OpenAccountsCorkboard.f5_3.test.jsx` (8) + `RetailVisionPOS.f12_5.test.jsx` (7) = **27/27 verde**
**CI:** `npm run ci` → lint 284 archivos / 0 errores · Node 3/3 · Vitest PASS · pytest PASS · guards limpios

---

## 1. La lección (14ª)

**PARIDAD DE PRESENTACIÓN (estética + datos).**

Las trece lecciones anteriores cubrieron: el paso de integración como compuerta (F4.5),
la completitud del conjunto (F10), el inventario de componentes que no ve integraciones
(F10.4), ni flujos de datos (F10.5), ni paridad de operación (F10.6), y —en F12.1 a F12.5—
las categorías de paridad PORTADA, OMITIDA, HUÉRFANA y DESCARTADA.

F12.6 agrega una categoría nueva al inventario de paridad: **INFIEL**.

> Un componente puede estar **integrado** (F12.5 lo conectó) y aun así ser **infiel** al
> original: existe, funciona, pero **no se parece ni dice lo mismo** que el viejo POS.

El pizarrón del viejo POS era un **corcho con post-its**: color por terminal, rotación
aleatoria, pin rojo, folio, terminal, cliente, teléfono, capturista, hora y tipo de pedido.
El nuevo pizarrón era un **modal oscuro plano** que solo mostraba folio y total.

Integrado ≠ fiel. La compuerta de F12.5 probaba que el botón abría el pizarrón; **no**
probaba que el pizarrón dijera la verdad que el cajero necesitaba leer de un vistazo.

**Regla derivada:** cuando un componente se hereda del viejo POS (§6.8), su compuerta debe
verificar **paridad de presentación** —estética *y* datos—, no solo su existencia.

---

## 2. Diagnóstico

### 2.1 El síntoma

Tras F12.5, el botón PIZARRÓN abría `OpenAccountsCorkboard`. Pero el componente:

- Renderizaba un modal oscuro plano (`bg-fondo-profundo`), no un corcho.
- Mostraba **solo** `account_num` y `total`.
- El contrato 23 (`CuentaAbiertaSalida`) exponía **5 campos**: `id`, `account_num`,
  `total`, `status`, `created_at`.

### 2.2 La fuente de verdad (el viejo POS)

`apps/pos/OpenAccountsCorkboard.jsx` (viejo POS) mostraba por cada cuenta:

| Dato | Origen en el viejo POS |
|---|---|
| Folio (`account_num`) | `ticket.account_num` |
| Terminal | `ticket.terminal_id` |
| Cliente | `ticket.customer_name` |
| Teléfono | `ticket.customer_phone` |
| Tipo de pedido | `ticket.delivery_type` |
| Capturista | `ticket.captured_by_name` |
| Hora | `ticket.created_at` |
| Total | `ticket.total` |

Y la estética: corcho (`bg-madera-panel` + `border-madera-veta`), post-it con color por
terminal, rotación determinista, pin rojo.

### 2.3 La brecha

El contrato 23 viajaba con **5 campos**; el viejo POS necesitaba **12**. Faltaban:
`terminal_id`, `customer_name`, `customer_phone`, `delivery_type`, `captured_by_name`,
`cashed_by_name` y `version`.

---

## 3. La decisión de reparto (F12.6 vs F13)

El usuario pidió que cada cuenta llevara **metadata auditable** (quién la capturó, quién la
cobró, cuándo, cómo se pagó) **rastreable en el módulo "Auditoría y Control"** del ERP.

Se investigó dónde vive esa metadata en el viejo ERP:

- `tickets.captured_by_id` (FK a `employees`) — quién capturó.
- `tickets.cashed_by_id` — quién cobró.
- Tabla `auditoria` (`apps/api/modules/security/models.py`) — log de operaciones sensibles.
- `AuditoriaControlUI.jsx` — la pantalla que lo consulta.

**El reparto aceptado (dos fases):**

| Fase | Dueño | Qué construye |
|---|---|---|
| **F12.6** | **POS** | Modelo de lectura del pizarrón: proyección denormalizada, identidad de sesión, **sin JOIN**. |
| **F13** | **Auditoría y Control** | Libro mayor inmutable + eventos outbox (`CREAR_TICKET` / `COBRAR_TICKET`). |

**Por qué el POS no lee de Auditoría y Control (la "trampa temporal"):** si el pizarrón
dependiera de que Auditoría y Control esté vivo, una caída de ese módulo tumbaría el
pizarrón —violando el espíritu de RN-87/RN-88 (un fallo de un módulo no tumba el POS).

**Por qué la denormalización NO es doble fuente de verdad (el "snapshot congelado"):** el
nombre del capturista es un **hecho histórico** ("quién capturó ESTA cuenta el día X"), no
un valor vivo que deba sincronizarse. Es el mismo patrón que `component_name` o
`employee_name`: se congela en el momento de la operación. El POS **emite** el dato; el
libro mayor de Auditoría y Control lo **posee** para efectos contables.

---

## 4. Lo construido

### 4.1 Backend

1. **`models/pos.py`** — `Ticket` gana `captured_by_name` y `cashed_by_name` (String,
   nullable). Snapshot congelado del nombre, no FK viva.
2. **`migrations/versions/0003_ticket_traceability.py`** — migración aplicada.
3. **`schemas.py`** — `CrearTicketEntrada` acepta `capturista_nombre`; `CuentaAbiertaSalida`
   (contrato 23) pasa de 5 a **12 campos**:
   `id`, `account_num`, `total`, `status`, `created_at`, `terminal_id`, `customer_name`,
   `customer_phone`, `delivery_type`, `captured_by_name`, `cashed_by_name`, `version`.
4. **`routers/pos.py`** — `crear_ticket` persiste `captured_by_name`; `cobrar_ticket`
   persiste `cashed_by_name`; `cuentas_abiertas` usa `CuentaAbiertaSalida.model_validate(t)`.
5. **`contracts/registry.py`** — contrato 23 actualizado (garantías de campos).
6. **`tests/test_f5_cuentas.py`** — `CAMPOS_ESPERADOS` ahora es el conjunto de 12 campos;
   test renombrado `test_respuesta_ligera_campos_escalares`.

### 4.2 Frontend

**`apps/pos/src/components/OpenAccountsCorkboard.jsx`** — reconstruido (313 líneas):

- `ROTACIONES` (6 clases de rotación) + `rotacionDe(indice)` — rotación determinista.
- `COLOR_POR_TERMINAL` (**TERM-06** amarillo, **TERM-05** azul, **TERM-04** verde,
  **TERM-03** rosa, **TERM-02** morado, **TERM-01** teal, CAJA naranja)
  + `colorDe(terminal)`.
  > **BUG-02 (9 Oct 2026) — vocabulario de IDs.** El mapa se heredó del viejo POS
  > con las claves VIEJAS (`T6`, `T3`, …), pero el nuevo POS unificó los ids a
  > `TERM-01..TERM-06` (ver `useTerminals.js`, F7.7d). Como `colorDe('TERM-03')`
  > no encontraba la clave, TODOS los post-its caían al fallback `bg-yellow-100`
  > (amarillos). Se tradujo el mapa al vocabulario real conservando el color por
  > número de terminal. Ver `OpenAccountsCorkboard.bug02.test.jsx`.
- `formatearHora(instante)` — RN-78: formatea UTC a hora local `es-MX`; `'—'` si inválido.
- `formatearTotal(valor)` — `es-MX` MXN.
- `mensajeDeError(reason)` — mapea `sin_conexion` / `terminal_invalida` / `datos_invalidos`;
  un `reason` no mapeado se muestra **verbatim** (p. ej. `"red caída"`); vacío → genérico.
- Corcho: `rounded-canon40 border-[20px] border-madera-veta bg-madera-panel` + textura
  `radial-gradient` con `rgb(var(--madera) / …)`.
- Post-it: `<li>` con `min-h-tactil` (R-04), color por terminal, rotación, pin rojo
  (`absolute -top-3 left-1/2 … bg-red-600`).
- Datos: folio (`data-testid={folio-${id}}`), terminal, bloque PEDIDO (tipo, cliente,
  teléfono), capturista (📝), hora (🕒), total (`data-testid={total-${id}}`), botón
  "Recuperar".
- Raíz `w-full max-w-[1000px]` (R-01: sin ancho fijo).

**`apps/pos/src/RetailVisionPOS.jsx`** — el montaje del pizarrón (líneas 837-849) envuelve
`OpenAccountsCorkboard` en un contenedor `role="dialog" aria-modal="true"
aria-label="Cuentas abiertas"` y le pasa `onCerrar`.

---

## 5. Las compuertas

| Compuerta | Archivo | Tests | Qué prueba |
|---|---|---|---|
| Presentación F12.6 | `OpenAccountsCorkboard.f12_6.test.jsx` | 13 | Corcho, pin, rotación, color, datos, hora, error verbatim |
| Presentación F5.3 | `OpenAccountsCorkboard.f5_3.test.jsx` | 8 | Contrato de props, folio/total, recuperar, ancho, táctil |
| Integración F12.5 | `RetailVisionPOS.f12_5.test.jsx` | 7 | Botón → diálogo → cuentas → recuperar → error verbatim |
| **BUG-02** | `OpenAccountsCorkboard.bug02.test.jsx` | 8 | Color por terminal con vocabulario `TERM-0X` (6 terminales + fallback + 2 distintas) |

**Total: 36/36 verde.**

---

## 6. Los 12 criterios (F12.6)

1. El corcho usa `.bg-madera-panel` y `border-madera-veta`.
2. Cada `<li>` tiene un pin (`span[aria-hidden="true"]` con `bg-red-600`).
3. La rotación es determinista (idéntica entre renders).
4. TERM-06 → `bg-yellow-200`; CAJA → `bg-orange-200` (mapa con vocabulario `TERM-0X`, BUG-02).
5. PEDIDO/cliente/teléfono se muestran; VENTA_DIRECTA oculta el bloque.
6. El nombre del capturista se muestra.
7. La hora es `🕒 \d{2}:\d{2}`; `null` → `🕒 —`.
8. Un `reason` no mapeado (`'red caída'`) se muestra verbatim; vacío → `'error_desconocido'`.
9. El folio se expone en `data-testid={folio-${id}}`.
10. El total se expone en `data-testid={total-${id}}`.
11. La raíz es `w-full max-w-[1000px]` (sin ancho fijo).
12. Cada post-it tiene `min-h-tactil` (R-04).

---

## 7. Archivos tocados

**Backend (`../NUEVO-POS/apps/api/`):**
- `models/pos.py`
- `migrations/versions/0003_ticket_traceability.py`
- `schemas.py`
- `routers/pos.py`
- `contracts/registry.py`
- `tests/test_f5_cuentas.py`

**Frontend (`../NUEVO-POS/apps/pos/src/`):**
- `components/OpenAccountsCorkboard.jsx`
- `components/OpenAccountsCorkboard.f12_6.test.jsx`
- `components/OpenAccountsCorkboard.f5_3.test.jsx`
- `components/OpenAccountsCorkboard.bug02.test.jsx` *(BUG-02)*
- `hooks/useOpenAccounts.js` *(BUG-02 — modo CAJA sin `terminalId`)*
- `RetailVisionPOS.jsx`
- `RetailVisionPOS.f12_5.test.jsx`

---

## 8. Commit

- **NUEVO-POS:** `8c2b63e`

---

## 9. Lo que queda (F13)

**F13 — Auditoría y Control: libro mayor inmutable + eventos outbox del POS.**

- El POS **emite** eventos `CREAR_TICKET` / `COBRAR_TICKET` por el patrón outbox
  (RN-85/RN-86: encolar en la misma transacción, sin envío directo).
- Auditoría y Control **posee** el libro mayor inmutable (RN-61/RN-62: el POS emite, no
  descuenta).
- La metadata auditable (capturista, cobrador, fecha, método de pago) queda rastreable en
  la pantalla de Auditoría y Control.

---

## 10. Trazabilidad regla → test

| Regla | Enunciado | Test |
|---|---|---|
| RN-31 | El pizarrón lista solo las cuentas OPEN de su terminal | `test_f5_cuentas.py::test_lista_solo_las_cuentas_open_de_la_terminal` |
| RN-78 | Los timestamps viajan en UTC; el POS formatea a hora local | `OpenAccountsCorkboard.f12_6.test.jsx` (criterio 7) |
| Regla 15 | "Respuesta ligera" = proyección de campos escalares explícitos | `test_f5_cuentas.py::test_respuesta_ligera_campos_escalares` |
| A-02 / O-23 | Los contratos exponen operaciones, nunca tablas | `test_f2_frontera.py` |
| R-01 | Sin anchos fijos | `OpenAccountsCorkboard.f5_3.test.jsx` (criterio 7) |
| R-04 | Objetivo táctil ≥ 44px (`min-h-tactil`) | `OpenAccountsCorkboard.f5_3.test.jsx` (criterio 8) |
| §6.8 | La integración se hereda; la implementación se reescribe | `OpenAccountsCorkboard.f12_6.test.jsx` (paridad de presentación) |
| BUG-02 | El color del post-it usa el vocabulario real `TERM-0X` (no los ids viejos `T6`) | `OpenAccountsCorkboard.bug02.test.jsx` (8 criterios) |
| BUG-02 | El modo CAJA (`terminalId=""`) carga las cuentas de todas las terminales | `OpenAccountsCorkboard.bug02.test.jsx` (criterio 8) |
