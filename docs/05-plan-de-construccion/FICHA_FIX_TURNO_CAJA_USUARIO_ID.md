# FICHA FIX — No se podía abrir el turno de caja: `usuario_id` llegaba `null` y el contrato exigía UUID

> **Tipo:** Corrección de bug en producción (bloqueo total de la caja)
> **Componentes:**
> - [`apps/pos/src/RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:126) — identidad del operador
> - [`apps/api/schemas.py`](../../apps/api/schemas.py:358) — `AbrirTurnoEntrada.usuario_id`
> - [`apps/api/contracts/registry.py`](../../apps/api/contracts/registry.py:289) — contrato 10 `caja.abrir_turno`
> **Estado:** ✅ CERRADA — HTTP 201 confirmado en vivo, 111 tests backend + 26 tests frontend en verde
> **Fecha:** 2026-10-07
> **Plan rector:** §10.6 (lecciones por clase de fallo) + REGLA DURA 2 ("verificar, no asumir") + A-02 (frontera por contratos) + precedente F7.7c (id numérico del ERP ≠ UUID)

---

## 1. Síntoma reportado

El dueño del proyecto reportó, textualmente:

> *"quise abrir turno de caja o habilitar caja y no pude"*

El POS **no podía abrir el turno de caja**. El botón de "Habilitar caja" / "Abrir
turno" no completaba la operación. La caja quedaba inutilizable: sin turno abierto
no se puede cobrar.

---

## 2. Diagnóstico (causa raíz)

El fallo era el resultado de **dos defectos en serie**: uno en el frontend y otro en
el contrato. Cada uno por separado ya rompía la operación; juntos la hacían
imposible de diagnosticar a simple vista.

### 2.1 Defecto A (frontend) — la identidad del operador era SIEMPRE `null`

En [`RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:126) el componente
pasaba la identidad del cajero a `GestorDeCaja` así:

```javascript
usuarioId={sesion?.employee_id || null}
```

Pero **`SesionActiva` (contrato 9) nunca expone `employee_id`**. El esquema
[`SesionActiva`](../../apps/api/schemas.py:83) solo declara:

```python
class SesionActiva(BaseModel):
    id: UUID
    terminal_id: str
    is_active: bool
```

Y la tabla `terminal_sessions` **no tiene la columna `employee_id`** — verificado en
vivo contra PostgreSQL:

```
ERROR:  column "employee_id" does not exist
```

Por lo tanto `sesion?.employee_id` era **siempre `undefined`**, y `usuarioId` caía a
`null` en cada render. El frontend enviaba `usuario_id: null` al backend.

### 2.2 Defecto B (contrato) — el id numérico del ERP no es un UUID

El contrato 10 declaraba `usuario_id` como **UUID obligatorio**:

```python
class AbrirTurnoEntrada(BaseModel):
    usuario_id: UUID   # ← rechaza el id numérico del ERP
```

Pero el ERP autentica al cajero con un **id NUMÉRICO** (`currentUser.id = 1`). Pydantic
v2 rechaza el entero con **HTTP 422**:

```json
{
  "detail": [{
    "type": "uuid_type",
    "loc": ["body", "usuario_id"],
    "msg": "UUID input should be a string, bytes or UUID object",
    "input": 1
  }]
}
```

Confirmado en vivo con `curl` contra `nuevo_pos_api`:

| Petición | Resultado |
|---|---|
| `POST /cash/open-session` con `usuario_id: null` | **HTTP 422** |
| `POST /cash/open-session` con `usuario_id: 1` | **HTTP 422** (`uuid_type`) |

### 2.3 La cadena del bloqueo

1. El frontend deriva `usuarioId` de `sesion?.employee_id` → **siempre `null`**.
2. Envía `usuario_id: null` (o, si se corrigiera solo eso, el id numérico `1`).
3. El contrato exige `UUID` → Pydantic responde **422**.
4. `GestorDeCaja` recibe el fallo y no abre el turno.
5. Sin turno abierto, la caja queda bloqueada.

**Es la MISMA clase de bug que F7.7c**: el id del ERP es un número, no un UUID, y la
frontera no lo toleraba.

---

## 3. Corrección aplicada

### 3.1 Frontend — derivar la identidad del usuario AUTENTICADO

