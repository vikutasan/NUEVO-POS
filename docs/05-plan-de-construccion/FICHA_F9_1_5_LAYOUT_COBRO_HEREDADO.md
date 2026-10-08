# FICHA — FASE 9.1.5 (Layout de Cobro Heredado del Viejo POS)

> **Fase:** 9.1.5 — Corrección de cableado: el layout del cobro heredado del viejo POS
> **Origen:** `REQUERIMIENTOS_UX_PENDIENTES_OCT7.md` §1 (ergonomía del teclado de pagos)
> **Sub-pasos:** F9.1.5.0, F9.1.5.1, F9.1.5.2
> **Estado:** PROPUESTA — pendiente de aprobación del dueño
> **Fecha:** 2026-10-08

---

## 1. Qué es esta micro-fase (y qué NO es)

La F9.1.5 **no construye lógica de dinero nueva**. Es una **corrección de
cableado de la interfaz**: la F9.1.3 dejó el cobro funcional (pagos mixtos,
acotamiento al pendiente, RN-94 en verde), pero con una **gramática de
interacción que contradice la del viejo POS**.

El dueño lo pidió con estas palabras:

> *"en cuanto a la ergonomía del teclado de pagos, ya se comprobó que el lugar
> adecuado es en la parte derecha del teclado numérico y en grande. Por otro
> lado prefiero la lógica del viejo POS de ir cargando directamente cada pago a
> la pantalla derecha y desaparecer el resumen que va apareciendo en la parte de
> abajo."*

Y remató:

> *"quiero que esta parte quede lo más parecido posible al del viejo POS."*

**El principio rector (UX heredada) — el mismo de la F7.6:**

> Cuando un componente ya existe en el viejo POS, su **INTEGRACIÓN** se hereda;
> solo su **IMPLEMENTACIÓN** se reescribe. El viejo POS es la fuente de verdad
> para la integración; el nuevo POS lo es para la implementación.

**Lo que esta fase NO toca:**

- La lógica de dinero (`useCheckout`, `checkoutService`, `acotarAlPendiente`,
  `montoAplicado`, `manejarGuardarEdicion`). El acotamiento al pendiente y el
  redondeo a 2 decimales (DT-02) se conservan **intactos**.
- El contrato del payload (`{abonos}` / pago único con `monto` explícito).
- El backend. Cero cambios de API.
- Los métodos válidos (`EFECTIVO`, `CREDITO`, `DEBITO`, `TRANSFERENCIA`).

---

## 2. El hallazgo (evidencia del viejo POS vs. el nuevo)

Se leyó el viejo POS directamente (no la ficha) para confirmar la gramática:

| Aspecto | Viejo POS (fuente de verdad) | Nuevo POS hoy (F9.1.3) | F9.1.5 (corregido) |
|---|---|---|---|
| **Disposición** | Modal de 2 paneles: izquierda = captura, derecha = pagos | 2 columnas, pero la lista de abonos vive en la IZQUIERDA | Izquierda = captura; derecha = pagos |
| **Botón "Abonar Pago"** | A la **derecha del teclado**, grande (`w-24`, ícono ➕ + 2 líneas) | Botón full-width **debajo** de la lista de abonos | A la derecha del teclado, grande |
| **Carga del pago** | Cada pago **aparece en el panel derecho** al abonar | El abono se agrega a una lista en la izquierda | Cada pago aparece en el panel derecho |
| **Resumen duplicado** | **No existe** un resumen abajo; el panel derecho ES el resumen | Lista de abonos (izq.) + resumen (der.) = **duplicado** | Se elimina el resumen de abajo; el panel derecho es el único resumen |
| **Sub-métodos de tarjeta** | `DEBITO` / `CREDITO` / `QR` | "Tarjeta" se canoniza a `DEBITO` (sin sub-botones) | `DEBITO` / `CREDITO` (**sin QR**) |
| **QR** | Existe como sub-botón | **Nunca existió** | **NO se porta** (criterio negativo) |
| **Transferencia** | No existe | **Ya existe** como método de primer nivel | Se conserva (confirmación) |

**Evidencia leída del viejo POS** (`apps/pos/components/CheckoutScreen.jsx`):

- Línea 146: `<div className="w-1/2 p-10 border-r border-white/5 space-y-6">` — panel izquierdo de captura.
- Líneas 160-175: selector de método Efectivo / Tarjeta.
- Líneas 177-189: sub-botones `['DEBITO', 'CREDITO', 'QR']` (solo si `paymentMethod === 'TARJETA'`).
- Líneas 198-224: teclado numérico + botón **"➕ Abonar Pago"** (`w-24`) a su derecha.
- Línea 229: `<div className="w-1/2 p-10 bg-black/10 flex flex-col">` — panel derecho "Resumen de Pagos".
- Líneas 236-239: cada pago se apila en el panel derecho con animación `slide-in-from-right`.

**Evidencia leída del nuevo POS** (`apps/pos/src/components/CheckoutScreen.jsx`):

