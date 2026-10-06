# FICHA F12.18 — Recuperar una cuenta del pizarrón y enviarla disparaba el modal (BUG de runtime)

> **Sub-fase:** 12.18 — `verificar_envio` acepta la cuenta recuperada (doble prueba: ledger O `ticket_items`)
> **Fase:** 12 — Portar funcionalidades del POS viejo al POS nuevo
> **Estado:** ✅ CERRADA — **BUG CORREGIDO** (bloqueaba ENVIAR CUENTA tras recuperar del pizarrón)
> **Fecha:** 2026-10-06
> **Commit:** _(pendiente — se registra al cerrar)_
> **Plan rector:** contrato 22 (verificación post-envío) + contrato 30 (lectura de líneas) + contrato 18 (idempotencia por `item_id`) + Regla 15 (proyección de campos escalares) + RN-25 (bloqueo optimista)

---

## 1. Síntoma reportado (runtime, no test)

Tras cerrar F12.17, el dueño del proyecto reportó un flujo específico:

> "si invoco una cuenta del pizarrón y luego la quiero enviar me sale nuevamente el modal"

Es decir: **recuperar** una cuenta desde el pizarrón (F5.3 / F12.10) y luego pulsar
**ENVIAR CUENTA** volvía a mostrar:

> **No se pudo completar**
> No se pudo enviar: hay productos sin guardar en el servidor. Verifique la conexión WiFi.

F12.17 corrigió el 409 de las acciones de línea (añadir/cambiar/quitar). **Este es un
bug DISTINTO**, en la ruta de **recuperación**, no en la de captura.

---

## 2. Diagnóstico (verificado con evidencia, no asumido)

### 2.1 La verificación post-envío (contrato 22)

`clearCart` (en `useCart.js`) envía a `verificar_envio` los `item_id` de las líneas del
carrito:

```js
const ids = lineasRef.current.map((l) => l.item_id);
// ...
withRetries(() => cliente.verificarEnvio(idTicket, { item_ids: ids }))
```

Si `faltantes` no está vacío, el carrito **NO** se limpia y se devuelve
`reason: 'items_no_persistidos'` → el modal.

### 2.2 Qué compara `verificar_envio` (tras F12.16)

```python
detalles = dict(ticket.payment_details or {})
persistidos = {str(i) for i in detalles.get("_item_ids", [])}
faltantes = [i for i in entrada.item_ids if i not in persistidos]
```

Compara contra el **ledger de idempotencia** `payment_details["_item_ids"]`.

### 2.3 El ledger SOLO lo escribe `anadir_item`

En `anadir_item` (contrato 18):

```python
item_ids_procesados.append(entrada.item_id)
detalles["_item_ids"] = item_ids_procesados
ticket.payment_details = detalles
```

El ledger guarda la **intención** del cliente (un UUID generado por `nuevoItemId()` en el
frontend). **Ninguna otra vía lo escribe** — ni `crear_ticket` (contrato 3), ni una sesión
anterior, ni el POS viejo.

### 2.4 Qué devuelve `leer_lineas` (contrato 30) al recuperar

`_lineas_atomicas` (en `pos.py`) proyecta las líneas así:

```python
LineaAtomicaSalida(
    item_id=str(item.product_id),   # ← ¡el product_id, NO la intención!
    product_id=item.product_id,
    ...
)
```

El modelo `TicketItem` **no persiste** el `item_id` de intención (deuda D-9), así que el
contrato 30 lo **deriva del `product_id`** de forma determinista.

### 2.5 Causa raíz — incompatibilidad de claves entre las dos rutas

| Ruta | `item_id` que llega a `verificar_envio` | ¿Está en el ledger? |
|---|---|---|
| **Captura** (añadir en esta sesión) | UUID de intención (`nuevoItemId()`) | ✅ Sí |
| **Recuperación** (pizarrón) | `str(product_id)` (contrato 30) | ❌ **Nunca** |

Al recuperar una cuenta:

1. `leerLineas` devuelve líneas con `item_id = str(product_id)`.
2. `hidratarLineas` instala esos `product_id` como `item_id` del carrito.
3. Al enviar, `clearCart` manda `item_ids = [product_id, ...]`.
4. `verificar_envio` los busca en el ledger — que contiene **UUIDs de intención**, no
   `product_id`s.
