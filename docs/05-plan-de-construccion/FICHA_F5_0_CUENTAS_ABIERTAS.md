# FICHA F5.0 — Prerrequisito del Pizarrón: contrato 23 + endpoint

> **Fase:** 5 (Pizarrón de Cuentas Abiertas) — Sub-fase **5.0**
> **Estado:** ✅ CERRADA — puerta en verde
> **Fecha:** 2026-09-29
> **Commit:** _(se registra al final de esta ficha)_
> **Plan de abordaje:** [`PLAN_DE_ABORDAJE_FASE_5_POR_PARTES.md`](../../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_5_POR_PARTES.md) §4.0

---

## 1. Por qué existe esta sub-fase

El Plan Maestro §7 (Fase 5) promete un **"Pizarrón de Cuentas Abiertas"**: varias
cuentas en paralelo sobre la misma terminal, con recuperación de cuenta desde
otra terminal (flujo E.3, reglas RN-31/RN-32/RN-33).

La **autocrítica del plan de Fase 5 (defecto D-1)** detectó, con evidencia, que
el contrato 23 **NO existía**:

- `contracts/registry.py` declaraba **22 contratos** (1–22). Ninguno exponía las
  cuentas abiertas de una terminal.
- `routers/pos.py` no tenía ningún endpoint de cuentas abiertas.
- El frontend, por lo tanto, **no tenía forma legítima** de preguntar "¿qué
  cuentas están abiertas en esta terminal?" sin leer la tabla `tickets`
  directamente — lo que **viola A-02** (frontera por contratos: prohibido leer
  tablas ajenas).

Sin este prerrequisito, las sub-fases 5.1/5.2/5.3 (servicio, hook y pizarrón)
no tendrían a qué llamar. **F5.0 construye la frontera primero.**

---

## 2. Qué se construyó (4 archivos tocados)

### 2.1 `apps/api/schemas.py` — la proyección ligera

Se añadieron dos esquemas al final del archivo:

```python
class CuentaAbiertaSalida(BaseModel):
    """Una cuenta abierta del pizarrón (contrato 23).

    RESPUESTA LIGERA: EXACTAMENTE 5 campos escalares (Regla 15). NO incluye las
    líneas: leer las líneas es responsabilidad del contrato 21.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    account_num: str
    status: str
    total: Decimal
    version: int


class CuentasAbiertasSalida(BaseModel):
    """Salida del contrato 23: las cuentas OPEN de una terminal (RN-31)."""

    cuentas: list[CuentaAbiertaSalida] = Field(default_factory=list)
```

**Decisión de diseño:** `CuentaAbiertaSalida` expone **exactamente 5 campos
escalares** (`id`, `account_num`, `status`, `total`, `version`). Es la
aplicación literal de la **Regla 15** (respuesta ligera) y de la lección de la
batalla: el pizarrón necesita saber *qué* cuentas hay y *cuánto* llevan, no
*qué* tienen dentro. Leer las líneas es del contrato 21
(`GET /pos/tickets/{id}`), y se hace **solo al recuperar** una cuenta concreta.

`model_config = ConfigDict(from_attributes=True)` permite construir la salida
directamente desde el ORM (`CuentaAbiertaSalida.model_validate(ticket)`).

### 2.2 `apps/api/contracts/registry.py` — el contrato 23

Se añadió el contrato **al FINAL de la tupla** (después del 22), con un
comentario de sección `# ── FASE 5.0 ──`:

```python
Contrato(
    numero=23,
    nombre="pos.cuentas_abiertas",
    consumidor="POS",
    proveedor="POS",
    operacion="GET /pos/open-accounts",
    entrada={"terminal_id": "String"},
    salida={"cuentas": "List[CuentaAbiertaSalida]"},
    garantias=(
        "Devuelve una PROYECCIÓN de las cuentas OPEN, no la tabla `tickets` (O-23).",
        "RESPUESTA LIGERA: cada cuenta expone EXACTAMENTE 5 campos escalares (Regla 15).",
        "Solo devuelve cuentas de la terminal pedida (RN-31).",
        "NO devuelve las líneas: leer las líneas es del contrato 21.",
    ),
    errores=("400 si `terminal_id` está vacío.",),
    estado_hoy="FASE 5.0",
),
```

