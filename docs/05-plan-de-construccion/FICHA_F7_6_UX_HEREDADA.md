# FICHA — FASE 7.6 (UX Heredada del Viejo POS)

> **Fase:** 7.6 — Corrección de cableado: la UX heredada del viejo POS
> **Plan de abordaje:** `PLAN_F7_6_UX_HEREDADA_v2.md` (263 líneas, 5 sub-pasos, 11 criterios)
> **Sub-pasos:** F7.6.0, F7.6.1, F7.6.2, F7.6.3
> **Estado:** CERRADA — gate en verde (13 tests / 11 criterios), CI completo en verde, guards 7/7
> **Fecha de cierre:** 2026-09-29

---

## 1. Qué es esta micro-fase (y qué NO es)

La F7.6 **no construye nada nuevo**. Es una **corrección de cableado**: la F7.5
integró los 3 entregables de la Fase 7 en la pantalla real, pero lo hizo con una
gramática de interacción **que contradice la del viejo POS**.

El dueño lo detectó: *"en la UI y en la UX del viejo POS ya está definido cómo se
integran algunos componentes"*. La F7.6 alinea el cableado nuevo con esa fuente de
verdad.

**El principio rector (UX heredada):**

> Cuando un componente ya existe en el viejo POS, su **INTEGRACIÓN** se hereda;
> solo su **IMPLEMENTACIÓN** se reescribe. El viejo POS es la fuente de verdad
> para la integración; el nuevo POS lo es para la implementación.

---

## 2. El hallazgo (evidencia del viejo POS)

Se leyó el viejo POS directamente (no la ficha) para confirmar la gramática:

| Componente | Viejo POS (fuente de verdad) | F7.5 (incorrecto) | F7.6 (corregido) |
|---|---|---|---|
| **Visión** | `viewMode === 'CAMERA'` **reemplaza el cuerpo** (grid ↔ visor). Se conmuta desde `CategoryBar`. | Overlay suelto (`visionAbierta`) montado al final. | `viewMode` como estado; el cuerpo alterna grid ↔ visor. |
| **Voz** | Botón `#btn-dictado-voz` en el header con `disabled={!voiceAvailable}` → overlay. | Botón sin gate de disponibilidad. | Botón con `disabled={!vozDisponible}` → overlay. |
| **Tema** | **No existe** en el viejo POS. | Overlay nuevo. | Overlay nuevo (se conserva). |

**Evidencia leída del viejo POS:**
- `apps/pos/RetailVisionPOS.jsx` línea 667: `viewMode === 'CAMERA' ? <VisionVisor .../> : <ProductGrid .../>`.
- `apps/pos/components/CategoryBar.jsx` línea 9: botón "👁️ ESCANER IA" → `setViewMode('CAMERA')`; línea 19: cada categoría → `setViewMode('GRID')`.
- `apps/pos/components/POSHeader.jsx` líneas 140-157: `#btn-dictado-voz` con `disabled={!voiceAvailable}`.

---

## 3. Los 3 archivos corregidos

### F7.6.0 — `apps/pos/src/components/CategoryBar.jsx`

Se añadió el **conmutador de vista**. Nuevas props (opcionales, con default):

```jsx
export default function CategoryBar({
  categorias,
  categoriaActiva,
  onSeleccionar,
  onExportarPDF = null,
  // F7.6.0 — conmutador de vista (UX heredada del viejo POS).
  viewMode = 'GRID',
  onCambiarVista,
}) {
```

- Botón "📷 Escáner IA": `aria-selected={viewMode === 'CAMERA'}`, `onClick={() => onCambiarVista?.('CAMERA')}`.
- Cada categoría: `aria-selected={viewMode === 'GRID' && categoriaActiva === cat.id}`, `onClick={() => { onSeleccionar(cat.id); onCambiarVista?.('GRID'); }}`.

**Compatibilidad:** sin `onCambiarVista` el componente se comporta como antes, de
modo que el gate de la Fase 3 (que lo monta sin estas props) no se rompe.

### F7.6.1 — `apps/pos/src/components/POSHeader.jsx`

- Se reemplazó la prop `onAbrirVision` por `vozDisponible = true`.
- El botón de voz ahora: `disabled={!vozDisponible}`, con className condicional
  (`opacity-40 cursor-not-allowed` cuando no está disponible) y `title` explicativo.
- **Se retiró el botón 📷 de visión del header** (la visión vive en la `CategoryBar`).

### F7.6.2 — `apps/pos/src/RetailVisionPOS.jsx`

- Estado: se **eliminó** `visionAbierta`; ahora hay `const [viewMode, setViewMode] = useState('GRID')`.
- `POSHeader` recibe `vozDisponible={voz.disponible}` (sin `onAbrirVision`).
- `CategoryBar` recibe `viewMode={viewMode}` y `onCambiarVista={setViewMode}`.
- El **cuerpo alterna**: `viewMode === 'CAMERA' ? <VisionVisor .../> : <ProductGrid .../>`.
- El `onCerrar` del visor vuelve a `GRID` (no a un booleano).
- **Se eliminó el overlay de visión** del final del componente.

