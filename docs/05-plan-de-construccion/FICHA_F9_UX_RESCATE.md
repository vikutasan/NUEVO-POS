# FICHA DE CIERRE — FASE 9: Rescate de UX del viejo POS

> **Fase:** 9 — Rescate de UX del viejo POS (y afinado de la UI por defecto)
> **Estado:** ✅ CERRADA — 3 piezas construidas, verificadas y respaldadas
> **Fecha:** 2026-09-30
> **Plan rector:** `PLAN_DE_ABORDAJE_FASE_9_POR_PARTES.md` (272 líneas, v1.1)

---

## 1. Qué es la Fase 9

La Fase 9 **rescata tres piezas de UX del viejo POS** que valía la pena conservar,
antes de congelar la UI por defecto del módulo nuevo. No añade capacidad de negocio:
es una **micro-fase de afinado operativo**.

### El problema que resuelve

El usuario invirtió mucho en la UX del viejo POS (`apps/pos/` del ERP). Antes de
definir la UI por defecto del POS nuevo, pidió comparar ambas UX y rescatar lo que
valga la pena **sin mayor problema**.

La comparación archivo por archivo arrojó un hallazgo tranquilizador: **el POS nuevo
ya heredó ~80% de la UX del viejo** (ticket de papel, barra de categorías, visión
como modo de vista, header de 3 zonas, pizarrón, gestor de caja, panel de voz,
programación de pedido, edición de cantidad). El §6.8 del Plan Maestro — *"la
integración se hereda, la implementación se reescribe"* — se cumplió.

Quedaban **tres piezas concretas** de bajo riesgo y alto valor, más **una capacidad
mayor** (pagos mixtos) que NO es "sin mayor problema" porque toca el contrato de
cobro. Esta fase ejecuta las tres piezas de bajo riesgo; la capacidad mayor se
planifica aparte (F9.1).

---

## 2. Las 3 piezas (sub-fases)

La Fase 9 se ejecutó **de adentro hacia afuera**: primero el componente con su gate
(test), luego el cableado en la pantalla real.

| Sub-fase | Qué construyó | Gate | Commit |
|---|---|---|---|
| **9.0.1** | `ExitAccountModal.jsx` (salvaguarda de salida con cuenta abierta) + cableado en `RetailVisionPOS.jsx` | 12/12 | `20a163d` |
| **9.0.2** | `TecladoNumerico.jsx` (teclado táctil puro) + montaje en `CheckoutScreen.jsx` | 12/12 | `20a163d` |
| **9.0.3** | `OfflineBanner` en `POSOverlays.jsx` (solo estado de red) + montaje en `RetailVisionPOS.jsx` | 6/6 | `20a163d` |

**Total: 30 criterios de puerta en verde.**

### La cadena de cada pieza

```
F9.0.1  ExitAccountModal.jsx  →  RetailVisionPOS.jsx (onCambiarEstacion / onBackToTerminals)
F9.0.2  TecladoNumerico.jsx   →  CheckoutScreen.jsx (bloque EFECTIVO)
F9.0.3  OfflineBanner         →  RetailVisionPOS.jsx (visible={!enLinea})
```

Cada pieza es **puro frontend**: no toca backend, contratos ni reglas de negocio.

---

## 3. Decisiones de diseño de la fase

### 3.1 El modal de salida intercepta, no reemplaza (F9.0.1)

El nuevo POS **no ofrecía salvaguarda** al salir con una cuenta abierta. El viejo POS
ofrecía 3 caminos explícitos. `ExitAccountModal` los reproduce con 3 acciones:

- **"📌 Enviar al Pizarrón y salir"** → deja la cuenta abierta (ya está persistida por
  la persistencia atómica por ítem de la Fase 3) y sale.
- **"🚪 Salir sin enviar — perder cuenta"** → acción destructiva (color `peligro`).
- **"Cancelar — quedarme"** → cierra el modal y NO sale.

