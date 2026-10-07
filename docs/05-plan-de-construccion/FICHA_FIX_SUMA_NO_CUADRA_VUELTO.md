# FICHA — FIX "suma_no_cuadra" al cobrar con vuelto (monto mayor al total)

**Fecha:** 7 de octubre de 2026
**Fase:** Corrección post-F13 (defecto reportado en operación real)
**Estado:** ✅ COMPLETO — corregido, probado (750 frontend / 320 backend), documentado y pusheado
**Commit:** `3f6b3f8` (1ª vuelta) + `57a1ba4` (ficha) + `24971a2`/`1ff2c93` (3ª vuelta) + `41d2ce8` (4ª vuelta, parche de síntoma) + **5ª vuelta** (fix arquitectónico DT-02 regla 6)
**Archivos tocados:** 6 (3 de código + 2 de test + esta ficha) — ver §9.6 y §10.6

> **NOTA DE HONESTIDAD (5ª vuelta).** La 4ª vuelta "resolvió" el síntoma
> redondeando una suma de flotantes **en el frontend**. El dueño preguntó:
> *"¿no dijimos en los transversales del ERP que no se debe usar flotante?"*.
> Tenía razón: la 4ª vuelta seguía violando **DT-02 regla 6** ("El dinero no se
> suma en el frontend. Los totales vienen del backend. El frontend solo
> formatea."). La 5ª vuelta elimina la causa raíz: el total del ticket ahora se
> **LEE del backend** (`Numeric(12,2)`), no se deriva sumando líneas. Ver §10.

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

---

## 9. 4ª vuelta — la causa raíz REAL: el total flotante sin redondear

### 9.1 El reporte

> "refresque navegador y el problema continua"

Tras la 3ª vuelta, el usuario **refrescó el navegador** (descartando así el
bundle viejo) y el `suma_no_cuadra` **siguió apareciendo**. Esto **refutó** el
diagnóstico de la 2ª vuelta ("bundle viejo"): el defecto era real y estaba en
el código actual.

### 9.2 Reproducción end-to-end contra la API viva

Se escribió un script (`_repro_e2e.py`) que, contra la API viva
(`nuevo_pos_api` en el puerto 5101), envía el payload **canónico** y el
**legacy**. Resultado: **el backend responde 200 en ambos casos**. Es decir, el
backend NO era el culpable — el error nacía en el cliente, ANTES de la llamada.

### 9.3 La causa raíz — aritmética de punto flotante

El total del carrito se calculaba en
[`useCart.js`](../NUEVO-POS/apps/pos/src/hooks/useCart.js:111) como una **suma
cruda de flotantes**:

```js
const total = useMemo(
  () => lineas.reduce((acc, l) => acc + Number(l.unit_price) * Number(l.quantity), 0),
  [lineas]
);
```

Con un precio como `$33.33` y cantidad `3`, el resultado en JS es
`33.33 × 3 = 99.99000000000001` (no `99.99`). Ese total **flotante** fluía al
path del **pago único** en
[`manejarConfirmar()`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.jsx:269):

```js
const monto = Math.min(montoCapturado, total);   // ← 99.99000000000001 SIN redondear
```

El `monto` sin redondear cruzaba la frontera y el backend lo comparaba con
`Decimal` exacto:

```
Decimal("99.99000000000001") != Decimal("99.99")   →   RN-94   →   suma_no_cuadra
```

**El path de `abonos` estaba protegido** porque
[`montoAplicado()`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.jsx:188)
redondea el `pendiente` con `Math.round(... * 100) / 100`. **El path del pago
único NO redondeaba nada.** Esa asimetría era el bug.

### 9.4 La corrección — redondear TODO lo que cruza la frontera

Se aplicaron **4 cambios** para que ningún flotante llegue jamás al backend:

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | [`useCart.js`](../NUEVO-POS/apps/pos/src/hooks/useCart.js:111) | El `total` se redondea a 2 decimales en el origen. |
| 2 | [`CheckoutScreen.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.jsx:62) | Nuevo helper `redondear2(valor)`. |
| 3 | [`CheckoutScreen.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.jsx:269) | `manejarConfirmar` redondea `monto`, `recibido` y `cambio` (ambos paths: efectivo y tarjeta). |
| 4 | [`checkoutService.js`](../NUEVO-POS/apps/pos/src/services/checkoutService.js:95) | `construirPaymentDetails` redondea cada `montoNum` antes de sumar. |

**Cambio 1 — `useCart.js`:**

```js
const total = useMemo(
  () =>
    Math.round(
      lineas.reduce((acc, l) => acc + Number(l.unit_price) * Number(l.quantity), 0) * 100
    ) / 100,
  [lineas]
);
```

**Cambio 2 — helper `redondear2` en `CheckoutScreen.jsx`:**

```js
function redondear2(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
```

**Cambio 3 — `manejarConfirmar` (pago único):**

```js
if (esEfectivo) {
  const monto = redondear2(Math.min(montoCapturado, total));
  const recibido = redondear2(montoCapturado);
  onConfirmar({
    metodo: metodoReal,
    monto,
    recibido,
    cambio: redondear2(Math.max(recibido - monto, 0)),
  });
  return;
}
const totalRedondeado = redondear2(total);
onConfirmar({
  metodo: metodoReal,
  monto: totalRedondeado,
  recibido: totalRedondeado,
  cambio: 0,
});
```

**Cambio 4 — `construirPaymentDetails` (path de abonos):**

```js
const montoNum = Math.round(Number(abono && abono.monto) * 100) / 100;
if (!Number.isFinite(montoNum) || montoNum <= 0) {
  return fallo('monto_invalido', null);
}
const pago = { metodo, monto: aMonto(montoNum) };
```

### 9.5 Tests de regresión (total flotante `99.99000000000001`)

Se añadieron **10 tests** con `const TOTAL_FLOTANTE = 33.33 * 3;`:

- **Sección 11 de [`CheckoutScreen.f9_1_3.test.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.f9_1_3.test.jsx) (6 tests):**
  1. El resumen muestra `$99.99` (no `$99.99000000000001`).
  2. Pago único exacto: `monto === 99.99`, `recibido === 100`, `cambio === 0.01`.
  3. Pago único con vuelto: `monto === 99.99`, `recibido === 150`, `cambio === 50.01`.
  4. Tarjeta: `monto === 99.99`.
  5. Abonos: `Number(abono.monto) === 99.99`.
  6. Abonos: la suma redondeada es `99.99`.
- **Sección A7 de [`useCheckout.f9_1_2.test.jsx`](../NUEVO-POS/apps/pos/src/hooks/useCheckout.f9_1_2.test.jsx) (4 tests):**
  1. Abono con total flotante → `ok`.
  2. Abono con monto flotante → `pagos[0].monto === '99.99'`.
  3. Pago mixto → suma `99.99`.
  4. Pago corto → sigue rechazándose con `suma_no_cuadra` (sin regresión).

### 9.6 Archivos tocados (4ª vuelta)

| Archivo | Cambio |
|---------|--------|
| [`useCart.js`](../NUEVO-POS/apps/pos/src/hooks/useCart.js:111) | `total` redondeado a 2 decimales. |
| [`CheckoutScreen.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.jsx:62) | Helper `redondear2` + `manejarConfirmar` redondea `monto`/`recibido`/`cambio`. |
| [`checkoutService.js`](../NUEVO-POS/apps/pos/src/services/checkoutService.js:95) | `construirPaymentDetails` redondea cada `montoNum`. |
| [`CheckoutScreen.f9_1_3.test.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.f9_1_3.test.jsx) | +6 tests (sección 11). |
| [`useCheckout.f9_1_2.test.jsx`](../NUEVO-POS/apps/pos/src/hooks/useCheckout.f9_1_2.test.jsx) | +4 tests (sección A7). |
| [`FICHA_FIX_SUMA_NO_CUADRA_VUELTO.md`](../NUEVO-POS/docs/05-plan-de-construccion/FICHA_FIX_SUMA_NO_CUADRA_VUELTO.md) | Esta sección §9. |

### 9.7 Verificación (4ª vuelta)

| Suite | Antes | Después |
|-------|-------|---------|
| Frontend (`npm run test -- --run`) | 732 passed | **742 passed** (64 files) |

Los 10 tests nuevos pasan; ningún test existente se rompió (incluido el cambio
de `useCart.total`, que afecta a todo el carrito).

### 9.8 Lección de la 4ª vuelta

**El dinero NUNCA debe viajar como flotante sin redondear.** `33.33 × 3` no es
`99.99` en IEEE-754; es `99.99000000000001`. Cuando ese valor cruza a un backend
que compara con `Decimal` exacto (RN-94), la comparación falla por un bit. La
regla es simple y no admite excepciones: **todo valor monetario se redondea a 2
decimales en el punto donde se calcula** (el carrito) **y otra vez en el punto
donde cruza la frontera** (el payload). Redondear en un solo lado es frágil;
redondear en ambos es defensa en profundidad.

**Regla derivada:** si un path de cobro redondea y otro no, el que no redondea
es un bug latente esperando un precio con centavos no representables en binario
(`.33`, `.67`, etc.). La asimetría entre `montoAplicado` (redondeaba) y
`manejarConfirmar` (no redondeaba) fue exactamente eso.

---

## 10. 5ª vuelta — el fix ARQUITECTÓNICO: el total viene del backend (DT-02 regla 6)

### 10.1 El reporte (verbatim del usuario)

> "pero no dijimos en los transversales del erp que no se debe usar flotante?"

El dueño **cuestionó la 4ª vuelta**: redondear una suma de flotantes en el
frontend seguía siendo sumar dinero en el frontend. La pregunta era correcta y
señalaba una **deuda arquitectónica**, no un bug de redondeo.

### 10.2 La directiva violada — DT-02 regla 6

De [`DIRECTRICES_TRANSVERSALES_DEL_ERP.md`](../NUEVO-POS/docs/DIRECTRICES_TRANSVERSALES_DEL_ERP.md),
la directiva **DT-02 (Dinero)** establece:

- **DT-02.1:** "El dinero se guarda en `Numeric(12,2)`, nunca en `Float`."
- **DT-02.3 regla 6:** "**El dinero no se suma en el frontend.** Los totales
  vienen del backend. El frontend solo formatea."
- **DT-02.3 regla 7:** el dinero viaja como STRING en el cable; se coacciona con
  `Number()` antes de operar.

La 4ª vuelta **redondeaba** la suma, pero seguía **sumando** en el frontend
(`lineas.reduce(...)`). Eso es exactamente lo que la regla 6 prohíbe. El
redondeo era un **parche de síntoma**: hacía que el número coincidiera, pero la
**fuente de verdad** seguía estando en el cliente.

### 10.3 El punto ciego del guard E-09

El guard [`E-09`](../NUEVO-POS/scripts/guards.mjs:128) solo miraba `Float` en
`models.py` (backend). Era **ciego** a la suma de dinero en el frontend: la
violación de la regla 6 pasaba la puerta sin ser detectada. Ese punto ciego es
la razón por la que la deuda sobrevivió 4 vueltas.

### 10.4 El fix arquitectónico — el total se LEE, no se CALCULA

Se invirtió la dirección del dato: el total del ticket ahora **viene del
backend** (contrato 21 `leerTicket` / contrato 30 `leerLineas`, ambos
`total: Decimal` → `Numeric(12,2)`), y el frontend solo lo **formatea**.

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | [`useCart.js`](../NUEVO-POS/apps/pos/src/hooks/useCart.js:170) | Nuevo estado `totalServidor` + `refrescarTotal()` (lee contrato 21). `total` se deriva de `totalServidor`; la suma local queda SOLO como fallback sin servidor. |
| 2 | [`useCart.js`](../NUEVO-POS/apps/pos/src/hooks/useCart.js:187) | `anadirLinea`/`cambiarCantidad`/`quitarLinea` refrescan el total del servidor tras cada escritura. |
| 3 | [`useCart.js`](../NUEVO-POS/apps/pos/src/hooks/useCart.js:477) | `hidratarLineas(lineas, version, totalServidor)` ADOPTA el total del backend (contrato 30). |
| 4 | [`RetailVisionPOS.jsx`](../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx:403) | Ambos call sites de `hidratarLineas` pasan `datos.total`. |
| 5 | [`RetailVisionPOS.jsx`](../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx:969) | Ambos render sites de `SalesReceipt` pasan `total={carrito.total}`. |
| 6 | [`SalesReceipt.jsx`](../NUEVO-POS/apps/pos/src/components/SalesReceipt.jsx:40) | Nueva prop `total`; el componente usa el total del backend y solo cae a `calcularTotal` en modo local. |
| 7 | [`checkoutService.js`](../NUEVO-POS/apps/pos/src/services/checkoutService.js:137) | La suma de `pagos` se documenta como **espejo UX de RN-94** (valida los pagos del usuario contra el total del backend), NO como fuente del total. |
| 8 | [`guards.mjs`](../NUEVO-POS/scripts/guards.mjs:133) | Nuevo grep **E-09-FE**: detecta `reduce` sobre `unit_price`/`price` en `apps/pos/`. Honra el escape hatch `DT-02-FALLBACK-LOCAL`. |
| 9 | [`useCart.dt02_regla6.test.jsx`](../NUEVO-POS/apps/pos/src/hooks/useCart.dt02_regla6.test.jsx) | +8 tests de regresión (nuevo archivo). |

**El único fallback local permitido** (modo puramente local, sin API ni ticket)
se marca con el comentario `DT-02-FALLBACK-LOCAL`, que el guard E-09-FE tolera
explícitamente. Cualquier otra suma de líneas en el frontend **falla la puerta**.

### 10.5 Tests de regresión (nuevo archivo `useCart.dt02_regla6.test.jsx`)

1. Tras añadir una línea, el total es el del servidor (`99.99`, no el flotante).
2. Tras cambiar la cantidad, el total se refresca desde el backend.
3. Tras quitar una línea, el total se refresca desde el backend.
4. `hidratarLineas` adopta el total del backend (contrato 30).
5. Sin total de servidor, cae al fallback local redondeado.
6. Sin API ni ticket, el total es la suma local redondeada (`99.99`).
7. El guard declara E-09-FE y honra `DT-02-FALLBACK-LOCAL`.
8. Las dos únicas sumas de dinero del frontend están marcadas como fallback local.

### 10.6 Archivos tocados (5ª vuelta)

| Archivo | Cambio |
|---------|--------|
| [`useCart.js`](../NUEVO-POS/apps/pos/src/hooks/useCart.js) | `totalServidor` + `refrescarTotal`; `total` desde el backend; fallback local marcado. |
| [`RetailVisionPOS.jsx`](../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx) | Pasa `datos.total` a `hidratarLineas` y `total={carrito.total}` a `SalesReceipt`. |
| [`SalesReceipt.jsx`](../NUEVO-POS/apps/pos/src/components/SalesReceipt.jsx) | Prop `total`; usa el total del backend. |
| [`checkoutService.js`](../NUEVO-POS/apps/pos/src/services/checkoutService.js) | Documenta la suma de pagos como espejo UX de RN-94. |
| [`guards.mjs`](../NUEVO-POS/scripts/guards.mjs) | Nuevo grep E-09-FE + escape hatch `DT-02-FALLBACK-LOCAL`. |
| [`useCart.dt02_regla6.test.jsx`](../NUEVO-POS/apps/pos/src/hooks/useCart.dt02_regla6.test.jsx) | +8 tests de regresión (nuevo archivo). |
| [`FICHA_FIX_SUMA_NO_CUADRA_VUELTO.md`](../NUEVO-POS/docs/05-plan-de-construccion/FICHA_FIX_SUMA_NO_CUADRA_VUELTO.md) | Esta sección §10. |

### 10.7 Verificación (5ª vuelta)

| Suite | Antes | Después |
|-------|-------|---------|
| Frontend (`npm run test -- --run`) | 742 passed | **750 passed** (65 files) |
| Backend (`pytest -q`) | 320 passed | 320 passed (sin cambios) |
| Guard (`node scripts/guards.mjs`) | 7 greps | **8 greps** (E-09-FE) — verde |

Los 8 tests nuevos pasan; ningún test existente se rompió.

### 10.8 Lección de la 5ª vuelta

**Un parche de síntoma puede pasar todas las pruebas y seguir violando la
directiva.** La 4ª vuelta tenía 10 tests verdes y, aun así, el frontend seguía
sumando dinero. La causa raíz no era el redondeo: era la **dirección del dato**.
El total se **derivaba** en el cliente cuando debía **leerse** del servidor.

**Regla derivada:** cuando una directiva transversal dice "X no se hace en el
frontend", la prueba no es "¿el resultado coincide?" sino "¿de dónde viene el
dato?". Y si el guard no detecta la violación, **el guard tiene un punto ciego
que hay que cerrar** — un estándar que no se ejecuta es una opinión.

---

## 11. FIX Arquitectónico: Cobro Mixto y "suma_no_cuadra" (6ª Vuelta)

**Fecha:** 7 de octubre de 2026
**Commits:** `6eb38f1` y `7b0b6d4`

### 11.1 El Síntoma
El error `suma_no_cuadra` continuaba manifestándose **solamente en el flujo de pagos mixtos** cuando el cajero abonaba una cantidad inicial en efectivo (ej. $10) y luego intentaba cubrir el resto (ej. $37) pagando con tarjeta por un monto superior al saldo pendiente (ej. $1,000 para forzar un error, o simplemente por un error de tipeo en el que ingresaban $1,000 en vez del total restante). El frontend devolvía `suma_no_cuadra` y bloqueaba la operación.

### 11.2 La Causa Raíz
En la función `montoAplicado` de `CheckoutScreen.jsx`, la protección que acotaba el monto ingresado al **saldo pendiente** del ticket solo estaba habilitada para `EFECTIVO`. 
```javascript
// El código viejo hacía esto:
if (metodoReal !== 'EFECTIVO') return capturado; 
```
Si el cajero ingresaba $1000 en tarjeta, el abono se registraba íntegramente por $1000, lo que provocaba que la suma total de los abonos (1010) excediera el total del ticket (47), detonando la validación RN-94 del frontend antes de llegar al backend.

### 11.3 La Solución
1. **Acotamiento Universal:** Se eliminó la cláusula de escape. Ahora **todos los métodos de pago** acotan automáticamente el monto al saldo pendiente. Si el total pendiente es $37 y el cajero teclea $1000 en débito, el abono se registrará exactamente por $37.
2. **Corrección Visual de Cambio:** Al acotar el monto al pendiente, la función `resumenDePagos` de `checkoutService.js` (que calculaba el cambio restando la sumatoria de `monto` del total) comenzó a dar siempre `cambio = 0`, ya que el `monto` total nunca podía rebasar el total del ticket. Se modificó la función para que compute lo *entregado* utilizando el valor `recibido` si está presente.
3. **Desglose en Lista:** Se actualizó la UI del listado de abonos en `CheckoutScreen.jsx` para mostrar explícitamente cuando hay un excedente en efectivo:
   `Entregó $500.00 (Aplica: $47.00)`

### 11.4 Conclusión Final
Esta iteración erradica por completo la imposibilidad de tener discrepancias de sumatorias locales para la validación de frontera RN-94 sin romper la regla transversal de redondeos DT-02, a la vez que se provee visibilidad de la cantidad exacta de efectivo recibida, preservando intacta la capacidad del cajero para calcular vuelto en la terminal.

### 11.5 Archivos tocados (6ª vuelta)

| Archivo | Cambio |
|---------|--------|
| [`CheckoutScreen.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.jsx) | `montoAplicado` acota **todos** los métodos al pendiente (se elimina la rama `if (metodoReal !== 'EFECTIVO') return capturado`). |
| [`checkoutService.js`](../NUEVO-POS/apps/pos/src/services/checkoutService.js) | `resumenDePagos` calcula el cambio desde `recibido ?? monto` (no desde la suma de `monto`). |
| [`CheckoutScreen.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.jsx) | La lista de abonos muestra el desglose `Entregó … (Aplica: …)` cuando hay excedente en efectivo. |
| [`FICHA_FIX_SUMA_NO_CUADRA_VUELTO.md`](../NUEVO-POS/docs/05-plan-de-construccion/FICHA_FIX_SUMA_NO_CUADRA_VUELTO.md) | Esta sección §11. |

### 11.6 Verificación (6ª vuelta)

| Suite | Resultado |
|-------|-----------|
| Frontend (`npm run test -- --run`) | 750 passed (65 files) — sin regresiones |
| Backend (`docker exec nuevo_pos_api python -m pytest -q`) | 320 passed |
| Guard (`node scripts/guards.mjs`) | 8 greps — verde |

---

## 12. Saldo de Deuda: Consistencia ALTA/EDICIÓN (7ª Vuelta)

**Fecha:** 7 de octubre de 2026
**Origen:** Revisión de la 6ª vuelta. El fix acotó el **alta** (`montoAplicado`) de
forma universal, pero la **edición** (`manejarGuardarEdicion`) seguía con la lógica
vieja: solo acotaba `EFECTIVO` y dejaba `TARJETA`/`TRANSFERENCIA` con el monto
capturado tal cual. El bug quedaba reabierto por la puerta de la edición.

### 12.1 La Causa Raíz (deuda)
Duplicación de la lógica de acotamiento en dos funciones con criterios distintos:

```javascript
// montoAplicado (alta) — 6ª vuelta: universal
return Math.min(capturado, Math.max(0, pendiente));

// manejarGuardarEdicion (edición) — lógica vieja: solo EFECTIVO
const monto = metodoReal === 'EFECTIVO'
  ? Math.min(capturado, pendiente > 0 ? pendiente : capturado)
  : capturado;   // ← TARJETA/TRANSFERENCIA sin acotar
```

### 12.2 La Solución
1. **Helper único `acotarAlPendiente(capturado, pendiente)`** — una sola definición
   del criterio de acotamiento (`Math.min(capturado, Math.max(0, pendiente))`).
2. **`montoAplicado` y `manejarGuardarEdicion` usan el MISMO helper** — se elimina
   la rama por método. Alta y edición quedan consistentes por construcción.
3. **Tests de regresión** en `CheckoutScreen.f9_1_3.test.jsx` (§12): tarjeta por
   encima del pendiente se acota; editar tarjeta a un monto mayor también se acota;
   el cambio en mixto refleja solo lo entregado; la lista muestra el desglose.

### 12.3 Archivos tocados (7ª vuelta)

| Archivo | Cambio |
|---------|--------|
| [`CheckoutScreen.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.jsx) | Nuevo helper `acotarAlPendiente`; `montoAplicado` y `manejarGuardarEdicion` lo comparten (sin rama por método). |
| [`CheckoutScreen.f9_1_3.test.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.f9_1_3.test.jsx) | +4 tests de regresión (§12) del acotamiento universal y del cambio en mixto. |
| [`FICHA_FIX_SUMA_NO_CUADRA_VUELTO.md`](../NUEVO-POS/docs/05-plan-de-construccion/FICHA_FIX_SUMA_NO_CUADRA_VUELTO.md) | Esta sección §12. |

### 12.4 Verificación (7ª vuelta)

| Suite | Resultado |
|-------|-----------|
| Frontend (`npm run test -- --run`) | 754 passed (65 files) — +4 tests, sin regresiones |
| Backend (`docker exec nuevo_pos_api python -m pytest -q`) | 320 passed (sin cambios) |
| Guard (`node scripts/guards.mjs`) | 8 greps — verde |

### 12.5 Lección de la 7ª vuelta

**Un fix correcto en un punto de entrada no cierra el bug si hay otro punto de
entrada con la misma lógica duplicada.** La 6ª vuelta acotó el alta pero dejó la
edición con el criterio viejo. La deuda no era el síntoma (que ya no se reproducía
por el alta) sino la **duplicación**: dos copias del mismo criterio que pueden
divergir. La solución no fue parchear la edición, sino **extraer el criterio a un
único helper** para que no puedan divergir. Regla derivada: cuando dos rutas
comparten una regla de negocio, la regla vive en **un solo lugar**.
