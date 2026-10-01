# FICHA F12.2 — Ticket de PEDIDO: plantilla completa + doble copia (CLIENTE + COMERCIO)

> **Fase:** F12 — Portar funcionalidades puntuales del POS viejo (una por una).
> **Sub-fase:** F12.2 — Plantilla de PEDIDO + doble copia.
> **Estado:** ✅ CERRADA.
> **Fecha:** 01 Oct 2026.
> **Commit:** `c662841` (NUEVO-POS).
> **Repositorio:** NUEVO-POS.

---

## 1. El pedido del usuario

> *"En el viejo POS se dispuso que al cobrar un PEDIDO el ticket se imprimía DOBLE
> (copia CLIENTE y copia NEGOCIO) y el ticket del cliente era para recoger el pedido
> y la copia negocio era para tener un respaldo físico por si caía el sistema.
> ¿Puedes revisar que el nuevo POS también tenga esta funcionalidad?"*

Y, tras el diagnóstico:

> *"Le invertí tiempo y esfuerzo a diseñar la estructura con la que salen estos tickets
> impresos, ¿esta estructura se respetará?"*

> *"OK, PROCEDE."*

---

## 2. El ciclo de 6 pasos (F12)

### 2.1 Detectar

El viejo POS imprime el ticket de un PEDIDO **dos veces**:

| Copia | Para qué sirve |
|-------|----------------|
| **CLIENTE** | El cliente la usa para recoger/recibir el pedido. |
| **COMERCIO** | Respaldo físico del negocio por si cae el sistema. |

Y el ticket de un PEDIDO lleva una **sección propia** que la venta directa no tiene:

```
*** DATOS DEL PEDIDO ***
CLIENTE:  María López
TIPO:     🏪 RECOLECCIÓN (PICKUP)   |   🚗 ENTREGA A DOMICILIO
ENTREGA:  jue 01 oct, 02:00 p.m.
EMPAQUE:  🛍️ TRAE SU EMPAQUE        |   📦 EMPAQUE PAGADO
DIRECCIÓN: Av. Reforma 123, Col. Centro   (solo DELIVERY)
NOTAS:    Sin nueces, por favor
PAGADO - PENDIENTE DE RECOLECCION   |   PAGADO - PENDIENTE DE ENTREGA
--- COPIA: CLIENTE ---              (rótulo de copia)
```

### 2.2 Verificar (contra los archivos reales — REGLA DURA 2 / E-19)

**El ORACLE (viejo POS):**

- [`apps/pos/utils/ticketGenerator.js`](../../../apps/pos/utils/ticketGenerator.js:6) —
  `generateTicketHTML(ticketData, copyLabel = null)` con la sección de PEDIDO en
  las líneas 142-189.
- [`apps/pos/utils/ticketGenerator.js`](../../../apps/pos/utils/ticketGenerator.js:217) —
  `combineOrderTicketsForPrint(ticketData)` (la doble copia).
- [`apps/pos/hooks/useTicketActions.js`](../../../apps/pos/hooks/useTicketActions.js:87) —
  el disparador:
  ```js
  const html = (activeTicket.order_type === 'PEDIDO')
    ? combineOrderTicketsForPrint(activeTicket)
    : generateTicketHTML(activeTicket);
  ```

**El nuevo POS (antes de F12.2):**

- `generarTicketHTML` **NO tenía** ninguna rama `order_type === 'PEDIDO'`.
- **No existía** `combinarCopiasPedido`.
- `TicketDeliveryPanel` imprimía **siempre** una sola copia.

### 2.3 Clasificar

**OMITIDA** — la 10ª instancia de la clase de fallo §10.6
(*"el inventario de componentes no ve la PARIDAD DE OPERACIÓN"*).

La omisión era **mayor** que la doble copia: faltaba la **sección entera**
`*** DATOS DEL PEDIDO ***`. La compuerta F6.0 no lo detectó porque **solo probaba
un ticket genérico**, nunca uno con `order_type: 'PEDIDO'`.

### 2.4 Adaptar

**`apps/pos/src/utils/ticketGenerator.js`** (424 líneas):

- `fechaEntregaProgramada(instante)` — formatea la fecha de entrega (es-MX, corta);
  devuelve `'---'` si el instante es inválido. Nunca lanza.
- `filaPedido(etiqueta, valor)` — una fila etiqueta/valor de la sección.
- `seccionDatosPedido(ticket, copyLabel)` — la sección completa. Devuelve `''`
  si `ticket.order_type !== 'PEDIDO'`. Lee `ticket.delivery_address` y
  `ticket.committed_at` (los nombres reales del nuevo POS).
- `generarTicketHTML(ticket = {}, copyLabel = null)` — incluye
  `${seccionDatosPedido(ticket, copyLabel)}`.
- `combinarCopiasPedido(ticket = {})` — genera CLIENTE + COMERCIO, extrae el
  `<body>` de cada una y las envuelve en `.ticket-copy`.