Se intercepta `onCambiarEstacion` (el botón "Cambiar Estación" del `POSHeader`) y
`onBackToTerminals` **solo si `carrito.lineas.length > 0`**. Con el carrito vacío se
sale directo, sin fricción.

### 3.2 El teclado numérico se suma, no sustituye (F9.0.2)

El `CheckoutScreen` capturaba el efectivo con un `<input type="number">` y botones
rápidos ($50/$100/$200/$500). En una terminal táctil (tablet/mostrador sin teclado
físico), el input nativo es incómodo.

`TecladoNumerico` es un componente **puro**: no guarda estado propio. Recibe `valor` y
emite `onCambiar` aplicando la regla de edición (dígito concatena, "." solo una vez,
"C" limpia). Así el `CheckoutScreen` sigue siendo el **único dueño** del estado
`recibido` y el cálculo de cambio en vivo no se duplica.

**El input nativo NO se elimina:** se conserva como alternativa para quien prefiera
teclear. Ambos escriben el mismo estado `recibido`, por lo que son intercambiables.

### 3.3 El banner muestra solo el estado de red, SIN conteo (F9.0.3)

El viejo POS mostraba un banner con `pendingCount` + `isSyncing` (cuántas operaciones
están en cola local). El nuevo POS tiene indicador de red en el header, pero no tenía
un banner fijo e inequívoco.

**Verificación (REGLA DURA 2) — RESUELTA:** se verificó el código real. El POS nuevo
**NO tiene cola local**: persiste directo contra la API en cada acción
([`useCart.anadirLinea`](../../../NUEVO-POS/apps/pos/src/hooks/useCart.js:122) →
`cliente.anadirItem`). Lo único en `localStorage` son preferencias de UI (`pos.tema`,
`pos.ordenTerminales`), no operaciones.

Por tanto, **no existe un conteo de pendientes que mostrar**. El banner muestra **solo
el estado de red**, con el mensaje *"Sin conexión con el servidor. El cobro está
bloqueado hasta que vuelva la red."* Es **persistente** (no se auto-oculta) y usa
`role="alert"`.

### 3.4 DECISIÓN ARQUITECTÓNICA — No se construye cola local

Se evaluó construir una **cola local** (offline-first) y se **rechazó** con argumentos:

1. **Es un mini-sistema transaccional:** idempotencia, orden, conflictos de folio,
   concurrencia, persistencia, efectivo, multi-terminal. No es un parche de UI.
2. **Contradice el modelo:** "el servidor es la única fuente de verdad". El POS
   persiste directo contra la API en cada acción.
3. **Reintroduce el riesgo de la cicatriz de $453 (v6.1):** con la red caída, el botón
   de cobro quedó activo, el cajero cobró, el `fetch` falló en silencio y la cuenta
   quedó inconsistente. Por eso `useNetworkHealth` expone `botonBloqueado`.
