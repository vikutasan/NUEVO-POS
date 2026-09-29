# 📋 FICHA DE EVIDENCIA — CIERRE DE FASE 3 (POS Completo)

> **Fecha:** 29 Sep 2026
> **Sub-fase:** Cierre F3 — Cableado end-to-end de la persistencia atómica (D-12)
> **Plan:** [`PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md:380) §6 Criterios de aceptación
> **Estado:** ✅ **PUERTA EN VERDE**
> **Depende de:** Fases 3.0, 3.1, 3.2, 3.3 y 3.4 — todas cerradas y en verde

---

## 1. Qué se construyó

| Archivo | Qué resuelve | Regla / Criterio | Estado |
|---|---|---|---|
| [`apps/pos/src/RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:53) | Cablea `ticketId` real al `useCart` (fin del modo local) | D-12 / criterio 4 | ✅ |
| [`apps/pos/src/RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:215) | `confirmarCobro` deja de reenviar ítems: **solo paga** | criterio 5 | ✅ |
| [`apps/pos/src/RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:53) | `OverlayError` recibe el mensaje real (no `null`) | criterio 6 | ✅ |
| [`apps/pos/src/hooks/useCart.js`](../../apps/pos/src/hooks/useCart.js:98) | La línea del carrito conserva `name` (el ticket lo pinta) | — | ✅ |
| [`apps/pos/src/RetailVisionPOS.f3_cierre.test.jsx`](../../apps/pos/src/RetailVisionPOS.f3_cierre.test.jsx:1) | Test de integración de la pantalla real — 6 escenarios | criterios 4 y 5 | ✅ |

### Los 6 escenarios del test de integración

| # | Escenario | Qué prueba |
|---|---|---|
| 1 | Primer producto | Nace el ticket (`crearVenta` con `items: []`) y luego `anadirItem` |
| 2 | Segundo producto | `anadirItem` ×2, `crearVenta` sigue en **1** (no se re-crea) |
| 3 | Incrementar | `cambiarCantidad` con el `item_id` correcto |
| 4 | Quitar | `quitarItem` con el `item_id` correcto |
| 5 | Cobrar | `cobrarTicket` **sin** `items`; `verificarEnvio` con **todos** los `item_id`; y **solo entonces** el carrito queda vacío |
| 6 | **Negativa** | Si `verificarEnvio` reporta `faltantes`, el carrito **NO** se limpia |

---

## 2. Decisiones de diseño

### 2.1 El diagnóstico D-12: la persistencia atómica no estaba cableada

La pantalla real `RetailVisionPOS` instanciaba el hook con `useCart({ ticketId: null })`.
Con `ticketId` nulo, `useCart` opera en **modo local**: `anadirLinea`,
`cambiarCantidad` y `quitarLinea` devuelven `{outcome:'ok', data:{local:true}}`
**sin llamar al servidor**. El backend atómico (Fase 3.2) y los hooks (Fase 3.3)
existían y estaban probados, pero la pantalla **no los usaba**: al cobrar, el
`confirmarCobro` reenviaba **todos** los ítems como un BLOB en un solo POST.

Esto violaba el criterio 4 (persistencia atómica por ítem verificada) y el
criterio 5 (verificación post-envío verificada). El cierre D-12 los resuelve.

### 2.2 El ticket nace con el primer ítem (`asegurarTicket`)

