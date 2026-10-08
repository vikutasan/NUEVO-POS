# FICHA F12.21 — Revisión pre-cobro del pedido + impresión de doble copia

**Estado:** COMPLETA
**Fecha:** 2026-10-08
**Origen:** Reporte del usuario — *"esa parte de ver el ticket de pedido antes de cobrar
para confirmar los datos con el cliente antes de cobrar y lo de imprimir ticket cliente y
ticket negocio, ahora quise cobrar un pedido y nada de esto es visible"*.

---

## 1. Problema reportado

Al cobrar un **PEDIDO** en el nuevo POS, el cajero no podía:

1. **Revisar los datos del pedido antes de cobrar** para confirmarlos con el cliente
   (nombre, teléfono, tipo de entrega, empaque, fecha compromiso, notas).
2. **Imprimir las dos copias** del ticket (copia CLIENTE + copia NEGOCIO) que el POS
   viejo sí entregaba al cobrar un pedido.

En el POS viejo ambos comportamientos existían y estaban integrados en el flujo de cobro.
En el nuevo POS el `CheckoutScreen` recibía **solo** `total`, `onConfirmar`, `onCancelar`,
`procesando`, `error` y `montoMinimo` — es decir, **no conocía el pedido**. Y el cobro
(`confirmarCobro`) no disparaba ninguna impresión.

## 2. Causa raíz

| # | Hueco | Detalle |
|---|-------|---------|
| A | `CheckoutScreen` no recibía el pedido | La firma no incluía `orderData` ni las líneas; el panel de revisión no existía. |
| B | El cobro no imprimía | `confirmarCobro` cerraba el checkout y abría el panel de entrega, pero nunca llamaba a `imprimirTicket`. |
| C | `TicketSalida` no exponía `order_*` | El backend devolvía el ticket cobrado **sin** `order_type` ni el resto de campos del pedido, así que el frontend no podía decidir si era un PEDIDO ni alimentar la plantilla de doble copia. |

El hueco **C** era el bloqueante silencioso: aunque se hubiera añadido la impresión,
`pagado.data.order_type` habría sido `undefined` y la doble copia **nunca** se habría
disparado.

## 3. Cambios implementados

### 3.1 Backend — proyección del pedido en el ticket (hueco C)

**`apps/api/schemas.py`** — `TicketSalida` ahora expone los 8 campos del pedido:

```python
    order_type: str = "VENTA_DIRECTA"
    delivery_type: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    committed_at: datetime | None = None
    packaging_type: str | None = None
    delivery_address: str | None = None
    order_notes: str | None = None
```

**`apps/api/routers/pos.py`** — `_ticket_a_salida` proyecta esos campos desde la fila
`Ticket` (proyección explícita, nunca `SELECT *` — O-23):

```python
        order_type=ticket.order_type,
        delivery_type=ticket.delivery_type,
        customer_name=ticket.customer_name,
        customer_phone=ticket.customer_phone,
        committed_at=ticket.committed_at,
        packaging_type=ticket.packaging_type,
        delivery_address=ticket.delivery_address,
        order_notes=ticket.order_notes,
```

Esto beneficia a **todos** los endpoints que devuelven `TicketSalida` (crear, cobrar,
actualizar pedido), no solo al cobro.

### 3.2 Frontend — panel de revisión pre-cobro (hueco A)

**`apps/pos/src/components/CheckoutScreen.jsx`**

- Firma ampliada:

```jsx
export default function CheckoutScreen({
  total,
  onConfirmar,
  onCancelar,
  procesando,
  error,
  montoMinimo,
  orderData = null,
  lineas = [],
}) {
  const esPedido = Boolean(orderData && orderData.order_type === 'PEDIDO');
```

- Helpers nuevos: `etiquetaEntrega`, `etiquetaEmpaque`, `formatearFechaHora` y el
  componente `OrderDetailRow`.
- El modal se ensancha a `max-w-[1400px]` y el título cambia a **"Cobrar pedido"** cuando
  `esPedido`.
- Se inserta el panel **"Confirmar con el Cliente"** entre la columna principal y la
  lateral, con: cliente, teléfono, tipo de entrega, empaque, fecha compromiso, dirección
  (si aplica) y notas.

**`apps/pos/src/RetailVisionPOS.jsx`** — se pasan las props al modal:

```jsx
orderData={bloquePedido}
lineas={carrito.lineas}
```

### 3.3 Frontend — impresión automática de doble copia (hueco B)

**`apps/pos/src/RetailVisionPOS.jsx`** — imports nuevos:

