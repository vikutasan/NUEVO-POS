# FICHA FIX — Cobro parcial: teclado que desaparece y "Agregar pago" no descubrible

> **Tipo:** Corrección de defectos de UX reportados en vivo (caja real)
> **Fase afectada:** 9.1.3 — UI de pagos mixtos (`CheckoutScreen`)
> **Estado:** ✅ CERRADA — suite completa 714/714 en verde
> **Fecha:** 2026-10-07
> **Origen:** Reporte del dueño operando la caja real

---

## 1. El reporte (verbatim)

> "por fin estoy en la caja intentando cobrar una cuenta y me topo con cosas no
> deseables, no está un botón para abonar digamos un pago parcial en efectivo,
> luego otro pago parcial en tarjeta me desaparece el teclado numérico, revisa
> esta suite"

Dos defectos concretos, ambos en la superficie de cobro:

| # | Defecto | Síntoma en vivo |
|---|---|---|
| **D1** | No hay botón descubrible para abonar un pago parcial en efectivo | El cajero no encuentra cómo registrar un abono; el botón "Agregar pago" estaba enterrado al fondo de la sección "Abonos del ticket", debajo de la lista, y el input "Monto del abono" era un campo **separado** del "Efectivo recibido" |
| **D2** | Al elegir Tarjeta, el teclado numérico desaparece | El `TecladoNumerico` estaba **dentro** del bloque `{esEfectivo ? ... : null}`, así que al cambiar el método a Tarjeta/Transferencia el teclado se desmontaba |

---

## 2. Diagnóstico (causa raíz)

### 2.1 D2 — el teclado estaba condicionado al método

En `CheckoutScreen.jsx` (antes del fix), el teclado vivía dentro del bloque
condicional del efectivo:

```jsx
{esEfectivo ? (
  <div>
    {/* input "Efectivo recibido" */}
    {/* billetes rápidos */}
    <TecladoNumerico valor={recibido} onCambiar={setRecibido} />   {/* ← aquí */}
  </div>
) : null}
```

Al pulsar "Tarjeta", `esEfectivo` pasaba a `false` y **todo el bloque** —incluido
el teclado— se desmontaba. El cajero quedaba sin forma de capturar el monto del
abono con tarjeta.

### 2.2 D1 — la captura estaba fragmentada y el botón enterrado

Había **dos** estados de captura (`recibido` para efectivo y `montoAbono` para
el abono genérico) y **dos** inputs distintos. El botón "Agregar pago" estaba al
final de la sección de abonos, después de la lista, fuera del flujo natural de
captura. El resultado: el camino "abonar un pago parcial" no era descubrible.

### 2.3 La referencia correcta (el viejo POS)

El viejo POS (`../ERP-R-DE-RICO/apps/pos/components/CheckoutScreen.jsx`) ya
resolvía esto bien: **un solo** estado `receivedAmount`, **un solo** teclado
(`handleNumberClick`), **un solo** `handleAddPayment` que usa
`paymentMethod` + `receivedAmount`. Los botones de método solo cambian la
etiqueta; **el teclado nunca se condiciona al método**. La implementación se
reescribe, pero la UX se hereda (principio 6.8 del Plan Maestro).

---

## 3. La corrección

Se reescribió `CheckoutScreen.jsx` con el **modelo de captura unificada**:

### 3.1 Un solo estado de captura

```javascript
const [metodo, setMetodo] = useState('EFECTIVO');
// Captura ÚNICA del monto a abonar: el teclado y el input nativo escriben aquí,
// sin importar el método.
const [montoAbono, setMontoAbono] = useState('');
```

Se eliminó el estado `recibido`. Ya no hay dos campos compitiendo.

### 3.2 El input de captura SIEMPRE visible (etiqueta dinámica)

```jsx
<label className="flex flex-col gap-2">
  <span className="text-sm text-crema-ticket/70">
    {esEfectivo ? 'Efectivo recibido' : 'Monto a cobrar'}
  </span>
  <input
    type="number" inputMode="decimal" min="0" step="0.50"
    value={montoAbono}
    onChange={(e) => setMontoAbono(e.target.value)}
    ...
  />
</label>
```

