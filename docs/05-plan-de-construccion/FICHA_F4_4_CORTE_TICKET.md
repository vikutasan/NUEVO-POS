# FICHA DE EVIDENCIA — FASE 4.4 (Plantilla de impresión del corte de caja)

> **Regla E-14: evidencia, no opinión.** Todo lo afirmado aquí se puede
> reproducir con los comandos listados al final.

---

## 1. Qué se construyó

La **plantilla de impresión del corte de caja** (interfaz 15 del registro de la
superficie, flujo E.5). Es la pieza que cierra el flujo de caja: una vez que el
turno se cierra en `GestorDeCaja`, esta plantilla renderiza el documento del
corte para que la Fase 6 lo mande a la impresora.

| Archivo | Rol |
|---|---|
| `apps/pos/src/components/CorteTicketTemplate.jsx` | La plantilla (solo renderiza). |
| `apps/pos/src/components/CorteTicketTemplate.f4_4.test.jsx` | La puerta (18 pruebas). |

### 1.1 Decisión de diseño (§8.4.2 del plan)

> **La plantilla SOLO RENDERIZA el corte. NO imprime.**

La impresión física real es **Fase 6** (Impresión + PDF de Catálogo). Esta
sub-fase entrega el *documento*, no el *transporte*. Se sigue el mismo patrón
que [`SalesReceipt.jsx`](../../apps/pos/src/components/SalesReceipt.jsx:1), que
también renderiza sin imprimir.

Consecuencia verificable: la plantilla **no** llama a `window.print()`, no
abre ventanas, no habla con ninguna impresora. Es una función pura de props a
JSX.

---

## 2. Contrato visible de la plantilla

### 2.1 Props

| Prop | Tipo | Descripción |
|---|---|---|
| `terminalId` | `string` | Terminal del turno (encabezado). |
| `cajero` | `string` | Nombre del cajero responsable. |
| `abiertaEn` | `string` (ISO) | Instante de apertura del turno. |
| `cerradaEn` | `string` (ISO) | Instante de cierre del turno. |
| `esperado` | `number` | Efectivo esperado según el sistema. |
| `contado` | `number` | Efectivo contado físicamente. |
| `credito` | `number` | Total cobrado con crédito. |
| `debito` | `number` | Total cobrado con débito. |
| `movimientos` | `array` | Entradas/salidas del turno (por defecto `[]`). |

### 2.2 Exportaciones

- `default CorteTicketTemplate` — el componente.
- `calcularDescuadre(esperado, contado)` — **la única fuente de verdad** del
  descuadre: `Number(contado || 0) − Number(esperado || 0)`.

### 2.3 Selectores estables (para pruebas y para Fase 6)

| `data-testid` | Contenido |
|---|---|
| `cajero` | Nombre del cajero (o `—`). |
| `apertura` | Fecha de apertura (o `—`). |
| `cierre` | Fecha de cierre (o `—`). |
| `esperado` | Efectivo esperado formateado. |
| `contado` | Efectivo contado formateado. |
| `diferencia` | Descuadre formateado. |
| `estado-cuadre` | `✓ Caja cuadrada` / `✗ Faltante` / `✗ Sobrante`. |
| `efectivo` | Efectivo del desglose. |
| `credito` | Crédito del desglose. |
| `debito` | Débito del desglose. |
| `movimientos` | Lista de movimientos (ausente si no hay). |

---

## 3. La puerta (18 pruebas, todas en verde)

`apps/pos/src/components/CorteTicketTemplate.f4_4.test.jsx`

| # | Bloque | Qué prueba |
|---|---|---|
| 1 | `calcularDescuadre` | 0 si cuadra; negativo si falta; positivo si sobra; tolera `null`/`undefined`. |
| 2 | Arqueo | Renderiza esperado y contado; diferencia `$0.00`; marca **Faltante**; marca **Sobrante**. |
| 3 | Identidad | Cajero, apertura y cierre; `—` sin fechas; `—` sin cajero; terminal en el encabezado. |
| 4 | Desglose | Efectivo, crédito y débito; `$0.00` cuando no hay tarjeta. |
| 5 | Movimientos | "Sin movimientos" si vacío; lista motivo + monto si hay. |
| 6 | Estructura | Raíz fluida (`w-full`) sin ancho fijo (R-01); no imprime por sí misma (§8.4.2). |

### 3.1 Criterio de la puerta (§8.4.3)

