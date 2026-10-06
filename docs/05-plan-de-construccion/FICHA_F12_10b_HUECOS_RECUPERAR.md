# FICHA F12.10b — Cerrar los 3 huecos de `recuperarCuentaAlCarrito`

> **Sub-fase:** 12.10b — guardia de cuenta vacía + contexto de PEDIDO + capturador (DESCARTADA)
> **Fase:** 12 — Portar funcionalidades del POS viejo al POS nuevo
> **Estado:** ✅ CERRADA — gate componente 4/4 en verde, CI completo en verde, guards 7/7 en verde
> **Fecha:** 2026-10-06
> **Commit:** `725f404` — F12.10b: cerrar los 3 huecos de `recuperarCuentaAlCarrito`
> **Plan rector:** §6.8 (UX heredada) + §10.6 (lecciones por clase de fallo) + A-02 (frontera por contratos)

---

## 1. Qué se construyó

F12.10 cerró el hueco **A-02** (la lectura de líneas no existía como contrato) e
hidrató el carrito. Pero al comparar `recuperarCuentaAlCarrito` del POS nuevo contra
`handleRecoverAccount` del POS viejo (§6.8 — la INTEGRACIÓN se hereda), aparecieron
**3 huecos más** en el MISMO handler. F12.10b los cierra.

El viejo POS, en `apps/pos/hooks/useTicketActions.js` → `handleRecoverAccount`
(líneas 400–477), hacía **5 cosas**:

```js
// viejo POS — handleRecoverAccount(account)
1. leer el ticket por folio
2. leer las líneas del ticket
3. setCart(...)                       // hidratar
4. setCurrentAccountNum(...)          // adoptar identidad
5. setOrderData({...})                // ← restaurar contexto de PEDIDO
   // + guardia: si no hay líneas, avisar y NO adoptar
```

El POS nuevo (F12.10) hacía solo **3** (leer líneas, hidratar, adoptar identidad).
Faltaban: la **guardia de cuenta vacía** y la **restauración del contexto de PEDIDO**.

### Los 3 huecos

| # | Hueco | Clase | Decisión |
|---|---|---|---|
| 1 | Una cuenta **sin líneas** se adoptaba igual (carrito vacío + identidad ajena) | OMITIDA | **CERRAR** — guardia + banner |
| 2 | Recuperar un **PEDIDO** no restauraba `order_type`/`delivery_type`/cliente | OMITIDA | **CERRAR** — restaurar `bloquePedido` + `tipoPedido` |
| 3 | El **capturador** (`captured_by_name`) no se restauraba en el cliente | — | **DESCARTADA** — el backend lo resuelve por RN-24 |

### Archivos

| Archivo | Rol | Cambio |
|---|---|---|
| `apps/pos/src/RetailVisionPOS.jsx` | `recuperarCuentaAlCarrito(cuenta, postit)` — guardia + contexto | reescrito |
| `apps/pos/src/RetailVisionPOS.jsx` | Import de `construirBloquePedido` | +1 import |
| `apps/pos/src/components/OpenAccountsCorkboard.jsx` | `manejarRecuperar` pasa la cuenta rica (contrato 23) | actualizado (F12.10) |
| `apps/pos/src/RetailVisionPOS.f12_10b.test.jsx` | La puerta de componente (2 criterios, 4 tests) | nuevo |
| `apps/pos/src/components/OpenAccountsCorkboard.f5_3.test.jsx` | Firma de `onRecuperar` (2 argumentos) | actualizado |

---

## 2. Decisión de diseño

### 2.1 Hueco 1 — Guardia de cuenta vacía (paridad con el viejo POS)

El viejo POS, si la cuenta no tenía líneas, **avisaba y no adoptaba**. El POS nuevo
la adoptaba igual: el operador quedaba sobre una cuenta vacía creyendo que recuperó
algo, y peor, **perdía su carrito actual** (la hidratación lo reemplaza).

```js
if (lineas.length === 0) {
  setBanner({ tipo: 'error', mensaje: '⚠️ Cuenta vacía.' });
  return;   // NO se hidrata, NO se adopta identidad, NO se cierra el pizarrón
}
```

El `return` temprano deja el carrito **intacto** y el pizarrón **abierto**, para que
el operador siga eligiendo. El banner es persistente (Regla 19).

### 2.2 Hueco 2 — Restaurar el contexto de PEDIDO

Un PEDIDO no es solo líneas: tiene `order_type`, `delivery_type`, cliente y notas.
El contrato 21 (lectura ligera) **NO** los trae (Regla 15: 5 campos escalares). El
**único** objeto que los trae es la cuenta del pizarrón (contrato 23), que el
pizarrón ya tenía en la mano. Por eso `onRecuperar` ahora recibe **dos** argumentos:
el ticket fresco (contrato 21) y la cuenta rica (contrato 23).

```js
const esPedido = postit && postit.order_type === 'PEDIDO';
if (esPedido) {
  setTipoPedido('PEDIDO');
  setBloquePedido(construirBloquePedido({
    order_type: 'PEDIDO',
    delivery_type: postit.delivery_type,
    customer_name: postit.customer_name,
    customer_phone: postit.customer_phone,
  }));
} else {
  setTipoPedido('VENTA_DIRECTA');
  setBloquePedido(null);   // paridad con el `setOrderData(null)` del viejo POS
}
```

