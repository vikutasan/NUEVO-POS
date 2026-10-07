# FICHA — FIX "suma_no_cuadra" al cobrar con vuelto (monto mayor al total)

**Fecha:** 7 de octubre de 2026
**Fase:** Corrección post-F13 (defecto reportado en operación real)
**Estado:** ✅ COMPLETO — corregido, probado (732 frontend / 320 backend), documentado y pusheado
**Commit:** `3f6b3f8` (1ª vuelta) + `57a1ba4` (ficha) + **3ª vuelta** (defensa de frontera)
**Archivos tocados:** 4 (2 de código + 2 de test)

> **NOTA DE HONESTIDAD (3ª vuelta).** El usuario reportó "el problema continua"
> tras la 1ª vuelta. El diagnóstico de la 2ª vuelta concluyó que el backend y el
> frontend ya eran correctos y que el error visible venía de un **bundle viejo**
> (el dev server estaba caído). Para que el defecto NO pueda reaparecer por
> ninguna versión de cliente, la 3ª vuelta añade una **defensa de frontera** en
> el backend (acota `monto` al total) y blinda el **path del pago ÚNICO** con
> tests (que la 1ª vuelta no cubría). Ver §8.

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

---

## 8. 3ª vuelta — defensa de frontera (el usuario reportó "el problema continua")

### 8.1 El reporte

> "el problema continua"

Tras la 1ª vuelta (`3f6b3f8`), el usuario volvió a ver `suma_no_cuadra` al cobrar
con un monto mayor al total.

### 8.2 Diagnóstico de la 2ª vuelta — el código ya era correcto

Se verificó, línea por línea, que **ambos lados ya estaban correctos**:

- **Frontend** ([`CheckoutScreen.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.jsx:254)):
  `manejarConfirmar` (pago único) ya envía `monto = min(capturado, total)` y
  `recibido = capturado`; `manejarAgregarPago`/`manejarGuardarEdicion` ya aplican
  `min(capturado, pendiente)`.
- **Backend** ([`_normalizar_pagos()`](../NUEVO-POS/apps/api/routers/pos.py:229)):
  ya reconstruye `monto` desde el total cuando falta, y respeta `monto` cuando
  viene.

Se reprodujo el flujo con un script (`_repro_vuelto.py`) que importa
`_normalizar_pagos` y `rn94_suma_de_pagos_cuadra_total` directamente. Resultado:
**el backend acepta TODAS las formas legítimas** (legacy sin `monto`, nuevo con
`monto`, canónico `pagos[]`). Solo fallaba la forma **malformada** `monto = recibido
= 150` — exactamente el bug que la 1ª vuelta corrigió en el frontend.

**Conclusión:** el error que el usuario veía venía de un **bundle viejo** en el
navegador (el dev server de Vite estaba caído; ver [`ERR_CONNECTION_REFUSED`]).
El código servido no era el actual.

### 8.3 La decisión — blindar la frontera, no confiar en el cliente

En vez de asumir "el cliente ya manda bien", se añadió una **defensa de frontera**
en el backend: [`_normalizar_pagos()`](../NUEVO-POS/apps/api/routers/pos.py:229)
ahora **acota `monto` al total**. Si un cliente (de cualquier versión) manda
`monto > total`, el excedente se trata como **cambio**, no como pago:

```python
if total is not None and "monto" in pago:
    try:
        monto_dec = Decimal(str(pago["monto"]))
        total_dec = Decimal(str(total))
        if monto_dec > total_dec:
            pago["monto"] = str(total_dec)   # el excedente es cambio
    except (InvalidOperation, ValueError, TypeError):
        pass   # monto no parseable: se deja tal cual, RN-94 lo rechazará
```

Así, **un vuelto legítimo NUNCA rompe el cobro, sin importar la versión del
cliente**. El cobro de MENOS sigue detectándose (la suma < total → RN-94).

### 8.4 El path que faltaba cubrir — el pago ÚNICO

La 1ª vuelta añadió 5 tests (sección 9 del test file), pero **todos usaban el path
de `abonos`** (agregar pago → confirmar). El path que el cajero usa de verdad —
teclear el efectivo y pulsar CONFIRMAR PAGO **sin** agregar abonos — **no estaba
cubierto**. La 3ª vuelta añade la **sección 10** con 5 tests del pago único:

1. **Efectivo con vuelto**: `monto = total`, `recibido = capturado`, `cambio = excedente`.
2. **Efectivo exacto**: `monto = recibido = total`, `cambio = 0`.
3. **Tarjeta**: `monto = total`, `recibido = total`, `cambio = 0` (sin captura).
4. **Efectivo con vuelto: el botón se habilita** (no queda muerto).
5. **Efectivo insuficiente: el botón sigue bloqueado** (sin regresión).

### 8.5 Tests de backend (sección 5b de `test_f9_1_pagos.py`)

Se añadieron 5 tests que blindan la defensa de frontera:

1. **`monto > total` se acota al total** — el caso malformado `monto = recibido = 150`
   sobre un total de 100 ahora normaliza a `monto = 100` y RN-94 pasa.
2. **Vuelto legítimo cuadra** — `monto = total`, `recibido > total`.
3. **Cobro de menos sigue rechazándose** — la defensa NO enmascara el cobro parcial.
4. **`monto` no parseable NO se acota** — se conserva para que RN-94 lo detecte
   (comportamiento pre-existente: RN-94 lanza `InvalidOperation`).
5. **Sin `total` no se acota** — retrocompatibilidad.

### 8.6 Archivos tocados (3ª vuelta)

| Archivo | Cambio |
|---------|--------|
| [`pos.py`](../NUEVO-POS/apps/api/routers/pos.py:229) | `_normalizar_pagos` acota `monto` al total; import de `InvalidOperation`. |
| [`test_f9_1_pagos.py`](../NUEVO-POS/apps/api/tests/test_f9_1_pagos.py:194) | +5 tests de la defensa de frontera (sección 5b). |
| [`CheckoutScreen.f9_1_3.test.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.f9_1_3.test.jsx:415) | +5 tests del pago único con vuelto (sección 10). |
| [`FICHA_FIX_SUMA_NO_CUADRA_VUELTO.md`](../NUEVO-POS/docs/05-plan-de-construccion/FICHA_FIX_SUMA_NO_CUADRA_VUELTO.md) | Esta sección §8. |

### 8.7 Verificación (3ª vuelta)

| Suite | Antes | Después |
|-------|-------|---------|
| Frontend (`npm run test -- --run`) | 727 passed | **732 passed** (64 files) |
| Backend (`pytest -q`) | 315 passed | **320 passed** |

Los 10 tests nuevos pasan; ningún test existente se rompió.

### 8.8 Lección de la 3ª vuelta

**Una frontera robusta no confía en que el cliente mande bien: valida y
SANEa.** La 1ª vuelta corrigió el cliente; la 3ª vuelta hizo que el servidor
tolere clientes obsoletos. En un POS con terminales que pueden quedar con
bundles cacheados, **el backend debe ser el guardián final**: si un `monto`
excede el total, es un vuelto mal etiquetado, no un error del cajero.
