# FICHA FIX — No se podía enviar al pizarrón: la sonda de red usaba la URL relativa `/health`

> **Tipo:** Corrección de bug en producción (falso positivo de red → botón ENVIAR CUENTA bloqueado)
> **Componente:** [`apps/pos/src/RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:126) — llamada a `useNetworkHealth()`
> **Estado:** ✅ CERRADA — 772 tests frontend en verde, guards 8/8 en verde, `GET http://localhost:5101/health` → 200 confirmado
> **Fecha:** 2026-10-08
> **Commit:** `e20ffbc` — fix(pos): sonda de red apunta al API propio (CONFIG.API_BASE_URL) en vez de la URL relativa /health
> **Plan rector:** §5 (fixed red banner) + §10.6 (lecciones por clase de fallo) + REGLA DURA 2 ("verificar, no asumir") + REGLA 13 (bloqueo sin conexión) + Cementerio §3 (Cuenta Fantasma $453)

---

## 1. Síntoma reportado

El cajero intentó **enviar un pedido al pizarrón** (la cuenta abierta) y **no se lo permitió**:

> *"quise enviar un pedido a pizarron y no me dejo"*

El botón **ENVIAR CUENTA** aparecía **deshabilitado de forma permanente**, aunque el
API estaba sano (`nuevo_pos_api` reportaba `Up (healthy)`) y la red WiFi funcionaba.
No era un fallo intermitente: el botón **nunca** se habilitaba, así que el flujo de
cuentas abiertas (F5) quedaba **inutilizable** desde el POS nuevo.

Es el **mismo síntoma superficial** que el bug del banner rojo (commit `567a9d1`), pero
con una **causa raíz distinta**: allí el método HTTP era incorrecto (`HEAD` → 405); aquí
el método es correcto (`GET`) pero la **URL es incorrecta** (relativa → 404).

---

## 2. Diagnóstico (causa raíz)

La causa **no era la red**, sino la **URL que sondeaba el hook de salud**.

En [`RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:126) el hook se
invocaba **sin opciones**:

```jsx
const red = useNetworkHealth();
```

El hook [`useNetworkHealth`](../../apps/pos/src/hooks/useNetworkHealth.js:78) tiene como
valor por defecto `url = '/health'` (línea 80). Es decir, la sonda hacía:

```
GET /health   ← URL RELATIVA
```

Una URL relativa la resuelve el **navegador** contra el **origen de la página**, que es
el servidor de desarrollo Vite (`http://localhost:5100`), **no** el API
(`http://localhost:5101`). Y [`vite.config.js`](../../apps/pos/vite.config.js:13) **no
declara ningún proxy** para `/health` (ni para `/api`, pese a un comentario que sugiere
lo contrario). Por tanto:

| Petición | Resultado |
|---|---|
| `GET http://localhost:5100/health` (lo que hacía la sonda) | **HTTP 404** (Vite no conoce la ruta) |
| `GET http://localhost:5101/health` (el API real) | **HTTP 200** |

### La cadena del falso positivo

1. La sonda hace `GET /health` → el navegador lo resuelve contra Vite (5100) → **404**.
2. `res.ok` es `false` para cualquier código que no sea 2xx → la sonda devuelve `{ ok: false }`.
3. El hook incrementa `fallosRef.current`.
4. Tras **2 fallos consecutivos** (`FALLOS_PARA_DOWN = 2`), el hook pone `estado = 'down'`.
5. `enLinea = estado !== 'down'` → `false`.
6. `botonBloqueado: !enLinea` → `true`.
7. Ese `botonBloqueado` está cableado a la prop `sinRed` de `SalesReceipt` (F12.14), y
   `envioBloqueado = vacio || enviandoCuenta || sinRed` → **`true`**.
8. El botón **ENVIAR CUENTA** queda `disabled` **de forma permanente**.

Es decir: **el POS se auto-infligía una caída de red falsa** cada 10 s
(`INTERVALO_POR_DEFECTO = 10000`), porque el sondeo de vida apuntaba a un origen que no
expone `/health`. La defensa `FALLOS_PARA_DOWN = 2` no ayuda cuando **el 100% de los
sondeos falla por una razón estructural** (URL incorrecta).

---

## 3. Corrección aplicada

En [`RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:126) se pasó la URL
**absoluta** del API propio del POS nuevo, tomada de `CONFIG.API_BASE_URL`:

```jsx
const { modo, esMovil } = useModo();
// FIX_PIZARRON_SIN_RED (8 Oct 2026) — El sondeo de red usaba la URL RELATIVA
// `/health`, que el navegador resuelve contra el origen de Vite (5100). Como
// `vite.config.js` NO proxya `/health`, Vite devolvía 404 → `res.ok === false`
// → tras 2 fallos consecutivos `estado='down'` → `botonBloqueado=true`. Eso
// deshabilitaba el botón ENVIAR CUENTA (F12.14) de forma PERMANENTE, aunque
// la red estuviera bien: el usuario no podía enviar pedidos al pizarrón.
// El sondeo debe apuntar al API PROPIO del POS nuevo (`CONFIG.API_BASE_URL`),
// que sí expone `GET /health` (apps/api/main.py).
const red = useNetworkHealth({ url: `${CONFIG.API_BASE_URL}/health` });
```

`CONFIG.API_BASE_URL` se resuelve en
[`apps/shared/config.js`](../../apps/shared/config.js:28) a partir de `VITE_API_URL` o,
en su defecto, al valor por defecto `http://localhost:5101` (línea 16). El endpoint
`GET /health` existe en [`apps/api/main.py`](../../apps/api/main.py:77)
(`@app.get("/health", tags=["salud"])`).

El cambio es de **una sola línea** (la llamada al hook); el resto del hook y el cableado
de F12.14 no se tocan.

### Archivos

| Archivo | Rol | Cambio |
|---|---|---|
| `apps/pos/src/RetailVisionPOS.jsx` | Llamada a `useNetworkHealth()` | `useNetworkHealth()` → `useNetworkHealth({ url: \`${CONFIG.API_BASE_URL}/health\` })` + comentario |

---

## 4. Decisión de diseño

### 4.1 El sondeo debe apuntar al API propio, no al origen de Vite

El hook es **agnóstico del origen**: por defecto usa una URL relativa, lo cual es
razonable **solo si** el servidor que sirve la página proxya `/health` hacia el API. En
este proyecto **no lo hace** (`vite.config.js` no declara proxy). Por tanto, el
consumidor **debe** pasar la URL absoluta del API. Se eligió `CONFIG.API_BASE_URL` (no
un literal `http://localhost:5101`) para respetar la configuración por entorno
(`VITE_API_URL` en producción) y no hardcodear el host.

### 4.2 No se toca el umbral de falsos positivos

El hook ya tenía `FALLOS_PARA_DOWN = 2` (dos fallos consecutivos antes de declarar
`down`). Esa defensa **funcionó como se diseñó**: el problema no era que un fallo aislado
disparara el bloqueo, sino que **todos** los sondeos fallaban (404 sistemático). Bajar o
subir el umbral no habría arreglado nada; la causa era la URL, no la sensibilidad.

### 4.3 Alternativa descartada: añadir un proxy `/health` en Vite

Se podría haber añadido un `server.proxy['/health']` en `vite.config.js` para que la URL
relativa funcionara. Se descartó porque:
- El **contrato** del hook es recibir la URL del API; el consumidor es quien conoce el
  origen. Depender de un proxy de desarrollo haría que el POS **solo** funcionara bajo
  Vite, no en el build de producción servido por otro origen.
- El fix del consumidor es de **una línea** y no altera la configuración del servidor de
  desarrollo (que otros consumidores podrían estar usando).

### 4.4 Coherencia con el fix anterior (HEAD → GET)

Este bug es la **segunda iteración** del mismo síntoma (banner rojo / botón bloqueado).
El primer fix (`567a9d1`) corrigió el **método** (`HEAD` → `GET`); este corrige la
**URL** (relativa → absoluta). Ambos comparten la lección: **una sonda de salud que falla
de forma sistemática exige verificar el contrato del endpoint (método, ruta, origen,
código esperado) antes de asumir que la red está caída.**

---

## 5. Verificación (REGLA DURA 2: "verificar, no asumir")

| Verificación | Resultado |
|---|---|
| `GET http://localhost:5101/health` (URL que ahora usa la sonda) | **HTTP 200** |
| `GET http://localhost:5100/health` (URL relativa anterior) | **HTTP 404** |
| Suite frontend completa (`npm run test -- --run`) | **67 archivos / 772 tests en verde** |
| Guards (`node scripts/guards.mjs` desde `../NUEVO-POS`) | **8/8 en verde** (215 archivos escaneados) |
| Consumidores de `useNetworkHealth` en producción | **solo** `RetailVisionPOS.jsx:126` (el resto son tests) |

Los tests de [`hooks.test.jsx`](../../apps/pos/src/hooks/hooks.test.jsx:92) inyectan una
`sonda` mock (`opciones.sonda`), por lo que **no** dependen de la URL real y no se rompen
con el cambio. Esto es intencional: el hook es inyectable para poder simular red
caída/arriba sin depender de la red real (ver
[`FICHA_F3_1_UTILIDADES.md`](FICHA_F3_1_UTILIDADES.md:37)).

---

## 6. Lección (para el cementerio de bugs)

**Una URL relativa es una promesa de proxy que nadie firmó.** El hook asumía que `/health`
llegaría al API; el servidor de desarrollo no proxya esa ruta, así que la promesa se
rompió en silencio y el POS se bloqueó solo.

Regla derivada: **cuando un hook tiene un valor por defecto relativo, el consumidor debe
verificar que el origen que sirve la página resuelve esa ruta hacia el servicio correcto.**
Si no hay proxy, hay que pasar la URL absoluta. Es la misma clase de fallo que la "Cuenta
Fantasma $453" (Cementerio §3): un fallo invisible que bloquea una operación de negocio
(el envío al pizarrón).

---

## 7. Trazabilidad

- **REGLA 13** — bloqueo de botón sin conexión. El gate funcionó; el problema era que la
  señal de "sin conexión" era **falsa**. ✅
- **F12.14** — el cableado `sinRed={red.botonBloqueado}` estaba correcto; este fix
  corrige la **fuente** de esa señal. ✅
- **§10.6** — nueva instancia del ciclo "de adentro hacia afuera": el síntoma (botón
  bloqueado) llevó a la causa (URL relativa). ✅
- **Cementerio §3 (Cuenta Fantasma $453)** — un fallo de guardado/envío invisible se
  combate con señales de red **veraces**. ✅
- **REGLA DURA 2 (E-19) "verificar, no asumir"** — se verificó con `curl` que el API
  responde 200 en `/health` y que Vite responde 404 en la ruta relativa. ✅

---

## 8. Cierre

El fix queda **CERRADO**. El sondeo de red apunta al API propio
(`CONFIG.API_BASE_URL + '/health'`), por lo que `botonBloqueado` refleja el estado real
de la red y el botón **ENVIAR CUENTA** vuelve a habilitarse cuando hay conexión. La suite
frontend (772 tests) y los guards (8/8) están en verde. Commit `e20ffbc`, pusheado a
`main`.