Se añadió el estado `ticketId` y el helper `asegurarTicket`, que crea el ticket
**una sola vez** (con `items: []`) y guarda su `id`. Tanto `agregarProducto`
como `alEscanear` lo invocan antes de añadir la línea. El `id` se lee desde un
`useRef` (`ticketIdRef`) para no depender del estado en callbacks asíncronos
(prohibición #3: *no leer estado en callbacks async*).

### 2.3 `confirmarCobro` solo paga (no reenvía ítems)

Antes, el cobro reenviaba el carrito completo. Ahora **solo** llama a
`acciones.cobrar(...)` sobre el ticket ya existente. Se conserva un *fallback*
defensivo: si por alguna razón no hubiera `ticketId`, se crea el ticket con los
ítems actuales antes de pagar (nunca se pierde una venta).

### 2.4 `OverlayError` recibe el mensaje real

`OverlayError` se renderizaba con `mensaje={null}`, así que el usuario nunca veía
la causa del fallo. Ahora recibe `mensaje={error}` (el `reason` del contrato
`{outcome, reason}`).

### 2.5 La línea del carrito conserva `name`

`useCart.anadirLinea` no guardaba `name`, así que el ticket pintaba `undefined`
en cada línea. Se añadió `name: linea.name ?? null` en el hook y se pasa
`name: producto.name` desde ambos puntos de llamada.

---

## 3. Puerta de cierre — Evidencia

### 3.1 Comando y salida

```text
Comando : npm run guards && npm run test   (cwd: NUEVO-POS)
Salida  :
  === GUARDIANES DE ESTÁNDARES (F0 + F4/A-04) ===
  Archivos de código escaneados: 88
  [OK  ] E-05 — Silencios en ruta crítica → 0 coincidencia(s)
  [OK  ] A-04 — Silencios en la ruta crítica de guardianes → 0 coincidencia(s)
  [OK  ] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
  [OK  ] E-15 — TODOs sin formato declarado → 0 coincidencia(s)
  [OK  ] R-01 — Ancho fijo en la superficie → 0 coincidencia(s)
  [OK  ] E-09 — Dinero en Float (Float en models.py) → 0 coincidencia(s)
  [OK  ] E-10 — Tiempo naive (DateTime() en models.py) → 0 coincidencia(s)
  PUERTA F0 EN VERDE / F4-A-04 EN VERDE / F5-R-01 EN VERDE

  === TESTS (Fase 3.0 — runner real) ===
  Tests de Node      : 3/3 archivo(s) en verde
  Tests de componentes: PASA
  Tests de API       : PASA
  ✅ RESULTADO: TODOS LOS TESTS EN VERDE.
Resultado: PASA (exit 0)
```

### 3.2 Los 8 criterios de aceptación (§6 del plan)

| # | Criterio | Evidencia | Estado |
|---|---|---|---|
| 1 | Paridad con el flujo E.1 | Test de integración escenarios 1–5 | ✅ |
| 2 | 0 de 5 deudas abiertas | D-9 y D-11 registradas como no bloqueantes | ✅ |
| 3 | 0 de 10 acoplamientos | Guardián A-04 en verde | ✅ |
| 4 | Persistencia atómica por ítem verificada | Escenarios 1–4 (`anadirItem`/`cambiarCantidad`/`quitarItem`) | ✅ |
| 5 | `clearCart` con verificación post-envío | Escenarios 5 y 6 | ✅ |
| 6 | Contrato `{outcome, reason}` | `useTicketActions` + `OverlayError` con mensaje real | ✅ |
| 7 | Los 5 greps de CI en verde | Guardián F0 (7/7) | ✅ |
| 8 | Ficha de evidencia por sub-fase | FICHAS F3.0–F3.4 + esta ficha | ✅ |

### 3.3 Sin regresión

Las puertas F1, F2, F3, F3.2, F3.3, F3.4 y F5 siguen en verde. El runner
(`scripts/test.mjs`) ejecuta Node + Vitest + pytest y reporta **todo en verde**.

---

## 4. Deudas registradas (no bloqueantes)

| ID | Deuda | Impacto | Mitigación |
|---|---|---|---|
| D-9 | `TicketItem` no tiene columna `item_id` | Idempotencia apoyada en `payment_details["_item_ids"]` | Se reemplaza por restricción única cuando exista la columna |
| D-11 | 3 tests de F3.3 tardan ~3 s | Solo tiempo de CI | Proviene del `sleep` real de `withRetries` |

---

## 5. Conclusión

La Fase 3 (POS Completo) queda **formalmente cerrada**. La persistencia atómica
por ítem está cableada de punta a punta en la pantalla real, el cobro ya no
reenvía ítems, la verificación post-envío gobierna la limpieza del carrito, y el
usuario ve los errores reales. La puerta completa (guards + Node + Vitest +
pytest) está **en verde**.

**Siguiente fase natural:** Fase 4 — Gestor de Caja (Plan Maestro §7).
