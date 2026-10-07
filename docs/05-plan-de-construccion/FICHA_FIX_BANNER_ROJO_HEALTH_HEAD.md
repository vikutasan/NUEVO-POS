# FICHA FIX — Banner rojo falso: la sonda de red usaba HEAD contra `/health`

> **Tipo:** Corrección de bug en producción (falso positivo de red)
> **Componente:** [`apps/pos/src/hooks/useNetworkHealth.js`](../../apps/pos/src/hooks/useNetworkHealth.js:41) — `sondaReal()`
> **Estado:** ✅ CERRADA — 708 tests frontend en verde, `GET /health` → 200 confirmado
> **Fecha:** 2026-10-07
> **Commit:** `567a9d1` — fix(pos): sonda de red usa GET en /health (el HEAD devolvia 405 y disparaba el banner rojo falso)
> **Plan rector:** §5 (fixed red banner) + §10.6 (lecciones por clase de fallo) + REGLA DURA 2 ("verificar, no asumir") + Cementerio §3 (Cuenta Fantasma $453)

---

## 1. Síntoma reportado

En el nuevo POS aparecía una **banda roja horizontal a la altura del encabezado** con la leyenda:

> *"Sin conexión con el servidor. El cobro está bloqueado hasta que vuelva la red."*

El banner es **persistente** (no se auto-oculta) y bloquea el botón de cobro
(`botonBloqueado: !enLinea`). El API estaba **sano** — el contenedor `nuevo_pos_api`
reportaba `Up (healthy)` — pero el POS se comportaba como si la red estuviera caída.

---

## 2. Diagnóstico (causa raíz)

La causa **no era la red**, sino un **método HTTP incorrecto en la sonda de salud**.

La sonda [`sondaReal()`](../../apps/pos/src/hooks/useNetworkHealth.js:41) usaba
`method: 'HEAD'` contra el endpoint `/health`. Pero el API solo declara el endpoint
para **GET**:

```python
# apps/api/main.py:77
@app.get("/health", tags=["salud"])
```

Verificado con `curl` contra el contenedor `nuevo_pos_api`:

| Petición | Resultado |
|---|---|
| `GET /health` | **HTTP 200** |
| `HEAD /health` | **HTTP 405 Method Not Allowed** |

### La cadena del falso positivo

1. La sonda hace `HEAD /health` → el API responde **405**.
2. `res.ok` es `false` para cualquier código que no sea 2xx → la sonda devuelve `{ ok: false }`.
3. El hook incrementa `fallosRef.current`.
4. Tras **2 fallos consecutivos** (`FALLOS_PARA_DOWN = 2`), el hook pone `estado = 'down'`.
5. `enLinea = estado !== 'down'` → `false`.
6. `bannerVisible: !enLinea` → `true` (banner rojo) y `botonBloqueado: !enLinea` → `true` (cobro bloqueado).

Es decir: **el POS se auto-infligía una caída de red falsa** cada 10 s
(`INTERVALO_POR_DEFECTO = 10000`), porque el sondeo de vida usaba un método que el
endpoint no acepta.

---

## 3. Corrección aplicada

En [`sondaReal()`](../../apps/pos/src/hooks/useNetworkHealth.js:41) se cambió
`method: 'HEAD'` por `method: 'GET'`, con un comentario que documenta el porqué:

```javascript
export async function sondaReal(url) {
  const inicio = performance.now();
  try {
    // NOTA (7 Oct 2026): el endpoint `/health` del API solo acepta GET
    // (`@app.get("/health")`). Un HEAD devuelve 405 Method Not Allowed,
    // que `res.ok` interpreta como caída y dispara el banner rojo falso.
    // Se usa GET: la sonda es un chequeo de vida ligero, no descarga cuerpo útil.
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const latenciaMs = Math.round(performance.now() - inicio);
    return { ok: res.ok, latenciaMs };
  } catch {
    return { ok: false, latenciaMs: -1 };
  }
}
```

La sonda sigue siendo un **chequeo de vida ligero**: `cache: 'no-store'` evita
respuestas cacheadas y `AbortSignal.timeout(5000)` acota la espera. El cambio es de
**una sola línea** (`'HEAD'` → `'GET'`); el resto del hook no se toca.