- Línea 79-83: `METODOS_PAGO = [EFECTIVO, TARJETA, TRANSFERENCIA]` (sin QR).
- Líneas 411-461: la lista "Abonos del ticket" vive en la **columna izquierda**.
- Líneas 485-492: el botón "+ Agregar pago" es full-width **debajo** de la lista.
- Líneas 502-509+: la columna derecha muestra total + resumen (duplicado).

---

## 3. Los 3 sub-pasos

### F9.1.5.0 — Desdoblar "Tarjeta" en Débito y Crédito (sin QR)

**Archivo:** `apps/pos/src/components/CheckoutScreen.jsx`

Hoy `METODOS_PAGO` tiene un solo botón "Tarjeta" que se canoniza a `DEBITO`
(`metodoCanonico`, línea 163-166). Se reemplaza por **dos botones de primer
nivel**: "Débito" (`DEBITO`) y "Crédito" (`CREDITO`), más Efectivo y
Transferencia. **No se agrega QR.**

```jsx
const METODOS_PAGO = [
  { id: 'EFECTIVO',      etiqueta: 'Efectivo',      icono: '💵' },
  { id: 'DEBITO',        etiqueta: 'Débito',        icono: '💳' },
  { id: 'CREDITO',       etiqueta: 'Crédito',       icono: '💳' },
  { id: 'TRANSFERENCIA', etiqueta: 'Transferencia', icono: '🏦' },
];
```

- `metodoCanonico` deja de mapear `TARJETA → DEBITO` (ya no existe el id
  `TARJETA` en la UI); sigue validando contra `METODOS_VALIDOS`.
- `manejarEditar` (línea 233) ya no necesita el mapeo `DEBITO/CREDITO → TARJETA`;
  carga el método tal cual.
- `etiquetaMetodo` (línea 89-95) se simplifica: los 4 métodos están en
  `METODOS_PAGO`, así que las ramas `DEBITO`/`CREDITO` de respaldo quedan
  inalcanzables (se pueden conservar por robustez o retirar).

**Compatibilidad:** el backend ya acepta `DEBITO` y `CREDITO` como métodos de
primera clase (`METODOS_VALIDOS`, `checkoutService.js` línea 35-40). Cero
cambios de contrato.

### F9.1.5.1 — Mover el botón "+ Agregar pago" a la derecha del teclado (grande)

**Archivo:** `apps/pos/src/components/CheckoutScreen.jsx`

Se reordena el bloque de captura para que el teclado y el botón de abono
compartan una fila, con el botón **a la derecha y grande**, como el viejo POS.

**DECISIÓN DEL DUEÑO (8 Oct 2026):** el botón **conserva su texto actual
`"+ Agregar pago"`**; solo cambia de POSICIÓN (a la derecha del teclado) y de
TAMAÑO (grande). NO se renombra a "Abonar Pago". Esto evita tocar el helper
`botonAgregarPago()` de los tests existentes.

```jsx
{/* Teclado + "+ Agregar pago" (a la derecha, grande) */}
<div className="flex gap-3">
  <div className="flex-grow">
    <TecladoNumerico valor={montoAbono} onCambiar={setMontoAbono} deshabilitado={procesando} />
  </div>
  <button
    type="button"
    onClick={manejarAgregarPago}
    disabled={procesando || montoCapturado <= 0}
    className="w-24 min-h-tactil rounded-canon35 bg-acento text-fondo-profundo font-bold
               flex flex-col items-center justify-center gap-1
               disabled:opacity-40 disabled:cursor-not-allowed"
  >
    <span aria-hidden="true" className="text-2xl">➕</span>
    <span className="text-xs uppercase leading-none">Agregar</span>
    <span className="text-xs uppercase leading-none">pago</span>
  </button>
</div>
```

- El texto accesible sigue conteniendo "Agregar pago", así que el helper
  `botonAgregarPago()` (`getByRole('button', { name: /Agregar pago/ })`) sigue
  funcionando sin cambios.
- El estado de edición (`editandoId`) mantiene sus botones "Guardar abono" /
  "Cancelar" en el mismo lugar donde estaba el de agregar.

### F9.1.5.2 — Cargar cada pago al panel derecho y eliminar el resumen de abajo

**Archivo:** `apps/pos/src/components/CheckoutScreen.jsx`

- La **lista de abonos** (líneas 411-461) se **mueve** de la columna izquierda a
  la **columna derecha**, encima del resumen de totales. Cada abono se apila
  como una tarjeta (método, monto, recibido/cambio, Editar, Borrar).
- Se **elimina** el bloque "Abonos del ticket" de la izquierda (queda solo la
  captura: método + monto + teclado + Abonar Pago).
- El **resumen de totales** (total, abonado, faltante, cambio) se conserva en la
  columna derecha, **debajo** de la lista de pagos — es el único resumen.
- El mensaje de bloqueo (`motivoBloqueo`) y el botón "Confirmar cobro" siguen
  junto al resumen, en la derecha.

