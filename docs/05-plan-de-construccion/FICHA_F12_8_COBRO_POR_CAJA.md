# FICHA F12.8 — COBRO GATEADO POR CAJA HABILITADA

**Fase:** 12.8 (Rescate de UX del viejo POS — paridad de operación)
**Estado:** ✅ CERRADA
**Fecha:** 6 Oct 2026
**Compuertas:** `SalesReceipt.f12_8.test.jsx` (11) + `RetailVisionPOS.f4_5.test.jsx` (5) = **16/16 verde**
**CI:** `npm run ci` → lint 286 archivos / 0 errores · guards limpios · pytest PASS · Node 3/4 · Vitest PASS (2 fallos pre-existentes, ajenos a F12.8)

---

## 1. La lección (15ª)

**PARIDAD DE OPERACIÓN (el gate de cobro por caja).**

Las catorce lecciones anteriores cubrieron: el paso de integración como compuerta (F4.5),
la completitud del conjunto (F10), el inventario de componentes que no ve integraciones
(F10.4), ni flujos de datos (F10.5), ni paridad de operación (F10.6); y —en F12.1 a F12.6—
las categorías de paridad PORTADA, OMITIDA, HUÉRFANA, DESCARTADA e INFIEL.

F12.8 agrega una categoría nueva al inventario de paridad: **OPERACIÓN**.

> Un componente puede estar **integrado** (F12.5) y ser **fiel** en su presentación (F12.6),
> y aun así **permitir una operación que el viejo POS prohibía**. La paridad no es solo
> "se ve igual" ni "dice lo mismo": es **"se comporta igual"**.

En el viejo POS, el botón de cobro estaba gateado por `cashEnabled`: **sin caja habilitada,
el único camino válido era enviar la cuenta al pizarrón**. El nuevo POS había perdido ese
gate: el botón COBRAR estaba siempre activo, y solo la guarda RN-49 del backend (y su espejo
en el frontend) lo detenía *después* de intentarlo.

Integrado ≠ fiel ≠ **operativamente equivalente**. La compuerta de F12.6 probaba que el
pizarrón decía la verdad; **no** probaba que el POS respetara las **reglas de operación** del
viejo POS (qué acciones están permitidas en cada estado).

**Regla derivada:** cuando un componente se hereda del viejo POS (§6.8), su compuerta debe
verificar **paridad de operación** —qué acciones permite y en qué estados—, no solo su
existencia ni su presentación.

---

## 2. Diagnóstico

### 2.1 El síntoma

El usuario reportó: *"cuando la caja no está habilitada, lo único que debería poder hacer es
enviarla al pizarrón; solo cuando está habilitada como caja esa terminal sí me permite la
opción de cobrar — pero parece que esto no es así en el nuevo POS."*

### 2.2 La fuente de verdad (el viejo POS)

`apps/pos/components/SalesReceipt.jsx` (viejo POS) recibía `cashEnabled = false` y lo usaba
para **deshabilitar** el botón de cobro:

```jsx
// viejo POS — SalesReceipt.jsx
export const SalesReceipt = ({ ..., cashEnabled = false, ... }) => {
  // El botón de cobro se bloquea si la caja NO está habilitada.
```

El estado `cashEnabled` provenía del turno de caja real (`isCashEnabled`), una **única
fuente de verdad**.

### 2.3 La brecha (dos defectos)

1. **El gate de cobro no existía.** `SalesReceipt.jsx` (nuevo POS) nunca recibía ni usaba un
   indicador de caja habilitada. El botón COBRAR estaba activo siempre; el usuario podía
   *intentar* cobrar sin turno y solo entonces la guarda RN-49 lo rechazaba.
2. **Doble fuente de verdad para "caja activa".** `POSHeader.jsx` pintaba "● Activa" según
   `cajaAbierta` (la visibilidad del overlay del gestor de caja), **no** según `turnoCaja`
   (el turno real). Abrir el gestor pintaba "● Activa" aunque no hubiera turno abierto.

### 2.4 La colisión de nombre (F12.7)

El trabajo se había rotulado F12.7, pero el usuario ya había commiteado un F12.7 distinto
(`d9bd311` — cierre de brechas B1-B4 del Gestor de Caja) con Claude Opus. Se investigaron los
diffs de `d9bd311` y `ed4d0a5` y se confirmó que **el gate de cobro NO existía** en ninguno:
la colisión era solo de nombre. Se renombró el trabajo a **F12.8**.

---

## 3. La decisión de diseño (Opción A)

Al agregar el gate temprano, el test F4.5.3 (que probaba la guarda RN-49 *tardía*) empezó a
fallar: el botón ya no era clickeable sin caja, así que el modal de pago era inalcanzable.

Se evaluaron dos opciones:

| Opción | Descripción | Veredicto |
|---|---|---|
| **A** | Mantener el gate temprano (botón deshabilitado sin caja) y actualizar el test F4.5.3 al comportamiento corregido. Conservar la guarda RN-49 como defensa en profundidad. | ✅ **Aceptada** |
| B | Quitar el gate temprano y confiar solo en la guarda RN-49 tardía. | ❌ Rechazada |

