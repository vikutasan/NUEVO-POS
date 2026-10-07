# FICHA — FIX: "Envié una cuenta al pizarrón y no apareció — Los datos recibidos no son válidos"

**Fecha:** 7 de octubre de 2026
**Reportado por:** el usuario (operación real)
**Estado:** ✅ CORREGIDO, VERIFICADO EN VIVO Y EN SUITE
**Commit:** (pendiente de push)

---

## 1. El reporte (verbatim)

> "envie una cuenta al pizarron y en el pizarron no aparecio, me salio Los datos recibidos no son válidos."

Traducción operativa: el cajero envió una cuenta al pizarrón. La cuenta **NO apareció** en el
pizarrón y la pantalla mostró el mensaje **"Los datos recibidos no son válidos."**

---

## 2. El diagnóstico (la causa raíz REAL)

### 2.1 De dónde sale el mensaje

El texto exacto **"Los datos recibidos no son válidos."** vive en
[`OpenAccountsCorkboard.jsx`](../apps/pos/src/components/OpenAccountsCorkboard.jsx:116) — el mapa
`mensajeDeError(reason)` del pizarrón:

```js
function mensajeDeError(reason) {
  const mapa = {
    datos_invalidos: 'Los datos recibidos no son válidos.',
    ...
  };
}
```

Ese `reason: 'datos_invalidos'` lo produce el servicio
[`openAccountsService.js`](../apps/pos/src/services/openAccountsService.js:35) cuando el backend
responde **HTTP 422**:

```js
function motivo(err) {
  if (err.status === 422) return 'datos_invalidos';
  ...
}
```

### 2.2 Por qué el backend respondía 422

El pizarrón, en **modo CAJA** (D1 — cuando `cajaHabilitada === true`), lista las cuentas de
**TODAS** las terminales. Para eso el hook
[`useOpenAccounts.js`](../apps/pos/src/hooks/useOpenAccounts.js:87) llama:

```js
servicioRef.current.listarTodasLasCuentasAbiertas();
```

Y ese servicio, en [`client.js`](../apps/pos/src/api/client.js:354), cuando el `terminalId` viene
vacío, llama al endpoint **SIN** el parámetro:

```js
export function listarCuentasAbiertas(terminalId) {
  if (!terminalId) return peticion('/pos/open-accounts');   // ← sin ?terminal_id=
  return peticion(`/pos/open-accounts?terminal_id=${terminalId}`);
}
```

**El defecto:** el endpoint `GET /pos/open-accounts` (contrato 23) declaraba `terminal_id` como
**OBLIGATORIO**:

```python
terminal_id: str = Query(..., min_length=1)   # ← REQUERIDO
```

Al no recibir el parámetro, **FastAPI devuelve 422** (missing required query param) **antes** de
entrar al handler. El frontend traduce ese 422 a `datos_invalidos` y el pizarrón muestra
"Los datos recibidos no son válidos." La cuenta nunca se lista.

### 2.3 La contradicción de diseño

El propio contrato 23 declaraba `errores=("400 si terminal_id está vacío.",)` — es decir, el
contrato **asumía** que el modo CAJA (listar todas) no existía. Pero la decisión **D1** (5 Oct 2026)
introdujo justamente ese modo para dar paridad con el viejo POS (`getOpenTickets()`). El backend
quedó desalineado con la decisión de producto.

---

## 3. La corrección

### 3.1 Backend — `terminal_id` pasa a ser OPCIONAL

En [`pos.py`](../apps/api/routers/pos.py:767), el endpoint `GET /pos/open-accounts`:

```python
@router.get("/open-accounts", response_model=CuentasAbiertasSalida)
async def cuentas_abiertas(
    terminal_id: str | None = Query(None),          # ← OPCIONAL
    db: AsyncSession = Depends(get_db),
) -> CuentasAbiertasSalida:
    """... FICHA_FIX_PIZARRON_422 (7 Oct 2026) — `terminal_id` es OPCIONAL:
      - Si viene, devuelve SOLO las cuentas OPEN de esa terminal (RN-31).
      - Si se OMITE, devuelve TODAS las cuentas OPEN de TODAS las terminales
        (modo CAJA — D1, paridad con el viejo POS `getOpenTickets()`).
    ..."""
    consulta = (
        select(Ticket)
        .where(Ticket.status == "OPEN")
        .order_by(Ticket.created_at.asc())
    )
    # FICHA_FIX_PIZARRON_422 — filtro por terminal SOLO si se pidió una.
    if terminal_id is not None and terminal_id.strip():
        consulta = consulta.where(Ticket.terminal_id == terminal_id)
    filas = (await db.execute(consulta)).scalars().all()
    return CuentasAbiertasSalida(
        cuentas=[CuentaAbiertaSalida.model_validate(t) for t in filas]
    )
```