**Lo que NO se tocó:** `VisionVisor.jsx`, `VoiceCartPanel.jsx`, `ThemeSelector.jsx`,
los 3 hooks (`useVision`, `useVoiceCart`, `useTheme`), ni la persistencia atómica.

---

## 4. El contrato del carrito se conserva

La corrección de UX **no toca la persistencia**. La confirmación de voz (`onApply`)
y el "Agregar" de visión (`onAgregar`) siguen llamando a:

```js
const listo = await asegurarTicket();
if (!listo) return;
carrito.anadirLinea({ product_id, name, quantity, unit_price });
```

Es el **MISMO camino** que el grid de productos, así que la persistencia atómica
por ítem (contratos 18–20) sigue operando igual.

---

## 5. El gate de integración — 11 criterios / 13 tests

Archivo: `apps/pos/src/RetailVisionPOS.f7_6.test.jsx` (monta la pantalla REAL con
el cliente `api` simulado).

| # | Criterio | Test |
|---|---|---|
| 1 | La `CategoryBar` expone el conmutador de vista | 2 tests (presente/no seleccionado; conmuta a CAMERA) |
| 2 | Cada categoría conmuta a `GRID` | 1 test (vuelve del visor al grid) |
| 3 | El cuerpo alterna grid ↔ visor | 1 test (GRID monta grid; CAMERA monta visor) |
| 4 | El visor NO es un overlay suelto | 2 tests (no se monta al arrancar; "×" vuelve a GRID) |
| 5 | La voz se abre desde el header con gate | 1 test (botón habilitado con `disponible=true`) |
| 6 | La voz SÍ se abre cuando está disponible | 1 test (monta `VoiceCartPanel`) |
| 7 | El header NO tiene botón de visión | 1 test (no hay botón de visión/cámara) |
| 8 | El tema se abre como overlay nuevo | 1 test (monta `ThemeSelector`) |
| 9 | La confirmación de voz usa el camino atómico | 1 test (panel con catálogo real) |
| 10 | El "Agregar" de visión usa el mismo camino | 1 test (visor con catálogo real) |
| 11 | La degradación elegante se conserva | 1 test (grid montado + venta manual viva) |

**Resultado:** `13 passed (13)`.

---

## 6. Evidencia de ejecución

```
npx vitest run src/RetailVisionPOS.f7_6.test.jsx
  ✓ src/RetailVisionPOS.f7_6.test.jsx (13 tests) 699ms
  Test Files  1 passed (1)
       Tests  13 passed (13)
```

```
npm run ci
  Lint OK: 0 errores. (209 archivos)
  Tests de Node      : 3/3 archivo(s) en verde
  Tests de componentes: PASA
  Tests de API       : PASA
  ✅ RESULTADO: TODOS LOS TESTS EN VERDE.
  PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE
```

**Cero regresiones.** El gate de la Fase 3 (`RetailVisionPOS.f3_cierre.test.jsx`)
sigue en verde porque las props nuevas de `CategoryBar` son opcionales.

---

## 7. Trazabilidad

| Regla / Directriz | Cómo la respeta la F7.6 |
|---|---|
| **H-5 (Regla de Oro)** | La IA propone; el operador confirma. Solo `onApply`/`onAgregar` tocan el carrito. |
| **RN-74 (visión asistiva)** | El visor sugiere; nunca bloquea la venta manual (el grid sigue disponible). |
| **DT-07 (Centro de IA único)** | Los tres hooks consumen contratos; degradan con elegancia. |
| **DT-08 (visión cenital)** | El visor es persistente (modo "escáner de charola"), no se cierra por producto. |
| **A-02 (frontera por contratos)** | El POS no lee tablas ajenas; consume contratos 17/24/25. |
| **R-03 (3 modos)** | El visor usa `max-w-3xl`/`max-h-[80vh]`; el cuerpo alterna en los 3 modos. |
| **R-04 (target táctil)** | Todos los controles nuevos tienen `min-h-tactil`. |
| **UX heredada** | La integración replica la del viejo POS (visión = modo de vista; voz = overlay con gate). |

---

## 8. Resumen ejecutivo

- **Qué es:** una micro-fase de **corrección de cableado**, no de construcción.
- **Qué corrige:** la visión pasa de overlay a **modo de vista** (grid ↔ visor); la
  voz gana su **gate de disponibilidad**; el botón de visión sale del header.
- **Qué conserva:** el tema como overlay nuevo; los hooks intactos; la persistencia
  atómica por ítem intacta; el gate de la Fase 7 intacto.
- **Qué produce:** 3 archivos corregidos + 1 gate (11 criterios / 13 tests) + 1 ficha
  + 2 documentos actualizados (F7.6.4).
- **Cero dependencias nuevas.**
