# 📋 FICHA DE EVIDENCIA — FASE 4.0 (Ligar el ticket a su caja)

> **Fecha:** 29 Sep 2026
> **Sub-fase:** 4.0 — Prerrequisito del arqueo: `Ticket.cash_session_id`
> **Plan:** [`PLAN_DE_ABORDAJE_FASE_4_POR_PARTES.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_4_POR_PARTES.md:1) §4 FASE 4.0
> **Estado:** ✅ **PUERTA EN VERDE**
> **Depende de:** Fase 3 (POS completo) — cerrada y en verde

---

## 1. Qué se construyó

| Archivo | Qué resuelve | Contrato / Regla | Estado |
|---|---|---|---|
| [`apps/api/routers/pos.py`](../../apps/api/routers/pos.py:104) | Helper `_sesion_caja_activa_o_400` (exige turno abierto) | RN-49 | ✅ |
| [`apps/api/routers/pos.py`](../../apps/api/routers/pos.py:274) | `cobrar_ticket` liga `ticket.cash_session_id` a la caja | RN-49 / F4.0 | ✅ |
| [`apps/api/tests/test_f4_caja.py`](../../apps/api/tests/test_f4_caja.py:1) | Puerta F4.0 — 2 criterios (positivo + negativo) | — | ✅ |

### El defecto que se cerró (Defecto 3 de la autocrítica)

`Ticket.cash_session_id` **existía en el modelo desde Fase 1** pero **nunca se
poblaba al cobrar**. El cobro (`POST /pos/tickets/{id}/pay`) pasaba el ticket a
`PAID` y guardaba `payment_details`, pero dejaba `cash_session_id = NULL`.

**Consecuencia si no se corrige:** el corte de caja (Fase 4.1+) calcularía el
efectivo esperado sumando los tickets de la sesión… y encontraría **cero
tickets**, porque ninguno está ligado a la caja. El arqueo saldría siempre en
cero. Es un defecto **silencioso**: nada falla, pero el número es falso.

---

## 2. Decisiones de diseño

### 2.1 El cobro EXIGE un turno de caja abierto (RN-49)

Antes de ligar el ticket, `cobrar_ticket` llama a `_sesion_caja_activa_o_400`,
que busca la `CashSession` con `status == "OPEN"` de la terminal del ticket:

- **0 sesiones** → `ReglaViolada("RN-49", "No hay turno de caja abierto para
  esta terminal", 400)`. El cobro falla con un motivo claro, no con un 500 ni
  con un ticket huérfano.
- **1 sesión** → se devuelve y el ticket se liga a ella.
- **>1 sesión** → `rn49_una_sesion_caja_por_terminal` lanza (estado imposible).

### 2.2 La regla RN-49 espera dicts, no el ORM

`rn49_una_sesion_caja_por_terminal(sesiones, terminal_id)` filtra por las claves
`terminal_id` **y** `estado` (no `status`). El helper proyecta el ORM a dicts con
esas claves exactas:

```python
rn49_una_sesion_caja_por_terminal(
    [{"terminal_id": s.terminal_id, "estado": s.status} for s in sesiones],
    terminal_id,
)
```

Pasar el ORM directo habría lanzado `KeyError: 'estado'` — un 500 en vez del 400
con motivo. Se detectó leyendo la firma real de la regla antes de escribir el
helper.

### 2.3 El orden de las validaciones no cambió

`cobrar_ticket` conserva el orden original: 404 si el ticket no existe → RN-23
(no re-cobrar un PAID) → RN-25 (version) → **RN-49 (turno de caja)** → escritura.
La validación de caja se inserta **después** de las de concurrencia para no
cambiar el contrato de error de los casos ya cubiertos por la puerta F3.2.

---

## 3. Puerta 4.0 — Evidencia

### 3.1 Comando y salida (criterio positivo)

```text
Comando : docker compose exec -T api pytest tests/test_f4_caja.py -k "liga_ticket" -v
Salida  :
  tests/test_f4_caja.py::test_liga_ticket_a_sesion_de_caja PASSED          [100%]
  ======================= 1 passed, 1 deselected in 1.45s ========================
Resultado: PASA (exit 0)
```

### 3.2 Comando y salida (los 2 criterios)

```text
Comando : docker compose exec -T api pytest tests/test_f4_caja.py -v
Salida  :
  tests/test_f4_caja.py::test_liga_ticket_a_sesion_de_caja PASSED          [ 50%]
  tests/test_f4_caja.py::test_cobro_sin_turno_de_caja_falla PASSED         [100%]
  ============================== 2 passed in 1.40s ===============================
Resultado: PASA (exit 0)
```

### 3.3 Sin regresión en la suite completa

```text
Comando : docker compose exec -T api pytest -q
Salida  : 200 passed in 3.21s
Resultado: PASA (exit 0)
```

La suite pasó de 198 a **200 tests** (los 2 nuevos de F4.0). Ningún test
existente se rompió: la búsqueda confirmó que **ningún test previo cobraba un
ticket vía `/pay`**, así que exigir un turno de caja no afectó a nadie.

### 3.4 Puerta completa del proyecto

```text
Comando : npm run test
Salida  :
  Tests de Node      : 3/3 archivo(s) en verde
  Tests de componentes: PASA
  Tests de API       : PASA
  ✅ RESULTADO: TODOS LOS TESTS EN VERDE.
Resultado: PASA (exit 0)
```

### 3.5 Guardianes de estándares

```text
Comando : node scripts/guards.mjs
Salida  :
  [OK] E-05 — Silencios en ruta crítica → 0 coincidencia(s)
  [OK] A-04 — Silencios en la ruta crítica de guardianes → 0 coincidencia(s)
  [OK] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
  [OK] E-15 — TODOs sin formato declarado → 0 coincidencia(s)
  [OK] R-01 — Ancho fijo en la superficie → 0 coincidencia(s)
  [OK] E-09 — Dinero en Float → 0 coincidencia(s)
  [OK] E-10 — Tiempo naive → 0 coincidencia(s)
  PUERTA F0 EN VERDE / PUERTA F4/A-04 EN VERDE / PUERTA F5/R-01 EN VERDE
Resultado: PASA (exit 0)
```

---

## 4. Criterios de aceptación (Plan §4.0.3)

| # | Criterio | Evidencia | Estado |
|---|---|---|---|
| 1 | Un ticket cobrado con turno abierto tiene `cash_session_id` = id de la caja | `test_liga_ticket_a_sesion_de_caja` (lee la BD) | ✅ |
| 2 | Un cobro sin turno abierto falla con motivo claro | `test_cobro_sin_turno_de_caja_falla` (400 + "turno de caja") | ✅ |
| 3 | El ticket rechazado NO queda huérfano ni cobrado | El test verifica `status == "OPEN"` y `cash_session_id is None` | ✅ |
| 4 | Sin regresión en la suite completa | 200 passed | ✅ |
| 5 | Guardianes de estándares limpios | 7/7 en verde | ✅ |

---

## 5. Deudas registradas

| # | Deuda | Impacto | Cuándo se paga |
|---|---|---|---|
| D-13 | El cobro exige turno de caja, pero **no hay endpoint para abrir turno** todavía | El POS no puede cobrar hasta que exista `POST /cash/open-session` | **Fase 4.1** (inmediata) |
| D-14 | `cashed_by_id` (auditoría de quién cobró) sigue sin poblarse | Trazabilidad incompleta | Fase 4.1 (al tener el empleado de la caja) |

> **Nota sobre D-13:** es una deuda **intencional y transitoria**. F4.0 es el
> prerrequisito; F4.1 es el backend de caja que abre el turno. Entre ambas
> sub-fases el POS no puede cobrar (no hay turno que abrir), lo cual es
> **correcto**: es preferible un cobro que falla con motivo a un cobro que
> contamina el arqueo con tickets huérfanos.

---

## 6. Autocrítica de esta sub-fase

- **Acierto:** se detectó el `KeyError` de RN-49 (`estado` vs `status`) **antes**
  de correr el test, leyendo la firma real de la regla. Sin eso, el helper habría
  dado 500 en vez de 400.
- **Acierto:** el test negativo verifica **tres** cosas (código 400, motivo
  legible, y que el ticket sigue `OPEN` sin caja), no solo el código HTTP.
- **Riesgo asumido:** el helper hace `select` de todas las sesiones OPEN de la
  terminal y luego filtra en Python. Con el volumen real (1 sesión por terminal)
  es irrelevante; si algún día hubiera miles, se movería el filtro a SQL.
- **Límite:** F4.0 no cubre el caso "turno cerrado a mitad del cobro"
  (concurrencia entre cierre y cobro). Se abordará en F4.1 con el bloqueo de la
  sesión al cerrar.