**Antes:** `Query(..., min_length=1)` + `raise HTTPException(400)` si vacío + filtro incondicional.
**Después:** `Query(None)` + filtro condicional. Un `terminal_id` vacío (`?terminal_id=`) se trata
como "sin filtro" (modo CAJA), no como error.

### 3.2 Contrato 23 — declaración actualizada

En [`registry.py`](../apps/api/contracts/registry.py:630):

- `entrada={"terminal_id": "String = NULL (opcional)"}`
- Garantía añadida: "FICHA_FIX_PIZARRON_422 — si `terminal_id` se OMITE (o viene vacío), devuelve
  TODAS las cuentas OPEN de TODAS las terminales (modo CAJA)."
- `errores=()` (ya no hay 400 por terminal_id vacío).
- `estado_hoy="FASE 5.0 + F12.6 + FICHA_FIX_PIZARRON_422"`.

---

## 4. Tabla de cambios

| Archivo | Cambio |
|---|---|
| [`apps/api/routers/pos.py`](../apps/api/routers/pos.py:767) | `terminal_id` de `Query(..., min_length=1)` → `Query(None)`; filtro condicional; docstring FICHA_FIX_PIZARRON_422 |
| [`apps/api/contracts/registry.py`](../apps/api/contracts/registry.py:630) | Contrato 23: entrada opcional, garantía del modo CAJA, `errores=()`, `estado_hoy` |
| [`apps/api/tests/test_f5_cuentas.py`](../apps/api/tests/test_f5_cuentas.py:310) | Reemplaza el test obsoleto `test_terminal_id_vacio_es_rechazado` (afirmaba 422) por `test_sin_terminal_id_devuelve_todas` y `test_terminal_id_vacio_devuelve_todas` |

---

## 5. Tests de regresión

En [`test_f5_cuentas.py`](../apps/api/tests/test_f5_cuentas.py:310):

1. **`test_sin_terminal_id_devuelve_todas`** — sin `terminal_id`, devuelve las cuentas OPEN de
   TODAS las terminales (subconjunto `{TERMINAL_A, TERMINAL_B} <= terminales`).
2. **`test_terminal_id_vacio_devuelve_todas`** — un `terminal_id` vacío se trata como "sin filtro"
   (modo CAJA), **no** 422.

Ambos usan el helper `_crear_ticket(ent, terminal_id)` (inserción directa en BD) para no depender
de una sesión de terminal activa.

---

## 6. Verificación

| Prueba | Resultado |
|---|---|
| `pytest tests/test_f5_cuentas.py` | **7 passed** |
| `pytest` (suite completa, sin `test_f7_7_terminales.py`) | **287 passed** |
| `npm run test -- --run` (frontend) | **64 files, 722 tests, 0 failures** |
| En vivo `GET /pos/open-accounts` (sin param) | **200** (antes 422) |
| En vivo `GET /pos/open-accounts?terminal_id=TERM-01` | **200** |
| En vivo `GET /pos/open-accounts?terminal_id=` (vacío) | **200** (antes 422) |

### 6.1 Nota de honestidad — los 28 fallos de `test_f7_7_terminales.py`

La suite completa reporta **28 failed, 287 passed**. Los 28 fallos están **TODOS** en
`test_f7_7_terminales.py` y son **PRE-EXISTENTES**, ajenos a esta corrección:

- Causa: `ForeignKeyViolationError` — `DELETE FROM cash_sessions` viola la FK
  `fk_tickets_cash_session_id_cash_sessions` (un ticket de prueba referencia la sesión de caja).
- El helper [`_limpiar()`](../apps/api/tests/test_f7_7_terminales.py:75) borra `cash_sessions`
  **sin borrar antes** los `tickets` que la referencian.
- **Comprobado con `git stash`:** con los cambios de esta ficha **guardados** (código limpio en
  `daed18a`), el archivo sigue fallando **28 failed in 12.46s** con el MISMO error. Es un bug de
  aislamiento de tests, no de la corrección.

---

## 7. La lección

**Un contrato que declara un parámetro como obligatorio cuando el producto ya decidió que es
opcional es una bomba de tiempo.** La decisión D1 (modo CAJA = listar todas) se tomó en el
frontend, pero el contrato 23 siguió exigiendo `terminal_id`. El síntoma (422 → "datos no válidos")
aparecía lejos de la causa (una firma de FastAPI). **Cuando una decisión de producto cambia el
"qué", hay que revisar TODOS los contratos que la sirven, no solo la UI que la dispara.**