Y se actualizó el docstring de `listar_contratos()` de "22 contratos" a
**"23 contratos"**.

**Decisión de diseño:** el contrato se colocó **al final** (no intercalado)
para que el orden de la tupla siga siendo `1..23` y las puertas que comparan
listas ordenadas no se rompan por un reordenamiento accidental.

### 2.3 `apps/api/routers/pos.py` — el endpoint

Se añadieron los imports de los dos esquemas nuevos y **un único** endpoint:

```python
@router.get("/open-accounts", response_model=CuentasAbiertasSalida)
async def cuentas_abiertas(
    terminal_id: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
) -> CuentasAbiertasSalida:
    """Lista las cuentas OPEN de una terminal (contrato 23, FASE 5.0)."""
    if not terminal_id or not terminal_id.strip():
        raise HTTPException(status_code=400, detail="terminal_id es obligatorio")

    filas = (
        await db.execute(
            select(Ticket)
            .where(Ticket.terminal_id == terminal_id)
            .where(Ticket.status == "OPEN")
            .order_by(Ticket.created_at.asc())
        )
    ).scalars().all()

    return CuentasAbiertasSalida(
        cuentas=[CuentaAbiertaSalida.model_validate(t) for t in filas]
    )
```

**Decisiones de diseño:**

1. **Solo lectura.** No crea, no modifica, no borra. Es una consulta.
2. **Filtro doble:** `terminal_id == terminal_id` **Y** `status == "OPEN"`.
   Nunca devuelve cuentas de otra terminal (RN-31) ni cuentas ya cobradas.
3. **Orden `created_at.asc()`:** la cuenta más antigua primero, "como un corcho
   real" — el cajero ve arriba la que lleva más tiempo abierta.
4. **`min_length=1` en `Query`:** FastAPI rechaza `terminal_id=""` con **422**
   antes de entrar al handler. El guard explícito de 400 queda como segunda
   línea de defensa (captura cadenas de solo espacios, que sí pasan
   `min_length=1`).

### 2.4 `apps/api/tests/test_f2_frontera.py` — la puerta de frontera actualizada

La puerta de FASE 2 afirmaba "hay exactamente **22** contratos". Al añadir el
23, esa afirmación dejó de ser cierta. Se actualizó **en tres puntos**:

- `LOS_22_CONTRATOS` → **`LOS_23_CONTRATOS`**, con `"pos.cuentas_abiertas"`
  añadido al final de la tupla.
- `test_criterio2_hay_exactamente_22_contratos` →
  **`test_criterio2_hay_exactamente_23_contratos`** (assert `== 23`).
- `test_criterio3_el_pos_es_proveedor_en_sus_contratos`: la lista de contratos
  cuyo proveedor es POS pasó de 7 a **8** (se añadió `pos.cuentas_abiertas`).
- `test_listar_contratos_devuelve_los_22` →
  **`test_listar_contratos_devuelve_los_23`** (assert `== 23`).

**Esto NO es "ajustar el test para que pase".** Es la consecuencia correcta de
un cambio de frontera deliberado: el contrato 23 es real, está implementado y
tiene su propia puerta (`test_f5_cuentas.py`). La puerta de FASE 2 solo
*contaba* contratos; ahora cuenta 23.

---

## 3. La puerta de F5.0 — `apps/api/tests/test_f5_cuentas.py`

Archivo nuevo, **303 líneas**, **6 tests**. Verifica cuatro criterios:

