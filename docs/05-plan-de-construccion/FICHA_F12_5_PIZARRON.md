# FICHA DE EVIDENCIA — F12.5 Pizarrón de cuentas abiertas integrado al POS

> **Sub-fase:** F12.5 — Cableado del botón "Pizarrón" en `POSHeader` + montaje de `OpenAccountsCorkboard` en `RetailVisionPOS`
> **Fase:** 12 — Porte de funcionalidades del viejo POS al nuevo POS
> **Plan:** [`PLAN_MAESTRO_DEFINITIVO_POS.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/PLAN_MAESTRO_DEFINITIVO_POS.md) §5 (Fase 5) + §6.8 + §10.6
> **Commit de esta sub-fase:** `4e51037`
> **Estado:** ✅ CERRADA — gate verde (7 tests) + CI verde

---

## 1. Qué se construyó

Se **integró** al POS el pizarrón de cuentas abiertas (Fase 5). El componente
[`OpenAccountsCorkboard.jsx`](../../apps/pos/src/components/OpenAccountsCorkboard.jsx)
(F5.3), el hook
[`useOpenAccounts.js`](../../apps/pos/src/hooks/useOpenAccounts.js) (F5.2) y el
servicio
[`openAccountsService.js`](../../apps/pos/src/services/openAccountsService.js)
(F5.1) ya existían desde la Fase 5 y **pasaban sus tests aislados**. **Pero la
pantalla
[`RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx) nunca los
importaba ni los montaba**, y
[`POSHeader.jsx`](../../apps/pos/src/components/POSHeader.jsx) **no tenía ningún
botón** para abrirlo.

Resultado antes de esta sub-fase: el cajero **no podía recuperar una cuenta
abierta desde el POS**. El componente estaba construido, probado… y **HUÉRFANO**.

