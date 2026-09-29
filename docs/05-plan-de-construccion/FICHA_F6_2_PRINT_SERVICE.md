# FICHA F6.2 — `printService.js` (disparador único de impresión térmica)

| Campo | Valor |
|---|---|
| **Fase** | 6 — Impresión + PDF de Catálogo |
| **Sub-fase** | 6.2 — Servicio de impresión térmica unificado |
| **Estado** | ✅ CERRADA — gate en verde |
| **Fecha** | 2026-09-29 |
| **Plan de abordaje** | `PLAN_DE_ABORDAJE_FASE_6_POR_PARTES.md` §8 (v2.1) |
| **Entregable** | A — Impresión térmica unificada |

---

## 1. Qué se construyó

El **disparador único** de impresión térmica para el ticket de venta y el corte
de caja. Toma un documento HTML ya generado (por F6.0, `ticketGenerator.js`) y lo
envía a la impresora térmica del equipo. **No genera HTML**: eso es F6.0.

| Archivo | Acción | Líneas |
|---|---|---|
| `apps/pos/src/services/printService.js` | CREAR | 152 |
| `apps/pos/src/services/printService.f6_2.test.jsx` | CREAR (gate) | 232 |

---

## 2. Por qué un solo servicio para ticket y corte (§4 del plan)

El POS viejo tenía **dos copias** del mismo patrón `iframe.print()`:

- `apps/pos/hooks/useTicketActions.js` → para el ticket de venta.
- `apps/pos/components/GestorDeCaja.jsx` → para el corte de caja.

Dos copias = dos lugares donde arreglar el mismo bug. Aquí se unifica en una sola
función (`imprimirHTML`) con dos envoltorios delgados (`imprimirTicket`,
`imprimirCorte`). El corte usa el HTML del corte (de `generarCorteHTML`, F6.0),
**no** el del ticket.

---

## 3. Patrón portado del POS viejo (D-4), con DOS mejoras

### Mejora 1 — HTML autosuficiente (D-6)

El POS viejo inyectaba una **hoja de estilos remota** (`cdn.jsdelivr.net/npm/tailwindcss`)
dentro del iframe. Si no había internet, el corte salía **sin estilos**.

En el POS nuevo el HTML de F6.0 ya trae su propio `<style>` y **CERO CDNs**. Aquí
no se inyecta nada externo. El gate (criterio 7c) lee el código fuente y **falla**
si aparece cualquier URL de CDN.

### Mejora 2 — Se PRESERVA `iframe.contentWindow.print()` (D-7)

El patrón `iframe.contentWindow.print()` se conserva **tal cual**: es el que
respeta la bandera `--kiosk-printing` que el personal ya tiene configurada para
**impresión silenciosa**. Imprimir desde la ventana principal rompería esa
impresión silenciosa. El gate (criterio 7b) lee el código fuente y **falla** si
aparece una llamada a la ventana principal.

---

## 4. Contrato `{outcome, reason}`

`imprimirTicket` e `imprimirCorte` **NUNCA lanzan**. Un fallo se traduce a
`{outcome: 'error', reason}`:

| Situación | `reason` |
|---|---|
| Documento no disponible o sin `createElement` | `documento_no_disponible` |
| HTML vacío o no-string | `html_vacio` |
| Excepción a mitad de camino | mensaje del error, o `error_de_impresion` |

---

## 5. Defecto detectado y corregido por el propio gate

### D-10 — El fallback a `document` pisaba el `documento` inyectado

**Síntoma:** el criterio 2 (`imprimirTicket('<html></html>', { documento: null })`
debe devolver `error`) devolvía `ok`.

**Causa:** el fallback inline

```js
opciones.documento || (typeof document !== 'undefined' ? document : null)
```

trata `null` como *falsy*, así que caía al `document` global de jsdom (que existe).
El servicio era **intesteable** en el caso "documento no disponible".

**Corrección:** se extrajo el helper `resolverDocumento(opciones)`, que distingue
"la clave no viene" de "la clave viene con `null`":

```js
function resolverDocumento(opciones) {
  if (Object.prototype.hasOwnProperty.call(opciones, 'documento')) {
    return opciones.documento ?? null;
  }
  return typeof document !== 'undefined' ? document : null;
}
```