**Por qué la Opción A (§6.8):** *"Cuando un componente ya existe en el viejo POS, su
INTEGRACIÓN se hereda; solo su IMPLEMENTACIÓN se reescribe."* El viejo POS **deshabilitaba**
el botón (`cashEnabled`). Heredar esa integración significa replicar el gate temprano. La
guarda RN-49 **no se elimina**: queda como defensa en profundidad (el backend sigue siendo la
autoridad final).

---

## 4. Lo construido

### 4.1 Frontend

**`apps/pos/src/components/SalesReceipt.jsx`** — nueva prop `cajaHabilitada = false`:

- `cobroBloqueado = vacio || cobrando || !cajaHabilitada` — el botón se deshabilita si el
  ticket está vacío, si ya se está cobrando o si la caja NO está habilitada.
- El rótulo del footer cambia: `cajaHabilitada ? 'Total a Pagar' : 'Caja no habilitada'`.
- El `title` guía al usuario: `'Presione "🏦 CAJA" para habilitar el cobro'`.
- El estilo del botón cambia según `cajaHabilitada` (acento vs. gris deshabilitado).

**`apps/pos/src/RetailVisionPOS.jsx`** — cablea `turnoCaja` (el turno real) a los tres
consumidores:

- `cajaHabilitada={Boolean(turnoCaja)}` en el `SalesReceipt` del panel lateral (línea 762).
- `cajaHabilitada={Boolean(turnoCaja)}` en el `SalesReceipt` móvil (línea 795).
- `cajaHabilitada={Boolean(turnoCaja)}` en el `OpenAccountsCorkboard` (línea 944) — para la
  feature D1 "CAJA ve TODAS las cuentas" (de `ed4d0a5`), un concern distinto del gate de cobro.

**`apps/pos/src/components/POSHeader.jsx`** — el botón CAJA ahora refleja `turnoCaja` (turno
real), no `cajaAbierta` (visibilidad del overlay). Se unifica la fuente de verdad en
`turnoCaja`, igual que el viejo POS usaba una sola (`isCashEnabled`).

### 4.2 La guarda RN-49 (defensa en profundidad, preservada)

`RetailVisionPOS.jsx` (líneas 513-517) conserva la guarda temprana:

```jsx
if (!turnoCaja) {
  setCheckoutAbierto(false);
  setAvisoCaja(true);
  return;
}
```

El backend (`routers/pos.py::_sesion_caja_activa_o_400`) sigue siendo la autoridad final
(RN-49). El gate del frontend es UX; la guarda es defensa; el backend es la ley.

---

## 5. Las compuertas

| Compuerta | Archivo | Tests | Qué prueba |
|---|---|---|---|
| Operación F12.8 | `SalesReceipt.f12_8.test.jsx` | 11 | Gate por caja: bloqueado sin caja, disponible con caja, bloqueos previos preservados |
| Integración F4.5.3 | `RetailVisionPOS.f4_5.test.jsx` | 5 | El gate temprano + la guarda RN-49 como defensa en profundidad |

**Total: 16/16 verde.**

---

## 6. Los 8 invariantes (F12.8)

1. Sin caja habilitada, el botón COBRAR está **deshabilitado**.
2. Sin caja habilitada, el rótulo dice **"Caja no habilitada"**.
3. Sin caja habilitada, el `title` guía a habilitar la caja.
4. Con caja habilitada, el botón COBRAR está **habilitado**.
5. Con caja habilitada, el rótulo dice **"Total a Pagar"**.
6. Un ticket vacío bloquea el cobro **aunque** la caja esté habilitada.
7. Un cobro en curso (`cobrando`) bloquea el botón **aunque** la caja esté habilitada.
8. La guarda RN-49 sigue existiendo como defensa en profundidad (el backend es la autoridad).

---

## 7. Archivos tocados

**Frontend (`../NUEVO-POS/apps/pos/src/`):**
- `components/SalesReceipt.jsx` — prop `cajaHabilitada` + gate del botón.
- `components/SalesReceipt.f12_8.test.jsx` — compuerta nueva (11 tests).
- `components/POSHeader.jsx` — fuente de verdad unificada en `turnoCaja`.
- `components/POSHeader.f12_3.test.jsx` — test actualizado a la fuente de verdad.
- `RetailVisionPOS.jsx` — cablea `cajaHabilitada` a los 3 consumidores.
- `RetailVisionPOS.f4_5.test.jsx` — test F4.5.3 actualizado al comportamiento corregido.

---

## 8. Commit

- **NUEVO-POS:** `edbcca1`

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
| RN-49 | Solo una sesión de caja OPEN por terminal; sin turno, el cobro se rechaza | `test_f3_comportamiento.py::test_rn49` + `RetailVisionPOS.f4_5.test.jsx` (F4.5.3) |
| §6.8 | La integración se hereda; la implementación se reescribe | `SalesReceipt.f12_8.test.jsx` (paridad de operación) |
| R-04 | Objetivo táctil ≥ 44px (`min-h-[60px]`) | `SalesReceipt.f12_8.test.jsx` |
| A-02 / O-23 | Los contratos exponen operaciones, nunca tablas | `test_f2_frontera.py` |