### Archivos

| Archivo | Rol | Cambio |
|---|---|---|
| `apps/pos/src/hooks/useNetworkHealth.js` | `sondaReal()` — método de la sonda | `'HEAD'` → `'GET'` + comentario |

---

## 4. Decisión de diseño

### 4.1 La sonda es un chequeo de vida, no una descarga

Un `HEAD` es "más barato" en teoría (no trae cuerpo), pero **solo si el endpoint lo
soporta**. El endpoint `/health` del API es un `@app.get` puro; no declara `HEAD`.
Usar `GET` es correcto: el cuerpo de `/health` es mínimo (un JSON de estado), y la
sonda no lo consume — solo mira `res.ok` y mide latencia.

### 4.2 No se toca el umbral de falsos positivos

El hook ya tenía una defensa contra falsos positivos: `FALLOS_PARA_DOWN = 2` (dos
fallos consecutivos antes de declarar `down`). Esa defensa **funcionó como se diseñó**:
el problema no era que un fallo aislado disparara el banner, sino que **todos** los
sondeos fallaban (405 sistemático). Bajar o subir el umbral no habría arreglado nada;
la causa era el método, no la sensibilidad.

### 4.3 Alternativa descartada: añadir `HEAD` al API

Se podría haber añadido un `@app.head("/health")` al API. Se descartó porque:
- El frontend es el que estaba mal (usaba un método no soportado).
- El endpoint `/health` es un contrato de vida; no necesita variantes.
- Cambiar el API habría requerido reiniciar el contenedor (`nuevo_pos_api` no corre
  con `--reload`), mientras que el fix del frontend recarga en caliente.

---

## 5. Verificación (REGLA DURA 2: "verificar, no asumir")

| Verificación | Resultado |
|---|---|
| `GET /health` (método que ahora usa la sonda) | **HTTP 200** |
| `HEAD /health` (método roto anterior) | **HTTP 405** |
| Suite frontend completa | **64 archivos / 708 tests en verde** |
| POS en `http://localhost:5100/` | **HTTP 200** |
| API en `http://localhost:5101/health` | **HTTP 200** |

Los tests de [`hooks.test.jsx`](../../apps/pos/src/hooks/hooks.test.jsx:92) inyectan
una `sonda` mock (`opciones.sonda`), por lo que **no** dependen del método HTTP real y
no se rompen con el cambio. Esto es intencional: el hook es inyectable para poder
simular red caída/arriba sin depender de la red real (ver
[`FICHA_F3_1_UTILIDADES.md`](FICHA_F3_1_UTILIDADES.md:37)).

---

## 6. Lección (para el cementerio de bugs)

**Un falso positivo de red es tan dañino como una caída real.** El POS bloqueó el
cobro —la operación crítica del negocio— durante horas por un `405` que nadie miraba.
La defensa contra falsos positivos (`FALLOS_PARA_DOWN = 2`) no sirve si **el 100% de
los sondeos falla por una razón estructural** (método incorrecto).

Regla derivada: **cuando una sonda de salud falla de forma sistemática, hay que
verificar el contrato del endpoint (método, ruta, código esperado) antes de asumir
que la red está caída.** Es la misma clase de fallo que la "Cuenta Fantasma $453"
(Cementerio §3): un fallo invisible que bloquea o corrompe una operación de negocio.

---

## 7. Incidente operativo asociado

Durante la verificación, el servidor de desarrollo Vite (puerto 5100) estaba **caído**
(`ERR_CONNECTION_REFUSED`). Se reinició con `npm run dev` en `apps/pos`. No es un bug
del código: es el estado del entorno de desarrollo. Se documenta aquí porque ocurrió
en la misma sesión y explica por qué el POS no cargaba en el navegador.

| Verificación | Resultado |
|---|---|
| `netstat` puerto 5100 (antes) | nada escuchando |
| `netstat` puerto 5101 (API) | LISTENING |
| `npm run dev` (reinicio) | Vite v5.4.21 ready en 500 ms |
| POS en `http://localhost:5100/` (después) | **HTTP 200** |
