# FICHA F6.0 — Motor térmico unificado: `ticketGenerator.js`

> **Fase:** 6 (Impresión + PDF de Catálogo) — Sub-fase **6.0**
> **Estado:** ✅ CERRADA — puerta en verde
> **Fecha:** 2026-09-29
> **Commit:** _(se registra al final de esta ficha)_
> **Plan de abordaje:** [`PLAN_DE_ABORDAJE_FASE_6_POR_PARTES.md`](../../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_6_POR_PARTES.md) §6

---

## 1. Por qué existe esta sub-fase

La Fase 6 tiene **dos entregables** (alcance depurado en v2.1 del plan):

- **Entregable A — Impresión térmica unificada** (ticket de venta + corte de caja).
- **Entregable B — Exportación de catálogo a PDF tipo carta** (con selector de categorías).

F6.0 es la **base del Entregable A**: el motor que convierte datos en **strings
HTML térmicos autosuficientes**. Sin este motor, ni el ticket ni el corte pueden
imprimirse de forma fiable.

### 1.1 El defecto del POS viejo que NO se copia (D-6)

La autocrítica del plan (defecto **D-6**) documentó una **asimetría** en el POS
viejo:

| Documento | Cómo se generaba en el POS viejo | Problema |
|---|---|---|
| Ticket de venta | `generateTicketHTML()` → **string HTML** autosuficiente | ✅ Correcto |
| Corte de caja | `cortePrintRef.current.innerHTML` + **Tailwind por CDN** | ❌ Depende de internet |

El corte del POS viejo se imprimía **sin estilos si no había conexión**, porque
inyectaba `<script src="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19">`. Eso
viola el principio de **autosuficiencia** y es un riesgo real en una panadería
con red inestable.

**Decisión arquitectónica de F6.0:** el POS nuevo **unifica** ambos documentos
como **strings HTML puros**, con su `<style>` embebido y **cero** referencias
externas. El corte deja de depender de React renderizado en el DOM y de un CDN.

---

## 2. Qué se construyó (2 archivos)

### 2.1 `apps/pos/src/utils/ticketGenerator.js` (225 líneas)

Utilidad **pura** (sin React, sin DOM) que exporta dos funciones:

```js
export function generarTicketHTML(ticket = {}) { ... }  // ticket de venta
export function generarCorteHTML(corte = {}) { ... }    // corte de caja
```

Ambas delegan en helpers privados puros:

| Helper | Responsabilidad |
|---|---|
| `moneda(valor)` | Formatea a `$0.00`; nunca lanza (NaN → `$0.00`) |
| `fechaHora(instante)` | ISO → fecha/hora local `es-MX`; nunca lanza |
| `estilosTermicos()` | Hoja de estilo embebida compartida (`@page { size: 80mm auto }`) |
| `documentoTermico(cuerpo)` | Envuelve el cuerpo en `<html>…</html>` autosuficiente |
| `encabezadoNegocio()` | Logo + nombre del negocio |
| `lineaProducto(linea)` | Una fila cantidad / nombre / precio / importe |
| `bloqueLineas(lineas)` | Tabla de líneas, o aviso "— sin líneas —" |
| `totalArticulos(lineas)` | Suma de cantidades |
| `filaCorte(etiqueta, valor)` | Una fila etiqueta/valor del corte |
| `bloqueMovimientos(movimientos)` | Movimientos ↑/↓, o "Sin movimientos." |

**Decisiones de diseño:**

1. **Ancho `80mm` es ancho de PAPEL, no responsivo.** Se declara como constante
   `ANCHO_TERMICO` y va en `@page`, no en una clase `w-[80mm]`. Está **exento de
   R-01** (el guard solo dispara con `px`, no con `mm`), pero se documenta para
   que nadie lo confunda con un ancho fijo de superficie.

2. **Tolerancia a datos incompletos.** `generarTicketHTML()` sin argumentos no
   lanza: usa `'---'` como cuenta, `'T1'` como terminal y muestra "— sin líneas —".
   Lo mismo `generarCorteHTML()` con `esperado`/`contado` ausentes (→ 0).

3. **El corte calcula el descuadre.** `descuadre = contado − esperado` y clasifica:
   `✓ Caja cuadrada` / `✗ Faltante` / `✗ Sobrante`. Es la información que el cajero
   firma al cerrar el turno.

4. **Ninguna función supera 20 líneas ni 3 niveles de anidación (E-16).**

### 2.2 `apps/pos/src/utils/ticketGenerator.f6_0.test.jsx` (14 tests)

Puerta de la sub-fase. Verifica los 7 criterios del plan §6.4:

