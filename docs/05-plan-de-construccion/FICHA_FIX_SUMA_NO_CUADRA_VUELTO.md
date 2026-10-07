# FICHA — FIX "suma_no_cuadra" al cobrar con vuelto (monto mayor al total)

**Fecha:** 7 de octubre de 2026
**Fase:** Corrección post-F13 (defecto reportado en operación real)
**Estado:** ✅ COMPLETO — corregido, probado (727/727), documentado y pusheado
**Commit:** _(ver §7)_
**Archivos tocados:** 2 (1 de código + 1 de test)

---

## 1. El reporte (verbatim del usuario)

> "intente cobrar poniendo una cantidad que se pasaba para vert como manejaba el
> cambio y me sale No se pudo completar / suma_no_cuadra / Cerrar"

Traducción: el cajero capturó un monto **MAYOR** al total (p. ej. total $100 y el
cliente entrega $150) para probar cómo la app maneja el **cambio/vuelto**. En vez
de cobrar y mostrar el cambio, la app abortó con el error `suma_no_cuadra`.

---

## 2. Diagnóstico — la causa raíz

### 2.1 Dónde se origina el mensaje

El texto "No se pudo completar / suma_no_cuadra" viene de la frontera del POS:

- [`construirPaymentDetails()`](../NUEVO-POS/apps/pos/src/services/checkoutService.js:95)
  valida **RN-94** en el navegador: la suma de los `monto` de los abonos DEBE
  cuadrar el total. Si no, devuelve `fallo('suma_no_cuadra', { suma, total })`
  ([`checkoutService.js:136`](../NUEVO-POS/apps/pos/src/services/checkoutService.js:136)).
- [`RetailVisionPOS.jsx:668`](../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx:668)
  convierte ese `fallo` en el error visible y **aborta el cobro** antes de llamar
  al backend.

### 2.2 El defecto exacto

En [`CheckoutScreen.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.jsx:154),
`manejarAgregarPago` construía el abono así:

```js
const monto = Number(montoAbono);          // 150 (lo CAPTURADO)
agregarPago({
  metodo: metodoReal,
  monto,                                    // ← 150 (¡lo RECIBIDO!)
  recibido: metodoReal === 'EFECTIVO' ? monto : null,  // ← 150
});
```

Es decir, guardaba **`monto = recibido = 150`**. Pero el diseño canónico (ver
[`calcularCambio()`](../NUEVO-POS/apps/pos/src/services/checkoutService.js:77))
es:

| Campo      | Significado                                  | Valor correcto |
|------------|----------------------------------------------|----------------|
| `monto`    | lo que se **APLICA** al total (≤ pendiente)  | **100**        |
| `recibido` | el efectivo que el cliente **ENTREGA**       | 150            |
| `cambio`   | `recibido − monto`                           | 50             |

Al guardar `monto = 150`, la suma de los abonos (150) **no cuadraba** el total
(100) → RN-94 → `suma_no_cuadra` → el cobro se abortaba.

**El mismo defecto existía en `manejarGuardarEdicion`** (editar un abono a un
monto mayor al pendiente reproducía el fallo).

### 2.3 Por qué el diseño ya contemplaba el vuelto

El servicio [`construirPaymentDetails`](../NUEVO-POS/apps/pos/src/services/checkoutService.js:119)
ya adjunta `recibido` y `cambio` para EFECTIVO, y
[`calcularCambio(monto, recibido)`](../NUEVO-POS/apps/pos/src/services/checkoutService.js:77)
devuelve `recibido − monto`. La intención arquitectónica SIEMPRE fue
`monto` = aplicado, `recibido` = entregado. El componente de UI era el único que
no respetaba ese contrato.

---

## 3. La corrección

En [`CheckoutScreen.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.jsx:153)
se añadió un helper `montoAplicado(metodoReal, capturado)` que, para EFECTIVO,
aplica `min(capturado, pendiente)`; el excedente queda como `recibido` (vuelto).
Para TARJETA/TRANSFERENCIA el monto aplicado es el capturado tal cual.

```js
function montoAplicado(metodoReal, capturado) {
  if (metodoReal !== 'EFECTIVO') return capturado;
  const pendiente = Math.max(0, Math.round((total - resumen.abonado) * 100) / 100);
  return Math.min(capturado, pendiente > 0 ? pendiente : capturado);
}
```

- `manejarAgregarPago`: `monto = montoAplicado(...)`, `recibido = capturado`.
- `manejarGuardarEdicion`: idéntico, pero el pendiente **excluye** el monto
  anterior del abono que se está editando (para no contar doble).

---

## 4. Tabla de cambios

| Archivo | Cambio |
|---------|--------|
| [`CheckoutScreen.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.jsx:153) | Nuevo helper `montoAplicado`; `manejarAgregarPago` y `manejarGuardarEdicion` aplican `min(capturado, pendiente)` y guardan el excedente como `recibido`. |
| [`CheckoutScreen.f9_1_3.test.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.f9_1_3.test.jsx:346) | +5 tests de regresión del vuelto (sección 9). |

---

## 5. Tests de regresión (sección 9 del test file)

1. **Capturar MÁS que el pendiente aplica solo el pendiente y cuadra** — total
   $100, captura $150 → el abono aplica $100, `recibido` $150, el botón se
   habilita y el payload lleva `monto=100`, `recibido=150`.
2. **El vuelto se calcula como recibido − aplicado** — verifica `monto`/`recibido`.
3. **Un monto MENOR al pendiente se aplica tal cual** (sin regresión).
4. **Abonos mixtos: efectivo con vuelto + tarjeta cuadran el total** — la suma de
   `monto` es exactamente el total.
5. **Al editar un abono con vuelto, también aplica solo el pendiente**.

---

## 6. Verificación

| Suite | Antes | Después |
|-------|-------|---------|
| Frontend (`npm run test -- --run`) | 722 passed | **727 passed** (64 files) |
| Backend (`pytest -q`) | 315 passed | 315 passed (sin cambios) |

Los 5 tests nuevos pasan; ningún test existente se rompió.

---

## 7. Lección

**El contrato del payload de pago tiene DOS campos distintos que se confunden
fácilmente:** `monto` (lo aplicado) y `recibido` (lo entregado). El servicio
canónico ya los separaba correctamente, pero la UI los colapsaba en uno solo.
La lección es la de siempre: **la frontera valida, pero la UI no debe poder
CONSTRUIR un payload inválido**. Aquí la UI construía `monto = recibido`, y la
frontera (correctamente) lo rechazaba. El bug no estaba en la validación sino en
la construcción.

**Regla derivada:** cuando un campo del payload tiene una semántica distinta a la
del input del usuario (aquí: "lo capturado" ≠ "lo aplicado"), el componente debe
hacer la conversión explícita y documentarla, no reutilizar el input tal cual.
