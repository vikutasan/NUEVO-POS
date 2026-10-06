# FICHA F12.10 — Recuperar una cuenta HIDRATA el carrito (contrato 30)

> **Sub-fase:** 12.10 — `pos.leer_lineas` + `hidratarLineas` + `recuperarCuentaAlCarrito`
> **Fase:** 12 — Portar funcionalidades del POS viejo al POS nuevo
> **Estado:** ✅ CERRADA — gate backend 9/9 en verde, gate componente 5/5 en verde, CI completo en verde, guards 7/7 en verde
> **Fecha:** 2026-10-06
> **Commit:** `2df05f4` — F12.10: recuperar una cuenta hidrata el carrito (contrato 30 pos.leer_lineas)
> **Plan rector:** §6.8 (UX heredada) + §10.6 (lecciones por clase de fallo) + A-02 (frontera por contratos)

---

## 1. Qué se construyó

El **cierre del hueco A-02 de la lectura de líneas**: recuperar una cuenta desde el
pizarrón ahora **hidrata el carrito** con las líneas del ticket, no solo adopta su
identidad.

Antes de F12.10, `recuperarCuentaAlCarrito` (F12.5) hacía:

```js
setTicketId(cuenta.id);      // adopta la identidad
setPizarronAbierto(false);   // cierra el pizarrón
```

…y nada más. El usuario recuperaba una cuenta y veía el carrito **VACÍO**. La causa
raíz era un hueco A-02: **ningún contrato devolvía las líneas**. El contrato 21
(`pos.leer_ticket`) es deliberadamente ligero — Regla 15: EXACTAMENTE 5 campos
escalares, sin líneas.

F12.10 cierra ese hueco con un contrato NUEVO (el 30) y cablea la hidratación
end-to-end:

```
Contrato 30 (backend)  →  cliente  →  hook  →  handler
GET /pos/tickets/{id}/items   leerLineas   hidratarLineas   recuperarCuentaAlCarrito
```

### Archivos

| Archivo | Rol | Cambio |
|---|---|---|
| `apps/api/schemas.py` | Esquema `LineasTicketSalida` (salida del contrato 30) | +1 clase |
| `apps/api/routers/pos.py` | Endpoint `GET /pos/tickets/{id}/items` (contrato 30) | +1 endpoint |
| `apps/api/contracts/registry.py` | Declaración del contrato 30 + conteo 30→31 | +1 contrato |
| `apps/api/tests/test_f12_10_leer_lineas.py` | La puerta de backend (5 criterios) | nuevo |
| `apps/api/tests/test_f2_frontera.py` | Frontera: `LOS_31_CONTRATOS` + proveedor POS | actualizado |
| `apps/pos/src/api/client.js` | `leerLineas(ticketId)` | +1 función |
| `apps/pos/src/hooks/useCart.js` | `hidratarLineas(lineas, version)` | +1 función |
| `apps/pos/src/RetailVisionPOS.jsx` | `recuperarCuentaAlCarrito` async | reescrito |
| `apps/pos/src/RetailVisionPOS.f12_10.test.jsx` | La puerta de componente (5 criterios) | nuevo |
| `apps/pos/src/RetailVisionPOS.f12_5.test.jsx` | Mock de `leerLineas` (contrato 30) | actualizado |

---

## 2. Decisión de diseño

### 2.1 Un contrato NUEVO, no engordar el contrato 21 (Regla 15)

La tentación era añadir `lineas` al contrato 21 (`pos.leer_ticket`). Se descartó:
la Regla 15 fija que la lectura ligera devuelve EXACTAMENTE 5 campos escalares. La
lectura de líneas es una **operación distinta** y merece su **propio contrato**
(A-02: ningún endpoint existe sin contrato). El contrato 30 es
`pos.leer_lineas` → `GET /pos/tickets/{id}/items`.

### 2.2 El contrato 30 devuelve una PROYECCIÓN, no una tabla (O-23)

`LineasTicketSalida` expone `{ ticket_id, version, total, lineas }`, donde cada
línea es una `LineaAtomicaSalida` (5 campos: `item_id`, `product_id`, `quantity`,
`unit_price`, `subtotal`). **Nunca** se expone la tabla `ticket_items` cruda. El
`tabla_expuesta` del contrato 30 es `None`.

### 2.3 La versión viaja con las líneas (RN-25)

El contrato 30 devuelve la `version` del ticket junto con las líneas. El handler
la adopta (`hidratarLineas(lineas, version)`), de modo que el carrito queda con la
versión **fresca** y la concurrencia optimista (RN-25) sigue siendo correcta tras
recuperar. No se usa la `version` de la proyección ligera del pizarrón.

### 2.4 El handler decide con `esOk`, nunca con try/catch

`recuperarCuentaAlCarrito` usa el contrato `{ outcome, reason }`:

