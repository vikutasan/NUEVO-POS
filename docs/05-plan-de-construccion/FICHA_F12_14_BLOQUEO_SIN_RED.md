# FICHA F12.14 — Bloqueo del botón ENVIAR CUENTA sin red (REGLA 13)

> **Sub-fase:** 12.14 — cablear `botonBloqueado` de `useNetworkHealth` al botón ENVIAR CUENTA
> **Fase:** 12 — Portar funcionalidades del POS viejo al POS nuevo
> **Estado:** ✅ CERRADA — gate componente 8/8 en verde, CI completo en verde, guards 7/7 en verde
> **Fecha:** 2026-10-06
> **Commit:** `PENDIENTE` — F12.14: bloquear ENVIAR CUENTA sin red (REGLA 13)
> **Plan rector:** §6.8 (UX heredada) + §10.6 (lecciones por clase de fallo) + REGLA 13 + Cementerio §3 (Cuenta Fantasma $453)

---

## 1. Qué se construyó

F12.11 (la auditoría handler-por-handler) clasificó el hueco F12.14 como el indicador
cosmético `lastSaveStatus` (OMITIDA, BAJA). La **verificación** (REGLA DURA 2: "verificar,
no asumir") reveló un hueco **distinto y más importante**: el hook `useNetworkHealth`
**ya exponía** `botonBloqueado` (= `!enLinea`), pero ese valor estaba **HUÉRFANO** — no
lo consumía ningún componente. El botón ENVIAR CUENTA se podía pulsar sin red.

El viejo POS, en `apps/pos/components/SalesReceipt.jsx`, bloqueaba el envío con:

```jsx
disabled={isSendingToPizarron || cart.length === 0 || hasUnsavedItems}
title={hasUnsavedItems
  ? '⛔ No se puede enviar: hay productos sin guardar en el servidor. Verifique la conexión WiFi.'
  : ''}
```

Es decir: **sin conexión, el botón se bloquea y el `title` guía a verificar el WiFi.**
Esto es **REGLA 13** (bloqueo de botón sin conexión), no un adorno cosmético. F12.14
cierra el hueco cableando el estado de red que ya existía.

### El hueco

| # | Hueco | Clase | Decisión |
|---|---|---|---|
| 1 | `useNetworkHealth().botonBloqueado` (= `!enLinea`) se exponía pero **NO** lo consumía nadie; el botón ENVIAR CUENTA se podía pulsar sin red | HUÉRFANA | **CERRAR** — cablear `sinRed` a `SalesReceipt` |

### Archivos

| Archivo | Rol | Cambio |
|---|---|---|
| `apps/pos/src/components/SalesReceipt.jsx` | Prop `sinRed` + `envioBloqueado` + `title` | +1 prop, +1 gate, +1 mensaje |
| `apps/pos/src/RetailVisionPOS.jsx` | `SalesReceipt` escritorio — `sinRed={red.botonBloqueado}` | +1 prop |
| `apps/pos/src/RetailVisionPOS.jsx` | `SalesReceipt` móvil — `sinRed={red.botonBloqueado}` | +1 prop |
| `apps/pos/src/components/SalesReceipt.f12_14.test.jsx` | La puerta de componente (3 criterios, 8 tests) | nuevo |

---

## 2. Decisión de diseño

### 2.1 Cablear, no reimplementar

`useNetworkHealth` ya calcula `botonBloqueado: !enLinea` (línea 145 del hook). El
hueco **no** era de cálculo, sino de **cableado**: el valor existía y nadie lo leía.
F12.14 **no** reimplementa la detección de red; solo conecta el valor ya calculado al
botón. Esto respeta §6.8: la INTEGRACIÓN se hereda; la IMPLEMENTACIÓN ya estaba escrita.

### 2.2 Un gate más en `envioBloqueado`

`SalesReceipt` ya tenía dos gates de bloqueo del envío:

```jsx
const vacio = lineas.length === 0;
const envioBloqueado = vacio || enviandoCuenta;
```

F12.14 añade un tercer gate **independiente**:

```jsx
const envioBloqueado = vacio || enviandoCuenta || sinRed;
```

Los tres gates son ortogonales: ticket vacío (nada que enviar), envío en curso (ya se
está enviando) y sin red (no se puede enviar). Cualquiera de los tres bloquea.

### 2.3 El `title` guía la acción correctiva

Cuando `sinRed` es verdadero, el `title` del botón muestra:

```
⛔ No se puede enviar: sin conexión. Verifique la red WiFi.
```

Es la misma UX heredada del viejo POS: no basta con deshabilitar; hay que decirle al
cajero **por qué** y **qué hacer**. Esto ataca directamente la causa raíz de la
"Cuenta Fantasma $453" (Cementerio §3): un fallo de guardado invisible. Un botón
deshabilitado con un `title` explícito es visible y accionable.

### 2.4 `sinRed` por defecto `false`

La prop `sinRed = false` tiene valor por defecto: si un consumidor no la pasa, el
comportamiento es el de siempre (no bloquea por red). Esto evita romper consumidores
existentes y hace el cambio retrocompatible.

---

## 3. La puerta de componente (8 tests)

`apps/pos/src/components/SalesReceipt.f12_14.test.jsx` — 3 criterios, 8 tests:

### Criterio 1 — sin red el botón ENVIAR CUENTA está bloqueado (3 tests)

1. el botón ENVIAR CUENTA está deshabilitado
2. el `title` guía a verificar la red WiFi
3. pulsar el botón NO dispara `onEnviarCuenta`

### Criterio 2 — con red el botón ENVIAR CUENTA procede (3 tests)

4. el botón está habilitado
5. pulsar el botón dispara `onEnviarCuenta`
6. sin caja pero con red, el envío sigue permitido (gate independiente)

### Criterio 3 — los gates preexistentes siguen vigentes (2 tests)

7. un ticket vacío bloquea el envío aunque haya red
8. un envío en curso bloquea el botón

---

## 4. Verificación

| Puerta | Comando | Resultado |
|---|---|---|
| Componente F12.14 | `npx vitest run src/components/SalesReceipt.f12_14.test.jsx --reporter=verbose` | ✅ 8/8 |
| CI completo | `npm run ci` (desde `../NUEVO-POS`) | ✅ lint 295 archivos / 0 errores; tests Node 3/3, componentes PASA, API PASA; guards 7/7 |
| Guards | incluidos en `npm run ci` | ✅ E-05, A-04, E-15, R-01, E-09, E-10 en verde |

---

## 5. Trazabilidad

- **REGLA 13** — bloqueo de botón sin conexión. ✅ cumplida.
- **§6.8** — UX heredada del viejo POS: la integración (bloquear sin red) se hereda. ✅
- **§10.6** — 23ª instancia del ciclo "de adentro hacia afuera". ✅
- **Cementerio §3 (Cuenta Fantasma $453)** — un fallo de guardado invisible se combate
  con un botón visiblemente bloqueado + `title` accionable. ✅
- **REGLA DURA 2 (E-19) "verificar, no asumir"** — la auditoría clasificó F12.14 como
  cosmético; la verificación reveló que era REGLA 13 (HUÉRFANA). ✅

---

## 6. Cierre

F12.14 queda **CERRADA**. El botón ENVIAR CUENTA se bloquea sin red, con un `title`
que guía a verificar el WiFi, y los gates preexistentes (ticket vacío, envío en curso)
siguen vigentes. La puerta de componente (8/8) y el CI completo están en verde.