La etiqueta cambia con el método, pero el campo es **el mismo**.

### 3.3 El teclado SIEMPRE visible (fuera del condicional)

```jsx
<TecladoNumerico valor={montoAbono} onCambiar={setMontoAbono} deshabilitado={procesando} />
```

Ya no está dentro de `{esEfectivo ? ... : null}`. Con Tarjeta o Transferencia el
teclado sigue montado y captura el monto del abono.

### 3.4 El botón "Agregar pago" es la acción primaria, siempre disponible

```jsx
<button
  type="button"
  onClick={manejarAgregarPago}
  disabled={procesando || montoCapturado <= 0}
  className="flex-1 min-h-tactil px-4 rounded-canon35 bg-acento text-fondo-profundo font-bold ..."
>
  + Agregar pago ({esEfectivo ? 'Efectivo' : etiquetaMetodo(metodoCanonico(metodo))})
</button>
```

Es prominente (color de acento), está junto a la captura (no enterrado bajo la
lista) y su etiqueta declara el método activo. Se deshabilita solo cuando no hay
monto capturado.

### 3.5 El botón de edición se renombró a "Guardar abono"

Para que no se confunda con el "Guardar" del cobro final.

---

## 4. Tabla de cambios

| Archivo | Cambio |
|---|---|
| `apps/pos/src/components/CheckoutScreen.jsx` | Reescrito: un solo `montoAbono`, input siempre visible con etiqueta dinámica, teclado siempre montado, "Agregar pago" primario y siempre disponible, "Guardar abono" |
| `apps/pos/src/components/CheckoutScreen.f9_1_3.test.jsx` | Helpers actualizados (`inputMonto` agnóstico al método, `botonAgregarPago`); nueva sección 7 con 5 pruebas de regresión de D1/D2 |

---

## 5. Pruebas de regresión (sección 7 de la puerta F9.1.3)

Se añadieron 5 pruebas que **fallarían** con el código anterior:

| Prueba | Defecto que blinda |
|---|---|
| El botón "Agregar pago" está visible y habilitado con monto capturado | D1 |
| Abono parcial en efectivo (40 de 100) registra y muestra faltante 60 | D1 |
| El teclado numérico sigue visible al elegir Tarjeta | D2 |
| Se puede capturar el monto de tarjeta con el teclado | D2 |
| Pago mixto (efectivo 40 + tarjeta 60) cuadra a cero | D1 + D2 |

El helper `inputMonto()` se hizo **agnóstico al método** para que las pruebas
funcionen con ambas etiquetas:

```javascript
function inputMonto() {
  return (
    screen.queryByLabelText('Efectivo recibido') ||
    screen.getByLabelText('Monto a cobrar')
  );
}
```

---

## 6. Verificación

```
npx vitest run src/components/CheckoutScreen.f9_1_3.test.jsx \
               src/components/TecladoNumerico.f9_0_2.test.jsx \
               src/components/components.f3_4.test.jsx
→ 3 archivos, 60 pruebas, todas en verde

npx vitest run   (suite completa del frontend)
→ 64 archivos, 714 pruebas, todas en verde
```

Verificación en vivo: el servidor Vite (puerto 5100) recargó en caliente
(`hmr update /src/components/CheckoutScreen.jsx`).

---

## 7. Lección

**La UX heredada del viejo POS se hereda; la implementación se reescribe.** El
viejo POS ya tenía el modelo correcto (una captura, un teclado, un botón de
agregar). Al reescribir la superficie se fragmentó la captura en dos estados y
se condicionó el teclado al método, introduciendo dos defectos que el viejo POS
no tenía. La corrección **restaura el modelo del viejo POS** dentro de la
arquitectura nueva (hook `useCheckout` + `TecladoNumerico` puro).

Regla derivada: **el teclado de captura nunca se condiciona al método de pago**;
el método solo cambia la etiqueta y el método canónico del abono.
