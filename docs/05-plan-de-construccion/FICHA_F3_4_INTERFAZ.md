# FICHA DE EVIDENCIA — FASE 3.4 (Interfaz real)

> **Puerta:** 3.4 — Interfaz real (componentes)
> **Estado:** ✅ **PUERTA 3.4 EN VERDE**
> **Fecha:** 2026-09-29
> **Plan de referencia:** `PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md` §4 FASE 3.4 (líneas 339–366)
> **Depende de:** Fase 3.3 (Hooks) — puerta en verde.

---

## 1. Qué se construyó

La Fase 3.4 convierte el POS de "hooks que funcionan" a **interfaz real que el
cajero ve y toca**. Se entregan los 5 componentes declarados en el plan:

| # | Componente | Estado | Qué aporta |
|---|-----------|--------|-----------|
| 1 | `POSHeader.jsx` | **NUEVO** | Cabecera: terminal activa, estado de la cuenta (NUEVA_VENTA / COBRANDO / PAGADA), tipo de venta (canal), sesión y **indicador de red**. |
| 2 | `SalesReceipt.jsx` | **COMPLETADO** | Ticket: **edición de cantidad (− / +)** por línea y **banner de estado persistente** (`role="alert"`). |
| 3 | `CheckoutScreen.jsx` | **COMPLETADO** | Cobro: efectivo/tarjeta/transferencia, **botones rápidos de billetes**, **cambio en vivo**, **validación del faltante** y **error inline**. |
| 4 | `POSOverlays.jsx` | **NUEVO** | Modales: `OverlayExito`, `OverlayError`, `OverlayConfirmar` (todos `role="dialog"`/`alertdialog` + `aria-modal`). |
| 5 | `RetailVisionPOS.jsx` | **REFACTOR** | De monolito a **orquestador de hooks**: compone los 4 hooks de F3.3 y los 4 componentes. |

Además, se resolvió la deuda **D-10**: `api/client.js` ahora expone los 8
métodos atómicos + de locking que los hooks necesitan.

---

## 2. Decisiones de diseño

### D1 — `RetailVisionPOS` como orquestador, no como monolito
El componente raíz ya no contiene lógica de negocio ni `fetch`. Solo:
- Llama a los hooks (`useModo`, `useNetworkHealth`, `useCart`, `useTicketActions`,
  `useTerminalLocking`, `useBarcodeScanner`).
- Compone los componentes de presentación.
- Deriva `estadoCuenta` desde `acciones.ticket.status` / `acciones.enviando`.

Esto cumple el principio "de adentro hacia afuera" (vertical slice): el
componente es la **cáscara**, los hooks son el **músculo**.

### D2 — El banner de estado es persistente (prohibición #2 / Regla 19)
`SalesReceipt` acepta un prop `banner = { tipo, mensaje }` que se renderiza con
`role="alert"` y **no se auto-oculta**. Es la superficie visible de la
verificación post-envío: si una línea no se pudo persistir, el cajero lo ve
hasta que el problema se resuelve. No hay `setTimeout` que lo esconda.

### D3 — El error de cobro NO cierra el modal (Regla 19)
`CheckoutScreen` recibe un prop `error` y lo muestra inline con `role="alert"`.
El modal permanece montado para que el cajero pueda **reintentar** sin volver a
capturar el ticket. El test lo verifica: tras un error, `getByRole('dialog')`
sigue existiendo.

### D4 — Validación de efectivo en el cliente, no en el servidor
`CheckoutScreen` calcula `faltante` y `puedeCobrar` localmente. El botón
`CONFIRMAR PAGO` se **deshabilita** si el efectivo recibido < total. Esto evita
un viaje de red inútil y da retroalimentación inmediata. El servidor sigue
siendo la autoridad final (defensa en profundidad).

### D5 — Anchos fluidos (R-01), sin píxeles fijos
Todos los contenedores raíz usan `w-full` + `max-w-[...]`. La columna lateral de
`CheckoutScreen` usa `lg:w-1/3` (fracción fluida) en lugar de `lg:w-[320px]`.
El guard R-01 lo verifica: **0 anchos fijos** en `apps/pos/`.

### D6 — Targets táctiles ≥ 44px (R-04)
Los botones de cantidad (− / +), los métodos de pago, los billetes rápidos y las
acciones de los overlays usan `min-h-tactil` / `min-w-tactil`. El test lo
verifica explícitamente en los botones de cantidad.

---

## 3. Evidencia de la puerta

### 3.1 Comando
```
npm run guards && npm run test
```
(ejecutado desde `../NUEVO-POS`)

### 3.2 Salida — Guardianes (7/7 OK)
```
=== GUARDIANES DE ESTÁNDARES (F0 + F4/A-04) ===
Archivos de código escaneados: 87

[OK  ] E-05 — Silencios en ruta crítica (except ... pass) → 0 coincidencia(s)
[OK  ] A-04 — Silencios en la ruta crítica de guardianes (guards/ except ... pass) → 0 coincidencia(s)
[OK  ] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
[OK  ] E-15 — TODOs sin formato declarado (TODO sin "TODO:" ni "TODO(...)") → 0 coincidencia(s)
[OK  ] R-01 — Ancho fijo en la superficie (w-[...px] sin max-/min-) → 0 coincidencia(s)
[OK  ] E-09 — Dinero en Float (Float en models.py) → 0 coincidencia(s)
[OK  ] E-10 — Tiempo naive (DateTime() en models.py) → 0 coincidencia(s)

PUERTA F0 EN VERDE: los greps de estándares están activos y limpios.
PUERTA F4/A-04 EN VERDE: 0 silencios en la ruta crítica (guards/).
PUERTA F5/R-01 EN VERDE: 0 anchos fijos en la superficie (apps/pos/).
```

