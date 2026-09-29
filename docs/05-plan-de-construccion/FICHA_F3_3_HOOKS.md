# 📋 FICHA DE EVIDENCIA — FASE 3.3 (Hooks del POS)

> **Fecha:** 29 Sep 2026
> **Sub-fase:** 3.3 — Hooks del POS (el corazón)
> **Plan:** [`PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md:302) §4 FASE 3.3
> **Estado:** ✅ **PUERTA EN VERDE**
> **Depende de:** Fase 3.2 (backend atómico) — cerrada y en verde

---

## 1. Qué se construyó

| Archivo | Qué resuelve | Regla / Prohibición | Estado |
|---|---|---|---|
| [`apps/pos/src/hooks/useCart.js`](../../apps/pos/src/hooks/useCart.js:1) | Carrito con persistencia atómica por ítem (v6.0 SaaS) | Prohibición #2 | ✅ |
| [`apps/pos/src/hooks/useTicketActions.js`](../../apps/pos/src/hooks/useTicketActions.js:1) | Acciones con contrato `{outcome, reason}` (v7.0.3) | Regla 19 | ✅ |
| [`apps/pos/src/hooks/useTerminalLocking.js`](../../apps/pos/src/hooks/useTerminalLocking.js:1) | Heartbeat + locks de terminal (OMEGA) | RN-03/05/06 | ✅ |
| [`apps/pos/src/hooks/useBarcodeScanner.js`](../../apps/pos/src/hooks/useBarcodeScanner.js:1) | Lector de código de barras | Prohibición #3 | ✅ |
| [`apps/pos/src/hooks/hooks.f3_3.test.jsx`](../../apps/pos/src/hooks/hooks.f3_3.test.jsx:1) | Puerta F3.3 — 13 tests, 5 criterios | — | ✅ |

### Los 4 hooks

| Hook | Responsabilidad | Garantía clave |
|---|---|---|
| `useCart` | Carrito + persistencia atómica por ítem | `clearCart()` **solo** tras HTTP 200 + verificación post-envío |
| `useTicketActions` | Crear ticket / cobrar | Devuelve `{outcome, reason}` en **toda** rama; nunca lanza |
| `useTerminalLocking` | Tomar/liberar lock + heartbeat | Late **solo** con el lock tomado; deps primitivas |
| `useBarcodeScanner` | Acumular pulsaciones rápidas → código | Callback en `useRef`; no re-registra el listener |

---

## 2. Decisiones de diseño

### 2.1 `clearCart()` jamás limpia sin verificación (Prohibición #2)

El carrito **no** se vacía al recibir la respuesta del POST. Primero se llama a
`verificarEnvio(ticketId, {item_ids})` (contrato 22) y solo si la BD confirma que
**todos** los ítems están persistidos (`faltantes.length === 0`) se limpia. Si hay
faltantes o la verificación falla, el carrito **conserva** las líneas y devuelve
`{outcome:'error', reason:'items_no_persistidos' | 'verificacion_fallo'}`. Esto
elimina la clase de bug "el ticket se perdió pero el carrito se vació".

### 2.2 Los callbacks async leen `useRef`, no estado cerrado (Ticket #906)

Todo callback asíncrono (`clearCart`, `crearTicket`, `cobrar`) lee el estado
vigente desde un **espejo en `useRef`** (`lineasRef`, `ticketRef`, `versionRef`,
`enviandoRef`), nunca desde la clausura del render. Así un callback creado en el
primer render ve las líneas añadidas después. Es la prohibición #3 hecha código.

### 2.3 Simetría de limpieza (Regla 19)

Éxito y fallo limpian **los mismos refs** usando `buildResetPatch`/`aplicarReset`
de [`sessionReset.js`](../../apps/pos/src/state/sessionReset.js:39). Un fallo no
deja un ticket huérfano (cuenta fantasma); el estado queda idéntico al de un
éxito en cuanto a refs limpiados.

### 2.4 `useEffect` con dependencias primitivas (H1)

Los `useEffect` de `useTerminalLocking` y `useBarcodeScanner` dependen solo de
**primitivos** (`activo`, `bloqueada`, `terminalId`, `intervaloMs`, `umbralMs`,
`longitudMinima`). Los callbacks viven en refs, así que un re-render con un
callback de identidad nueva **no** re-registra listeners ni reinicia el heartbeat.

### 2.5 API inyectada (testabilidad)

Los 4 hooks reciben `api` por parámetro en vez de importar el cliente HTTP. Esto
permite testear con mocks sin red y deja el cableado del cliente real
(`anadirItem`, `verificarEnvio`, `latir`, `tomarLock`, `liberarLock`) para la
Fase 3.4, cuando los componentes consuman los hooks.

---

## 3. Puerta 3.3 — Evidencia

### 3.1 Comando y salida

```text
Comando : npm run test   (en apps/pos)
Salida  :
  ✓ src/hooks/hooks.test.jsx (8 tests) 50ms
  ✓ src/hooks/hooks.f3_3.test.jsx (13 tests) 9125ms
  Test Files  2 passed (2)
       Tests  21 passed (21)
Resultado: PASA (exit 0)   (8 de F3.1 + 13 de F3.3)
```

### 3.2 Runner completo (raíz) — sin regresión

```text
Comando : npm run test   (en la raíz del repo)
Salida  :
  ── Tests de Node (3 archivo(s)) ──
    ✅ apps/pos/src/theme/theme.test.js
    ✅ apps/pos/src/utils/utilidades.test.js
    ✅ packages/theme-engine/theme-engine.test.js
  ── Tests de componentes React (Vitest) ──
    ✅ vitest — todos los tests de componentes pasaron.
  ── Tests de la API (pytest en Docker) ──
    ✅ pytest — todos los tests de la API pasaron.
  ════════════════════════════════════════════════════════
    Tests de Node      : 3/3 archivo(s) en verde
    Tests de componentes: PASA
    Tests de API       : PASA
    ✅ RESULTADO: TODOS LOS TESTS EN VERDE.
Resultado: PASA (exit 0)
```

### 3.3 Criterios de la puerta (del plan §4 FASE 3.3)

| Criterio del plan | Test que lo prueba | Estado |
|---|---|---|
| `clearCart` solo tras HTTP 200 + verificación | `useCart — clearCart solo tras verificación` (3 tests) | ✅ |
| Callback async lee `useRef`, no estado cerrado (Ticket #906) | `useCart — el callback async lee useRef` | ✅ |
| `useTicketActions` devuelve `{outcome, reason}` en toda rama | `useTicketActions — contrato {outcome, reason}` (3 tests) | ✅ |
| Simetría de limpieza: éxito y fallo limpian los mismos refs | `useTicketActions — simetría de limpieza` (2 tests) | ✅ |
| `useEffect` deps son primitivos (H1) | `H1 — los hooks no re-registran listeners` (2 tests) | ✅ |
| *(extra)* El lector entrega el código completo al Enter | `useBarcodeScanner — entrega el código completo` (2 tests) | ✅ |

---

## 4. Deudas registradas

| ID | Deuda | Impacto | Bloquea |
|---|---|---|---|
| **D-9** | `TicketItem` no tiene columna `item_id`; la idempotencia se apoya en `payment_details["_item_ids"]` | Bajo (funciona) | No |
| **D-7** | `guards.mjs` no excluye `dist/` ni tests, y no reconoce `TODO(scope)` | Bajo | No |
| **D-10** | `api/client.js` aún no expone `anadirItem`, `cambiarCantidad`, `quitarItem`, `verificarEnvio`, `latir`, `tomarLock`, `liberarLock`; los hooks reciben `api` inyectada | Bajo (los hooks ya funcionan con mocks) | No |
| **D-11** | 3 tests de F3.3 tardan ~3 s por usar el `dormir` real de `withRetries` (backoff 1s+2s) | Bajo (solo lentitud) | No |

---

## 5. Veredicto

**PUERTA 3.3 EN VERDE.** Los 4 hooks del POS están construidos y probados: el
carrito solo se limpia tras verificación post-envío, los callbacks async leen
`useRef` (Ticket #906), las acciones devuelven `{outcome, reason}` en toda rama,
la limpieza es simétrica y los `useEffect` usan deps primitivas (H1). La puerta
F3.1 sigue verde (8/8) y el runner completo está en verde (Node 3/3, Vitest PASA,
pytest PASA). Se puede avanzar a **FASE 3.4 — Interfaz real (componentes)**:
`POSHeader`, `SalesReceipt`, `CheckoutScreen`, `POSOverlays` y el refactor de
`RetailVisionPOS`.
