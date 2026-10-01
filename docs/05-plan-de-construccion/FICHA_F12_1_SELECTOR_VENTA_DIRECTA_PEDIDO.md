# FICHA F12.1 — Selector VENTA DIRECTA / PEDIDO (UX heredada del viejo POS)

> **Fase:** 12 — Portar funcionalidades puntuales del POS viejo (una por una).
> **Sub-fase:** 12.1 — El selector VENTA DIRECTA / PEDIDO que gobierna el botón 📌.
> **Estado:** ✅ CERRADA.
> **Regla rectora:** §6.8 — *la INTEGRACIÓN se hereda; solo la IMPLEMENTACIÓN se reescribe.*
> **Lección aplicada:** §10.6.5 — *el inventario de componentes no ve la PARIDAD DE OPERACIÓN.*

---

## 1. QUÉ SE PORTÓ (la funcionalidad exacta)

En el **viejo POS** (`apps/pos/components/POSHeader.jsx:95-134`) existe un **selector
VENTA DIRECTA / PEDIDO** que **GOBIERNA la aparición** del botón "Programación del
Pedido" (📌). El botón **SOLO existe** cuando `orderType === 'PEDIDO'`:

```jsx
// viejo POS — apps/pos/components/POSHeader.jsx
<button onClick={() => { onOrderTypeChange('VENTA_DIRECTA'); onOrderDataClear(); }}>
  Venta Directa
</button>
<button onClick={() => onOrderTypeChange('PEDIDO')}>
  📦 Pedido
</button>
...
{orderType === 'PEDIDO' && (
  <button id="btn-programacion-pedido" onClick={onOpenProgramacion}>
    📌 Programar pedido
  </button>
)}
```

El usuario lo describió así:

> *"EL SELECTOR VENTA DIRECTA /PEDIDO QUE AL ESTAR PUESTO EN PEDIDO HABILITA O HACE
> APARECER EL BOTON PROGRAMAR PEDIDO"*

---

## 2. EL DIAGNÓSTICO — por qué era una OMISIÓN (§10.6.5)

En el **nuevo POS**, el botón 📌 (`btn-programacion-pedido`) **YA existía** y su modal
(`OrderProgrammingModal.jsx`, 407 líneas) **ya estaba cableado** y probado por la
compuerta F7.5a. Pero el **SELECTOR que lo revela estaba OMITIDO**.

Esto es **exactamente** la clase de falla de §10.6.5:

> *"El componente existe y pasa su test" ≠ "el usuario puede llegar a él".*

El inventario de componentes veía el botón; **no veía la OPERACIÓN que lo revela**.
Sin el selector, el botón 📌 quedaba **siempre visible** — lo cual, además, era
**infiel** al viejo POS (donde solo aparece en modo PEDIDO).

**Clasificación de paridad (F10):** `OMITIDA`.

---

## 3. LA ADAPTACIÓN (implementación reescrita, integración heredada)

### 3.1 `POSHeader.jsx` (nuevo POS) — el selector en el CENTRO

Se añadieron tres props y el selector en la **zona CENTRO** (fiel al viejo POS):

```jsx
// props nuevas
tipoPedido = 'VENTA_DIRECTA',
onCambiarTipoPedido,
onLimpiarPedido,

// selector (zona CENTRO)
<div className="flex bg-fondo-profundo border border-white/10 rounded-2xl p-1 gap-1">
  <button type="button" id="btn-venta-directa"
    onClick={() => { onCambiarTipoPedido?.('VENTA_DIRECTA'); onLimpiarPedido?.(); }}
    aria-pressed={tipoPedido === 'VENTA_DIRECTA'}>
    Venta Directa
  </button>
  <button type="button" id="btn-pedido"
    onClick={() => onCambiarTipoPedido?.('PEDIDO')}
    aria-pressed={tipoPedido === 'PEDIDO'}>
    📦 Pedido
  </button>
</div>

// botón 📌 condicionado
{tipoPedido === 'PEDIDO' ? (
  <button id="btn-programacion-pedido" onClick={() => onAbrirPedido?.()}>
    📌 Programar pedido
  </button>
) : null}
```

**Fidelidad al viejo POS:**
- Los `id` heredados (`btn-venta-directa`, `btn-pedido`, `btn-programacion-pedido`) se conservan.
- Al volver a VENTA DIRECTA se limpia el bloque de pedido (`onLimpiarPedido`), equivalente
  a `onOrderDataClear()` del viejo POS.
- El selector vive en el **CENTRO**, como en el viejo POS.

### 3.2 `RetailVisionPOS.jsx` (nuevo POS) — el estado y el cableado