| # | Criterio | Tests |
|---|---|---|
| 1 | Devuelve `<html>` y `@page { size: 80mm` | 2 (ticket + corte) |
| 2 | Incluye número de cuenta y total | 1 |
| 3 | Cada línea con cantidad, nombre y precio | 1 |
| 4 | Corte con fondo, movimientos y conteo final | 4 (incluye descuadre y "caja cuadrada") |
| 5 | Ticket vacío / sin argumentos no rompe | 2 |
| 6 | **Autosuficiencia:** sin `http://` ni `https://` | 2 |
| 7 | **Sin DOM:** no accede a `document.*` | 2 |

---

## 3. La corrección del criterio 7 (falso positivo del test)

La primera corrida de la puerta dio **12/14 en verde** y **2 en rojo**, ambos en
el criterio 7. El fallo **no era del código fuente**, sino de una **aserción
demasiado ingenua** del test:

```js
// ❌ Aserción original (falso positivo)
expect(fuente).not.toContain('document');
```

`generarTicketHTML.toString()` contiene la llamada al helper puro
`documentoTermico(cuerpo)`, cuyo **nombre** incluye la subcadena `"document"`.
La aserción marcaba como "toca el DOM" algo que solo compone strings.

**Corrección aplicada** — se verifica la **ausencia de ACCESO al DOM**, no la
subcadena:

```js
// ✅ Aserción corregida
expect(fuente).not.toMatch(/\bdocument\s*\./);   // document. (con punto)
expect(fuente).not.toContain('window.document');
expect(fuente).not.toContain('getElementById');
expect(fuente).not.toContain('querySelector');
expect(fuente).not.toContain('createElement');
expect(fuente).not.toContain('appendChild');
expect(fuente).toContain('documentoTermico');     // sí delega en el helper puro
```

**Lección registrada:** una aserción de "no contiene X" sobre código fuente debe
apuntar a **patrones de uso** (con delimitadores), no a **subcadenas**, porque
los identificadores pueden contener la palabra buscada.

---

## 4. Evidencia de la puerta

### 4.1 Puerta de la sub-fase

```
$ npx vitest run src/utils/ticketGenerator.f6_0.test.jsx

 ✓ src/utils/ticketGenerator.f6_0.test.jsx (14 tests) 28ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```

### 4.2 Suite completa del POS (sin regresiones)

```
$ npx vitest run

 Test Files  11 passed (11)
      Tests  144 passed (144)
```

### 4.3 Guardianes de estándares (CI)

```
$ node scripts/guards.mjs

Archivos de código escaneados: 106

[OK] E-05 — Silencios en ruta crítica → 0 coincidencia(s)
[OK] A-04 — Silencios en guardianes → 0 coincidencia(s)
[OK] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
[OK] E-15 — TODOs sin formato declarado → 0 coincidencia(s)
[OK] R-01 — Ancho fijo en la superficie → 0 coincidencia(s)
[OK] E-09 — Dinero en Float → 0 coincidencia(s)
[OK] E-10 — Tiempo naive → 0 coincidencia(s)

PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE
```

---

## 5. Trazabilidad

| Regla / Estándar | Cómo lo cumple F6.0 |
|---|---|
| **D-6** (autosuficiencia) | Ambos documentos son strings con `<style>` embebido; 0 CDN |
| **E-16** (tamaño de función) | Ninguna función > 20 líneas ni > 3 niveles |
| **R-01** (ancho fijo) | `80mm` es ancho de papel en `@page`, no clase de superficie |
| **Regla 15** (respuesta ligera) | No aplica (utilidad de presentación, no de datos) |
| **A-02** (frontera) | No aplica (no lee tablas; recibe datos ya proyectados) |

---

## 6. Qué NO hace esta sub-fase (delimitación de alcance)

- **NO imprime.** F6.0 solo **genera strings**. El disparador
  (`iframe.contentWindow.print()`, compatible con `--kiosk-printing`) es **F6.2**.
- **NO renderiza React.** El componente `TicketTemplate.jsx` (interfaz 23) es **F6.1**.
- **NO genera PDF.** El catálogo con jsPDF y el selector de categorías es **F6.3**.

---

## 7. Cierre

F6.0 entrega el **motor térmico unificado** que corrige el defecto D-6 del POS
viejo: ticket y corte se generan con el **mismo patrón** (string HTML puro,
autosuficiente, sin DOM, sin CDN). La puerta de la sub-fase (14 tests), la suite
completa del POS (144 tests) y los 7 guardianes de CI están **en verde**.

**Siguiente:** F6.1 — `TicketTemplate.jsx` (interfaz 23) + corrección del
comentario erróneo de interfaz en `CorteTicketTemplate.jsx` (dice "interfaz 15",
debe decir "interfaz 24").
