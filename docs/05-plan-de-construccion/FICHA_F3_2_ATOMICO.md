# 📋 FICHA DE EVIDENCIA — FASE 3.2 (Backend atómico)

> **Fecha:** 29 Sep 2026
> **Sub-fase:** 3.2 — Backend atómico (contratos 18–22 + endpoints)
> **Plan:** [`PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md:259) §4 FASE 3.2
> **Estado:** ✅ **PUERTA EN VERDE**
> **Depende de:** Fase 3.1 (utilidades transversales) — cerrada y en verde

---

## 1. Qué se construyó

| Archivo | Qué resuelve | Contrato / Regla | Estado |
|---|---|---|---|
| [`apps/api/contracts/registry.py`](../../apps/api/contracts/registry.py:1) | Declara los contratos **18–22** (de 17 → 22) | A-02 (frontera) | ✅ |
| [`apps/api/contracts/__init__.py`](../../apps/api/contracts/__init__.py:1) | Docstring actualizado a 22 contratos | A-02 | ✅ |
| [`apps/api/schemas.py`](../../apps/api/schemas.py:159) | 8 esquemas Pydantic de entrada/salida atómicos | — | ✅ |
| [`apps/api/routers/pos.py`](../../apps/api/routers/pos.py:309) | 5 endpoints atómicos (POST/PATCH/DELETE/GET/POST) | 18–22 | ✅ |
| [`apps/api/tests/test_f2_frontera.py`](../../apps/api/tests/test_f2_frontera.py:143) | Puerta F2 actualizada a 22 contratos | A-02 | ✅ |
| [`apps/api/tests/test_f3_atomico.py`](../../apps/api/tests/test_f3_atomico.py:1) | Puerta F3.2 — 6 criterios | — | ✅ |

### Los 5 contratos atómicos

| # | Nombre | Operación | Garantía clave |
|---|---|---|---|
| 18 | `pos.añadir_item` | `POST /pos/tickets/{id}/items` | **IDEMPOTENTE por `item_id`** |
| 19 | `pos.cambiar_cantidad` | `PATCH /pos/tickets/{id}/items/{item_id}` | Bloqueo optimista RN-25/26 |
| 20 | `pos.quitar_item` | `DELETE /pos/tickets/{id}/items/{item_id}` | Anti-degradación RN-37 |
| 21 | `pos.leer_ticket` | `GET /pos/tickets/{id}` | Respuesta ligera: 5 campos |
| 22 | `pos.verificar_envio` | `POST /pos/tickets/{id}/verify` | Verificación post-envío (v6.1 $453) |

---

## 2. Decisiones de diseño

### 2.1 Idempotencia por `item_id` sin migración (deuda D-9)

El contrato 18 exige idempotencia por `item_id`: reenviar el mismo `item_id`
(reintento de red, doble clic) debe ser un **NO-OP**. El modelo `TicketItem`
**no tiene** columna `item_id` (deuda **D-9**), así que se registra el ledger de
`item_id` procesados en `Ticket.payment_details["_item_ids"]` (columna `JSONB`
ya existente). Cuando `ticket_items` tenga su propia columna `item_id`, este
ledger se reemplaza por una restricción única.

### 2.2 Aislamiento de event loop en los tests

El engine module-level `AsyncSessionLocal` se liga al loop del primer test; los
siguientes reciben otro loop y fallan con *"Future attached to a different loop"*.
La puerta crea un **engine por test** (fixture `entorno`) y sobreescribe la
dependencia `get_db` de FastAPI. Así cada test usa un engine ligado a su propio
loop y se cierra al terminar.

### 2.3 La puerta F2 se actualizó, no se rompió

Al pasar de 17 a 22 contratos, la puerta F2 (que afirmaba *exactamente 17*) se
actualizó: `LOS_22_CONTRATOS`, `test_criterio2_hay_exactamente_22_contratos`,
`test_criterio3_el_pos_es_proveedor_en_sus_contratos` (ahora 7) y
`test_listar_contratos_devuelve_los_22`. **No se relajó ningún criterio**: se
ajustó el número esperado a la nueva realidad declarada.

---

## 3. Puerta 3.2 — Evidencia

### 3.1 Comando y salida

```text
Comando : docker compose exec -T api pytest tests/test_f3_atomico.py -v
Salida  :
  tests/test_f3_atomico.py::test_contratos_18_a_22_declarados PASSED       [ 16%]
  tests/test_f3_atomico.py::test_idempotencia_item_no_duplica PASSED       [ 33%]
  tests/test_f3_atomico.py::test_concurrencia_optimista_409 PASSED         [ 50%]
  tests/test_f3_atomico.py::test_respuesta_ligera_max_5_campos PASSED      [ 66%]
  tests/test_f3_atomico.py::test_verificacion_post_envio PASSED            [ 83%]
  tests/test_f3_atomico.py::test_anti_degradacion_rechaza_50pct PASSED     [100%]
  ============================== 6 passed in 1.74s ===============================
Resultado: PASA (exit 0)
```

### 3.2 Sin regresión en la puerta F2

```text
Comando : docker compose exec -T api pytest tests/test_f2_frontera.py tests/test_f3_atomico.py -q
Salida  : ...............  [100%]
          15 passed in 1.80s
Resultado: PASA (exit 0)   (9 de F2 + 6 de F3.2)
```

### 3.3 Criterios de la puerta (del plan §4 FASE 3.2)

| Criterio del plan | Test que lo prueba | Estado |
|---|---|---|
| Los contratos 18–22 están declarados (A-02) | `test_contratos_18_a_22_declarados` | ✅ |
| 2× POST del mismo `item_id` = mismo estado | `test_idempotencia_item_no_duplica` | ✅ |
| `version` obsoleto → 409 | `test_concurrencia_optimista_409` | ✅ |
| Respuesta ligera ≤ 5 campos escalares | `test_respuesta_ligera_max_5_campos` | ✅ |
| Verificación post-envío contra BD | `test_verificacion_post_envio` | ✅ |
| Anti-degradación RN-37 rechaza −50% | `test_anti_degradacion_rechaza_50pct` | ✅ |

---

## 4. Deudas registradas

| ID | Deuda | Impacto | Bloquea |
|---|---|---|---|
| **D-9** | `TicketItem` no tiene columna `item_id`; la idempotencia se apoya en `payment_details["_item_ids"]` | Bajo (funciona) | No |
| **D-7** | `guards.mjs` no excluye `dist/` ni tests, y no reconoce `TODO(scope)` | Bajo | No |

---

## 5. Veredicto

**PUERTA 3.2 EN VERDE.** Los 5 contratos atómicos están declarados, los 5
endpoints existen y responden, y los 6 criterios de la puerta pasan contra
PostgreSQL real. La puerta F2 sigue verde (15/15 en conjunto). Se puede avanzar
a **FASE 3.3 — Hooks** (`useCart`, `useTicketActions`, `useTerminalLocking`,
`useBarcodeScanner`).
