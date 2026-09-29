# FICHA DE CIERRE — FASE 6 (Impresión Térmica Unificada + Carta PDF)

> **Fase:** 6 — Impresión + PDF de Catálogo
> **Plan de abordaje:** `PLAN_DE_ABORDAJE_FASE_6_POR_PARTES.md` (v2.1, 465 líneas)
> **Sub-fases:** F6.0, F6.1, F6.2, F6.3, F6.4
> **Estado:** CERRADA — gates en verde, suite completa en verde, guards 7/7
> **Fecha de cierre:** 2026-09-29

---

## 1. Resumen de las 4 sub-fases ejecutadas

La Fase 6 se ejecutó **de adentro hacia afuera**: primero la utilidad pura (sin UI),
luego la plantilla que solo renderiza, después el disparador único de impresión, y
finalmente la carta PDF con su selector. Cada sub-fase cerró con gate en verde,
suite completa, guards 7/7, ficha propia, commit y push. **No se abrió una sub-fase
sin cerrar la anterior.**

| Sub-fase | Qué construyó | Archivos | Gate | Commit |
|---|---|---|---|---|
| **F6.0** | Motor térmico unificado: `generarTicketHTML` + `generarCorteHTML` (utilidad pura, sin UI, sin DOM) | `apps/pos/src/utils/ticketGenerator.js` + `ticketGenerator.f6_0.test.jsx` + `FICHA_F6_0_MOTOR_TERMICO.md` | 14 tests | `5a11bfc` |
| **F6.1** | Plantilla de ticket de venta (interfaz 23) + corrección del comentario de la interfaz 24 (D-8) | `apps/pos/src/components/TicketTemplate.jsx` + `TicketTemplate.f6_1.test.jsx` + `FICHA_F6_1_TICKET_TEMPLATE.md` | 18 tests | `ee61fef` |
| **F6.2** | Disparador único de impresión térmica: patrón "Iframe Fantasma", compatible con `--kiosk-printing` | `apps/pos/src/services/printService.js` + `printService.f6_2.test.jsx` + `FICHA_F6_2_PRINT_SERVICE.md` | 12 tests | `d351054` |
| **F6.3** | Carta PDF (Entregable B): generador jsPDF + selector de categorías + botón en `CategoryBar` | `apps/pos/src/components/CatalogoPDF.jsx` + `SelectorCategoriasPDF.jsx` + `CategoryBar.jsx` (modificado) + `CatalogoPDF.f6_3.test.jsx` + `FICHA_F6_3_CATALOGO_PDF.md` + `package.json`/`package-lock.json` (jspdf) | 10 tests | `a92e73f` |
| **F6.4** | Ficha de cierre de la fase (este documento) | `docs/05-plan-de-construccion/FICHA_F6_CIERRE.md` | — | (este commit) |

**Total de tests nuevos de la fase:** 14 + 18 + 12 + 10 = **54 tests**.
**Suite completa del POS al cierre:** **184 tests en 14 archivos, todos en verde.**

---

## 2. Tabla de paridad con el POS viejo (`ERP-R-DE-RICO`)

La Fase 6 no reinventó la impresión: **portó lo que funcionaba** del POS viejo,
**mejoró** lo que arrastraba deuda técnica, y **añadió** lo que no existía.

| Aspecto | POS viejo (`ERP-R-DE-RICO`) | POS nuevo (Fase 6) | Veredicto |
|---|---|---|---|
| **Ticket de venta** | `apps/pos/utils/ticketGenerator.js` (266 líneas), HTML con estilos inline | `apps/pos/src/utils/ticketGenerator.js` (224 líneas), HTML autosuficiente con `<style>` propio | **Portado igual** (misma estructura, mismo ancho 58 mm, misma información) |
| **Corte de caja** | `apps/pos/components/CorteTicketTemplate.jsx` — dependía de CDNs/React en el DOM para imprimir | `generarCorteHTML` en `ticketGenerator.js` — HTML 100 % autosuficiente, **cero CDNs** | **Mejorado** (elimina la dependencia de CDN y del DOM de React) |
| **Disparo de impresión** | `iframe.contentWindow.print()` disperso en varios componentes | `printService.js` — **un único punto de disparo** (`imprimirTicket` / `imprimirCorte`) | **Mejorado** (un solo camino, un solo lugar que mantener) |
| **Compatibilidad `--kiosk-printing`** | Funcionaba por accidente (el patrón iframe lo permitía) | Garantizada por diseño: iframe oculto 0×0, `focus()` + `print()`, limpieza a 1000 ms | **Mejorado** (documentado y verificado por gate) |
| **Carta / catálogo PDF** | **No existía** | `CatalogoPDF.jsx` (jsPDF) + `SelectorCategoriasPDF.jsx` + botón en `CategoryBar` | **Nuevo** (Entregable B) |
| **Selector de categorías** | **No existía** | Modal con checkboxes, todas marcadas por defecto, exportación deshabilitada si no hay ninguna | **Nuevo** (permite excluir categorías ocultas o de prueba) |

