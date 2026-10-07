# FICHA FIX — "Confirmar pago" no hace nada (botón muerto sin explicación)

> **Tipo:** Corrección de defecto de UX reportado en vivo (caja real)
> **Fase afectada:** 9.1.3 — UI de pagos mixtos (`CheckoutScreen`) + F4.5.3 — guarda de cobro (`RetailVisionPOS`)
> **Estado:** ✅ CERRADA — suite completa 718/718 en verde
> **Fecha:** 2026-10-07
> **Origen:** Reporte del dueño operando la caja real

---

## 1. El reporte (verbatim)

> "ya aboné lo necesario, le doy en confirmar pago y no sucede nada"

El síntoma es un **no-op silencioso**: el cajero captura los abonos, pulsa
"CONFIRMAR PAGO" y **no pasa absolutamente nada** — ni banner de error, ni
estado de "Procesando…", ni cierre del diálogo. La app parece congelada.

---

## 2. Diagnóstico (causa raíz)

### 2.1 El botón estaba deshabilitado, pero el motivo vivía lejos

En `CheckoutScreen.jsx` el botón se deshabilita así:

```jsx
<button
  type="button"
  disabled={!puedeCobrar || procesando}
  onClick={manejarConfirmar}
>
  {procesando ? 'Procesando…' : 'CONFIRMAR PAGO'}
</button>
```

Y `puedeCobrar` se calcula así:

```javascript
const puedeCobrar = hayAbonos ? cuadra : !esEfectivo || montoCapturado >= minimo;
```

Cuando el cajero tiene abonos que **no suman exactamente el total**
(`resumen.faltante > 0`), `cuadra` es `false`, por lo tanto `puedeCobrar` es
`false` y **el botón queda deshabilitado**. Un botón deshabilitado **no dispara
`onClick`**: pulsarlo no hace nada. Ese es el no-op.

El agravante: el mensaje que explicaba el faltante (`mensajeValidacion`,
"Faltan $60.00 para cubrir el mínimo ($100.00).") se renderizaba **solo en la
columna izquierda**, bajo la lista de abonos. El botón está en la **columna
derecha**. El cajero mira el botón, lo pulsa, y no ve —en su campo visual— la
razón por la que está muerto.

### 2.2 Un segundo camino silencioso: el turno de caja obsoleto

En `RetailVisionPOS.jsx`, `confirmarCobro` tiene una guarda `!turnoCaja`:

```javascript
if (!turnoCaja) {
  setCheckoutAbierto(false);
  setAvisoCaja(true);
  return;
}
```

El estado `turnoCaja` se carga **una sola vez al montar** y solo se refresca al
cerrar el gestor de caja. Si el operador abrió la caja por otra vía (o el estado
quedó obsoleto), un `null` viejo **rebotaba el cobro en silencio**: cerraba el
checkout y encendía el aviso, pero el cajero podía no relacionarlo con su clic.

---

## 3. La corrección

### 3.1 El motivo del bloqueo se muestra JUNTO al botón (columna derecha)

Se añadió un `useMemo` `motivoBloqueo` que traduce el estado a una frase
accionable, y se renderiza en un bloque `role="status"` **inmediatamente encima**
del botón CONFIRMAR PAGO:

```javascript
const motivoBloqueo = useMemo(() => {
  if (procesando) return null;
  if (hayAbonos) {
    if (resumen.faltante > 0) {
      return `Faltan ${formatearPrecio(resumen.faltante)} para poder cobrar.`;
    }
    return null;
  }
  if (esEfectivo && montoCapturado < minimo) {
    return `Faltan ${formatearPrecio(minimo - montoCapturado)} para poder cobrar.`;
  }
  return null;
}, [procesando, hayAbonos, resumen.faltante, esEfectivo, montoCapturado, minimo]);
```

```jsx
{motivoBloqueo ? (
  <p
    role="status"
    className="rounded-canon35 bg-peligro/20 text-peligro px-4 py-3 text-sm font-semibold text-center"
  >
    {motivoBloqueo}
  </p>
) : null}
```