Regla resultante: **si el llamador proporciona `documento` (aunque sea `null`), se
respeta tal cual**; solo si la clave está ausente se usa el `document` global. El
gate lo blinda con el criterio 2c (un `documento: {}` inválido debe **fallar**, no
caer al global).

### D-11 — Los comentarios del código contenían los literales prohibidos

**Síntoma:** los criterios 7b y 7c (que escanean el **código fuente**) fallaban
aunque el código era correcto.

**Causa:** los comentarios explicativos citaban literalmente `window.print()` y
`cdn.jsdelivr.net/npm/tailwindcss` (al explicar D-6 y D-7). El escáner no
distingue comentario de código.

**Corrección:** se reformularon los comentarios para explicar lo mismo **sin**
citar los literales prohibidos ("Imprimir desde la ventana principal…", "una hoja
de estilos remota…"). Lección: un gate que escanea fuente debe redactarse con
cuidado, y el código que documenta una prohibición no debe violarla textualmente.

---

## 6. Criterios de la puerta (§8.4) — 7/7 en verde

| # | Criterio | Test |
|---|---|---|
| 1 | `imprimirTicket` devuelve `{outcome:'ok'}` | ✅ |
| 2 | Devuelve `{outcome:'error', reason}` si el documento no está disponible | ✅ (+ 2b, 2c) |
| 3 | El iframe se remueve del DOM tras imprimir | ✅ |
| 4 | `imprimirCorte` usa el HTML del corte, no el del ticket | ✅ |
| 5 | Nunca lanza (convierte excepción en `{outcome:'error'}`) | ✅ |
| 6 | Usa el `documento` inyectado (no el global) | ✅ (+ 6b) |
| 7 | Usa `iframe.contentWindow.print()`, NO la ventana principal | ✅ (+ 7b, 7c) |

**12 tests** en total (varios criterios tienen más de una aserción).

---

## 7. Evidencia de la puerta

```
$ npx vitest run src/services/printService.f6_2.test.jsx

 ✓ src/services/printService.f6_2.test.jsx (12 tests) 18ms

 Test Files  1 passed (1)
      Tests  12 passed (12)
```

### Suite completa del POS

```
$ npx vitest run

 Test Files  13 passed (13)
      Tests  174 passed (174)
```

### Guardianes de estándares (7/7)

```
$ node scripts/guards.mjs

[OK] E-05 — Silencios en ruta crítica (except ... pass) → 0
[OK] A-04 — Silencios en la ruta crítica de guardianes → 0
[OK] E-15 — Logs olvidados (console.log) → 0
[OK] E-15 — TODOs sin formato declarado → 0
[OK] R-01 — Ancho fijo en la superficie (w-[...px]) → 0
[OK] E-09 — Dinero en Float (Float en models.py) → 0
[OK] E-10 — Tiempo naive (DateTime() en models.py) → 0

PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE
```

---

## 8. Qué NO hace esta sub-fase (frontera explícita)

- **No** genera el HTML del ticket ni del corte → eso es F6.0.
- **No** renderiza React → el HTML es autosuficiente, no depende del DOM de React.
- **No** se conecta todavía a la pantalla real (`RetailVisionPOS` / `GestorDeCaja`)
  → el cableado de la UI se hará cuando F6.3 cierre el entregable B, para no dejar
  el POS a medio cablear entre sub-fases.
- **No** exporta PDF → eso es F6.3 (entregable B, `jsPDF`).

---

## 9. Trazabilidad

| Regla / Defecto | Dónde se cumple |
|---|---|
| D-4 (patrón iframe del POS viejo) | `imprimirHTML()` |
| D-6 (CDN inyectado en el POS viejo) | HTML autosuficiente + criterio 7c |
| D-7 (`--kiosk-printing`) | `iframe.contentWindow.print()` + criterio 7b |
| D-10 (fallback pisaba el `documento`) | `resolverDocumento()` + criterio 2c |
| D-11 (literales prohibidos en comentarios) | comentarios reformulados + criterios 7b/7c |
| Contrato `{outcome, reason}` | `ok()` / `fallo()` de `utils/outcome.js` |