- CSS: `.ticket-copy { page-break-after: always; }` +
  `.ticket-copy:last-child { page-break-after: auto; }`.
- Export por defecto: `{ generarTicketHTML, generarCorteHTML, combinarCopiasPedido }`.

**`apps/pos/src/components/TicketDeliveryPanel.jsx`**:

- Import: `import { generarTicketHTML, combinarCopiasPedido } from '../utils/ticketGenerator.js';`
- Prop nueva: `generadorDobleCopia = combinarCopiasPedido,`.
- `manejarImprimir` decide según el tipo de ticket:
  ```js
  const html =
    actual.order_type === 'PEDIDO'
      ? generadorDobleCopia(actual)
      : generadorTicket(actual);
  ```
- El arreglo de dependencias incluye `generadorDobleCopia`.

### 2.5 Probar

**Compuerta nueva:** `apps/pos/src/utils/ticketGenerator.f12_2.test.jsx` — **16 tests**.

| # | Criterio |
|---|----------|
| 1 | Un PEDIDO imprime la sección `*** DATOS DEL PEDIDO ***`. |
| 2 | La sección trae CLIENTE, TIPO, ENTREGA y EMPAQUE. |
| 3 | PICKUP → "RECOLECCIÓN" y estado "PENDIENTE DE RECOLECCION". |
| 3b | Empaque PROPIO → "TRAE SU EMPAQUE". |
| 4 | DELIVERY → "ENTREGA A DOMICILIO" y estado "PENDIENTE DE ENTREGA". |
| 4b | DELIVERY → imprime la DIRECCIÓN. |
| 4c | Empaque PAGADO → "EMPAQUE PAGADO". |
| 5 | Las NOTAS del pedido se imprimen. |
| 5b | Sin NOTAS → no aparece la fila de NOTAS. |
| 6 | Una VENTA DIRECTA NO imprime la sección de pedido. |
| 6b | Un ticket sin `order_type` tampoco. |
| 7 | `combinarCopiasPedido` produce DOS copias: CLIENTE y COMERCIO. |
| 7b | La doble copia trae DOS secciones `DATOS DEL PEDIDO`. |
| 8 | La doble copia separa las copias con salto de página (`.ticket-copy`). |
| 9 | El documento es térmico y autocontenido (sin recursos externos). |
| 9b | `combinarCopiasPedido` sin argumentos no rompe. |

**Resultado:**

- Compuerta F12.2: **16/16 en verde**.
- Suite completa del POS: **51 archivos / 589 tests en verde** (antes: 50/573).
- CI completo (`npm run ci`): lint OK, tests Node + Vitest + pytest OK,
  guardianes F0 / F4-A-04 / F5-R-01 OK.

> **Nota de verificación (E-19):** la primera corrida falló el criterio 4b porque
> el test usaba `address` y `scheduled_at`, pero el generador lee
> `delivery_address` y `committed_at`. Se corrigió el test para usar los nombres
> reales. La implementación era correcta; el test estaba mal.

### 2.6 Ficha + commit

Esta ficha. El hash real se registra en un commit de seguimiento (patrón ficha-hash).

---

## 3. La lección (10ª instancia de §10.6)

> **"El inventario de componentes no ve la PARIDAD DE OPERACIÓN."**

El nuevo POS tenía `generarTicketHTML` y su compuerta F6.0 en verde. Pero la
compuerta **solo probaba un ticket genérico**: nunca un `order_type: 'PEDIDO'`.
Por eso la sección entera y la doble copia pasaron desapercibidas.

**Regla derivada:** cuando una funcionalidad tiene una **variante de operación**
(PEDIDO vs. VENTA DIRECTA), la compuerta debe probar **cada variante**, no solo
la ruta feliz genérica.

---

## 4. Archivos tocados

| Archivo | Cambio |
|---------|--------|
| `apps/pos/src/utils/ticketGenerator.js` | Sección DATOS DEL PEDIDO + `copyLabel` + `combinarCopiasPedido` + CSS + export. |
| `apps/pos/src/components/TicketDeliveryPanel.jsx` | Import + prop `generadorDobleCopia` + `manejarImprimir` condicional. |
| `apps/pos/src/utils/ticketGenerator.f12_2.test.jsx` | **Nuevo** — compuerta F12.2 (16 tests). |
| `docs/05-plan-de-construccion/FICHA_F12_2_TICKET_PEDIDO_DOBLE_COPIA.md` | **Nuevo** — esta ficha. |

---

## 5. Trazabilidad

- **§6.8** — la UX heredada del viejo POS: la INTEGRACIÓN se hereda, la
  IMPLEMENTACIÓN se reescribe.
- **§10.6.5** — heredar la integración no basta; hay que heredar la **operación**.
- **REGLA DURA 2 / E-19** — "Verificar, no asumir".
- **RN-87** — el ticket impreso SIEMPRE está disponible (Imprimir nunca se deshabilita).
