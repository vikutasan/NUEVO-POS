# FICHA F7.7c — El tipo del id en la frontera HTTP (el 422)

**Fase:** 7.7c (corrección del bloqueo de entrada a terminales — tercera capa)
**Fecha:** 2026-09-30
**Estado:** ✅ CERRADA
**Commit:** `67b45e7`

---

## 1. El síntoma que reportó el usuario

> «aun no puedo entrar a ninguna terminal»

Y, al intentarlo, la consola del navegador mostraba:

> **`sale look terminal 422`**

Es decir: la petición `POST /pos/terminals/lock` llegaba al servidor y este la
rechazaba con **HTTP 422 Unprocessable Entity**.

---

## 2. Por qué este es el TERCER hallazgo, no el primero

El bloqueo de entrada a terminales tuvo **tres causas encadenadas**. Cada una
solo se hizo visible cuando se corrigió la anterior:

| # | Sub-fase | Causa | Síntoma | Corrección |
|---|----------|-------|---------|------------|
| 1 | F7.7 | El router `/pos/terminals/*` no existía en la API | **404** | Se escribió el router completo |
| 2 | F7.7b | El status exponía `occupier_id` como UUID, pero el frontend compara contra el id original (`1`) | La propia terminal se veía **"ocupada por otro"** | Se expuso `occupier_ref` |
| 3 | **F7.7c** | El contrato declara `user_id` como `str`, pero el frontend enviaba el **número** `1` | **422** `"Input should be a valid string"` | Coerción a string en la frontera |

Las tres capas estaban apiladas. Corregir la 1 destapó la 2; corregir la 2
destapó la 3. Esta ficha documenta la 3.

---

## 3. La causa raíz (con evidencia dura)

El usuario que entrega el ERP trae el id como **número**:

```js
// apps/pos/src/App.jsx
const [currentUser] = useState({
  id: 1,          // ← número, no string
  name: 'Victor',
  ...
});
```

El contrato de la API lo declara como **string**:

```python
# apps/api/routers/terminals.py
class LockEntrada(BaseModel):
    terminal_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)   # ← str
```

`JSON.stringify({ user_id: 1 })` produce `{"user_id":1}` (sin comillas).
Pydantic v2 lo rechaza. La prueba directa contra la API viva:

```text
$ curl -X POST .../pos/terminals/lock -d '{"terminal_id":"T2","user_id":1}'
{"detail":[{"type":"string_type","loc":["body","user_id"],
            "msg":"Input should be a valid string","input":1}]}
HTTP=422

$ curl -X POST .../pos/terminals/lock -d '{"terminal_id":"T2","user_id":"1"}'
{"success":true,"message":"Terminal T2 bloqueada"}
HTTP=200
```

Mismo id, mismo endpoint. La única diferencia es el **tipo**. Ese es el bug.

---

## 4. La corrección: coercer en la FRONTERA, no en el esquema

**Decisión arquitectónica:** el 422 NO se arregla relajando el esquema de la API
(aceptando `int | str`). Se arregla **coercionando en la frontera del cliente**,
porque:

1. El contrato declara `str` y esa declaración es correcta: los ids de usuario
   pueden ser UUID, `cajero-1`, `admin-2`… no siempre números.
2. La frontera HTTP es el lugar natural para normalizar tipos. Ni el hook ni el
   componente deben conocer el tipo exacto que exige el contrato.
3. Relajar el esquema propagaría la ambigüedad a todos los consumidores futuros.

Se añadió un helper `aIdTexto()` en **ambos** puntos de contacto con la API:

- [`apps/pos/src/services/terminalService.js`](../../apps/pos/src/services/terminalService.js)
  (contrato Fase 1: `lock`/`unlock` con `user_id`).
- [`apps/pos/src/api/client.js`](../../apps/pos/src/api/client.js)
  (contrato Fase 3.4: `latir`/`tomarLock`/`liberarLock` con `usuario_id`).

```js
function aIdTexto(usuarioId) {
  return usuarioId === null || usuarioId === undefined ? '' : String(usuarioId);
}
```

Los **seis** call sites (3 en cada archivo) ahora envían el id ya normalizado.

---

## 5. La puerta (gate)

### 5.1 Frontend — 7 tests

[`apps/pos/src/services/terminalService.f7_7c.test.jsx`](../../apps/pos/src/services/terminalService.f7_7c.test.jsx)

| Test | Qué fija |
|------|----------|
| lock coerciona id numérico | `1` → `"1"` |
| lock conserva id string | `cajero-1` → `cajero-1` |
| unlock coerciona id numérico | `7` → `"7"` |
| el JSON crudo no trae número | contiene `"user_id":"42"`, NO `"user_id":42` |
| id nulo/indefinido → cadena vacía | no rompe la serialización |
| las lecturas no llevan cuerpo | status/config siguen funcionando |
| saveConfig envía la lista tal cual | sin coerción indebida |

### 5.2 API — 2 tests nuevos (24 en total)

[`apps/api/tests/test_f7_7_terminales.py`](../../apps/api/tests/test_f7_7_terminales.py)

| Test | Qué fija |
|------|----------|
| `test_criterio10_user_id_numerico_es_rechazado_422` | El contrato NO acepta números (documenta la causa raíz) |
| `test_criterio10_user_id_texto_es_aceptado` | El mismo id como string sí toma el candado (200) |

El primer test es deliberadamente una **prueba negativa**: fija que el esquema
debe seguir siendo estricto, para que nadie "arregle" el 422 relajándolo.

---

## 6. Verificación

| Verificación | Resultado |
|--------------|-----------|
| Gate frontend F7.7c | **7 tests verdes** |
| Gate API F7.7 | **24 tests verdes** (era 22) |
| `npm run ci` | **lint 0 errores + todos los tests + 7 guards limpios** |
| Verificación en vivo (lock) | `{"success":true}` · **HTTP 200** |
| Verificación en vivo (status) | `occupier_id` (UUID) + `occupier_ref: "1"` · **HTTP 200** |

La verificación en vivo confirma la cadena completa: el lock entra, y el status
devuelve el id original en `occupier_ref`, así que el dueño reconoce su propia
terminal y el selector le permite entrar.

---

## 7. Lección transversal

> **Un contrato declara tipos; la frontera los respeta.**
>
> Cuando el productor de un dato (el ERP) y el consumidor (la API) no coinciden
> en el tipo, la normalización vive en la **frontera del cliente**, nunca en el
> esquema del servidor. Relajar el esquema para "que pase" es deuda técnica: el
> siguiente consumidor hereda la ambigüedad.

Esta lección se alinea con la **Prohibición #6** (no adivinar tipos en la
frontera) y con el principio de **frontera por contratos (A-02)**: el contrato
es la verdad; el cliente se adapta a él.

---

## 8. Alcance de la verificación

- ✅ Verificado: el lock/unlock/heartbeat aceptan el id en cualquier tipo de
  origen y lo normalizan a string antes de serializar.
- ✅ Verificado: el contrato de la API sigue siendo estricto (`str`).
- ✅ Verificado en vivo: lock 200 + status con `occupier_ref`.
- ⚠️ No verificado en navegador por el agente: la interacción visual final
  (clic en la tarjeta → entrada al POS). Requiere que el usuario recargue con
  caché limpia (`Ctrl + Shift + R`) porque el bundle anterior está cacheado.
