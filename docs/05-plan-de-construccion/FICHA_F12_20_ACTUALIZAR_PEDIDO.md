# FICHA F12.20 — Actualización de pedido (contrato 31)

**Fase:** 12.20
**Estado:** CERRADA
**Commit:** `60a9851` (push a `main` — `09246a5..60a9851`)
**Contrato:** 31 — `pos.actualizar_pedido` — `PATCH /pos/tickets/{id}/order`

---

## 1. El problema (bug real de negocio)

El flujo real del POS es **"productos primero, pedido después"**:

1. El cajero agrega productos → `agregarProducto` → `asegurarTicket()` crea el
   ticket como `VENTA_DIRECTA` (sin bloque de pedido).
2. Después abre el modal 📌 y llama a `guardarPedido(bloque)`.

Como `ticketIdRef.current` **ya existía**, `guardarPedido` solo actualizaba el
estado local y **nunca persistía** los campos `order_*`. Resultado: el
`order_type` del ticket se quedaba en `VENTA_DIRECTA`, así que su post-it en el
pizarrón se veía **idéntico al de una cuenta normal** (sin badge de PEDIDO, sin
línea de entrega).

**Causa raíz:** no existía un endpoint para actualizar los campos de pedido de un
ticket ya creado. El único camino era `POST /pos/tickets` (creación), que ya no
aplica cuando el ticket existe.

---

## 2. La solución (Ruta A — aprobada por el usuario)

Crear un endpoint **PATCH** dedicado (contrato 31) y llamarlo desde
`guardarPedido`. Esto respeta la regla **A-02** (ningún endpoint sin contrato
declarado) y **O-23** (proyecciones, nunca tablas crudas).

### 2.1 Backend

| Archivo | Cambio |
|---|---|
| [`schemas.py`](../../apps/api/schemas.py) | Nuevo `ActualizarPedidoEntrada` (contrato 31): `version: int = Field(ge=0)` + 9 campos `order_*` opcionales. |
| [`routers/pos.py`](../../apps/api/routers/pos.py) | Nuevo `@router.patch("/tickets/{ticket_id}/order")` → `actualizar_pedido`. |
| [`contracts/registry.py`](../../apps/api/contracts/registry.py) | Contrato 31 declarado (32 contratos en total). |
| [`services/orders_service.py`](../../apps/api/services/orders_service.py) | **Fix real** de `_mapear_estado` (ver §3). |

**Semántica PATCH** (Pydantic v2 `model_fields_set`): solo se aplican los campos
**presentes** en la entrada; un campo **ausente** no se toca. Esto distingue
"no enviado" de "enviado como `null`".

**Validaciones aplicadas en el endpoint:**

- `_ticket_con_items_o_404` → 404 si el ticket no existe.
- `rn23_no_modificar_paid` → 400 si el ticket ya está `PAID` (RN-23).
- `rn25_validar_version` → 409 si `version` está desfasada (RN-25).
- `rn27_incrementar_version` → incrementa `version` en cada escritura (RN-27).
- `db.flush()` → `proyectar_pedido(db, ticket)` → `db.commit()`: la
  re-proyección del pedido (contrato 15) ocurre **en la misma transacción**.
- Devuelve `_ticket_a_salida(ticket)` (`TicketSalida`).

### 2.2 Frontend

