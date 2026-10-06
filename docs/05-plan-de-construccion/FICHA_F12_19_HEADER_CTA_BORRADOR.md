# FICHA F12.19 — El encabezado no cambiaba de "Nueva Venta" a "CTA {folio} BORRADOR" (BUG de runtime)

> **Sub-fase:** 12.19 — Paridad del botón central de estado de transacción con el POS viejo
> **Fase:** 12 — Portar funcionalidades del POS viejo al POS nuevo
> **Estado:** ✅ CERRADA — **BUG CORREGIDO** (el header nunca reflejaba la cuenta en captura)
> **Fecha:** 2026-10-06
> **Plan rector:** §6.8 (la UX heredada — la INTEGRACIÓN se hereda, la IMPLEMENTACIÓN se reescribe) + RN-09/RN-10 (identidad vs. folio) + §10.6.5 (el inventario de componentes no ve la PARIDAD DE OPERACIÓN)

---

## 1. Síntoma reportado (runtime, no test)

El dueño del proyecto reportó:

> "en el encabezado del pos hay un boton central con la leyenda 'estado de transaccion nueva venta'
> que en el pos viejo al comenzar a capturar productos cambia la leyenda y muestra
> 'estado de transaccion cta v77559 borrador', este cambio en la leyenda no esta ocurriendo en el pos nuevo"

Es decir: en el POS viejo, al capturar el primer producto el botón central pasaba de
**NUEVA VENTA** a **CTA V77559** con la insignia **📝 BORRADOR**. En el POS nuevo el botón
se quedaba **siempre** en "Nueva Venta" (o "Cobrando…" / "Venta Cobrada"), sin importar
cuántos productos se capturaran.

---

## 2. Diagnóstico (verificado con evidencia, no asumido)

### 2.1 El comportamiento heredado (POS viejo)

En `apps/pos/components/POSHeader.jsx` (líneas 75-89) el botón central se pinta así:

```jsx
{currentAccountNum ? `CTA ${currentAccountNum}` : 'NUEVA VENTA'}
{currentAccountNum && cartLength > 0 && !orderData && (
  <span ...>📝 BORRADOR</span>
)}
{orderData && (<span ...>📦 PEDIDO TENTATIVO</span>)}
```

La leyenda depende de **dos datos de operación**: el folio de la cuenta (`currentAccountNum`)
y el tamaño del carrito (`cartLength`).

### 2.2 El comportamiento del POS nuevo (antes del fix)

En `apps/pos/src/components/POSHeader.jsx` el botón central solo pintaba `{etiquetaEstado}`,
derivada de un único prop `estado` con tres valores:

```jsx
const ETIQUETAS_ESTADO = Object.freeze({
  NUEVA_VENTA: 'Nueva Venta',
  COBRANDO: 'Cobrando…',
  PAGADA: 'Venta Cobrada',
});
```

El componente **no recibía** ni el folio ni el largo del carrito, así que era
**estructuralmente incapaz** de mostrar `CTA {folio}` + `📝 BORRADOR`.

### 2.3 Causa raíz — el componente existía, la OPERACIÓN no estaba cableada

`RetailVisionPOS.jsx` ya tenía los dos datos disponibles:

- `acciones.ticket?.account_num` — el folio (`V####`, RN-10), expuesto por `useTicketActions`.
- `carrito.lineas.length` — el largo del carrito, expuesto por `useCart`.

Pero la invocación de `POSHeader` (línea ~815) **no los pasaba**. Es exactamente la lección
de §10.6.5: *"el inventario de componentes no ve la PARIDAD DE OPERACIÓN"* — el componente
existía y pasaba sus tests, pero la operación que lo revela (capturar → folio + borrador)
estaba ausente.

---

## 3. Corrección

### 3.1 `POSHeader.jsx` — recibe los dos datos y deriva la leyenda

Se añadieron dos props con valores por defecto seguros:

```jsx
numeroCuenta = null,
cartLength = 0,
```

y dos valores derivados:

```jsx
const etiquetaCentro = numeroCuenta ? `CTA ${numeroCuenta}` : etiquetaEstado;
const mostrarBorrador = Boolean(numeroCuenta) && cartLength > 0 && !pedidoProgramado;
```

El botón central pinta `{etiquetaCentro}` y, cuando `mostrarBorrador`, la insignia
**📝 Borrador**.

### 3.2 `RetailVisionPOS.jsx` — cablea la operación

En la invocación de `POSHeader`:

```jsx
numeroCuenta={acciones.ticket?.account_num || null}
cartLength={carrito.lineas.length}
```

### 3.3 Invariantes preservados

| Invariante | Regla |
|---|---|
| El folio manda sobre el estado (si hay cuenta, se muestra `CTA {folio}`) | RN-09/RN-10 |
| El folio es **presentación**, nunca clave | RN-09 |
| La insignia BORRADOR exige folio **Y** líneas **Y** ausencia de pedido programado | §6.8 (paridad) |
| Sin folio, la leyenda sigue siendo el estado (`Nueva Venta` / `Cobrando…` / `Venta Cobrada`) | Regresión F3.4 |

---

## 4. Verificación

### 4.1 Test de puerta (frontend)

`src/components/POSHeader.f12_19.test.jsx` — 7 tests que fijan los invariantes:

1. Sin folio → **Nueva Venta**.
2. Con folio → **CTA V77559**.
3. El folio manda sobre el estado (aunque `estado="COBRANDO"`).
4. Folio + líneas + sin pedido → **📝 Borrador**.
5. Folio sin líneas → **no** Borrador.
6. Sin folio → **no** Borrador.
7. Folio + líneas + pedido programado → **no** Borrador.

### 4.2 Suites completas

| Suite | Resultado |
|---|---|
| Frontend (`vitest run`) | **691 passed** (63 archivos, +7 respecto a F12.18) |
| Backend (`pytest -q`) | **290 passed** |
| Guardianes (`node scripts/guards.mjs`) | **7/7 en verde** |

---

## 5. Lección

Un componente puede existir, tener su test y pasar la compuerta, y aun así **no revelar la
operación heredada** porque el orquestador no le pasa los datos que la operación produce.
La paridad de operación (§10.6.5) se verifica cableando el flujo completo
(capturar → folio → borrador), no inventariando componentes.