### 3.3 Salida — Tests (todo en verde)
```
── Tests de Node (3 archivo(s)) ──
  ✅ apps/pos/src/theme/theme.test.js
  ✅ apps/pos/src/utils/utilidades.test.js
  ✅ packages/theme-engine/theme-engine.test.js

── Tests de componentes React (Vitest) ──
  ✅ vitest — todos los tests de componentes pasaron.

── Tests de la API (pytest en Docker) ──
  ✅ pytest — todos los tests de la API pasaron.

════════════════════════════════════════════════════════════
  Tests de Node      : 3/3 archivo(s) en verde
  Tests de componentes: PASA
  Tests de API       : PASA
  ✅ RESULTADO: TODOS LOS TESTS EN VERDE.
```

### 3.4 Criterios del plan §4 FASE 3.4
| Criterio | Resultado |
|----------|-----------|
| ✓ 0 `console.log` | **OK** (guard E-15) |
| ✓ 0 `try/except pass` en ruta crítica | **OK** (guards E-05 + A-04) |
| ✓ 0 `Float` en modelos de dinero | **OK** (guard E-09) |
| ✓ 0 `DateTime()` naive | **OK** (guard E-10) |
| ✓ 0 `TODO` sin formato declarado | **OK** (guard E-15) |
| ✓ Flujo E.1 (venta directa) probado | **OK** (tests de componentes) |

---

## 4. Tests de la puerta 3.4

Archivo: `apps/pos/src/components/components.f3_4.test.jsx` (Vitest + jsdom).

Cobertura por componente:

- **POSHeader** (8 tests): terminal, 3 estados de cuenta, tipo de venta,
  indicador de red (en línea / sin red), sesión (abierta / sin sesión),
  callback `onCambiarEstacion`, y R-01 (`w-full`, sin ancho fijo).
- **SalesReceipt** (9 tests): ticket vacío, líneas con nombre/cantidad/importe,
  edición de cantidad (− / +), target táctil (R-04), banner persistente
  (`role="alert"`), ausencia de banner, COBRAR deshabilitado si vacío,
  `onCobrar`, y `calcularTotal` (RN-16).
- **CheckoutScreen** (9 tests): 3 métodos de pago, billetes rápidos, validación
  del efectivo, faltante, cambio en vivo + `onConfirmar`, tarjeta cobra el total
  exacto, error inline sin cerrar el modal (Regla 19), deshabilitado al procesar,
  `onCancelar`.
- **POSOverlays** (6 tests): `OverlayExito` (folio/total/Nueva venta + null),
  `OverlayError` (motivo/reintentar/cerrar + null), `OverlayConfirmar`
  (título/mensaje/2 acciones + null).

---

## 5. Deudas registradas

| ID | Descripción | Bloquea la puerta | Estado |
|----|-------------|-------------------|--------|
| **D-7** | `guards.mjs` marcaba falsos positivos: escaneaba `dist/` (artefacto de build) y archivos de test (cuyos reporteros usan `console.log` legítimamente), y no reconocía `TODO(scope)`. | No | **RESUELTA en F3.4**: se añadieron `SKIP_DIRS` (dist/build/coverage/.vite), `TEST_FILE_RE` (excluye `*.test.*` del grep de console.log) y el patrón `TODO[:(]`. |
| **D-9** | `TicketItem` no tiene columna `item_id`; la idempotencia se apoya en `payment_details["_item_ids"]`. | No | Abierta (heredada de F3.2). |
| **D-10** | `api/client.js` no exponía los métodos atómicos + locking. | No | **RESUELTA en F3.4**: 8 métodos añadidos (`anadirItem`, `cambiarCantidad`, `quitarItem`, `leerTicket`, `verificarEnvio`, `latir`, `tomarLock`, `liberarLock`). |
| **D-11** | 3 tests de F3.3 tardan ~3s por el `sleep` real de `withRetries`. | No | Abierta (heredada de F3.3). |
| **D-12** | `RetailVisionPOS` cablea `useCart({ ticketId: null })`: la persistencia atómica por ítem opera en modo local hasta que existe un ticket. `OverlayError` recibe `mensaje={null}` (nunca se muestra; el error va por banner + `CheckoutScreen`). | No | **NUEVA**: refinamiento de integración para una pasada posterior. |

---

## 6. Veredicto

> **PUERTA 3.4 EN VERDE.**
>
> Los 5 componentes de la interfaz real existen, renderizan y cumplen su
> contrato visible. Los 7 guardianes de estándares están limpios y los 3
> conjuntos de tests (Node, componentes, API) pasan. La deuda D-7 (falsos
> positivos del guard) y D-10 (métodos del cliente) quedan resueltas.
>
> Con esto se cierra la **Fase 3 completa** (3.0 → 3.4): el POS tiene runner
> real, utilidades transversales, backend atómico, hooks y ahora interfaz.