| Archivo | Rol |
|---|---|
| [`apps/pos/src/components/POSHeader.jsx`](../../apps/pos/src/components/POSHeader.jsx) | El header (se le añadió el botón "Pizarrón") |
| [`apps/pos/src/RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx) | La pantalla (se le cableó el flujo) |
| [`apps/pos/src/RetailVisionPOS.f12_5.test.jsx`](../../apps/pos/src/RetailVisionPOS.f12_5.test.jsx) | La puerta (7 tests, 5 criterios) |

### Los 2 cambios en `POSHeader.jsx`

1. **Props:** `onAbrirPizarron` (callback para abrir el pizarrón) y
   `cuentasAbiertas = 0` (conteo para el badge del botón).
2. **Botón "Pizarrón":** un botón táctil (`min-h-tactil`, R-04) que muestra el
   rótulo "Pizarrón" y el estado "● N abierta(s)" / "○ Sin cuentas". Se pinta en
   acento cuando hay cuentas abiertas.

### Los 5 cambios en `RetailVisionPOS.jsx`

1. **Imports:** `OpenAccountsCorkboard` (componente) + `listarCuentasAbiertas`
   (servicio, **import nombrado** — ver §5).
2. **Estado:** `pizarronAbierto` (visibilidad del overlay) y `cuentasAbiertas`
   (conteo para el badge del botón).
3. **Handlers:** `refrescarConteoCuentas` (lectura ligera del contrato 23 para el
   badge) + `recuperarCuentaAlCarrito` (adopta la identidad de la cuenta y cierra
   el pizarrón).
4. **Cableado:** los props `onAbrirPizarron` + `cuentasAbiertas` a `POSHeader`.
5. **Montaje:** el overlay `OpenAccountsCorkboard` (solo si `pizarronAbierto`).

---

## 2. Clasificación de paridad: HUÉRFANA

Las cuatro categorías de paridad (F10) son:

| Categoría | Significado | ¿Aplica aquí? |
|---|---|---|
| PORTADA | Existe en el viejo POS y en el nuevo | No |
| OMITIDA | Existe en el viejo POS, falta en el nuevo | No |
| **HUÉRFANA** | **Construida en el nuevo POS, nunca integrada** | **Sí** |
| DESCARTADA | Decisión consciente de no portarla | No |

El pizarrón de cuentas abiertas es una **función de la Fase 5 del nuevo POS**.
Sus tres piezas (servicio F5.1, hook F5.2, componente F5.3) se construyeron y se
probaron **en aislamiento**, pero nadie las conectó a la pantalla viva. Es un
**huérfano de integración**: el componente existe y pasa su test, pero el usuario
no puede llegar a él.

> **UX heredada (§6.8):** el viejo POS **sí** tenía un pizarrón de cuentas
> abiertas, abierto desde el header, que recuperaba la cuenta al carrito. La
> **integración** se hereda (botón en el header → overlay → recuperar); la
> **implementación** se reescribió (contratos 21 y 23, hook `useOpenAccounts`).

---

## 3. La 13ª instancia de la lección §10.6

Esta sub-fase es la **decimotercera** vez que aparece la misma clase de fallo:

> *"el componente existe y pasa su test" ≠ "el usuario puede llegar a él"*.

El inventario de componentes no ve las **integraciones** (§10.6.3), ni los
**flujos de datos** (§10.6.4), ni la **paridad de operación** (§10.6.5). Un
componente puede estar 100% verde en su test aislado y, aun así, ser inalcanzable
desde la pantalla real.

La compuerta de F12.5 cierra ese hueco: **no** prueba el componente aislado (eso
ya lo hace `OpenAccountsCorkboard.f5_3.test.jsx`), sino que prueba que el **flujo
completo** (botón → overlay → recuperar) sea alcanzable y opere desde el POS.

---

## 4. Los 5 criterios y su verificación

| # | Criterio | Tests | Resultado |
|---|---|---|---|
| 1 | El botón "Pizarrón" es ALCANZABLE desde el header (existe y respeta R-04) | 2 | ✅ |
| 2 | Pulsar el botón ABRE el pizarrón y éste lista las cuentas (contrato 23) | 2 | ✅ |
| 3 | Recuperar una cuenta adopta su identidad (contrato 21) y CIERRA el pizarrón | 1 | ✅ |
| 4 | "Cerrar" cierra el pizarrón SIN recuperar (no llama al contrato 21) | 1 | ✅ |
| 5 | Un fallo del pizarrón NO tumba el POS: muestra error y el catálogo sigue vivo | 1 | ✅ |

**Total: 7 tests, 7 verdes.**

---

## 5. Contrato respetado y alcance honesto

### El contrato `{outcome, reason}` (nunca `try/catch`)

El handler `refrescarConteoCuentas` respeta el contrato del POS:

```javascript
const r = await listarCuentasAbiertas(terminalEfectiva);
if (r.outcome === 'ok') {
  setCuentasAbiertas((r.data?.cuentas ?? []).length);
}
```

- **Nunca** usa `try/catch` (el servicio devuelve `{outcome, reason}` y no lanza).
- Un fallo del conteo **no tumba el POS**: se deja el conteo en 0 y el pizarrón
  (que es la autoridad de la lista) sigue siendo alcanzable.

### Alcance honesto de "recuperar" (Regla 15 / contrato 21)

`recuperarCuentaAlCarrito` **adopta la identidad** de la cuenta (`ticketId`) y
cierra el pizarrón. **No** hidrata el carrito con líneas inventadas: el contrato
21 (`leerTicket`) devuelve **exactamente 5 campos escalares y NO las líneas**.
Leer las líneas es de otro contrato. Hidratar el carrito es una operación aparte,
**fuera del alcance de F12.5** (que es hacer **alcanzable** el pizarrón, 13ª
instancia de §10.6). Se documenta el límite en vez de fingir que se cubrió.

### El import nombrado (lección de interop ESM/CJS)

El import del servicio se hizo **nombrado** (`import { listarCuentasAbiertas }`)
en vez de namespace (`import * as cuentasAbiertas`). Razón: el servicio hace
`import * as cliente from '../api/client.js'`; al simular el cliente con un objeto
plano, la interop ESM/CJS de Vitest no garantiza que el namespace exponga la
función (el error real fue
`cuentasAbiertas.listarCuentasAbiertas is not a function`). El import nombrado
elimina esa fragilidad.

---

## 6. Evidencia de CI

```
=== LINT (F0) ===
Archivos en la obra: 280
Lint OK: 0 errores.

── Tests de componentes React (Vitest) ──
  ✅ vitest — todos los tests de componentes pasaron.

── Tests de la API (pytest en Docker) ──
  ✅ pytest — todos los tests de la API pasaron.

=== GUARDIANES DE ESTÁNDARES (F0 + F4/A-04) ===
[OK] E-05 — Silencios en ruta crítica → 0 coincidencia(s)
[OK] A-04 — Silencios en la ruta crítica de guardianes → 0 coincidencia(s)
[OK] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
[OK] E-15 — TODOs sin formato declarado → 0 coincidencia(s)
[OK] R-01 — Ancho fijo en la superficie → 0 coincidencia(s)
[OK] E-09 — Dinero en Float → 0 coincidencia(s)
[OK] E-10 — Tiempo naive → 0 coincidencia(s)

PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE
```

### Notas de la compuerta (REGLA DURA 2 — "verificar, no asumir")

1. **El mock del servicio, no solo del cliente.** La primera corrida dio **7
   verdes pero 8 errores no capturados**:
   `cuentasAbiertas.listarCuentasAbiertas is not a function`. El test simulaba
   `./api/client.js` pero **no** `./services/openAccountsService.js`, y la interop
   del namespace fallaba. **Fix:** (a) simular también el servicio, delegando en
   el cliente simulado y devolviendo la MISMA forma `{outcome, reason, data}` que
   el real; (b) cambiar el import de la pantalla a **nombrado**. Resultado: 0
   errores.

2. **Colisión de `role="alert"`.** El Criterio 5 falló con
   `Found multiple elements with the role "alert"`: el POS pinta su propio banner
   de "sin conexión" (role=alert) porque el heartbeat falla en el test, **además**
   del error del pizarrón. **Fix:** la aserción pasó de `findByRole('alert')` a
   `findByText(/red caída/i)` (el texto específico del error del pizarrón).
   Resultado: 7/7 verdes. Lección: en una pantalla viva hay varios `role="alert"`;
   hay que aseverar por el texto propio de la compuerta.

---

## 7. Cierre

- **Función:** Pizarrón de cuentas abiertas (Fase 5) — **HUÉRFANA**.
- **Clasificación:** HUÉRFANA → **integrada**.
- **Instancia §10.6:** 13ª.
- **Gate:** 7 tests verdes.
- **CI:** verde (lint + tests + guards).
- **Alcance honesto:** se hizo **alcanzable** el pizarrón y se adopta la identidad
  de la cuenta al recuperar; la hidratación de las líneas del carrito queda
  **explícitamente fuera** de esta sub-fase (contrato 21 no las expone).