```jsx
// estado nuevo
const [tipoPedido, setTipoPedido] = useState('VENTA_DIRECTA');

// cableado al header
<POSHeader
  ...
  tipoPedido={tipoPedido}
  onCambiarTipoPedido={setTipoPedido}
  onLimpiarPedido={() => setBloquePedido(null)}
/>
```

---

## 4. LA COMPUERTA (F12.1 — Probar)

**Archivo nuevo:** `apps/pos/src/components/POSHeader.f12_1.test.jsx` — **13 tests**.

Fija las **4 invariantes** de la operación heredada:

| # | Invariante | Tests |
|---|-----------|-------|
| 1 | El selector existe con sus dos botones y los `id` heredados | 3 |
| 2 | Por defecto es VENTA_DIRECTA y el botón 📌 NO se muestra | 4 |
| 3 | Al pulsar PEDIDO, el botón 📌 APARECE y se notifica el cambio | 2 |
| 4 | Al volver a VENTA DIRECTA se notifica Y se limpia el bloque | 2 |
| — | Badge "📦 Pedido tentativo" | 2 |

### 4.1 Reparación de la compuerta F7.5a (regresión esperada)

La compuerta **F7.5a** (`RetailVisionPOS.f7_5a.test.jsx`, 11 tests) asumía que el botón 📌
estaba **siempre visible**. Con F12.1 eso deja de ser cierto — **es la consecuencia
correcta** de heredar la operación.

**Reparación fiel:** el helper `botonProgramarPedido()` ahora **primero activa el modo
PEDIDO** (idempotente) y luego devuelve el botón:

```jsx
function botonProgramarPedido() {
  fireEvent.click(screen.getByRole('button', { name: /📦 Pedido/i }));
  return screen.getByRole('button', { name: /Programar pedido/i });
}
```

Esto **preserva la intención** de los 11 tests (el puente POS → Pedidos sigue cableado
end-to-end) y **refleja la nueva operación** (hay que elegir PEDIDO para programar).

---

## 5. VERIFICACIÓN (evidencia real, no supuesta)

| Puerta | Comando | Resultado |
|--------|---------|-----------|
| Compuerta F12.1 | `npm run test -- --run src/components/POSHeader.f12_1.test.jsx` | ✅ 13/13 |
| Compuerta F7.5a (reparada) | `npm run test -- --run src/RetailVisionPOS.f7_5a.test.jsx` | ✅ 11/11 |
| Suite frontend completa | `npm run test -- --run` (apps/pos) | ✅ **50 archivos / 573 tests** |
| CI completo | `npm run ci` (NUEVO-POS) | ✅ lint + test + guards |
| Lint (F0) | `node scripts/lint.mjs` | ✅ 0 errores (276 archivos) |
| Guards (F0 + F4/A-04 + F5/R-01) | `node scripts/guards.mjs` | ✅ 7/7 en verde |

**Nota:** la suite frontend pasó de **49 archivos / 560 tests** a **50 archivos / 573
tests** (+1 archivo, +13 tests) por la nueva compuerta F12.1.

---

## 6. LECCIÓN DE LA FASE 12.1

Esta sub-fase es la **9.ª instancia** de la familia de lecciones §10.6:

> *"El componente existe y pasa su test" ≠ "el usuario puede llegar a él".*

El botón 📌 y su modal existían y pasaban F7.5a. Pero **faltaba la OPERACIÓN que los
revela** (el selector). El inventario de componentes no lo veía; la compuerta F7.5a
tampoco, porque **asumía** que el botón estaba visible.

**Corolario para el ciclo de portado (Detectar → Verificar → Clasificar → Adaptar →
Probar → Ficha):** al portar una funcionalidad, hay que portar **la operación completa**
—no solo el componente— y **reparar las compuertas que asumían el estado anterior**.

---

## 7. ARCHIVOS TOCADOS

| Archivo | Cambio |
|---------|--------|
| `apps/pos/src/components/POSHeader.jsx` | +3 props, +selector CENTRO, botón 📌 condicionado |
| `apps/pos/src/RetailVisionPOS.jsx` | +estado `tipoPedido`, +cableado de 3 props |
| `apps/pos/src/components/POSHeader.f12_1.test.jsx` | **NUEVO** — compuerta de 13 tests |
| `apps/pos/src/RetailVisionPOS.f7_5a.test.jsx` | helper `botonProgramarPedido()` activa PEDIDO |

---

## 8. PENDIENTE DE LA FASE 12

- **F12.2+** — Seguir portando funcionalidades puntuales del viejo POS, una por una,
  conforme el usuario las detecte (mismo ciclo de 6 pasos).