Se reutiliza `construirBloquePedido` — la **MISMA función pura** que usa el modal de
programación (`useOrderProgramming.js`). No se duplica la forma del bloque `order_*`
(contrato 3). Si el modal cambia la forma, el recuperar cambia con él.

### 2.3 Hueco 3 — El capturador es DESCARTADA (no un hueco)

El viejo POS restauraba `captured_by_name` en el cliente. El POS nuevo **no tiene
estado de capturador** en el cliente, y **no debe tenerlo**: RN-24 fija que el
capturador lo resuelve el **backend** desde la sesión de terminal activa. El cliente
nunca envía `captured_by` (verificado en `useTicketActions.js` → `crearTicket`, que
NO incluye ese campo). Por tanto, "restaurar el capturador en el cliente" no es un
hueco: es una **responsabilidad que se movió al backend** por diseño (A-02). Se
clasifica **DESCARTADA** con justificación, no se implementa.

### 2.4 La firma de `onRecuperar` cambia (2 argumentos)

`OpenAccountsCorkboard.manejarRecuperar` pasa `onRecuperar(resultado.data, cuenta)`.
El primer argumento es el ticket fresco (contrato 21); el segundo, la cuenta rica
(contrato 23). Esto rompió el test F5.3, que asertaba la firma de 1 argumento. Se
actualizó el test para reflejar el contrato nuevo (el segundo argumento es la cuenta
tocada). **No es un cambio de comportamiento del pizarrón**, es la propagación de un
dato que el pizarrón ya tenía.

---

## 3. La puerta de componente (2 criterios, 4 tests)

`apps/pos/src/RetailVisionPOS.f12_10b.test.jsx` — **4/4 en verde**.

| # | Criterio | Test | Qué verifica |
|---|---|---|---|
| 1 | Guardia de cuenta vacía | una cuenta sin líneas NO se adopta y avisa por banner | Banner "Cuenta vacía" + ticket sigue vacío |
| 1 | Guardia de cuenta vacía | una cuenta vacía NO cierra el pizarrón | El diálogo sigue abierto |
| 2 | Contexto de PEDIDO | recuperar un PEDIDO restaura el bloque de pedido | `#btn-pedido` `aria-pressed="true"` + botón "Programar pedido" |
| 2 | Contexto de PEDIDO | recuperar una VENTA DIRECTA limpia el bloque previo | El carrito se hidrata sin bloque de pedido |

### Notas de implementación de los tests

- El `SalesReceipt` **no** tiene `data-testid`. El estado vacío se ancla por su texto
  (`★ El ticket esta vacio ★`) y se sube al contenedor `<aside>` con `.closest('aside')`.
- El selector VENTA DIRECTA / PEDIDO se localiza por **id** (`#btn-pedido`), no por
  rol+nombre: su nombre accesible ("📦 Pedido") colisiona con el del botón
  "Programar pedido" (`#btn-programacion-pedido`).

---

## 4. Por qué existe esta compuerta (19ª instancia de §10.6)

§10.6 documenta las lecciones por **clase de fallo**. F12.10b es la **19ª instancia**
y pertenece a la clase **"de adentro hacia afuera"**, pero con un matiz nuevo: no es
un hueco de contrato (como F12.10), es un hueco de **paridad de handler**.

La lección: **cerrar un hueco A-02 no cierra el handler**. F12.10 hizo que el carrito
se hidratara, pero el handler seguía haciendo 3 de las 5 cosas del viejo POS. La
hidratación era **necesaria pero no suficiente**. La paridad de un handler se mide
contra el handler viejo **completo**, efecto por efecto, no contra el síntoma que
reportó el usuario.

Esto es exactamente lo que motiva **F12.11**: una auditoría **handler-por-handler**
que extraiga los efectos observables de cada handler del viejo POS y los compare con
el nuevo, para que ningún hueco de paridad quede invisible.

### Las 19 instancias (contexto)

| # | Fase | Clase de fallo |
|---|---|---|
| 16 | F12.9 | Un botón conflacionaba DOS operaciones |
| 17 | F12.9.1 | El esquema asumía el flujo inverso |
| 18 | F12.10 | Recuperar adoptaba identidad pero no hidrataba el carrito (hueco A-02) |
| **19** | **F12.10b** | **El handler hidrataba pero omitía 2 efectos del viejo POS (guardia + contexto)** |

---

## 5. Verificación

```
Componente (Vitest):
  npx vitest run src/RetailVisionPOS.f12_10b.test.jsx
  → 4 passed

CI completo (npm run ci desde NUEVO-POS):
  lint OK (0 errores) · vitest PASA · pytest PASA · guards 7/7 OK
  → TODOS LOS TESTS EN VERDE
```

---

## 6. Estado

✅ **CERRADA.** `recuperarCuentaAlCarrito` ahora hace las 5 cosas del viejo POS:
leer líneas, hidratar, adoptar identidad, **guardar contra cuenta vacía** y
**restaurar el contexto de PEDIDO**. El capturador se clasifica DESCARTADA (el
backend lo resuelve por RN-24). Queda abierta **F12.11** — la auditoría
handler-por-handler que evita que vuelva a pasar.