```jsx
import { imprimirTicket } from './services/printService.js';
import { generarTicketHTML, combinarCopiasPedido } from './utils/ticketGenerator.js';
```

Y en `confirmarCobro`, tras un cobro exitoso y **antes** de limpiar el carrito:

```jsx
const ticketCobrado = pagado.data;
if (ticketCobrado) {
  const esPedidoCobrado = ticketCobrado.order_type === 'PEDIDO';
  const html = esPedidoCobrado
    ? combinarCopiasPedido(ticketCobrado)
    : generarTicketHTML(ticketCobrado);
  const impresion = imprimirTicket(html);
  if (!impresion || impresion.outcome !== 'ok') {
    setBanner({
      tipo: 'aviso',
      mensaje:
        'La venta se cobró, pero no se pudo imprimir el ticket. Usa "Imprimir" en el paso de entrega.',
    });
  }
}
```

- **PEDIDO** → `combinarCopiasPedido` (copia CLIENTE + copia NEGOCIO en un solo trabajo).
- **VENTA_DIRECTA** → `generarTicketHTML` (una sola copia, comportamiento previo intacto).
- Si la impresión falla, **la venta NO se revierte** (RN-87: imprimir siempre está
  disponible); se avisa al cajero y el panel de entrega sigue ofreciendo "Imprimir".

### 3.4 Corrección de un bug real descubierto por los tests

`CheckoutScreen.jsx` leía `orderData.notes`, pero el campo real del backend es
`order_notes`. Las notas **nunca** se habrían mostrado. Corregido en la condición y en el
valor.

### 3.5 Aislamiento de tests (deuda saldada)

**`apps/api/tests/test_f7_7_terminales.py`** — `_limpiar` borraba `tickets` sin borrar
antes `orders`, lo que provocaba 28 fallos en cascada por FK
(`fk_orders_ticket_id_tickets`) en cuanto existía una fila residual en `orders`. Se añadió
`await db.execute(delete(Order))` **antes** de `TicketItem`, más el import de `Order`.

## 4. Tests

### 4.1 Nuevos

| Archivo | Tests | Qué cubre |
|---------|-------|-----------|
| `apps/pos/src/components/CheckoutScreen.f12_21.test.jsx` | 7 | Panel visible solo con PEDIDO; datos de cliente/entrega/empaque/fecha/notas; no aparece en VENTA_DIRECTA; título "Cobrar pedido". |
| `apps/api/tests/test_f12_21_ticket_salida_pedido.py` | 3 | `TicketSalida` expone `order_type`; default `VENTA_DIRECTA`; el cobro devuelve los `order_*` persistidos. |

### 4.2 Suites completas

| Suite | Resultado |
|-------|-----------|
| Backend | **330 passed** |
| Frontend | **780 passed (68 files)** |

## 5. Archivos tocados

| Archivo | Cambio |
|---------|--------|
| `apps/api/schemas.py` | +8 campos `order_*` en `TicketSalida` |
| `apps/api/routers/pos.py` | `_ticket_a_salida` proyecta los 8 campos |
| `apps/api/tests/test_f7_7_terminales.py` | `_limpiar` borra `Order` antes de `TicketItem` |
| `apps/api/tests/test_f12_21_ticket_salida_pedido.py` | **nuevo** — 3 tests |
| `apps/pos/src/components/CheckoutScreen.jsx` | panel pre-cobro + fix `order_notes` |
| `apps/pos/src/components/CheckoutScreen.f12_21.test.jsx` | **nuevo** — 7 tests |
| `apps/pos/src/RetailVisionPOS.jsx` | props al modal + impresión automática |

## 6. Reglas de negocio respetadas

- **RN-23** — no se modifica un ticket PAID (la impresión es posterior al cobro, solo lectura).
- **RN-25 / RN-27** — la concurrencia optimista del ticket no se altera.
- **RN-87** — imprimir siempre está disponible; un fallo de impresión no tumba la venta.
- **O-23** — proyección explícita de columnas, nunca `SELECT *`.

## 7. Cómo verificarlo

1. Programar un ticket como **PEDIDO** (modal de programación) y pulsar **Cobrar**.
2. El modal debe titularse **"Cobrar pedido"** y mostrar el panel **"Confirmar con el
   Cliente"** con los datos capturados.
3. Al confirmar el cobro, debe salir **un solo trabajo de impresión** con dos copias
   (CLIENTE + NEGOCIO).
4. Cobrar una **VENTA_DIRECTA** normal: sin panel de pedido y con **una sola copia**.