| # | Test | Qué prueba |
|---|------|-----------|
| 1 | `test_contrato_23_declarado` | El contrato 23 existe, con nombre, operación, consumidor, proveedor, entrada y salida. |
| 2 | `test_lista_solo_las_cuentas_open_de_la_terminal` | Siembro 2 cuentas OPEN en la terminal A y 1 en la B → solo devuelve las 2 de A (RN-31). |
| 3 | `test_no_devuelve_cuentas_cobradas` | Una cuenta marcada `PAID` NO aparece en el pizarrón (solo `status == "OPEN"`). |
| 4 | `test_respuesta_ligera_max_5_campos` | Cada cuenta expone **exactamente** `{id, account_num, status, total, version}` (Regla 15). |
| 5 | `test_terminal_id_vacio_es_rechazado` | `terminal_id=""` → **422** (validación de FastAPI), nunca 200 con lista vacía. |
| 6 | `test_terminal_sin_cuentas_devuelve_lista_vacia` | Una terminal sin cuentas → 200 con `cuentas: []`, no 404. |

**Aislamiento de event loop:** cada test crea su **propio engine async** ligado
al loop de ese test y sobreescribe la dependencia `get_db` de FastAPI — el
mismo patrón que las puertas de FASE 3.2 y FASE 4.0. Esto evita el clásico
"attached to a different loop" de SQLAlchemy async en pytest.

**Siembra directa en BD:** `_crear_ticket` inserta el ticket **directo en la
BD** (no vía HTTP) para poder sembrar cuentas de **dos terminales distintas**
sin depender de dos sesiones de terminal activas. `account_num` es NOT NULL en
el esquema (es el folio, RN-10), así que se le da explícitamente.

---

## 4. Evidencia de la puerta en verde

### 4.1 Puerta de F5.0

```
$ docker exec nuevo_pos_api python -m pytest tests/test_f5_cuentas.py -q
......                                                                   [100%]
6 passed in 1.71s
```

### 4.2 Puerta de frontera (FASE 2) — actualizada a 23

```
$ docker exec nuevo_pos_api python -m pytest tests/test_f2_frontera.py -q
.........                                                                [100%]
9 passed in 0.50s
```

### 4.3 Suite completa de la API — sin regresiones

```
$ docker exec nuevo_pos_api python -m pytest -q
........................................................................ [ 33%]
........................................................................ [ 67%]
.....................................................................    [100%]
213 passed in 4.73s
```

> **Antes de F5.0:** 207 tests. **Después:** 213. El delta de **+6** son
> exactamente los 6 tests nuevos de `test_f5_cuentas.py`. Ningún test existente
> se rompió.

### 4.4 Guardianes de estándares

```
$ node scripts/guards.mjs
Archivos de código escaneados: 98
[OK  ] E-05 — Silencios en ruta crítica → 0 coincidencia(s)
[OK  ] A-04 — Silencios en la ruta crítica de guardianes → 0 coincidencia(s)
[OK  ] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
[OK  ] E-15 — TODOs sin formato declarado → 0 coincidencia(s)
[OK  ] R-01 — Ancho fijo en la superficie → 0 coincidencia(s)
[OK  ] E-09 — Dinero en Float → 0 coincidencia(s)
[OK  ] E-10 — Tiempo naive → 0 coincidencia(s)
PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE
```

### 4.5 Runner completo del proyecto

```
$ npm run test
  Tests de Node      : 3/3 archivo(s) en verde
  Tests de componentes: PASA
  Tests de API       : PASA
  ✅ RESULTADO: TODOS LOS TESTS EN VERDE.
```

---

## 5. Trazabilidad regla → test

