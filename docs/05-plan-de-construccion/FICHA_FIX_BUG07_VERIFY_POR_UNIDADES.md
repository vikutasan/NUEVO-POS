# FICHA DE FIX — BUG-07: la verificación post-envío debe ser por UNIDADES, no por número de líneas

**Estado:** ✅ RESUELTO
**Fecha:** 10 Oct 2026
**Terminal reportada:** CAJA (la que se habilita como caja)
**Contrato afectado:** 22 — `POST /pos/tickets/{ticket_id}/verify`
**Regla de negocio en juego:** RN-17 (un producto una vez → el servidor FUSIONA duplicados)

---

## 1. Síntoma reportado por el usuario

> "hice una cuenta regular en cada terminal y todo bien, pero en ti que habilite
> como caja, hice un pedido y apareció el post it de pedido, luego me quise
> cambiar de terminal para ir probando enviar pedidos de cada terminal pero no me
> dejó salir, me salió el modal de que no he enviado artículos, lo cual es raro
> porque sí los había mandado y por eso se creó el post it de pedido, y caí en
> cuenta de que aún había artículos en ticket, le di en enviar y de nuevo el modal
> **No se pudo completar / No se pudo enviar: hay productos sin guardar en el
> servidor. Verifique la conexión WiFi. / Cerrar**"

Puntos clave del reporte:

1. El pedido **SÍ se persistió** (apareció el post-it en el pizarrón).
2. Aun así, al intentar salir de la terminal, el modal de "artículos sin enviar"
   bloqueó la salida.
3. Al pulsar "enviar", el mismo error de "productos sin guardar en el servidor".

Es decir: **el servidor tenía los datos, pero la verificación decía que faltaban.**

---

## 2. Causa raíz

La verificación post-envío (contrato 22) comparaba el **NÚMERO DE LÍNEAS** del
carrito contra el **NÚMERO DE FILAS** de `ticket_items` en el servidor.

Pero **RN-17 fusiona los productos repetidos en UNA sola fila**, incrementando su
`quantity`. Por lo tanto:

| Carrito (cliente) | Servidor (BD) | Comparación vieja |
|---|---|---|
| mismo producto agregado **2×** → 2 líneas (2 `item_id`) | **1 fila** con `quantity = 2` | `1 < 2` → **falso déficit** |

El fix de BUG-06 (verificación por **cobertura**) ya había eliminado la
comparación por *identidad* de `item_id`, pero seguía comparando por **número de
filas**. Un carrito con un producto repetido producía un falso déficit y el modal
bloqueaba el envío aunque **nada se hubiera perdido**.

La pregunta correcta no es "¿cuántas filas hay?" sino **"¿cuántas UNIDADES hay?"**:
el servidor debe tener al menos tantas unidades como el carrito afirma.

---

## 3. Solución aplicada

### 3.1 Backend — `apps/api/routers/pos.py` (`verificar_envio`)

La cobertura ahora se calcula por **UNIDADES**:

```python
# Unidades REALES en el servidor (RN-17 fusiona duplicados en una fila).
n_unidades_servidor = sum(int(item.quantity) for item in ticket.items)

# Unidades que el carrito AFIRMA. Si el cliente envía `cantidades` (BUG-07),
# se suman; si no (cliente viejo), se degrada al conteo de líneas (BUG-06).
if entrada.cantidades:
    n_unidades_afirmadas = sum(int(c) for c in entrada.cantidades)
else:
    n_unidades_afirmadas = len(entrada.item_ids)

if n_unidades_servidor >= n_unidades_afirmadas:
    return VerificarEnvioSalida(existe=True, item_ids_persistidos=list(entrada.item_ids), faltantes=[])
```

El déficit real (cuando el servidor tiene MENOS unidades de las afirmadas) se
sigue reportando como `faltantes`, preservando la cicatriz v6.1 $453 (nunca un
"siempre OK").

### 3.2 Esquema — `apps/api/schemas.py` (`VerificarEnvioEntrada`)

Se añadió el campo **opcional** `cantidades: list[int]` (mismo orden que
`item_ids`). Si se omite, se degrada al conteo de líneas (compatibilidad con
clientes viejos).

### 3.3 Contrato — `apps/api/contracts/registry.py` (contrato 22)

Se documentó la entrada `cantidades` y la semántica de cobertura por unidades.

### 3.4 Frontend — `apps/pos/src/hooks/useCart.js` (`clearCart`)

Ahora se envían también las cantidades:

```js
const ids = lineasRef.current.map((l) => l.item_id);
const cantidades = lineasRef.current.map((l) => Number(l.quantity ?? 1));
// ...
cliente.verificarEnvio(idTicket, { item_ids: ids, cantidades })
```

### 3.5 Frontend — `apps/pos/src/api/client.js`

Se documentó el parámetro opcional `cantidades` en `verificarEnvio`.

---

## 4. Pruebas

### 4.1 Backend — `apps/api/tests/test_f3_atomico.py`

Se añadieron 3 pruebas:

- `test_verificacion_por_unidades_no_bloquea_duplicados` — **BUG-07**: un producto
  repetido (2 líneas del carrito vs 1 fila fusionada del servidor) NO debe
  bloquear el envío.
- `test_verificacion_por_unidades_detecta_perdida_real` — la verificación por
  unidades SÍ detecta una pérdida real (no se convirtió en un "siempre OK").
- (se conservan las de BUG-06: cobertura por líneas y detección de pérdida real).

**Resultado:** `356 passed` (suite backend completa, sin regresiones).

### 4.2 Frontend — `apps/pos/src/hooks/hooks.f3_3.test.jsx`

Se actualizó la aserción de `clearCart` para reflejar el nuevo cuerpo de la
petición (`{ item_ids, cantidades }`).

**Resultado:** `812 passed` (75 archivos, sin regresiones).

---

## 5. Lección

> **La cobertura se mide en UNIDADES, no en filas.**
> Cuando una regla de negocio (RN-17) FUSIONA entidades, cualquier verificación
> que cuente "filas" en lugar de "unidades" produce falsos déficits. La pregunta
> "¿se perdió algo?" se responde con la magnitud real (unidades), no con la
> cardinalidad de la representación (filas).

Este es el segundo fix consecutivo sobre la misma verificación (BUG-06 → BUG-07):
primero se corrigió la *identidad* (item_id obsoleto), ahora la *magnitud*
(unidades vs filas). La verificación por cobertura por unidades es la forma
correcta y estable.
