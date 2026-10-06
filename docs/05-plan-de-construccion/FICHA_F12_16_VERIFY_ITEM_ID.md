# FICHA F12.16 — `verificar_envio` comparaba `item_id` contra `product_id` (BUG de runtime)

> **Sub-fase:** 12.16 — corrección del contrato 22 (verificación post-envío)
> **Fase:** 12 — Portar funcionalidades del POS viejo al POS nuevo
> **Estado:** ✅ CERRADA — **BUG CORREGIDO** (bloqueaba ENVIAR CUENTA con `items_no_persistidos`)
> **Fecha:** 2026-10-06
> **Commit:** `PENDIENTE` — F12.16: corregir verificación post-envío (comparar contra el ledger de idempotencia, no contra product_id)
> **Plan rector:** REGLA DURA 2 ("verificar, no asumir") + contrato 18 (idempotencia por `item_id`) + contrato 22 (verificación post-envío) + §6.8

---

## 1. Síntoma reportado (runtime, no test)

Al pulsar **ENVIAR CUENTA** en el POS nuevo, aparecía el modal:

> **No se pudo completar**
> No se pudo enviar: hay productos sin guardar en el servidor. Verifique la conexión WiFi.

El mensaje proviene de [`RetailVisionPOS.jsx`](../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx:777), en
`enviarCuentaAlPizarron`, cuando `carrito.clearCart()` devuelve
`{ outcome: 'error', reason: 'items_no_persistidos' }`.

**La conexión WiFi era correcta.** El error era un **falso positivo** del backend.

---

## 2. Causa raíz (verificada, no asumida)

`clearCart` ([`useCart.js:229-237`](../NUEVO-POS/apps/pos/src/hooks/useCart.js:229)) llama al
contrato 22 (`POST /pos/tickets/{id}/verify`) y, si `faltantes.length > 0`, **NO limpia el
carrito** y devuelve `items_no_persistidos`. Es la Prohibición #2 (cicatriz v6.1 $453): no
limpiar el carrito si la verificación no confirma que TODO llegó al servidor.

El backend, en [`pos.py`](../NUEVO-POS/apps/api/routers/pos.py:664), comparaba:

```python
persistidos = {str(i.product_id) for i in ticket.items}   # ← product_id
item_ids_persistidos = [i for i in entrada.item_ids if i in persistidos]
faltantes = [i for i in entrada.item_ids if i not in persistidos]
```

Pero el cliente envía **`item_id`** — la **INTENCIÓN de escritura** del contrato 18 — no el
`product_id`. En [`anadir_item`](../NUEVO-POS/apps/api/routers/pos.py:493-531), el `item_id`
se registra en el **ledger de idempotencia** `payment_details["_item_ids"]` (JSONB), NO en
`TicketItem.id` ni en `TicketItem.product_id`.

**Consecuencia:** como `item_id` ≠ `product_id` (son UUIDs distintos), **TODOS** los ítems se
marcaban como `faltantes` → `items_no_persistidos` → el carrito nunca se limpiaba → ENVIAR
CUENTA fallaba **siempre**.

### Por qué los tests no lo detectaron

El test existente [`test_f3_atomico.py:280`](../NUEVO-POS/apps/api/tests/test_f3_atomico.py:280)
pasaba `str(p1)` — un **`product_id`** — como `item_id`:

```python
json={"item_ids": [str(p1), "fantasma-999"]},
```

Al coincidir `item_id` con `product_id`, el test **enmascaraba** el bug. El flujo real del
frontend (contrato 18 con `item_id` propio) nunca se ejercitó en el backend.

---

## 3. La corrección

### 3.1 Backend — [`pos.py`](../NUEVO-POS/apps/api/routers/pos.py:655)

Comparar contra el **ledger de idempotencia** (donde `anadir_item` registra el `item_id`):

```python
detalles = dict(ticket.payment_details or {})
persistidos = {str(i) for i in detalles.get("_item_ids", [])}
item_ids_persistidos = [i for i in entrada.item_ids if i in persistidos]
faltantes = [i for i in entrada.item_ids if i not in persistidos]
```

Esto respeta la semántica del contrato 22: "el cliente CREE haber enviado X; el servidor
responde qué de X está realmente persistido". El `item_id` es la unidad de intención del
contrato 18, y el ledger `_item_ids` es su registro fiel.

### 3.2 Test — [`test_f3_atomico.py`](../NUEVO-POS/apps/api/tests/test_f3_atomico.py:267)

Reescrito para usar el **flujo REAL**: crear el ticket vacío (contrato 3) y añadir la línea
vía contrato 18 con un `item_id` explícito, luego verificar. Ahora el test **falla** si se
vuelve a comparar contra `product_id`.

```python
item_id_real = "intencion-abc-123"
# POST /pos/tickets/{id}/items con item_id=item_id_real, product_id=str(p1)
# POST /pos/tickets/{id}/verify con item_ids=[item_id_real, "fantasma-999"]
assert item_id_real in cuerpo["item_ids_persistidos"]
assert "fantasma-999" in cuerpo["faltantes"]
```

---

## 4. Verificación

| Verificación | Resultado |
|---|---|
| `pytest tests/test_f3_atomico.py -q` | ✅ **6 passed** |
| `npm run ci` (lint + test + guards) | ✅ **VERDE** (lint 295 archivos/0 errores; Node 3/3; componentes PASA; API PASA; guards 7/7) |
| `docker compose restart api` | ✅ Aplicado (el contenedor corre sin `--reload`) |

---

## 5. Lecciones (para futuras IAs)

1. **Un test que pasa un `product_id` donde el contrato espera un `item_id` enmascara el bug.**
   Los tests deben ejercitar el **flujo real** (contrato 18 → contrato 22), no atajos que
   coincidan por casualidad con la implementación defectuosa.
2. **El `item_id` es la INTENCIÓN del cliente (contrato 18), no una clave de la tabla.**
   Su registro canónico es `payment_details["_item_ids"]` (deuda D-9: migrará a una columna
   única cuando `ticket_items` la tenga).
3. **REGLA DURA 2 ("verificar, no asumir")** aplica también a los tests: un test verde no
   prueba que el flujo real funcione si el test no reproduce el flujo real.

---

## 6. Archivos tocados

| Archivo | Cambio |
|---|---|
| [`apps/api/routers/pos.py`](../NUEVO-POS/apps/api/routers/pos.py:655) | `verificar_envio` compara contra `payment_details["_item_ids"]` |
| [`apps/api/tests/test_f3_atomico.py`](../NUEVO-POS/apps/api/tests/test_f3_atomico.py:267) | Test reescrito con el flujo real (contrato 18 → 22) |
| `docs/05-plan-de-construccion/FICHA_F12_16_VERIFY_ITEM_ID.md` | Esta ficha |
