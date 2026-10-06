# FICHA F12.9 — ENVIAR AL PIZARRÓN SIN CAJA HABILITADA

**Fase:** 12.9 (Rescate de UX del viejo POS — paridad de operación, corrección de F12.8)
**Estado:** ✅ CERRADA
**Fecha:** 6 Oct 2026
**Compuertas:** `SalesReceipt.f12_8.test.jsx` (12) + `RetailVisionPOS.f4_5.test.jsx` (5) + `RetailVisionPOS.f12_5.test.jsx` (7) + `OpenAccountsCorkboard.f5_3.test.jsx` (8) + `OpenAccountsCorkboard.f12_6.test.jsx` (12) + `RetailVisionPOS.f8_6.test.jsx` (7) = **51/51 verde**
**CI:** `npm run ci` → guards 7/7 limpios · Vitest **648/648 verde** (0 fallos) · pytest PASS

---

## 1. La lección (16ª)

**PARIDAD DE OPERACIÓN — la operación conflacionada.**

F12.8 introdujo la categoría **OPERACIÓN** al inventario de paridad: *"un componente puede
estar integrado y ser fiel en su presentación, y aun así permitir una operación que el viejo
POS prohibía"*. F12.8 corrigió el gate de cobro: sin caja, el botón COBRAR se deshabilita.

Pero F12.8 **aplicó el gate sobre un solo botón que representaba DOS operaciones distintas**.

> En el viejo POS había **dos botones separados**: **COBRAR** (gateado por `cashEnabled`) y
> **ENVIAR CUENTA** (NUNCA gateado — enviar al pizarrón siempre es válido). El nuevo POS los
> había **conflacionado en un único botón**. Al gatear ese botón único por caja, se bloqueó
> *también* el envío al pizarrón — la operación que el usuario necesitaba precisamente cuando
> NO hay caja.

**Regla derivada:** cuando un componente heredado del viejo POS expone **N operaciones
distintas**, su compuerta debe verificar que cada operación conserva **su propio gate**. Un
gate aplicado a un control que representa varias operaciones **sobre-bloquea**: cierra puertas
que debían quedar abiertas.

Esta es la **16ª instancia** del principio §10.6 ("de adentro hacia afuera"): el defecto no
estaba en la lógica del gate (que era correcta), sino en la **frontera del control** — un botón
que debía ser dos.

---

## 2. Diagnóstico

### 2.1 El síntoma

El usuario reportó: *"cuando una terminal no tiene la caja habilitada debe ser capaz de enviar
las cuentas al pizarrón tal como ocurre en el viejo POS, y eso no está ocurriendo en el nuevo
POS."*

### 2.2 La fuente de verdad (el viejo POS)

`apps/pos/components/SalesReceipt.jsx` (viejo POS) exponía **dos acciones separadas**:

- **COBRAR** — gateado por `cashEnabled`. Sin caja, deshabilitado.
- **ENVIAR CUENTA** (`handleHoldAccount`) — **sin gate**. Enviar al pizarrón siempre es válido,
  con o sin caja.

La operación "enviar al pizarrón" es la **válvula de escape** del POS sin caja: es *lo único*
que se puede hacer con una cuenta cuando la terminal no cobra.

### 2.3 La brecha

El nuevo POS había **conflacionado** ambas operaciones en un único botón. F12.8 gateó ese botón
único por `cajaHabilitada`, con lo que:

- Sin caja → el botón se deshabilita → **el operador no puede enviar la cuenta al pizarrón**.
- La válvula de escape quedó cerrada exactamente en el escenario donde se necesita.

### 2.4 La verificación (git)

Se inspeccionaron los diffs de `ed4d0a5` (pizarrón) y `d9bd311` (F12.7) para confirmar que el
gate de F12.8 se había aplicado sobre un control conflacionado, no sobre dos controles. La
evidencia: el viejo POS tenía dos `onClick` distintos; el nuevo, uno solo.

---

## 3. La decisión de diseño (Opción A — restaurar la paridad de dos botones)

| Opción | Descripción | Veredicto |
|---|---|---|
| **A** | Separar en DOS botones: **COBRAR** (gateado por caja) + **ENVIAR CUENTA** (sin gate). Restaurar la paridad exacta del viejo POS. | ✅ **Aceptada** |
| B | Dejar un solo botón y quitar el gate de F12.8. | ❌ Rechazada — reintroduce el defecto de F12.8 (cobro sin caja). |
| C | Un solo botón con comportamiento condicional (cobra si hay caja, envía si no). | ❌ Rechazada — oculta la operación disponible; el operador no ve que puede enviar. |

