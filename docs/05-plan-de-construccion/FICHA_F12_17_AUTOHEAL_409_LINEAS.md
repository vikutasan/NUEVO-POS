# FICHA F12.17 — El 409 de las acciones de línea no se auto-curaba (BUG de runtime)

> **Sub-fase:** 12.17 — auto-heal del 409 en `anadirLinea` / `cambiarCantidad` / `quitarLinea`
> **Fase:** 12 — Portar funcionalidades del POS viejo al POS nuevo
> **Estado:** ✅ CERRADA — **BUG CORREGIDO** (bloqueaba ENVIAR CUENTA con `items_no_persistidos`)
> **Fecha:** 2026-10-06
> **Commit:** `a5347e3` — F12.17: auto-heal del 409 en las acciones de línea (anadirLinea/cambiarCantidad/quitarLinea) + no reintentar errores de negocio (REGLA 18/9)
> **Plan rector:** REGLA 18 (no reintentar errores de negocio) + REGLA 9 (auto-heal del 409) + RN-25/RN-26 (bloqueo optimista) + contrato 18 (idempotencia por `item_id`) + contrato 21 (lectura ligera del ticket) + contrato 22 (verificación post-envío)

---

## 1. Síntoma reportado (runtime, no test)

Tras cerrar F12.16, el dueño del proyecto volvió a entrar al POS y reportó:

> "entré al POS y el bug aún continúa"

El modal seguía apareciendo al pulsar **ENVIAR CUENTA**:

> **No se pudo completar**
> No se pudo enviar: hay productos sin guardar en el servidor. Verifique la conexión WiFi.

**La corrección de F12.16 era correcta, pero no era la causa raíz.** El falso positivo de
`verificar_envio` era un **síntoma**; la causa real estaba **antes**, en el frontend.

---

## 2. Diagnóstico (verificado con evidencia, no asumido)

### 2.1 Evidencia — logs del API

```
docker logs nuevo_pos_api --tail 60
```

Mostró, repetido 6+ veces:

```
POST /pos/tickets/31974e76-.../items HTTP/1.1" 409 Conflict
```

El endpoint `anadir_item` (contrato 18) **rechazaba** cada intento de añadir un ítem.

### 2.2 Evidencia — estado en la BD

```sql
SELECT id, status, version, payment_details FROM tickets ORDER BY created_at DESC LIMIT 5;
```

Los tickets recientes (`31974e76`, `5e138955`) tenían:

| Campo | Valor |
|---|---|
| `version` | `0` |
| `items` | `0` |
| `payment_details` | `NULL` |

El ticket **nunca avanzó de versión** y el **ledger de idempotencia quedó vacío**.

### 2.3 Causa raíz — desincronía de `version` en `useCart`

[`useCart.anadirLinea`](../NUEVO-POS/apps/pos/src/hooks/useCart.js:157) llamaba a `withRetries`
**sin** `debeReintentar` y **sin** auto-heal:

```js
const resultado = await aOutcome(() =>
  withRetries(() =>
    cliente.anadirItem(idTicket, {
      item_id: itemId,
      product_id: linea.product_id,
      quantity: cantidad,
      version: versionRef.current,   // ← versión leída al vuelo
    })
  )
);
```

Dos llamadas concurrentes (dos clics rápidos, o clic + escáner) leían **el mismo**
`versionRef.current` (v0) antes de que ninguna confirmara:

1. La **primera** llega al servidor con v0 → el servidor la acepta y avanza a **v1**.
2. La **segunda** llega con v0 (ya obsoleta) → `rn25_validar_version` lanza
   `ReglaViolada("RN-25", ..., 409)`.

Y aquí el agravante: como `withRetries` tiene `debeReintentar = () => true` por defecto
([`withRetries.js:59`](../NUEVO-POS/apps/pos/src/utils/withRetries.js:59)), el 409 se
**reintentaba 3× con la MISMA versión obsoleta** → 3× más 409. El ítem **nunca** se persistía.

### 2.4 Cadena del fallo

```
2 clics rápidos
  → 2× anadirLinea leen v0
  → 1ª OK (servidor → v1)
  → 2ª 409 (v0 obsoleta)
  → withRetries reintenta 3× con v0 → 3× 409
  → el ítem NUNCA se persiste
  → el ledger _item_ids queda incompleto
  → verificar_envio (contrato 22) marca faltantes
  → clearCart devuelve items_no_persistidos
  → el carrito NO se limpia
  → modal "hay productos sin guardar en el servidor"
```

### 2.5 Por qué F12.12 no lo cubrió

F12.12 añadió el auto-heal del 409 **solo a `cobrar`** (en `useTicketActions`). Las acciones
de **línea** (`anadirLinea`, `cambiarCantidad`, `quitarLinea`) viven en `useCart` y quedaron
con el mismo defecto latente. El bug de F12.16 era el **síntoma visible**; F12.17 es la
**causa raíz**.

---

## 3. La corrección

Se replicó en `useCart` el patrón de auto-heal de `cobrar` (F12.12), en las **tres** acciones
de línea.

### 3.1 Importar los predicados de error

```js
import { esErrorDeNegocio, esConflictoDeVersion } from './useTicketActions.js';
```

### 3.2 Helper `sincronizarVersion` (contrato 21)

Descarga la versión fresca del ticket y re-sincroniza el ref:

```js
const sincronizarVersion = useCallback(async () => {
  const cliente = apiRef.current;
  const idTicket = ticketRef.current;
  if (!cliente || !idTicket || typeof cliente.leerTicket !== 'function') return null;
  const lectura = await aOutcome(() => cliente.leerTicket(idTicket));
  if (!esOk(lectura) || !lectura.data) return null;
  const fresca = lectura.data.version;
  if (Number.isInteger(fresca) && fresca >= 0) {
    setVersionActual(fresca);
    versionRef.current = fresca;
    return fresca;
  }
  return null;
}, []);
```

### 3.3 `anadirLinea` / `cambiarCantidad` / `quitarLinea`

Cada una ahora:

1. Pasa `debeReintentar: (err) => !esErrorDeNegocio(err)` → **un 409 NO se reintenta** (REGLA 18).
2. Ante un 409, llama a `sincronizarVersion()` y **reintenta UNA vez** con la versión fresca
   (REGLA 9).
3. Si el auto-heal no puede leer la versión, **no reintenta a ciegas** (evita el bucle).
4. Al tener éxito, sincroniza `versionRef.current` con la versión devuelta por el servidor.

```js
let errorCrudo = null;
let resultado = await aOutcome(() =>
  withRetries(
    () => cliente.anadirItem(idTicket, { item_id: itemId, product_id: linea.product_id,
                                          quantity: cantidad, version: versionRef.current }),
    { debeReintentar: (err) => { errorCrudo = err; return !esErrorDeNegocio(err); } }
  )
);

if (!esOk(resultado) && esConflictoDeVersion(errorCrudo)) {
  const fresca = await sincronizarVersion();
  if (fresca !== null) {
    errorCrudo = null;
    resultado = await aOutcome(() =>
      withRetries(
        () => cliente.anadirItem(idTicket, { item_id: itemId, product_id: linea.product_id,
                                              quantity: cantidad, version: versionRef.current }),
        { debeReintentar: (err) => !esErrorDeNegocio(err) }
      )
    );
  }
}

if (esOk(resultado) && resultado.data && typeof resultado.data.version === 'number') {
  setVersionActual(resultado.data.version);
  versionRef.current = resultado.data.version;
}
return resultado;
```

---

## 4. Test de puerta — [`useCart.f12_17.test.jsx`](../NUEVO-POS/apps/pos/src/hooks/useCart.f12_17.test.jsx)

9 tests que reproducen el bug y blindan el fix:

| Criterio | Qué verifica |
|---|---|
| 1 | Un 409 se corta de inmediato (1 intento, no 3) |
| 2 | Ante un 409, se descarga la versión fresca y se reintenta con ella (la línea queda persistida) |
| 2b | Tras el auto-heal, la versión local queda sincronizada (la siguiente escritura usa v1) |
| 3 | Si `leerTicket` falla, no se reintenta el 409 (evita el bucle) |
| 4 | `cambiarCantidad` tiene el mismo comportamiento (auto-heal + no-reintento) |
| 4b | `quitarLinea` tiene el mismo comportamiento (auto-heal + no-reintento) |
| 5 | **El bug de producción:** 2 añadidos concurrentes → el ledger queda completo → `clearCart` limpia el carrito |

El criterio 5 simula un servidor real (versión + ledger de `item_id`) y demuestra que, con el
fix, **ambos** ítems quedan persistidos y la verificación post-envío no reporta faltantes.

---

## 5. Verificación

| Verificación | Resultado |
|---|---|
| `npm run test` (apps/pos) | ✅ **684 passed** (62 archivos) |
| `docker exec nuevo_pos_api python -m pytest tests/ -q` | ✅ **289 passed** |
| `node scripts/guards.mjs` | ✅ **VERDE** (7/7 guardianes) |

---

## 6. Lecciones (para futuras IAs)

1. **Un síntoma corregido no cierra el bug.** F12.16 corrigió el falso positivo de
   `verificar_envio`, pero la causa raíz (el 409 no auto-curado en `useCart`) seguía viva.
   **REGLA DURA 2 ("verificar, no asumir")** obliga a reproducir el flujo **completo** en
   runtime, no solo a arreglar el último eslabón visible.
2. **El auto-heal del 409 debe ser transversal, no puntual.** F12.12 lo aplicó a `cobrar`;
   las acciones de línea quedaron fuera. Toda acción que envíe `version` debe filtrar los
   errores de negocio (REGLA 18) y auto-curarse ante un 409 (REGLA 9).
3. **`withRetries` reintenta TODO por defecto.** Es una trampa: reintentar un 409 con la misma
   versión obsoleta multiplica el fallo. Siempre pasar `debeReintentar` en escrituras con
   bloqueo optimista.
4. **La evidencia manda.** El diagnóstico se cerró con logs del API (409 repetido), estado en
   BD (`version: 0`, ledger `NULL`) y lectura del código — no por intuición.

---

## 7. Archivos tocados

| Archivo | Cambio |
|---|---|
| [`apps/pos/src/hooks/useCart.js`](../NUEVO-POS/apps/pos/src/hooks/useCart.js:21) | Import de `esErrorDeNegocio`/`esConflictoDeVersion`; helper `sincronizarVersion`; auto-heal + no-reintento en `anadirLinea`, `cambiarCantidad`, `quitarLinea` |
| [`apps/pos/src/hooks/useCart.f12_17.test.jsx`](../NUEVO-POS/apps/pos/src/hooks/useCart.f12_17.test.jsx:1) | Test de puerta (9 tests) |
| `docs/05-plan-de-construccion/FICHA_F12_17_AUTOHEAL_409_LINEAS.md` | Esta ficha |
