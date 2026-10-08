# FICHA_FIX_API_SIN_RELOAD — El contenedor servía código viejo

**Fecha:** 8 de octubre de 2026
**Fase:** F12.20 (seguimiento) — hallazgo operativo
**Estado:** RESUELTO
**Commits:** `60a9851` (código F12.20) + `4a45be4` (ficha F12.20) + este fix

---

## 1. El síntoma reportado

Tras publicar F12.20 (contrato 31, `PATCH /pos/tickets/{id}/order`) y verificar
que **327/327** pruebas de backend y **773/773** de frontend pasaban, el usuario
reportó en vivo:

> "aun no cambia el aspecto del post it cuando es pedido"

Es decir: se programaba un pedido tentativo (modal 📌), pero el post-it del
pizarrón seguía mostrándose idéntico al de una cuenta normal (sin el badge
**📦 PEDIDO TENTATIVO**).

---

## 2. La investigación (la cadena estaba correcta)

Se trazó el flujo completo de datos, extremo a extremo, y **todo el código era
correcto**:

| Eslabón | Archivo | Verificación |
|---|---|---|
| Modal arma el bloque | [`OrderProgrammingModal.jsx`](../../apps/pos/src/components/OrderProgrammingModal.jsx:186) | `manejarGuardar` llama `construirBloquePedido({ order_type: 'PEDIDO', ... })` y luego `onGuardar(bloque)` |
| Función pura del bloque | [`useOrderProgramming.js`](../../apps/pos/src/hooks/useOrderProgramming.js:72) | `construirBloquePedido` fija `order_type: 'PEDIDO'` |
| Handler del POS | [`RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:792) | `guardarPedido` llama `actualizarPedidoDelTicket(ticketIdRef.current, {...bloque, version})` |
| Servicio | [`ordersService.js`](../../apps/pos/src/services/ordersService.js:62) | `actualizarPedidoDelTicket` → `cliente.actualizarPedidoTicket` |
| Cliente HTTP | [`client.js`](../../apps/pos/src/api/client.js:204) | `PATCH /pos/tickets/{id}/order` |
| Endpoint | [`pos.py`](../../apps/api/routers/pos.py:792) | `actualizar_pedido` persiste `order_type` + re-proyecta (contrato 15) |
| Proyección | [`schemas.py`](../../apps/api/schemas.py:585) | `CuentaAbiertaSalida.order_type` |
| Pizarrón | [`OpenAccountsCorkboard.jsx`](../../apps/pos/src/components/OpenAccountsCorkboard.jsx:326) | `cuenta.order_type === 'PEDIDO'` → badge |

La prueba automatizada `test_f12_20_actualizar_pedido.py` (7/7) **demostraba**
que el endpoint persistía `order_type=PEDIDO`. El código estaba bien.

---

## 3. La causa raíz (NO era un bug de código)

**El contenedor `nuevo_pos_api` estaba sirviendo código viejo.**

Evidencia:

```
$ docker ps --filter "name=nuevo_pos"
NAMES           STATUS                  PORTS
nuevo_pos_api   Up 13 hours (healthy)   0.0.0.0:5101->5101/tcp
nuevo_pos_db    Up 2 days (healthy)     0.0.0.0:5432->5432/tcp
```

El contenedor llevaba **13 horas** arriba — se había iniciado **antes** de que
se escribiera el contrato 31. El código vive en un **volumen montado**
(`./apps/api:/app`), así que los archivos en disco SÍ eran los nuevos, pero
`uvicorn` se lanzaba **sin `--reload`**:

```yaml
command: >
  sh -c "pip install --quiet --no-cache-dir -r requirements.txt &&
         uvicorn main:app --host 0.0.0.0 --port 5101"   # ← sin --reload
```

Sin `--reload`, uvicorn mantiene en memoria la **tabla de rutas del arranque**.
La ruta nueva `/pos/tickets/{ticket_id}/order` **no existía** en el proceso vivo,
así que el PATCH respondía **404** (route-not-found), no 404-de-ticket-inexistente.

Prueba directa:

```
$ PATCH http://localhost:5101/pos/tickets/00000000-.../order
STATUS=404          # la ruta no estaba registrada
```

---

## 4. La solución

### 4.1 Reinicio inmediato (desbloquea al usuario)

```bash
docker restart nuevo_pos_api
```

Tras el reinicio, la ruta quedó registrada en el OpenAPI en vivo:

```
$ GET http://localhost:5101/openapi.json  →  paths
/pos/tickets/{ticket_id}/order      ← AHORA SÍ
/orders/by-ticket/{ticket_id}
```

### 4.2 Verificación E2E en vivo (con un ticket real)

Se tomó el ticket real `25908e92-...` (V0001, total 47.00, `version=5`,
`order_type=VENTA_DIRECTA`) y se programó como pedido:

```
$ PATCH /pos/tickets/25908e92-.../order  {version:5, order_type:"PEDIDO", ...}
PATCH_STATUS=200        # version 5 → 6

$ GET /pos/open-accounts
{"cuentas":[{
  "id":"25908e92-...",
  "order_type":"PEDIDO",          ← PERSISTIDO
  "customer_name":"PRUEBA E2E",   ← PERSISTIDO
  "customer_phone":"5551234567",  ← PERSISTIDO
  "delivery_type":"PICKUP",       ← PERSISTIDO
  "version":6
}]}
```

El pizarrón, que lee `order_type === 'PEDIDO'`, ahora renderiza el badge
**📦 PEDIDO TENTATIVO** con el nombre del cliente y la línea de entrega.

### 4.3 Fix permanente (evita el trap recurrente)

Se añadió `--reload` al comando de uvicorn en
[`docker-compose.yml`](../../docker-compose.yml:57):

```yaml
command: >
  sh -c "pip install --quiet --no-cache-dir -r requirements.txt &&
         uvicorn main:app --host 0.0.0.0 --port 5101 --reload"
```

Con `--reload`, cualquier edición en `./apps/api` reinicia el worker
automáticamente. **Este es un cambio de DESARROLLO**: en producción el
`--reload` no debe usarse (consume recursos y reinicia ante cualquier cambio);
allí el despliegue reconstruye/reinicia el contenedor de forma explícita.

---

## 5. Lección (por qué pasó desapercibido)

- Las **pruebas** corren con `docker compose exec -T api python -m pytest`, que
  **arranca un proceso Python nuevo** cada vez → siempre cargan el código fresco
  del volumen. Por eso 327/327 pasaban aunque el servidor vivo estuviera viejo.
- El **servidor HTTP** es un proceso de larga vida que NO se recarga solo.
- El síntoma ("el post-it no cambia") parecía un bug de lógica de frontend, pero
  era un **desfase de despliegue**: código correcto, proceso obsoleto.

**Regla operativa:** tras cambiar código de backend, si el contenedor no tiene
`--reload`, hay que `docker restart nuevo_pos_api` (o `docker compose up -d
--build api`) antes de probar en vivo.

---

## 6. Archivos tocados

| Archivo | Cambio |
|---|---|
| [`docker-compose.yml`](../../docker-compose.yml:57) | `uvicorn ... --reload` (dev) |
| `FICHA_FIX_API_SIN_RELOAD.md` | este documento |

El código de F12.20 (contrato 31) **no se tocó**: ya era correcto y estaba
commiteado (`60a9851`). Este fix es puramente operativo (despliegue).

---

## 7. Resultado

- ✅ Causa raíz identificada: contenedor con código viejo (uvicorn sin `--reload`).
- ✅ `nuevo_pos_api` reiniciado → ruta del contrato 31 registrada y viva.
- ✅ Verificación E2E real: PATCH 200 (v5→v6) + `open-accounts` devuelve
  `order_type=PEDIDO` con datos del cliente.
- ✅ `--reload` añadido al compose de desarrollo → el trap no se repite.
- ✅ El post-it del pizarrón ahora muestra el badge **📦 PEDIDO TENTATIVO**.