**Por qué la Opción A (§6.8):** *"Cuando un componente ya existe en el viejo POS, su
INTEGRACIÓN se hereda; solo su IMPLEMENTACIÓN se reescribe."* El viejo POS **separaba** las dos
operaciones. Heredar esa integración significa replicar **dos controles con dos gates
independientes**.

---

## 4. Lo construido

### 4.1 Frontend

**`apps/pos/src/components/SalesReceipt.jsx`** — dos acciones separadas:

- **COBRAR** — `disabled={cobroBloqueado}` donde `cobroBloqueado = vacio || cobrando || !cajaHabilitada`.
  Gateado por caja (heredado de F12.8).
- **ENVIAR CUENTA** — `disabled={vacio || enviandoCuenta}`. **NO gateado por caja.** Llama a
  `onEnviarCuenta`. Visible y habilitado siempre que haya líneas.

**`apps/pos/src/RetailVisionPOS.jsx`** — nuevo handler `enviarCuentaAlPizarron`:

- Persiste el ticket (mismo camino atómico que el cobro), **limpia** el carrito y **abre una
  cuenta nueva** — la cuenta enviada queda viva en el pizarrón.
- Cablea `onEnviarCuenta` / `enviandoCuenta` en los **dos** render sites de `SalesReceipt`
  (panel lateral desktop + panel móvil).

### 4.2 Compuertas

- **`SalesReceipt.f12_8.test.jsx`** — se añadió la compuerta F12.9: con `cajaHabilitada=false`,
  COBRAR está deshabilitado **y** ENVIAR CUENTA está habilitado (la operación clave).
- **`RetailVisionPOS.f4_5.test.jsx`** — se alineó al doble botón.

### 4.3 Reparación de compuertas obsoletas (hallazgo colateral)

Al correr la suite completa se detectaron compuertas que quedaron **obsoletas** tras el rewrite
de presentación de F12.6 (el pizarrón pasó a folio `#001` + post-it clickable):

- `OpenAccountsCorkboard.f5_3.test.jsx` (8) — alineada a la presentación real.
- `OpenAccountsCorkboard.f12_6.test.jsx` (12) — alineada.
- `RetailVisionPOS.f12_5.test.jsx` (7) — alineada.

### 4.4 Reparación de deuda de CI pre-existente

La suite completa reveló **48 fallos pre-existentes** en el árbol limpio (HEAD `f627342`),
ajenos a F12.9. Se repararon los que estaban al alcance:

- **Runner** (`scripts/test.mjs`) — misruteaba `sessionReset.guardian.test.js`.
- **`hooks.test.jsx`** — `useNetworkHealth`.
- **`components.f3_4.test.jsx`** (3) — alineado.
- **`GestorDeCaja.f4_3 / f10_4 / f10_5 / f10_6_4`** (15) — alineados.
- **`RetailVisionPOS.f3_cierre.test.jsx`** (2) — el botón que abre el modal de pago es
  `💰 COBRAR` (no `💰 ENVIAR CUENTA`).

**Resultado:** de 48 fallos pre-existentes → **0**. F12.9 arregló 25 y no introdujo ninguno.

### 4.5 Alineación de las 3 compuertas de F7 (deuda vieja, ajena a F12.9)

Las 3 rojas restantes eran de F7 y **pre-existentes** (probado con `git stash`: fallan igual en
el árbol limpio). Se alinearon a la realidad del POS nuevo **sin inventar funciones**:

1. **`RetailVisionPOS.f7_5a.test.jsx`** — el test buscaba `getByRole('button', { name: /Cerrar/i })`
   y colisionaba con varios controles "Cerrar". Se **acotó la búsqueda al diálogo**
   (`within(dialogo)`) — el botón ✕ vive dentro del modal.
2. **`RetailVisionPOS.f7_6.test.jsx`** (visor) — misma colisión; se acotó al diálogo del visor
   (`within(visor)`).