En [`RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:126) se deriva
`usuarioId` **una sola vez** desde `currentUser` (el usuario autenticado por el ERP),
no desde la sesión de terminal:

```javascript
// FICHA_FIX_TURNO_CAJA_USUARIO_ID (7 Oct 2026) — IDENTIDAD DEL OPERADOR.
// El operador es el usuario AUTENTICADO por el ERP (`currentUser`), no la
// sesión de terminal. `SesionActiva` (contrato 9) NUNCA expone `employee_id`
// —la tabla `terminal_sessions` no tiene esa columna—, así que
// `sesion?.employee_id` era SIEMPRE `undefined`. Eso dejaba `usuarioId` en
// `null` y el backend rechazaba abrir el turno con 422 (`uuid_type`).
// Se deriva UNA sola vez aquí y se usa en los tres puntos que lo necesitan.
const usuarioId = currentUser?.id ?? null;
```

Ese único valor se usa en los **tres** puntos que lo necesitan:

| Punto | Antes | Ahora |
|---|---|---|
| `useTerminalLocking` | `usuarioId: sesion?.employee_id \|\| null` | `usuarioId` |
| Payload de liberación de lock | `occupier_id: sesion?.employee_id` | `occupier_id: String(usuarioId)` |
| `<GestorDeCaja>` | `usuarioId={sesion?.employee_id \|\| null}` | `usuarioId={usuarioId}` |

El payload de liberación de lock ahora es defensivo:

```javascript
if (usuarioId === null || usuarioId === undefined) return null;
return { occupier_id: String(usuarioId) };
```

### 3.2 Contrato — aceptar `UUID | String | Int` y normalizar a UUID determinista

En [`schemas.py`](../../apps/api/schemas.py:358) el contrato 10 ahora acepta el id
numérico del ERP y lo normaliza en la frontera:

```python
class AbrirTurnoEntrada(BaseModel):
    usuario_id: str | int | UUID
    # ...

    @field_validator("usuario_id", mode="before")
    @classmethod
    def _normalizar_usuario_id(cls, valor: object) -> UUID:
        if isinstance(valor, UUID):
            return valor
        if isinstance(valor, str):
            try:
                return UUID(valor)
            except (ValueError, AttributeError):
                return uuid5(ESPACIO_IDS_ERP, valor)
        if isinstance(valor, int):
            return uuid5(ESPACIO_IDS_ERP, str(valor))
        raise ValueError("usuario_id debe ser un UUID o un id de empleado")
```

El espacio de nombres es una constante **inmutable**:

```python
# El mismo id del ERP produce SIEMPRE el mismo UUID, así que la identidad del
# cajero es estable entre turnos, cortes y reportes. El valor es arbitrario
# pero INMUTABLE: cambiarlo reasignaría la identidad de todos los cajeros.
ESPACIO_IDS_ERP = UUID("6f2a1c9e-0b7d-4e3a-9c5f-1d8b2a4e6f70")
```

### 3.3 Contrato declarado — `registry.py`

En [`contracts/registry.py`](../../apps/api/contracts/registry.py:289) el contrato 10
`caja.abrir_turno` declara el tipo tolerante:

```python
"usuario_id": "UUID | String | Int",
```

### Archivos

| Archivo | Rol | Cambio |
|---|---|---|
| `apps/pos/src/RetailVisionPOS.jsx` | Identidad del operador | `sesion?.employee_id` → `currentUser?.id` (3 usos) |
| `apps/api/schemas.py` | `AbrirTurnoEntrada.usuario_id` | `UUID` → `str \| int \| UUID` + validador uuid5 |
| `apps/api/contracts/registry.py` | Contrato 10 | `"UUID"` → `"UUID \| String \| Int"` |
| `apps/api/tests/test_fix_turno_caja_usuario_id.py` | Puerta de regresión | 5 tests nuevos |

---

## 4. Decisión de diseño

### 4.1 La identidad del operador vive en el usuario autenticado, no en la sesión

La sesión de terminal (`terminal_sessions`) responde a la pregunta *"¿qué terminal
está ocupada y por quién tiene el lock?"*. **No** responde *"¿quién es el cajero que
opera?"*. Esa segunda pregunta la responde el ERP al autenticar (`currentUser`). Leer
`employee_id` de la sesión de terminal era un error de modelado: la columna no existe
porque el dato no pertenece ahí.

### 4.2 El UUID determinista preserva la trazabilidad

El ERP solo da un número. Si se guardara el número crudo en `cash_sessions.employee_id`
(una columna UUID), habría que cambiar el esquema. En su lugar, se deriva un UUID
**determinista** con `uuid5(ESPACIO_IDS_ERP, str(id))`:

- El **mismo** id del ERP produce **siempre** el **mismo** UUID.
- La identidad del cajero es **estable** entre turnos, cortes y reportes diarios.
- El corte y el reporte agrupan por cajero con un identificador consistente.
- No se toca el esquema de `cash_sessions` (la columna sigue siendo UUID).

### 4.3 Un UUID real pasa intacto

Un consumidor que ya envíe un UUID real (como los tests de F4.1 y F10.5, que usan
`str(uuid.uuid4())`) **no se ve afectado**: el validador lo detecta y lo devuelve sin
cambios. La corrección es **retrocompatible**.

### 4.4 Alternativa descartada: cambiar el esquema a `employee_id: str`

Se podría haber cambiado `cash_sessions.employee_id` de UUID a texto para guardar el
número del ERP. Se descartó porque:
- Rompería la consistencia de tipos del esquema (todas las FKs son UUID).
- Perdería la unicidad garantizada por el tipo UUID.
- El UUID determinista resuelve el problema **sin migración**.

---

## 5. Verificación (REGLA DURA 2 — verificar, no asumir)

### 5.1 Verificación en vivo (end-to-end)

Tras `docker restart nuevo_pos_api` (el contenedor no corre con `--reload`):

```
POST /cash/open-session  { "usuario_id": 1, ... }
→ HTTP 201
→ { "cash_session_id": "8d57717d-0a18-4cfe-894f-ef0ffac64f19", ... }
```

La fila persistida en `cash_sessions`:

| id | terminal_id | employee_id | employee_name | opening_float | status |
|---|---|---|---|---|---|
| `8d57717d-…` | `TERM-01` | `ba005378-6fd0-5831-bebb-31618ba339e6` | `Victor` | `100.00` | `OPEN` |

El `employee_id` es exactamente `uuid5(ESPACIO_IDS_ERP, "1")` — el UUID determinista
esperado. La fila de prueba se eliminó después.

### 5.2 Puerta de regresión

Nuevo archivo [`test_fix_turno_caja_usuario_id.py`](../../apps/api/tests/test_fix_turno_caja_usuario_id.py)
con **5 tests**:

| Test | Qué verifica |
|---|---|
| `test_el_esquema_acepta_un_id_numerico_del_erp` | `usuario_id: 1` no lanza 422 |
| `test_el_id_numerico_mapea_a_un_uuid_determinista` | `1` y `"1"` dan el mismo UUID |
| `test_un_uuid_real_pasa_intacto` | Un UUID real pasa sin cambios |
| `test_abrir_turno_con_id_numerico_del_erp` | POST → 201 y persiste el UUID determinista |
| `test_el_id_numerico_es_estable_entre_turnos` | Dos turnos comparten `employee_id` |

Resultado: **5 passed**.

### 5.3 Sin regresiones

| Suite | Resultado |
|---|---|
| Backend: `test_f4_1_caja_api` + `test_f10_5_paridad_caja` + `test_fix_turno_caja_usuario_id` + `test_f3_comportamiento` | **111 passed** |
| Frontend: `RetailVisionPOS.f4_5` + `f3_cierre` + `f7_7d` + `GestorDeCaja.f4_3` | **26 passed** (4 archivos) |

---

## 6. Lección para futuras IAs

### 6.1 Un campo que "siempre existe" puede no existir nunca

`sesion?.employee_id` **compila**, **no lanza error** y **devuelve `undefined`** en
silencio. El operador `?.` oculta el defecto: el código parece defensivo pero en
realidad enmascara que el campo **nunca** está presente. Antes de leer un campo de un
objeto, **verificar que el esquema lo declara**.

### 6.2 El id del ERP es un número — es la segunda vez (F7.7c)

Ya pasó en F7.7c: el id del ERP es un número y Pydantic lo rechaza como UUID. **Toda
frontera que reciba un id del ERP debe tolerar `str | int | UUID`.** Este es el
segundo caso; debe ser el último.

### 6.3 Un bug puede ser dos bugs en serie

El frontend mandaba `null` **y** el contrato exigía UUID. Corregir solo uno no habría
bastado: con el frontend arreglado, el id numérico `1` seguiría dando 422. **Diagnosticar
la cadena completa, no el primer eslabón.**

### 6.4 Verificar contra la base de datos real, no contra la intención

El diagnóstico se cerró consultando `terminal_sessions` en PostgreSQL y viendo que
**la columna `employee_id` no existe**. La suposición ("seguro la sesión trae el
empleado") se desmintió con un `SELECT`. REGLA DURA 2.

---

## 7. Referencias

- Precedente: **F7.7c** — el id del ERP es un número, no un UUID.
- Contrato 9: [`SesionActiva`](../../apps/api/schemas.py:83) — no expone `employee_id`.
- Contrato 10: [`caja.abrir_turno`](../../apps/api/contracts/registry.py:289).
- RN-49: una sola sesión de caja OPEN por terminal.
- RN-50: fondo de apertura.
- A-02: frontera por contratos (el consumidor pregunta por operación, no lee la tabla).
