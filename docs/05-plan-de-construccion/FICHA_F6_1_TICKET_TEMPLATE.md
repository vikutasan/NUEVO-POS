# FICHA F6.1 — `TicketTemplate.jsx` (interfaz 23, Impresión)

| Campo | Valor |
|---|---|
| **Fase** | 6 — Impresión + PDF de Catálogo |
| **Sub-fase** | 6.1 — Plantilla del ticket de venta (interfaz 23) |
| **Estado** | ✅ CERRADA — gate en verde |
| **Fecha** | 2026-09-29 |
| **Plan de abordaje** | `PLAN_DE_ABORDAJE_FASE_6_POR_PARTES.md` §7 (v2.1) |
| **Entregable** | A — Impresión térmica unificada |

---

## 1. Qué se construyó

La plantilla React del **ticket de venta** (flujo E.1), que cumple el contrato
declarado de la **interfaz 23** del registro de la superficie. **Solo renderiza**;
no imprime. El disparador de impresión es F6.2.

| Archivo | Acción | Líneas |
|---|---|---|
| `apps/pos/src/components/TicketTemplate.jsx` | CREAR | 193 |
| `apps/pos/src/components/TicketTemplate.f6_1.test.jsx` | CREAR (gate) | 218 |
| `apps/pos/src/components/CorteTicketTemplate.jsx` | MODIFICAR (D-8) | 215 |

---

## 2. Contrato de superficie respetado (interfaz 23)

El registro (`apps/api/superficie/registry.py`) declara para la interfaz 23:

| Atributo | Valor declarado | Cumplido en el código |
|---|---|---|
| `contenedor_raiz` | `w-[58mm] font-mono` | ✅ `<article className="w-[58mm] ... font-mono">` |
| `paleta` | `("#fdfbf7",)` | ✅ `bg-crema-ticket` (token → `#fdfbf7`) |
| `exenta_responsiva` | `True` | ✅ No usa `w-full`; ancho físico de papel |

**R-01:** `w-[58mm]` es ancho **físico** (mm, no px) → el guard no dispara (H-2).
**R-04:** exenta por ser plantilla de impresión (no interactiva).

---

## 3. Estructura de la plantilla

Réplica estética del ticket de venta del POS viejo:

1. **Borde zigzag** superior (SVG inline, igual que `SalesReceipt`).
2. **Encabezado:** "R DE RICO" + "Ticket de Venta".
3. **Identidad:** número de cuenta (`CTA:`), fecha formateada, terminal.
4. **Líneas:** cantidad (`Nx`), nombre, precio unitario (`c/u`) e importe.
5. **Totales:** conteo de artículos + total en grande.
6. **Footer:** leyenda de aclaración (3 días) + agradecimiento.

**Tolerancia de forma:** acepta tanto la forma del POS nuevo
(`nombre`/`cantidad`/`precio_unitario`) como la del POS viejo
(`name`/`quantity`/`unit_price`). Esto evita un acoplamiento frágil al contrato 21.

---

## 4. Defecto corregido en esta sub-fase

### D-8 — Deuda documental: numeración de interfaz equivocada

`CorteTicketTemplate.jsx` declaraba en su cabecera *"interfaz 15 del registro de
la superficie"*. El registro dice que la **interfaz 15 es `POSHeader`** y que
`CorteTicketTemplate` es la **interfaz 24**.

- **Corrección:** el comentario ahora dice *"interfaz 24 … (Impresión)"*.
- **Verificación:** el gate (criterio 8) lee el archivo y exige `interfaz 24`
  y la ausencia de `interfaz 15`. Si alguien revierte el comentario, el gate falla.
- **Además:** se actualizó la referencia obsoleta *"la impresión física real es
  Fase 6"* → ahora apunta a F6.2 y a `generarCorteHTML()` (F6.0).

---

## 5. Defecto detectado y corregido por el propio gate

### Blindaje de `lineas` no-array

El gate (criterio 7) descubrió que `lineas: null` **rompía el render**:

```
TypeError: Cannot read properties of null (reading 'length')
  at TicketTemplate (TicketTemplate.jsx:145:17)
```

**Causa:** el default `lineas = []` de la desestructuración solo cubre
`undefined`, **no** `null`. Un `null` proveniente de la red (o de un estado
intermedio) llegaba hasta `lineas.length`.

**Corrección:** se normaliza antes del render, no dentro del JSX:

```jsx
const filas = Array.isArray(lineas) ? lineas : [];
```

Se usa `filas` en el conteo, en la condición de vacío y en el `map`. El
componente ahora es **defensivo ante datos sucios** sin ensuciar el JSX.

---

## 6. Criterios de la puerta (§7.4) — 8/8 en verde

| # | Criterio | Test |
|---|---|---|
| 1 | Encabezado "R DE RICO" + "Ticket de Venta" | ✅ |
| 2 | Número de cuenta y fecha (formateada, no ISO) | ✅ |
| 3 | Cada línea con cantidad, nombre y precio | ✅ |
| 4 | Total y conteo de artículos | ✅ |
| 5 | Contenedor raíz `w-[58mm]` + `font-mono` + paleta crema | ✅ |
| 6 | NO llama a `window.print` (solo renderiza) | ✅ |
| 7 | Ticket vacío / `null` / sin props no rompe | ✅ |
| 8 | `CorteTicketTemplate.jsx` dice "interfaz 24" (D-8) | ✅ |

**18 tests** en total (varios criterios tienen más de una aserción).

---

## 7. Evidencia de la puerta

```
npx vitest run src/components/TicketTemplate.f6_1.test.jsx
  → 1 archivo, 18 tests, 18 passed ✅

npx vitest run
  → 12 archivos, 162 tests, 162 passed ✅

node scripts/guards.mjs
  → 108 archivos escaneados, 7/7 guardianes OK ✅
```

---

## 8. Decisiones de diseño (y su porqué)

1. **Solo renderiza, no imprime.** Igual que `CorteTicketTemplate.jsx` (F4.4).
   Separación estricta: F6.1 pinta, F6.2 dispara. Facilita testear el render sin
   navegador y el disparo sin React.
2. **Un solo camino de impresión (§4 del plan).** Esta plantilla es la vista
   previa en pantalla; `generarTicketHTML()` (F6.0) es el string térmico. Ambos
   comparten estructura visual, pero sirven a dos consumidores distintos.
3. **Tolerancia de forma (nuevo/viejo).** El POS nuevo aún no tiene un contrato
   cerrado de "línea de ticket" para impresión; aceptar ambas formas evita
   romper cuando el contrato 21 evolucione.
4. **Blindaje de datos sucios.** El componente no confía en la forma de sus
   props; normaliza antes de renderizar. Es la lección de la Fase 3 (datos
   sucios de la red no deben tumbar la UI).

---

## 9. Lo que NO hace esta sub-fase (delimitación de alcance)

- **No imprime.** El disparador `iframe.contentWindow.print()` es F6.2.
- **No genera el string térmico.** Eso es F6.0 (`ticketGenerator.js`).
- **No toca el corte.** `CorteTicketTemplate.jsx` solo recibió la corrección
  documental D-8; su impresión se cablea en F6.2.
- **No añade dependencias.** Cero librerías nuevas.

---

## 10. Trazabilidad

| Regla / Decisión | Dónde se cumple |
|---|---|
| Interfaz 23 (contrato de superficie) | `TicketTemplate.jsx` (raíz) |
| R-01 (sin ancho fijo en px) | `w-[58mm]` es mm → exenta |
| R-04 (controles táctiles) | Exenta (plantilla no interactiva) |
| D-8 (numeración de interfaz) | `CorteTicketTemplate.jsx` cabecera |
| §4 (un solo camino de impresión) | F6.0 genera · F6.1 pinta · F6.2 dispara |
| E-05 / E-15 (sin logs ni TODOs sueltos) | Guards 7/7 en verde |