| Regla / Estándar | Enunciado | Test que lo prueba |
|------------------|-----------|--------------------|
| **A-02** | Frontera por contratos: prohibido leer tablas ajenas | `test_contrato_23_declarado` |
| **RN-31** | Un draft pertenece a su terminal | `test_lista_solo_las_cuentas_open_de_la_terminal` |
| **Regla 15** | Respuesta ligera (máx. 5 campos) | `test_respuesta_ligera_max_5_campos` |
| **RN-10** | El folio (`account_num`) es obligatorio | `_crear_ticket` (siembra) + esquema |
| **E-14** | Evidencia, no opinión | §4 de esta ficha (salidas reales) |

---

## 6. Autocrítica de F5.0

**Lo que quedó bien:**

- El contrato se declaró **antes** de implementar el endpoint (A-02 al pie de
  la letra: no hay endpoint sin contrato).
- La respuesta es ligera **por diseño**, no por accidente: el esquema tiene
  exactamente 5 campos y el test lo verifica campo por campo.
- La puerta de FASE 2 se actualizó **con justificación**, no por conveniencia.

**Lo que se corrigió durante la construcción (defectos hallados y resueltos):**

- **D-A — Endpoint duplicado.** Al insertar el endpoint quedaron **dos**
  handlers idénticos para `GET /open-accounts` (uno sin el guard de 400, otro
  con él). Se eliminó el primero, conservando el que tiene el guard.
- **D-B — Contrato intercalado.** El contrato 23 se insertó **antes** del 22,
  rompiendo el orden `1..23` de la tupla. Se movió al final.
- **D-C — Puerta de frontera desactualizada.** `test_f2_frontera.py` seguía
  afirmando 22 contratos. Se actualizó a 23 en sus tres puntos.
- **D-D — `account_num` NOT NULL.** La siembra directa fallaba con
  `NotNullViolationError` porque no daba el folio. Se añadió
  `account_num=f"F50-{uuid4().hex[:8]}"`.
- **D-E — 422 vs 400.** El test esperaba 400 para `terminal_id=""`, pero
  FastAPI valida `min_length=1` **antes** del handler y responde 422. Se
  corrigió la expectativa y se documentó el porqué.

**Riesgo residual:**

- El guard de 400 del endpoint es **código muerto** para el caso de cadena
  vacía (FastAPI lo intercepta antes). Sigue siendo útil para cadenas de solo
  espacios. Se documenta aquí para que nadie lo "limpie" creyendo que sobra.
- El endpoint **no pagina**. Con decenas de cuentas abiertas en una terminal
  (escenario improbable en una panadería) la respuesta crecería. Se acepta
  conscientemente: el pizarrón debe mostrar **todas** las cuentas abiertas de
  la terminal, no una página.

---

## 7. Qué habilita esta sub-fase

Con el contrato 23 vivo y en verde, las siguientes sub-fases tienen a qué
llamar:

- **F5.1** — `openAccountsService.js` + `listarCuentasAbiertas` en `client.js`
  (el servicio que consume el contrato 23).
- **F5.2** — `useOpenAccounts.js` (el hook que lista, refresca y recupera la
  versión fresca de una cuenta).
- **F5.3** — `OpenAccountsCorkboard.jsx` (el pizarrón visual, 3 modos).

---

## 8. Veredicto

**F5.0 CERRADA.** El prerrequisito del Pizarrón de Cuentas Abiertas está
construido, probado y en verde:

- ✅ Contrato 23 `pos.cuentas_abiertas` declarado (al final, orden 1..23).
- ✅ Endpoint `GET /pos/open-accounts` implementado (único, con guard).
- ✅ Esquemas `CuentaAbiertaSalida` (5 campos) + `CuentasAbiertasSalida`.
- ✅ Puerta de F5.0: **6/6 verde**.
- ✅ Puerta de frontera FASE 2: **9/9 verde** (actualizada a 23).
- ✅ Suite completa: **213/213 verde** (sin regresiones).
- ✅ Guardianes: **7/7 verde** (98 archivos).
- ✅ Runner completo: **TODO EN VERDE**.

La frontera está lista. El pizarrón puede empezar a construirse.