```js
const resultado = await aOutcome(() => api.leerLineas(cuenta.id));
if (!esOk(resultado)) {
  setBanner({ tipo: 'error', mensaje: `No se pudo recuperar la cuenta: ${resultado.reason || 'error'}` });
  return;
}
const datos = resultado.data || {};
carrito.hidratarLineas(datos.lineas, datos.version);
setTicketId(cuenta.id);
setPizarronAbierto(false);
```

Si el contrato 30 falla, el pizarrón **NO** se cierra y el POS **NO** se tumba: se
avisa por banner persistente (Regla 19).

### 2.5 `hidratarLineas` normaliza (defensa en profundidad)

`hidratarLineas` normaliza cada línea (`Number(...)`, `?? null`) y tolera una
entrada no-array (`Array.isArray(...) ? ... : []`). Solo adopta la `version` si es
un entero ≥ 0. Devuelve `{ outcome: 'ok', ... }` para ser consistente con el resto
del hook.

### 2.6 La hidratación es una operación del carrito, no del pizarrón

`hidratarLineas` vive en `useCart` (el dueño del estado del carrito), no en el
pizarrón. El pizarrón solo reporta la cuenta elegida; el handler de la pantalla
orquesta la lectura (contrato 30) y la hidratación. Esto respeta la cadena
vertical: cada capa conoce solo a la inmediata inferior.

---

## 3. La puerta de backend (5 criterios)

`apps/api/tests/test_f12_10_leer_lineas.py` — **5/5 en verde**.

| # | Criterio | Qué verifica |
|---|---|---|
| 1 | Contrato 30 declarado | `pos.leer_lineas` existe en el registro (frontera A-02) |
| 2 | Devuelve las líneas del ticket | La proyección incluye las líneas (no la tabla) |
| 3 | Devuelve `version` y `total` | RN-25: la versión fresca viaja con las líneas |
| 4 | Ticket inexistente → 404 | `_ticket_con_items_o_404` responde 404 |
| 5 | Ticket vacío → lista vacía | Un ticket sin líneas devuelve `lineas: []`, no 404 |

## 4. La puerta de componente (5 criterios)

`apps/pos/src/RetailVisionPOS.f12_10.test.jsx` — **5/5 en verde**.

| # | Criterio | Qué verifica |
|---|---|---|
| 1 | Recuperar llama al contrato 30 | `leerLineas('cuenta-1')` se invoca al recuperar |
| 2 | Las líneas hidratan el carrito | El `SalesReceipt` pinta los productos recuperados |
| 3 | El total refleja las líneas | El total del carrito muestra `45.50` |
| 4 | Recuperar cierra el pizarrón | El diálogo desaparece tras hidratar |
| 5 | Un fallo del contrato 30 no tumba el POS | El catálogo sigue vivo + banner de error |

---

## 5. Por qué existe esta compuerta (18ª instancia de §10.6)

§10.6 documenta las lecciones por **clase de fallo**. F12.10 es la **18ª instancia**
y pertenece a la clase **"de adentro hacia afuera"**: el flujo se probó de la
superficie hacia adentro (el pizarrón recupera, el handler adopta la identidad),
pero **nadie probó la hidratación del carrito** porque **no existía el contrato**
que la hiciera posible.

La lección: **un flujo que "funciona" puede estar incompleto si su contrato no
existe**. El pizarrón "funcionaba" (recuperaba la identidad), pero el carrito
quedaba vacío. La frontera por contratos (A-02) es lo que hace **visible** ese
hueco: al exigir que toda operación tenga contrato, la ausencia del contrato de
lectura de líneas se vuelve un hueco declarado, no un bug silencioso.

### Las 18 instancias (contexto)

| # | Fase | Clase de fallo |
|---|---|---|
| 13 | F12.5 | Componente existía pero era inalcanzable |
| 14 | F12.6 | … |
| 15 | F12.8 | … |
| 16 | F12.9 | Un botón conflacionaba DOS operaciones |
| 17 | F12.9.1 | El esquema asumía el flujo inverso |
| **18** | **F12.10** | **Recuperar adoptaba identidad pero no hidrataba el carrito (hueco A-02)** |

---

## 6. Verificación

```
Backend (Docker):
  pytest tests/test_f12_10_leer_lineas.py tests/test_f2_frontera.py -q
  → 9 passed

Componente (Vitest):
  npx vitest run src/RetailVisionPOS.f12_10.test.jsx
  → 5 passed

CI completo (npm run ci desde NUEVO-POS):
  lint OK (0 errores) · vitest PASA · pytest PASA · guards 7/7 OK
  → TODOS LOS TESTS EN VERDE
```

---

## 7. Estado

✅ **CERRADA.** El hueco A-02 de la lectura de líneas queda cerrado. Recuperar una
cuenta desde el pizarrón ahora hidrata el carrito con sus líneas (contrato 30) y
adopta la versión fresca (RN-25). El conteo de contratos sube a **31**.