5. **Ninguno coincide** → `faltantes` = toda la cuenta → el modal.

F12.16 fue correcto al comparar contra el ledger (en vez de contra `product_id`), pero
dejó fuera la ruta de recuperación, donde la clave **es** el `product_id`.

---

## 3. Corrección

`verificar_envio` ahora usa una **prueba doble**: un `item_id` está persistido si

- **(a)** está en el ledger de idempotencia `payment_details["_item_ids"]` (ítems añadidos
  en esta sesión), **O**
- **(b)** coincide con el `product_id` de una línea REAL en `ticket_items` (ítems
  recuperados del pizarrón).

```python
detalles = dict(ticket.payment_details or {})
ledger = {str(i) for i in detalles.get("_item_ids", [])}
# (b) F12.18 — `product_id` de las líneas REALES del ticket.
product_ids_reales = {str(item.product_id) for item in ticket.items}

def _persistido(item_id: str) -> bool:
    return item_id in ledger or item_id in product_ids_reales

item_ids_persistidos = [i for i in entrada.item_ids if _persistido(i)]
faltantes = [i for i in entrada.item_ids if not _persistido(i)]
```

Ambas son **pruebas de existencia en la BD**; ninguna escribe. El endpoint sigue siendo de
**solo lectura** (contrato 22). Un `item_id` fantasma (que no está ni en el ledger ni en
`ticket_items`) sigue reportándose como faltante.

---

## 4. Verificación

### 4.1 Test de puerta (backend)

`test_verificacion_cuenta_recuperada_del_pizarron` en `tests/test_f3_atomico.py`:

1. Crea un ticket con una línea REAL vía contrato 3 (esta vía **NO** escribe el ledger).
2. Lee las líneas por contrato 30 y comprueba que `item_id == str(product_id)`.
3. Verifica con ese `item_id` y exige `faltantes == []`.

Sin el fix, este test falla (el ítem se reporta como faltante). Con el fix, pasa.

### 4.2 Suites completas

| Suite | Resultado |
|---|---|
| Backend (`pytest tests/ -q`) | **290 passed** (+1 respecto a F12.17) |
| Frontend (`vitest run`) | **684 passed** (62 archivos) |
| Guardianes (`guards.mjs`) | **7/7 VERDE** |

El test de F12.16 (`test_verificacion_post_envio`) sigue pasando: la rama (a) del ledger
se conserva intacta.

---

## 5. Lecciones

1. **Una verificación de "existe en la BD" debe probar contra la BD, no contra un
   subconjunto de ella.** El ledger de idempotencia es un *índice auxiliar* de las
   intenciones de ESTA sesión; no es la fuente de verdad de qué líneas existen. La fuente
   de verdad es `ticket_items`.
2. **Las claves de identidad deben ser coherentes entre contratos.** El contrato 18 usa
   UUIDs de intención; el contrato 30 devuelve `product_id`. Mientras D-9 no se cierre
   (columna `item_id` en `ticket_items`), cualquier comparación entre ambos debe tolerar
   las dos formas.
3. **Un fix de comparación puede arreglar una ruta y romper otra.** F12.16 arregló la ruta
   de captura; F12.18 arregló la de recuperación. La prueba doble cubre ambas.
4. **El síntoma (el modal) reaparece por causas distintas.** F12.17 y F12.18 producen el
   MISMO modal desde rutas diferentes. No basta con "el modal ya no sale en mi prueba":
   hay que recorrer TODAS las rutas que llegan a `clearCart`.

---

## 6. Archivos tocados

| Archivo | Cambio |
|---|---|
| `apps/api/routers/pos.py` | `verificar_envio` — prueba doble (ledger O `ticket_items`) |
| `apps/api/tests/test_f3_atomico.py` | + `test_verificacion_cuenta_recuperada_del_pizarron` |
| `docs/05-plan-de-construccion/FICHA_F12_18_VERIFY_CUENTA_RECUPERADA.md` | Esta ficha |
