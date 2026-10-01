# FICHA DE EVIDENCIA — F12.4 Carta/catálogo en PDF integrado al POS

> **Sub-fase:** F12.4 — Cableado de `onExportarPDF` + `SelectorCategoriasPDF` en `RetailVisionPOS`
> **Fase:** 12 — Porte de funcionalidades del viejo POS al nuevo POS
> **Plan:** [`PLAN_MAESTRO_DEFINITIVO_POS.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/PLAN_MAESTRO_DEFINITIVO_POS.md) §6.2 + §10.6
> **Commit de esta sub-fase:** `PENDIENTE`
> **Estado:** ✅ CERRADA — gate verde (8 tests) + CI verde

---

## 1. Qué se construyó

Se **integró** al POS la carta/catálogo en PDF (F6.3). El componente
[`CatalogoPDF.jsx`](../../apps/pos/src/components/CatalogoPDF.jsx) y el modal
[`SelectorCategoriasPDF.jsx`](../../apps/pos/src/components/SelectorCategoriasPDF.jsx)
ya existían desde la Fase 6.3 y pasaban su test aislado. **Pero la pantalla
[`RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx) nunca le pasaba
`onExportarPDF` a `CategoryBar`**, y `CategoryBar` pinta el botón
"Exportar carta a PDF" **solo si recibe ese prop**.

Resultado antes de esta sub-fase: el dueño **no podía imprimir la carta desde el
POS**. El componente estaba construido, probado… y **HUÉRFANO**.

| Archivo | Rol |
|---|---|
| [`apps/pos/src/RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx) | La pantalla (se le cableó el flujo) |
| [`apps/pos/src/RetailVisionPOS.f12_4.test.jsx`](../../apps/pos/src/RetailVisionPOS.f12_4.test.jsx) | La puerta (8 tests, 5 criterios) |

### Los 4 cambios en `RetailVisionPOS.jsx`

1. **Imports:** `SelectorCategoriasPDF` + `descargarCatalogoPDF`.
2. **Estado:** `selectorPDFAbierto` (visibilidad del modal) y `exportandoPDF`
   (bandera de "generando").
3. **Handler `exportarCartaPDF`:** recibe las categorías marcadas, genera y
   descarga el PDF con el catálogo **completo** (para hidratar por `category_id`),
   cierra el selector y, si falla, avisa por el banner.
4. **Cableado:** el prop `onExportarPDF` a `CategoryBar` + el montaje del modal
   `SelectorCategoriasPDF`.

---

## 2. Clasificación de paridad: HUÉRFANA (no OMITIDA)

> **Aclaración del dueño:** *"la función NO está en el viejo POS, es NUEVA de este"*.

Esto es decisivo para la clasificación. Las cuatro categorías de paridad (F10) son:

| Categoría | Significado | ¿Aplica aquí? |
|---|---|---|
| PORTADA | Existe en el viejo POS y en el nuevo | No |
| OMITIDA | Existe en el viejo POS, falta en el nuevo | **No** — no está en el viejo POS |
| **HUÉRFANA** | **Construida en el nuevo POS, nunca integrada** | **Sí** |
| DESCARTADA | Decisión consciente de no portarla | No |

La carta en PDF es una **función nueva del nuevo POS** (§6.2 del Plan Maestro).
No se hereda del viejo POS, así que **no** es una omisión de paridad (§6.8). Es un
**huérfano de integración**: el componente se construyó y se probó, pero nadie lo
conectó a la pantalla.

---

## 3. La 12ª instancia de la lección §10.6

Esta sub-fase es la **duodécima** vez que aparece la misma clase de fallo:

> *"el componente existe y pasa su test" ≠ "el usuario puede llegar a él"*.

El inventario de componentes no ve las **integraciones** (§10.6.3), ni los
**flujos de datos** (§10.6.4), ni la **paridad de operación** (§10.6.5). Un
componente puede estar 100% verde en su test aislado y, aun así, ser inalcanzable
desde la pantalla real.

La compuerta de F12.4 cierra ese hueco: **no** prueba el componente aislado (eso
ya lo hace `CatalogoPDF.f6_3.test.jsx`), sino que prueba que el **flujo completo**
(botón → selector → descarga) sea alcanzable y opere desde el POS.

---

## 4. Los 5 criterios y su verificación

| # | Criterio | Tests | Resultado |
|---|---|---|---|
| 1 | El botón "Exportar carta a PDF" es ALCANZABLE desde el POS (existe y es pulsable) | 2 | ✅ |
| 2 | Pulsar el botón ABRE el selector de categorías (diálogo accesible) | 2 | ✅ |
| 3 | Confirmar DESCARGA el PDF con las categorías marcadas y CIERRA el selector | 2 | ✅ |
| 4 | Cancelar CIERRA el selector SIN descargar (sin efecto colateral) | 1 | ✅ |
| 5 | Un fallo del servicio NO tumba el POS: avisa por el banner y el POS sigue vivo | 1 | ✅ |

**Total: 8 tests, 8 verdes.**

> **Nota de la compuerta (REGLA DURA 2 — "verificar, no asumir"):** la primera
> corrida dio **7 verdes y 1 rojo**. El rojo no era un bug del cableado: era una
> **expectativa equivocada del test**. El selector marca **todas** las categorías
> por defecto (decisión de F6.3, línea 36 de `SelectorCategoriasPDF.jsx`), así que
> pulsar "Panadería" la **desmarca** en vez de marcarla. El test se corrigió para
> desmarcar "Heladería" y dejar solo "Panadería". La lección: el test también se
> verifica contra el comportamiento real, no contra lo que uno asume.

---

## 5. Contrato respetado

El handler `exportarCartaPDF` respeta el contrato `{outcome, reason}` del POS:

```javascript
const resultado = descargarCatalogoPDF(categoriasSeleccionadas, productos);
setSelectorPDFAbierto(false);
if (resultado.outcome !== 'ok') {
  setBanner({
    tipo: 'error',
    mensaje: `No se pudo generar la carta: ${resultado.reason || 'error'}`,
  });
}
```

- **Nunca** usa `try/catch` (el servicio devuelve `{outcome, reason}` y no lanza).
- **Siempre** cierra el selector, incluso si falla (no deja al usuario atrapado).
- Un fallo del PDF **no tumba el POS**: se avisa por el banner y la venta continúa.

---

## 6. Evidencia de CI

```
=== LINT (F0) ===
Archivos en la obra: 279
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

> **Nota de guardián:** la primera corrida de CI marcó el guardián E-15 (TODOs sin
> formato) por un falso positivo: la palabra "TODO" dentro de un comentario en
> español ("Se conserva **TODO** el módulo real…"). Se reescribió el comentario
> ("Se conserva el módulo real completo…") y el guardián quedó limpio. Lección:
> los guardianes de texto no distinguen idioma; hay que redactar sin ambigüedad.

---

## 7. Cierre

- **Función:** Carta/catálogo en PDF (F6.3) — **NUEVA del nuevo POS**.
- **Clasificación:** HUÉRFANA → **integrada**.
- **Instancia §10.6:** 12ª.
- **Gate:** 8 tests verdes.
- **CI:** verde (lint + tests + guards).
