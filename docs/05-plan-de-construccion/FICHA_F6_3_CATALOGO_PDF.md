# FICHA F6.3 — Carta PDF con selector de categorías (Entregable B)

**Fase:** 6 — Impresión + PDF de Catálogo
**Sub-fase:** F6.3
**Fecha:** 2026-09-29
**Estado:** ✅ CERRADA — gate en verde, suite completa en verde, guards 7/7

---

## 1. Qué se construyó

El **Entregable B** de la Fase 6: la exportación de la carta/catálogo a PDF,
con un **selector obligatorio de categorías** para elegir qué se imprime y qué
no (ej: solo panadería, sin heladería; excluir categorías ocultas o de prueba).

| Archivo | Acción | Rol |
|---|---|---|
| `apps/pos/src/components/CatalogoPDF.jsx` | CREAR | Generador del PDF (jsPDF) + contrato `{outcome, reason}` |
| `apps/pos/src/components/SelectorCategoriasPDF.jsx` | CREAR | Modal con checkboxes de categorías |
| `apps/pos/src/components/CategoryBar.jsx` | MODIFICAR | Botón "📄 Exportar PDF" + prop `onExportarPDF` |
| `apps/pos/src/components/CatalogoPDF.f6_3.test.jsx` | CREAR | Puerta de 10 criterios |
| `apps/pos/package.json` | MODIFICAR | Dependencia `jspdf@^2.5.2` |

---

## 2. Por qué jsPDF (y no `window.print()`)

La impresión térmica (Entregable A, F6.0–F6.2) y la carta PDF (Entregable B)
son **dos cosas distintas**:

- **Térmica:** se imprime en la impresora de 80 mm del mostrador, en el momento.
  Se resuelve con HTML autosuficiente + `iframe.contentWindow.print()`
  (compatible con `--kiosk-printing`).
- **Carta PDF:** es un **archivo descargable** que el dueño envía por correo a su
  proveedor de impresiones, para que la imprima en el papel y color que elija.
  `window.print()` NO produce un archivo descargable, por eso se usa jsPDF.

jsPDF es la **única dependencia nueva** de toda la Fase 6.

---

## 3. El contrato `{outcome, reason}`

El generador **nunca lanza**. Siempre devuelve:

```js
{ outcome: 'ok',    data: { doc, paginas } }   // éxito
{ outcome: 'error', reason: 'sin_categorias' } // sin categorías seleccionadas
{ outcome: 'error', reason: '<mensaje>' }      // cualquier excepción de jsPDF
```

`descargarCatalogoPDF(...)` reutiliza el mismo contrato y añade el `doc.save()`
del navegador, traduciendo cualquier fallo a un `reason`.

---

## 4. Decisiones de diseño

1. **Normalización tolerante:** `normalizarCategorias(categorias, productos)`
   acepta categorías ya hidratadas (`{id, name, productos}`) o categorías sueltas
   (`{id, name}`) + el catálogo completo, hidratando por `category_id`. Esto
   permite reutilizar el generador tanto desde el POS como desde un script.
2. **Categoría vacía no rompe:** una categoría sin productos se dibuja con su
   título y se omite su bloque de filas. La generación sigue en `ok`.
3. **Multipágina:** cuando el cursor llega al pie (297 mm − 18 mm), se agrega una
   página y se continúa. El resultado reporta `paginas`.
4. **Precio unificado:** `formatearPrecio` replica el patrón de
   `CheckoutScreen` (`toLocaleString('es-MX', {currency:'MXN'})`) para que la
   carta y el ticket hablen el mismo idioma.
5. **Selector con todo marcado por defecto:** el dueño desmarca lo que no quiere.
   El botón "Exportar PDF" se deshabilita si no queda ninguna categoría marcada.
6. **Retrocompatibilidad de `CategoryBar`:** el botón solo aparece si se pasa
   `onExportarPDF`. Sin esa prop, la barra se comporta exactamente como antes
   (criterio 10 de la puerta).

---

## 5. Cumplimiento de estándares

| Regla | Cómo se cumple |
|---|---|
| **R-01** (sin anchos fijos `px`) | Ni el generador ni el selector declaran `w-[...px]`. Verificado por la puerta y por el guard. |
| **R-03** (3 modos) | El selector usa la paleta canónica: `bg-superficie`, `bg-acento`, `text-crema`, `bg-white/5`. |
| **R-04** (target táctil ≥44px) | Todos los controles del selector y el botón de la barra usan `min-h-tactil`. |
| **E-05** (sin `catch` silencioso) | Los dos `catch` del generador traducen el error a un `reason` explícito. |
| **E-15** (sin `console.log`) | Cero logs en los tres archivos. Verificado por el guard. |

---

## 6. Puerta F6.3 — 10 criterios

| # | Criterio | Resultado |
|---|---|---|
| 1 | `generarCatalogoPDF` devuelve `{outcome:'ok'}` | ✅ |
| 2 | El PDF incluye el nombre del negocio y la fecha | ✅ |
| 3 | Cada categoría seleccionada aparece con su nombre | ✅ |
| 4 | Cada producto aparece con su nombre y su precio | ✅ |
| 5 | Una categoría sin productos no rompe la generación | ✅ |
| 6 | `generarCatalogoPDF([])` devuelve `{outcome:'error', reason}` | ✅ |
| 7 | El modal lista todas las categorías con checkbox | ✅ |
| 8 | El botón "📄 Exportar PDF" existe y dispara el modal | ✅ |
| 9 | El botón respeta R-03 (paleta) y R-04 (target táctil) | ✅ |
| 10 | `CategoryBar` sigue funcionando con sus props originales | ✅ |

---

## 7. Evidencia de ejecución

```
npx vitest run src/components/CatalogoPDF.f6_3.test.jsx
  ✓ src/components/CatalogoPDF.f6_3.test.jsx (10 tests)
  Test Files  1 passed (1)
       Tests  10 passed (10)

npx vitest run
  Test Files  14 passed (14)
       Tests  184 passed (184)

node scripts/guards.mjs
  Archivos de código escaneados: 113
  [OK] E-05 · [OK] A-04 · [OK] E-15 (console.log) · [OK] E-15 (TODO)
  [OK] R-01 · [OK] E-09 · [OK] E-10
  PUERTA F0 / F4-A-04 / F5-R-01 EN VERDE
```

---

## 8. Defectos documentados en esta sub-fase

- **D-12 (nuevo):** el primer intento de escritura de los archivos quedó en 0
  bytes por interrupciones del entorno. Se detectó con `dir` y se re-escribió.
  Lección: **verificar el tamaño del archivo tras cada escritura** antes de
  darlo por bueno.

---

## 9. Qué queda para F6.4

La ficha de cierre de la Fase 6 (`FICHA_F6_CIERRE.md`), que consolida F6.0–F6.3,
la tabla de paridad con el POS viejo, la guía operativa de `--kiosk-printing` y
la lista completa de defectos D-1 a D-12.