**Conclusión de paridad:** el ticket se portó **igual** (paridad funcional 1:1); el
corte se **mejoró** (sin CDN, sin dependencia del DOM de React); la carta PDF y su
selector son **funcionalidad nueva** que el POS viejo nunca tuvo.

---

## 3. Guía operativa de impresión (bandera `--kiosk-printing`)

### 3.1 Qué es y por qué importa

El navegador, por defecto, **siempre muestra el diálogo de impresión** antes de
enviar el documento a la impresora térmica. En un POS de mostrador eso es un paso
manual que frena al cajero. La bandera `--kiosk-printing` (Chromium/Chrome/Edge)
hace que `window.print()` **imprima directo, sin diálogo**.

`printService.js` está diseñado para ser **100 % compatible** con esa bandera: crea
un `<iframe>` oculto, escribe el HTML autosuficiente, llama a
`iframe.contentWindow.focus()` y `iframe.contentWindow.print()`, y retira el iframe
después. Si la bandera está activa, imprime en silencio; si no, muestra el diálogo
normal (degradación elegante, nunca falla).

### 3.2 Cómo configurarla (Windows 11)

1. Localizar el acceso directo con el que se abre el POS (Chrome/Edge).
2. Clic derecho → **Propiedades** → campo **Destino**.
3. Añadir la bandera al final, **fuera** de las comillas, precedida de un espacio:

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=http://localhost:5173
   ```

4. Aceptar y abrir el POS **desde ese acceso directo** (no desde otro).

> **Nota:** la bandera es **configuración del equipo**, no código. El POS no puede
> activarla por sí mismo; solo puede aprovecharla cuando está presente.

### 3.3 Qué hacer si la bandera NO está configurada

- El POS **sigue funcionando**: al imprimir aparece el diálogo nativo del navegador.
- El cajero selecciona la impresora térmica y confirma. Es un clic extra, no un error.
- **No hay que tocar código.** Basta con configurar la bandera en el acceso directo
  del equipo del mostrador (paso 3.2).

### 3.4 Impresoras soportadas

| Documento | Ancho de papel | Plantilla | Interfaz |
|---|---|---|---|
| Ticket de venta | 58 mm | `TicketTemplate.jsx` | Interfaz 23 |
| Corte de caja | 80 mm | `CorteTicketTemplate.jsx` | Interfaz 24 |

Ambas plantillas están **exentas** del guard R-01 (ancho fijo en `px`) porque su
ancho es **físico** (`w-[58mm]`, `w-[80mm]`), no un ancho de layout. El guard solo
marca `w-[Npx]`, no `w-[Nmm]`.

---

## 4. Los 9 defectos (D-1 a D-9) y cómo se corrigieron

Estos defectos se detectaron durante la **autocrítica del plan** (v1.0 → v2.0 → v2.1)
y durante la **ejecución**. Se documentan aquí para que no se repitan.

| # | Defecto | Cómo se corrigió |
|---|---|---|
| **D-1** | El plan v1.0 asumía que la impresión térmica ya existía en el POS nuevo; en realidad **no existía nada**. | Se verificó el código real: `NUEVO-POS` no tenía impresión ni PDF. Se declaró F6.0 como el motor desde cero. |
| **D-2** | El plan v1.0 mezclaba "imprimir ticket" con "exportar carta a PDF" como si fueran lo mismo. | Se separaron en **2 entregables distintos**: (A) impresión térmica unificada; (B) carta PDF con selector. |
| **D-3** | El plan v1.0 proponía `window.print()` para la carta, pero eso **no produce un archivo descargable** para enviar por correo. | Se cambió a **jsPDF** para la carta (genera un `.pdf` descargable) y se mantuvo `iframe.print()` solo para la térmica. |
| **D-4** | El plan v1.0 no contemplaba **elegir qué categorías** incluir en la carta. | Se añadió el **selector de categorías** (`SelectorCategoriasPDF.jsx`) como requisito obligatorio del Entregable B. |
| **D-5** | El plan v1.0 no verificaba la numeración de las interfaces de impresión. | Se verificó contra `superficie/registry.py`: interfaz 23 = `TicketTemplate`, interfaz 24 = `CorteTicketTemplate`. |
| **D-6** | El corte del POS viejo dependía de **CDNs externos**, lo que rompía la impresión sin internet. | `generarCorteHTML` embebe su propio `<style>`: **cero CDNs**, autosuficiente. |
| **D-7** | El disparo de impresión estaba **disperso** en varios componentes del POS viejo. | `printService.js` centraliza el disparo en **un único punto** (`imprimirTicket` / `imprimirCorte`). |
| **D-8** | El comentario de la interfaz 24 decía "58 mm" cuando el corte es de **80 mm**. | Se corrigió el comentario en `CorteTicketTemplate.jsx` durante F6.1. |
| **D-9** | El plan v2.0 **inventó** un "Entregable C (documento de respaldo / contingencia)" que el dueño nunca pidió. | Se **eliminó por completo** en v2.1. El alcance real son solo 2 entregables (A y B). |

### 4.1 Defectos descubiertos durante la ejecución (D-10 a D-12)

Además de los 9 del plan, la ejecución reveló 3 defectos de proceso que se
corrigieron en el momento:

| # | Defecto | Cómo se corrigió |
|---|---|---|
| **D-10** | En F6.2, el *fallback* de impresión **pisaba el documento** en lugar de degradar. | Se reescribió el fallback para que abra el documento en una ventana nueva sin sobrescribir el iframe. |
| **D-11** | En F6.2, un **comentario** contenía el literal `window.print()`, lo que hacía fallar el gate (criterio 7b) por un falso positivo. | Se reformuló el comentario para no contener el literal prohibido. Misma clase de error que el guard E-15. |
| **D-12** | Varias escrituras de archivo se interrumpieron y dejaron archivos de **0 bytes** (`CatalogoPDF.jsx`, `SelectorCategoriasPDF.jsx`, `CatalogoPDF.f6_3.test.jsx`). | Se verificó el tamaño con `dir` tras cada escritura y se reescribió cada archivo. Regla adoptada: **verificar el tamaño del archivo tras cada escritura antes de darlo por bueno.** |

---

## 5. Evidencia de los gates

### 5.1 Gate de la sub-fase F6.3 (carta PDF)

```
npx vitest run src/components/CatalogoPDF.f6_3.test.jsx
→ 10 tests, 10 passed
```

### 5.2 Suite completa del POS (gate de cierre F6.4)

```
npm run test
→ 14 archivos de test, 184 tests, todos en verde
```

### 5.3 Guards de CI (gate de cierre F6.4)

```
node scripts/guards.mjs
→ 7/7 guards en verde, 113 archivos escaneados
```

Los 7 guards verificados:

| Guard | Qué vigila | Resultado |
|---|---|---|
| **E-05** | `except`/`pass` silenciosos | ✅ |
| **A-04** | guards silenciosos (que no fallen en silencio) | ✅ |
| **E-15** | `console.log` + formato de `TODO` | ✅ |
| **R-01** | ancho fijo `w-[...px]` (exento en `mm`) | ✅ |
| **E-09** | `Float` en `models.py` | ✅ |
| **E-10** | `DateTime` sin zona (naive) | ✅ |
| **R-03** | paleta canónica en las interfaces | ✅ |

---

## 6. Cumplimiento de estándares

| Estándar | Cómo lo cumple la Fase 6 |
|---|---|
| **R-01** (sin ancho fijo en `px`) | Las plantillas térmicas usan `w-[58mm]`/`w-[80mm]` (ancho físico, exento). El selector y la carta no usan `px` fijos. |
| **R-03** (paleta canónica) | `SelectorCategoriasPDF.jsx` usa `bg-superficie`, `bg-acento`, `text-crema`, `bg-white/5`. |
| **R-04** (área táctil mínima) | Todos los botones del selector usan `min-h-tactil`. |
| **E-05** (sin `except` silencioso) | `CatalogoPDF.jsx` captura el error y devuelve `{outcome:'error', reason}` — nunca traga el error. |
| **E-15** (sin `console.log` ni `TODO` mal formado) | Ningún archivo de la fase introduce `console.log`. |
| **Contrato `{outcome, reason}`** | `generarCatalogoPDF` devuelve `ok({doc, paginas})` o `fallo(reason)`; nunca lanza. |
| **Autosuficiencia** | Los documentos de impresión embeben su propio `<style>`, cero CDNs, sin dependencia del DOM de React. |
| **Frontera por contratos** | Fase 6 es 100 % frontend; **no** toca contratos del backend. |

---

## 7. Lo que la Fase 6 NO hace (delimitación explícita)

- **No** implementa envío de correo. El PDF se descarga; el dueño lo adjunta manualmente.
- **No** implementa impresión directa sin diálogo por sí sola: eso depende de
  `--kiosk-printing`, que es configuración del equipo (§3).
- **No** toca el POS viejo (`ERP-R-DE-RICO`). Solo lo leyó como referencia.
- **No** modifica los contratos del backend. Fase 6 es 100 % frontend.
- **No** añade dependencias más allá de `jspdf`.
- **No** incluye ningún "documento de respaldo / contingencia" (Entregable C
  eliminado en v2.1, D-9).

---

## 8. Estado final de la Fase 6

| Criterio de cierre | Estado |
|---|---|
| F6.0 — motor térmico unificado | ✅ `5a11bfc` |
| F6.1 — plantilla de ticket (interfaz 23) + D-8 | ✅ `ee61fef` |
| F6.2 — disparador único de impresión | ✅ `d351054` |
| F6.3 — carta PDF + selector de categorías | ✅ `a92e73f` |
| F6.4 — ficha de cierre | ✅ (este commit) |
| Gate F6.3 (10 tests) | ✅ verde |
| Suite completa (184 tests) | ✅ verde |
| Guards de CI (7/7) | ✅ verde |
| Push a `origin/main` | ✅ |

**La Fase 6 queda CERRADA.** El POS nuevo ya imprime ticket de venta (58 mm) y corte
de caja (80 mm) con un único motor autosuficiente, y exporta la carta completa a PDF
con selector de categorías para enviar al proveedor de impresión.
