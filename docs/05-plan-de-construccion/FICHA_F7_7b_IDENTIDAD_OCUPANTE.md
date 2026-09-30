# FICHA F7.7b — Identidad del ocupante de la terminal (el segundo bloqueo)

**Fase:** 7.7b (corrección del bloqueo de entrada a terminales)
**Fecha:** 2026-09-30
**Estado:** ✅ CERRADA
**Predecesora:** F7.7 (router de terminales — el hueco de la Fase 1)

---

## 1. El síntoma reportado

Tras cerrar F7.7 (el router de terminales ya existía y respondía 200), el usuario
volvió a probar y reportó:

> *"pues quise entrar y no me dejo entrar"*

Es decir: el primer bloqueo (el 404) estaba resuelto, pero **la entrada seguía
negada**. Había una segunda causa, más profunda, escondida detrás de la primera.

---

## 2. El diagnóstico

La API respondía correctamente. El problema estaba en **la comparación de
identidad** entre lo que la API devuelve y lo que el frontend espera.

### La cadena del fallo

1. El frontend identifica al usuario con un id **original**: `currentUser.id = 1`
   (definido en [`App.jsx`](../../apps/pos/src/App.jsx:38)).
2. Al tomar el candado, el frontend envía ese id: `{ terminal_id: "T1", user_id: 1 }`.
3. La API, para respetar la regla **C-01** (toda identidad es UUID), convierte
   ese `1` en un UUID determinista con `uuid5`:
   `ddfc5cb5-e91b-5ada-b4e2-2793e2cd1ba2`.
4. El status devolvía **solo** ese UUID en `occupier_id`.
5. El frontend comparaba `info.occupier_id === currentUser.id`, es decir:
   `"ddfc5cb5-..." === 1` → **siempre falso**.

### El efecto visible

Como la comparación nunca era verdadera, la función
[`resolveCardState()`](../../apps/pos/src/utils/terminalCardState.js:22) nunca
devolvía `'mine'`. Resultado:

- La terminal recién tomada por el propio usuario se pintaba como **"ocupada"**.
- Al tocar la tarjeta, [`handleSelect()`](../../apps/pos/src/components/TerminalSelector.jsx:164)
  caía en la rama `state === 'occupied'` y mostraba
  *"Terminal ocupada por otro usuario"* — **bloqueando la entrada al propio dueño**.

En palabras simples: **el sistema no reconocía al usuario como dueño de su propia
terminal**, porque comparaba su nombre con su número de identificación interno.

---

## 3. La corrección

Se expone el id **original** del usuario junto al UUID canónico, sin romper C-01.

### 3.1 API — [`terminals.py`](../../apps/api/routers/terminals.py:193)

La proyección `_a_estado()` ahora incluye un campo nuevo, `occupier_ref`, con el
id tal como lo envió el cliente (guardado en `occupier_name`):

```python
return {
    "occupier_id": str(candado.occupier_id),   # UUID canónico (C-01)
    "occupier_ref": candado.occupier_name,     # id ORIGINAL del usuario
    "occupier_name": candado.occupier_name,
    "locked_at": candado.locked_at.isoformat(),
    "stale_session": False,
}
```

Cuando la terminal está libre, `occupier_ref` es `None` (no un UUID fantasma).

### 3.2 Frontend — [`terminalCardState.js`](../../apps/pos/src/utils/terminalCardState.js:22)

La comparación usa `occupier_ref` (con fallback a `occupier_id` por
compatibilidad) y es tolerante al tipo (`1` y `"1"` son el mismo usuario):

```js
const referencia = info.occupier_ref ?? info.occupier_id;
if (String(referencia) === String(currentUserId)) return 'mine';
```

---

## 4. La puerta (gate)

### 4.1 API — [`test_f7_7_terminales.py`](../../apps/api/tests/test_f7_7_terminales.py:1)

**22 tests** (19 previos + 3 nuevos del criterio 2):

| Test | Qué fija |
|------|----------|
| `test_criterio2_status_expone_occupier_ref_original` | El status expone el id original en `occupier_ref`, distinto del UUID |
| `test_criterio2_occupier_ref_es_none_si_libre` | Una terminal libre no inventa un `occupier_ref` |
| `test_criterio2_occupier_ref_sobrevive_al_lock` | Tras un lock real, `occupier_ref` devuelve el id enviado |

### 4.2 Frontend — [`terminalCardState.test.jsx`](../../apps/pos/src/utils/terminalCardState.test.jsx:1)

**11 tests**, incluida la regresión explícita:

| Test | Qué fija |
|------|----------|
| `el dueño se reconoce a sí mismo por occupier_ref` | El caso exacto que bloqueaba la entrada |
| `REGRESIÓN: comparar contra el UUID NO debe marcar la terminal como mía` | Si alguien vuelve a comparar contra `occupier_id`, el test lo delata |
| `compatibilidad: sin occupier_ref cae al occupier_id` | Respuestas antiguas siguen clasificando bien |

---

## 5. Verificación en vivo

Contra la API viva, el flujo completo del frontend:

```
POST /pos/terminals/lock  {"terminal_id":"T1","user_id":"1"}
→ {"success":true,"message":"Terminal T1 bloqueada"}

GET /pos/terminals/status
→ "T1":{"occupier_id":"ddfc5cb5-...","occupier_ref":"1", ...}
```

`occupier_ref = "1"` coincide con `currentUser.id = 1` → la tarjeta resuelve a
`'mine'` → **la entrada se permite**.

---

## 6. Resultado de la puerta completa

| Puerta | Resultado |
|--------|-----------|
| API `test_f7_7_terminales.py` | ✅ 22 passed |
| Frontend `terminalCardState.test.jsx` | ✅ 11 passed |
| CI completo (`npm run ci`) | ✅ lint 0 errores + todos los tests + 7 guards limpios |
| Verificación en vivo | ✅ `occupier_ref` = id original |

---

## 7. La lección (por qué esto importa)

Este bug es una **cicatriz**, no deuda. Documenta un patrón de fallo que puede
repetirse en cualquier módulo del ERP:

> **Cuando la base de datos normaliza una identidad (UUID) pero el cliente
> identifica al usuario con su id original, la frontera debe exponer AMBOS.**
> Comparar el id del cliente contra el id normalizado de la base es una
> comparación que nunca puede ser verdadera.

El gate lo blinda: el test de regresión falla si alguien vuelve a comparar
contra el UUID. La próxima vez, la alarma suena antes de que el usuario lo note.

---

## 8. Archivos tocados

| Archivo | Cambio |
|---------|--------|
| [`apps/api/routers/terminals.py`](../../apps/api/routers/terminals.py:193) | `_a_estado()` expone `occupier_ref` |
| [`apps/pos/src/utils/terminalCardState.js`](../../apps/pos/src/utils/terminalCardState.js:22) | Compara contra `occupier_ref` (fallback + tolerancia de tipo) |
| [`apps/api/tests/test_f7_7_terminales.py`](../../apps/api/tests/test_f7_7_terminales.py:1) | +3 tests del criterio 2 |
| [`apps/pos/src/utils/terminalCardState.test.jsx`](../../apps/pos/src/utils/terminalCardState.test.jsx:1) | Nuevo — 11 tests de regresión |