> `npm run test` en verde; `CorteTicketTemplate.test.js` renderiza **esperado,
> contado y diferencia**.

Cumplido: los tres valores se leen del DOM por `data-testid` en las pruebas 2.

---

## 4. Dos correcciones durante la construcción (evidencia de rigor)

### 4.1 La prueba R-01 era demasiado estricta (falso positivo)

La primera versión de la prueba usaba `not.toMatch(/\bw-\[\d+px\]/)`. El regex
hacía *match* sobre la subcadena `w-[420px]` **dentro** de `max-w-[420px]`.

`max-w-[420px]` es un **máximo** (fluido, permitido por R-01). Lo prohibido es
un ancho **fijo**. La prueba se corrigió para tokenizar el `className` y buscar
un token que empiece exactamente con `w-[`:

```js
const tokens = raiz.className.split(/\s+/);
const anchoFijo = tokens.filter((t) => /^w-\[\d+px\]$/.test(t));
expect(anchoFijo).toEqual([]);
```

### 4.2 El guardián R-01 cazó un comentario mío

El guardián `scripts/guards.mjs` (grep R-01) marcó en rojo el archivo de prueba
porque **un comentario** contenía literalmente el patrón prohibido. El guardián
tenía razón: el grep no distingue código de comentario, y la regla es que el
patrón no aparezca. Se reescribió el comentario para describir la regla sin
incrustar el token.

**Lección registrada:** los guardianes de grep son deliberadamente literales.
Escribir la regla sin escribir el patrón.

---

## 5. Evidencia de ejecución

```
$ node scripts/guards.mjs
=== GUARDIANES DE ESTÁNDARES (F0 + F4/A-04) ===
Archivos de código escaneados: 97
[OK  ] E-05 — Silencios en ruta crítica → 0 coincidencia(s)
[OK  ] A-04 — Silencios en la ruta crítica de guardianes → 0 coincidencia(s)
[OK  ] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
[OK  ] E-15 — TODOs sin formato declarado → 0 coincidencia(s)
[OK  ] R-01 — Ancho fijo en la superficie → 0 coincidencia(s)
[OK  ] E-09 — Dinero en Float → 0 coincidencia(s)
[OK  ] E-10 — Tiempo naive → 0 coincidencia(s)
PUERTA F0 EN VERDE
PUERTA F4/A-04 EN VERDE
PUERTA F5/R-01 EN VERDE

$ npx vitest run src/components/CorteTicketTemplate.f4_4.test.jsx   (cwd: apps/pos)
✓ src/components/CorteTicketTemplate.f4_4.test.jsx (18 tests) 129ms
Test Files  1 passed (1)
     Tests  18 passed (18)

$ npm run test   (cwd: NUEVO-POS)
  Tests de Node      : 3/3 archivo(s) en verde
  Tests de componentes: PASA
  Tests de API       : PASA
  ✅ RESULTADO: TODOS LOS TESTS EN VERDE.
```

---

## 6. Trazabilidad

| Regla / contrato | Dónde se cumple |
|---|---|
| **R-01** (sin ancho fijo) | Raíz `w-full max-w-[420px]`; prueba 6. |
| **R-04** (táctil) | Exenta: plantilla de impresión, no interactiva. |
| **§8.4.2** (solo renderiza) | Sin `window.print`; prueba 6. |
| **E-14** (evidencia) | Este documento + pruebas que leen el DOM. |
| **Interfaz 15** (superficie) | `CorteTicketTemplate` es la plantilla del flujo E.5. |

---

## 7. Deuda registrada

| ID | Deuda | Se resuelve en |
|---|---|---|
| **D-17** | Sin reintentos en las operaciones de caja (mutaciones con efecto contable). | Decisión del dueño (heredada de F4.2). |
| **D-18** | La impresión física real del corte no existe todavía. | **Fase 6** (Impresión + PDF). |

---

## 8. Estado de la Fase 4 tras esta sub-fase

Con F4.4 cerrada, el flujo completo de caja está construido de extremo a extremo:

```
abrir turno → movimientos → resumen en vivo → arqueo → cierre → plantilla de corte
   (F4.1)       (F4.1)          (F4.3)          (F4.3)   (F4.3)        (F4.4)
```

Falta únicamente la **ficha de cierre de la Fase 4** (sub-fase 4.5 documental),
que consolida la evidencia de las cinco sub-fases y declara la fase cerrada.