Ahora, cuando el botón está deshabilitado, **la razón está en el mismo lugar
donde se hace clic**. El botón deja de ser "muerto": es un botón bloqueado con
causa visible.

### 3.2 La guarda `!turnoCaja` relee el turno antes de avisar

Antes de rendirse, `confirmarCobro` **relee el turno real del servidor**. Solo si
de verdad no hay turno se avisa:

```javascript
let turnoVigente = turnoCaja;
if (!turnoVigente) {
  const r = await caja.obtenerTurnoActivo(terminalEfectiva);
  if (r.outcome === 'ok' && r.data && r.data.cash_session_id) {
    turnoVigente = r.data;
    setTurnoCaja(r.data);
  }
}
if (!turnoVigente) {
  setCheckoutAbierto(false);
  setAvisoCaja(true);
  return;
}
```

Un `null` obsoleto ya no rebota el cobro: si la caja está abierta de verdad, el
cobro procede.

---

## 4. Tabla de cambios

| Archivo | Cambio |
|---|---|
| `apps/pos/src/components/CheckoutScreen.jsx` | Nuevo `useMemo` `motivoBloqueo`; bloque `role="status"` con el faltante renderizado encima del botón CONFIRMAR PAGO |
| `apps/pos/src/RetailVisionPOS.jsx` | Guarda `!turnoCaja` endurecida: relee el turno activo (`caja.obtenerTurnoActivo`) antes de mostrar el aviso |
| `apps/pos/src/components/CheckoutScreen.f9_1_3.test.jsx` | Nueva sección 8 con 4 pruebas de regresión |
| `apps/pos/src/components/components.f3_4.test.jsx` | Prueba del faltante hecha específica (el texto ahora aparece 2 veces) |

---

## 5. Pruebas de regresión (sección 8 de la puerta F9.1.3)

Se añadieron 4 pruebas que **fallarían** con el código anterior:

| Prueba | Defecto que blinda |
|---|---|
| Con abonos que NO cuadran, muestra el faltante junto al botón y lo deshabilita | El no-op silencioso |
| Al cuadrar el total, el aviso desaparece y el botón se habilita | El no-op silencioso |
| En efectivo sin abonos y con recibido insuficiente, explica el faltante junto al botón | El no-op silencioso |
| Mientras procesa, no muestra motivo de bloqueo (el botón dice "Procesando…") | Estado de procesamiento |

### 5.1 Ajuste de la prueba heredada de F3.4

La prueba `F3.4: muestra el faltante cuando el efectivo es insuficiente` usaba
`screen.getByText(/Faltan/)`. Con el nuevo bloque, ese patrón ahora coincide con
**dos** nodos (el `mensajeValidacion` de la izquierda y el `motivoBloqueo` de la
derecha), lo que rompía la consulta. Se hizo **específica** al texto completo del
mensaje de validación:

```javascript
expect(
  screen.getByText('Faltan $60.00 para cubrir el mínimo ($100.00).'),
).toBeTruthy();
```

---

## 6. Verificación

```
npx vitest run src/components/CheckoutScreen.f9_1_3.test.jsx
→ 1 archivo, 19 pruebas, todas en verde

npx vitest run   (suite completa del frontend)
→ 64 archivos, 718 pruebas, todas en verde
```

Verificación en vivo: el servidor Vite (puerto 5100) recargó en caliente
(`hmr update /src/components/CheckoutScreen.jsx`).

---

## 7. Lección

**Un botón deshabilitado sin causa visible es un botón muerto.** El cajero no
distingue "la app no responde" de "me falta capturar algo": ambas se sienten
igual (no pasa nada). La regla derivada:

> **Todo control deshabilitado debe mostrar, en su vecindad inmediata, la razón
> por la que está deshabilitado.**

El mensaje de validación existía, pero estaba en **otra columna**. La
información correcta en el lugar equivocado equivale a no tenerla. Este defecto
es hermano del de la ficha anterior (`FICHA_FIX_COBRO_PARCIAL_TECLADO`): ambos
nacen de **fragmentar la superficie de cobro** — allí la captura, aquí la
explicación.