**Resultado:** izquierda = captura; derecha = pagos + totales + confirmar. Es la
gramática del viejo POS, sin el resumen duplicado de abajo.

---

## 4. El contrato del dinero se conserva (intacto)

La corrección de layout **no toca la lógica de dinero**. Se conservan sin
cambios:

- `acotarAlPendiente(capturado, pendiente)` (línea 184) — acotamiento universal.
- `montoAplicado` (línea 206) y `manejarGuardarEdicion` (línea 246) — mismo
  criterio en alta y edición.
- `redondear2` (línea 62) — todo monto que cruza la frontera se redondea (DT-02).
- El payload: con abonos `{abonos}`; sin abonos, pago único con `monto`
  explícito (línea 292-321).

El único cambio de datos es que `TARJETA` desaparece como id de UI y se envían
`DEBITO`/`CREDITO` directamente — que el backend ya acepta.

---

## 5. El gate de integración — 11 criterios

Archivo: `apps/pos/src/components/CheckoutScreen.f9_1_5.test.jsx` (monta el
componente REAL con `useCheckout`).

| # | Criterio | Verificación |
|---|---|---|
| 1 | Existen 4 métodos: Efectivo, Débito, Crédito, Transferencia | `getByText` de los 4 |
| 2 | **NO existe** un botón QR | `queryByText('QR')` es `null` |
| 3 | Elegir "Débito" envía `metodo: 'DEBITO'` al confirmar | payload del `onConfirmar` |
| 4 | Elegir "Crédito" envía `metodo: 'CREDITO'` al confirmar | payload del `onConfirmar` |
| 5 | Transferencia sigue disponible y envía `TRANSFERENCIA` | payload del `onConfirmar` |
| 6 | El botón "Abonar Pago" está a la derecha del teclado | orden en el DOM / contenedor flex |
| 7 | El botón "Abonar Pago" es grande (target táctil ≥ 44px) | clase `min-h-tactil` / `w-24` |
| 8 | Al abonar, el pago aparece en el panel DERECHO | el abono se renderiza en la columna derecha |
| 9 | NO hay resumen duplicado de abonos en la izquierda | la izquierda no contiene la lista de abonos |
| 10 | El resumen de totales (abonado/faltante/cambio) vive en la derecha | `getByText` en la columna derecha |
| 11 | La lógica de dinero se conserva (acotamiento + redondeo) | regresión: abono > pendiente se acota; total con coma flotante se redondea |

**Regresión obligatoria:** los 39 tests de `CheckoutScreen.f9_1_3.test.jsx`
deben seguir en verde (o actualizarse SOLO en los selectores de UI que cambian
de nombre/posición, nunca en las aserciones de dinero).

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Romper los 39 tests de F9.1.3 por cambio de selectores | Actualizar solo selectores de UI; las aserciones de dinero no se tocan |
| El botón "Abonar Pago" cambia de nombre accesible | Ajustar el helper `botonAgregarPago()` a `/Abonar Pago/` |
| Perder el acotamiento al pendiente al reordenar | El gate criterio 11 lo blinda con regresión explícita |
| `TARJETA` como id residual en algún test | Buscar y actualizar referencias a `TARJETA` en tests de UI |
| El guard `E-09-FE` (sumas de dinero en frontend) | No se introduce ninguna suma nueva; el resumen sigue usando `resumenDePagos` |

---

## 7. Trazabilidad

- **Origen:** `REQUERIMIENTOS_UX_PENDIENTES_OCT7.md` §1.
- **Fuente de verdad de integración:** `apps/pos/components/CheckoutScreen.jsx`
  (viejo POS), líneas 144-239.
- **Archivo a modificar:** `apps/pos/src/components/CheckoutScreen.jsx`.
- **Tests:** `apps/pos/src/components/CheckoutScreen.f9_1_5.test.jsx` (nuevo) +
  `CheckoutScreen.f9_1_3.test.jsx` (regresión).
- **Directivas:** DT-02 (dinero), RN-94 (suma de pagos cuadra el total).
- **Patrón:** F7.6 (UX heredada).

---

## 8. Resumen ejecutivo

La F9.1.5 alinea el layout del cobro con el viejo POS: **captura a la
izquierda, pagos a la derecha**, el botón **"Abonar Pago" grande a la derecha
del teclado**, y **sin resumen duplicado abajo**. Además desdobla "Tarjeta" en
**Débito y Crédito** (sin QR, que nunca existió en el nuevo POS) y confirma
**Transferencia** como método de primer nivel. Cero cambios de backend, cero
cambios en la lógica de dinero.

---

## 9. Por qué es el paso natural

El cobro ya funciona y cuadra (F9.1.3 + las 7 vueltas del fix
`suma_no_cuadra`). Lo que falta es que **se sienta como el viejo POS**, que es
donde el cajero ya tiene el músculo entrenado. Esta micro-fase cierra esa
brecha sin tocar una sola línea de la lógica de dinero — exactamente el mismo
movimiento que la F7.6 hizo para visión/voz/tema.