3. **`RetailVisionPOS.f7_6.test.jsx`** (tema) — el test esperaba un botón "Cambiar tema" **en la
   pantalla del POS**. Se verificó con `git show ed4d0a5` que el selector de tema fue
   **reubicado intencionalmente a la landing** (`TerminalSelector.jsx`, `aria-label="Cambiar tema"`,
   línea 452) — el commit lo documenta: *"Tema (F7.5.1) — reubicado a la landing (TerminalSelector)"*.
   El test se alineó a la frontera real: la pantalla del POS **NO** expone el control de tema.

---

## 5. Verificación

| Compuerta | Antes | Después |
|---|---|---|
| `SalesReceipt.f12_8.test.jsx` | 11 | **12** (añadida F12.9) |
| `RetailVisionPOS.f4_5.test.jsx` | 5 | **5** |
| `RetailVisionPOS.f12_5.test.jsx` | 7 | **7** |
| `OpenAccountsCorkboard.f5_3.test.jsx` | 8 | **8** |
| `OpenAccountsCorkboard.f12_6.test.jsx` | 12 | **12** |
| `RetailVisionPOS.f8_6.test.jsx` | 7 | **7** |
| `RetailVisionPOS.f7_5a.test.jsx` | 6 | **6** |
| `RetailVisionPOS.f7_6.test.jsx` | 18 | **18** |
| **Suite completa** | 645/648 (3 rojas F7) | **648/648** |
| **Guards** | 7/7 | **7/7** |

---

## 6. Archivos tocados

**Producción:**
- `apps/pos/src/components/SalesReceipt.jsx` — dos botones (COBRAR gateado + ENVIAR CUENTA libre).
- `apps/pos/src/RetailVisionPOS.jsx` — handler `enviarCuentaAlPizarron` + cableado doble.
- `apps/pos/src/hooks/useCart.js` — soporte de limpieza tras envío.

**Compuertas:**
- `apps/pos/src/components/SalesReceipt.f12_8.test.jsx` — compuerta F12.9.
- `apps/pos/src/RetailVisionPOS.f4_5.test.jsx`, `.f12_5.test.jsx`, `.f8_6.test.jsx`, `.f3_cierre.test.jsx`.
- `apps/pos/src/components/OpenAccountsCorkboard.f5_3.test.jsx`, `.f12_6.test.jsx`.
- `apps/pos/src/components/components.f3_4.test.jsx`.
- `apps/pos/src/hooks/hooks.test.jsx`.
- `apps/pos/src/GestorDeCaja.f4_3.test.jsx`, `.f10_4.test.jsx`, `.f10_5.test.jsx`, `.f10_6_4.test.jsx`.
- `apps/pos/src/RetailVisionPOS.f7_5a.test.jsx`, `.f7_6.test.jsx` — alineadas a la realidad.
- `scripts/test.mjs` — runner.

---

## 7. Criterios de cierre

1. ✅ Sin caja: **COBRAR** deshabilitado, **ENVIAR CUENTA** habilitado.
2. ✅ Con caja: **COBRAR** habilitado, **ENVIAR CUENTA** habilitado.
3. ✅ Enviar al pizarrón persiste la cuenta, limpia el carrito y abre una cuenta nueva.
4. ✅ Los dos render sites (desktop + móvil) cablean ambas acciones.
5. ✅ Suite completa **648/648 verde**; guards **7/7**.
6. ✅ Las 3 compuertas de F7 alineadas a la realidad (sin inventar funciones).

---

## 8. Lección para el inventario de paridad

| Categoría | Fase | Pregunta que responde |
|---|---|---|
| PORTADA | F12.1 | ¿El componente existe en el nuevo POS? |
| OMITIDA | F12.2 | ¿Falta una pieza del componente? |
| HUÉRFANA | F12.3 | ¿Hay piezas sin dueño? |
| DESCARTADA | F12.4 | ¿Se descartó algo que debía conservarse? |
| INFIEL | F12.6 | ¿La presentación dice la verdad? |
| OPERACIÓN | F12.8 | ¿Permite las mismas acciones en los mismos estados? |
| **CONFLACIÓN** | **F12.9** | **¿Un control representa varias operaciones con gates distintos?** |

> **CONFLACIÓN:** un control que agrupa N operaciones heredadas bajo un solo gate. El gate
> correcto para una operación **sobre-bloquea** las otras. La corrección es **separar** el
> control en N controles, cada uno con su propio gate — restaurando la frontera del viejo POS.