4. **El POS ya tiene la defensa correcta:** banner de red + botón bloqueado.
5. **El patrón Outbox ya se aplica correctamente en el servidor** para notificaciones
   (Regla de Oro #7, contrato #27).

**Si algún día el dolor de red es real y medido, se abrirá una fase propia** (p. ej.
"F10 — Modo offline-first"), no un parche de UX.

---

## 4. Evidencia del CI (puerta de la fase)

`npm run ci` ejecutado desde `../NUEVO-POS` — **TODO EN VERDE**:

```
=== LINT (F0) ===
Archivos en la obra: 249
Lint OK: 0 errores.

── Tests de Node (3 archivo(s)) ──
  ✅ apps/pos/src/theme/theme.test.js
  ✅ apps/pos/src/utils/utilidades.test.js
  ✅ packages/theme-engine/theme-engine.test.js

── Tests de componentes React (Vitest) ──
  ✅ vitest — todos los tests de componentes pasaron.

── Tests de la API (pytest en Docker) ──
  ✅ pytest — todos los tests de la API pasaron.

  Tests de Node      : 3/3 archivo(s) en verde
  Tests de componentes: PASA
  Tests de API       : PASA
  ✅ RESULTADO: TODOS LOS TESTS EN VERDE.

=== GUARDIANES DE ESTÁNDARES (F0 + F4/A-04) ===
Archivos de código escaneados: 165
[OK  ] E-05 — Silencios en ruta crítica (except ... pass) → 0 coincidencia(s)
[OK  ] A-04 — Silencios en la ruta crítica de guardianes → 0 coincidencia(s)
[OK  ] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
[OK  ] E-15 — TODOs sin formato declarado → 0 coincidencia(s)
[OK  ] R-01 — Ancho fijo en la superficie → 0 coincidencia(s)
[OK  ] E-09 — Dinero en Float (Float en models.py) → 0 coincidencia(s)
[OK  ] E-10 — Tiempo naive (DateTime() en models.py) → 0 coincidencia(s)

PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE
```

### Tests específicos de la fase

```
✓ src/components/POSOverlays.f9_0_3.test.jsx    (6 tests)
✓ src/components/ExitAccountModal.f9_0_1.test.jsx (12 tests)
✓ src/components/TecladoNumerico.f9_0_2.test.jsx  (12 tests)

Test Files  3 passed (3)
     Tests  30 passed (30)
```

---

## 5. Matriz de trazabilidad

| Pieza | Origen (viejo POS) | Destino (nuevo POS) | Test |
|-------|--------------------|---------------------|------|
| Modal de salida | `RetailVisionPOS.jsx` (modal inline) | `ExitAccountModal.jsx` | `ExitAccountModal.f9_0_1.test.jsx` |
| Teclado numérico | `CheckoutScreen.jsx` (teclado) | `TecladoNumerico.jsx` | `TecladoNumerico.f9_0_2.test.jsx` |
| OfflineBanner | `POSOverlays.jsx` (`OfflineBanner` con `pendingCount`) | `POSOverlays.jsx` (`OfflineBanner` solo estado de red) | `POSOverlays.f9_0_3.test.jsx` |

### Criterios de aceptación por pieza

**F9.0.1 — Modal de salida (7 criterios):**
1. Con el carrito vacío, salir NO muestra el modal (sale directo).
2. Con el carrito con ítems, salir MUESTRA el modal.
3. "Enviar al Pizarrón y salir" invoca el callback de salida sin borrar la cuenta.
4. "Salir sin enviar" invoca el callback de salida marcando la cuenta como perdida.
5. "Cancelar" cierra el modal y NO sale.
6. Los 3 botones respetan el target táctil ≥44px.
7. `role="dialog"` + `aria-modal="true"`.

**F9.0.2 — Teclado numérico (8 criterios):**
1. El teclado tiene teclas 1-9, 0, "." y "C".
2. Pulsar dígitos concatena al valor recibido.
3. "." solo se permite una vez.
4. "C" limpia el valor.
5. El cambio en vivo se recalcula al pulsar.
6. El botón "CONFIRMAR PAGO" sigue deshabilitado si el recibido < total.
7. Cada tecla respeta el target táctil ≥44px.
8. El input nativo sigue funcionando (no se rompe el caso de teclado físico).

**F9.0.3 — OfflineBanner (6 criterios):**
1. Con red, el banner NO se muestra.
2. Sin red, el banner SÍ se muestra.
3. El banner NO se auto-oculta (persistente).
4. El banner NO muestra ningún conteo de pendientes (no existe cola local).
5. El mensaje comunica que el cobro está bloqueado (coherente con `botonBloqueado`).
6. `role="alert"`.

---

## 6. Lo que esta fase **NO** hace (para evitar confusión futura)

- **NO** implementa **pagos mixtos** (abonar efectivo + tarjeta en la misma cuenta).
  Toca el contrato de cobro (`POST /pos/tickets/{id}/pay`) y las reglas de negocio.
  Va a **F9.1** con su propio plan, sus RN y sus tests.
- **NO** cambia colores ni temas. El nuevo POS usa tokens (`--madera`, `--acento`,
  `text-crema-ticket`); el viejo usaba colores hardcodeados. Se rescató la **gramática
  de interacción**, no los valores de color.
- **NO** revierte el layout responsivo (MOSTRADOR/COMPACTO/MÓVIL). El viejo era
  desktop-only; el nuevo es fluido. Se conserva lo nuevo.
- **NO** toca backend, contratos ni reglas de negocio (RN). No hay migración.
- **NO** construye una cola local (offline-first) → decisión arquitectónica en §3.4.
- **NO** muestra un conteo de pendientes (no existe cola local que lo respalde).

---

## 7. Riesgos (resultado)

| Riesgo | Probabilidad | Impacto | Resultado |
|--------|--------------|---------|-----------|
| El modal de salida interfiere con `onBackToTerminals` | Baja | Medio | **Mitigado:** se intercepta solo si `carrito.lineas.length > 0`; test explícito |
| El teclado numérico rompe el input nativo | Baja | Bajo | **Mitigado:** se conservan ambos; test del caso de teclado físico |
| No existe cola local para el conteo de pendientes | Confirmada | Nulo | **Resuelto:** verificado → el banner muestra solo el estado de red |
| Regresión en el gate de Fase 3 (componentes montados sin props nuevas) | Baja | Medio | **Mitigado:** props nuevas opcionales; CI completo en verde |

---

## 8. Bitácora de cambios

| Versión | Fecha | Cambio |
|---------|-------|--------|
| 1.0 | 30 Sep 2026 | Ficha de cierre inicial. 3 piezas (F9.0.1-F9.0.3) + CI verde + trazabilidad. |
| 1.1 | 30 Sep 2026 | Registro de los hashes reales: NUEVO-POS `20a163d` (código + ficha) · PLANOS `3f942f9` (Plan Maestro v2.0). |

---

## 9. Autocrítica

**¿Esta fase contribuye al objetivo del proyecto?** Sí, de forma acotada y honesta:

- **A favor:** rescata UX que el usuario ya pagó y valoró, con riesgo mínimo y sin
  tocar la arquitectura. Mejora la operación real (salvaguarda de cuentas, cobro
  táctil, aviso de red).
- **En contra / límite:** es una fase **cosmética-operativa**, no estructural. No añade
  capacidad de negocio nueva. La capacidad que SÍ importa (pagos mixtos) se deja
  explícitamente fuera y se planifica aparte, para no mezclar "rescate de UI" con
  "cambio de contrato".
- **Riesgo de sobre-ingeniería:** bajo. Las 3 piezas son componentes pequeños y
  testeables. La disciplina de "gate primero" evitó que crecieran.
- **Honestidad sobre el conteo de pendientes:** verificado que NO hay cola local, NO se
  inventó un número. Se dice la verdad en la UI (solo estado de red).
- **Honestidad sobre la cola local:** se evaluó construirla y se **rechazó** con
  argumentos. Si el dolor de red es real y medido, será una fase propia, no un parche
  de UX.

**Conclusión:** la fase es correcta como **micro-fase de afinado**. Se respetó el
alcance y no se coló F9.1 dentro.

---

## 10. Estado final

| Criterio global de la fase | Estado |
|---|---|
| Las 3 piezas están implementadas y cableadas en la pantalla real | ✅ |
| Cada pieza tiene su test verde | ✅ (30/30) |
| `npm run ci` verde (lint 0 + tests + 7 guards) | ✅ |
| La ficha de cierre existe y está completa | ✅ (este documento) |
| §7 del Plan Maestro actualizado | ✅ |
| Commits + push en ambos repos | ✅ |
| **Ningún** cambio en backend, contratos ni reglas de negocio | ✅ |
| **Ningún** color hardcodeado nuevo (se usan los tokens del tema) | ✅ |

**FASE 9 (F9.0) — CERRADA.**