| Archivo | Cambio |
|---|---|
| [`api/client.js`](../../apps/pos/src/api/client.js) | `actualizarPedidoTicket(ticketId, cuerpo)` → `PATCH /pos/tickets/{id}/order`. |
| [`services/ordersService.js`](../../apps/pos/src/services/ordersService.js) | `actualizarPedidoDelTicket(ticketId, cuerpo)` con patrón `{outcome, reason, data}` (nunca lanza). |
| [`RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx) | `guardarPedido` reescrito: si el ticket ya existe, llama al PATCH con `version` del carrito (RN-25). |

---

## 3. Hallazgo F12.20 — bug real en `_mapear_estado`

Al escribir el test de re-proyección apareció un **segundo bug, más profundo**:

```
{"detail":"Estado de pedido inválido: TENTATIVO","regla":"RN-69"}
```

`orders_service._mapear_estado` mapeaba `OPEN → "TENTATIVO"`, pero **`TENTATIVO`
NO es uno de los 14 estados válidos de RN-69**:

> `PENDIENTE, CONFIRMADO, EN_PREPARACION, LISTO, EN_RUTA, ENTREGADO, CANCELADO,
> DEVUELTO, REPROGRAMADO, EN_ESPERA, PARCIAL, FACTURADO, PAGADO, ARCHIVADO`

`rn69_catorce_estados("TENTATIVO")` lanzaba `ReglaViolada` (400), así que la
proyección de **cualquier** ticket `OPEN` bajo política `SIN_PAGO`/`ANTICIPO`
fallaba. El estado correcto para un pedido recién proyectado y aún no confirmado
es **`PENDIENTE`** (el mismo que usa `rn67_ticket_a_pedido`).

**Fix:**

```python
def _mapear_estado(status_ticket: str) -> str:
    if status_ticket == "PAID":
        return rn69_catorce_estados("PAGADO")
    return rn69_catorce_estados("PENDIENTE")
```

---

## 4. Verificación

### 4.1 Test dedicado — `test_f12_20_actualizar_pedido.py` (7/7 PASSED)

| Test | Criterio |
|---|---|
| `test_contrato_31_declarado` | El contrato 31 existe con firma y operación correctas. |
| `test_actualizar_pedido_persiste_order_type` | Tras el PATCH, el ticket queda con `order_type=PEDIDO` en la tabla. |
| `test_actualizar_pedido_reproyecta_el_pedido` | Bajo política `SIN_PAGO`, nace la fila en `orders` (contrato 15). |
| `test_actualizar_pedido_semantica_patch` | Un campo **ausente** no se toca; solo se aplican los presentes. |
| `test_actualizar_pedido_version_conflict` | `version` desfasada → 409 (RN-25) y **no** modifica el ticket. |
| `test_actualizar_pedido_ticket_paid` | Ticket ya cobrado → 400 (RN-23). |
| `test_actualizar_pedido_ticket_inexistente` | Ticket inexistente → 404. |

### 4.2 Suites completas

- **Backend:** `327 passed` (`docker compose exec -T api python -m pytest -q`).
- **Frontend:** `773 passed` (`npm run test -- --run`).

### 4.3 Guard de frontera

`test_f2_frontera.py` actualizado a **32 contratos**:

- `test_criterio2_hay_exactamente_32_contratos` (antes 31).
- `LOS_32_CONTRATOS` incluye `pos.actualizar_pedido`.
- `test_criterio3_el_pos_es_proveedor_en_sus_contratos` incluye
  `pos.actualizar_pedido` en la lista de contratos provistos por el POS.

### 4.4 Verificación en base de datos

La columna `tickets.order_type` existe con `NOT NULL DEFAULT 'VENTA_DIRECTA'`
(confirmado con `\d tickets`). La persistencia a `PEDIDO` queda asegurada por
`test_actualizar_pedido_persiste_order_type`.

---

## 5. Archivos tocados

```
apps/api/contracts/registry.py          | 65 ++++++++++++++++++++++++++-
apps/api/routers/pos.py                 | 81 ++++++++++++++++++++++++++++++++++
apps/api/schemas.py                     | 40 +++++++++++++++++
apps/api/services/orders_service.py     | 13 +++++-
apps/api/tests/test_f2_frontera.py      | 24 ++++++----
apps/api/tests/test_f12_20_actualizar_pedido.py | (nuevo, 488 líneas)
apps/pos/src/RetailVisionPOS.jsx        | 60 ++++++++++++++++++++++---
apps/pos/src/api/client.js              | 23 ++++++++++
apps/pos/src/services/ordersService.js  | 29 ++++++++++++
```

---

## 6. Resultado

Un pedido tentativo creado con el flujo "productos primero, pedido después"
ahora **persiste** su `order_type=PEDIDO` y su bloque de entrega, por lo que su
post-it en el pizarrón se distingue correctamente de una cuenta normal. De paso
se corrigió un bug latente que rompía la proyección de **cualquier** ticket
`OPEN` bajo política `SIN_PAGO`/`ANTICIPO`.
