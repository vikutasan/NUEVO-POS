# FICHA DE EVIDENCIA — FASE 4.1: Backend de Caja (contratos 9–14)

> **Regla E-14 (evidencia, no opinión):** todo lo afirmado aquí está respaldado por
> una salida de terminal o por una ruta de archivo concreta. Nada se da por hecho.

---

## 1. Qué se construyó

El **backend de caja** del POS nuevo: los 6 endpoints de los contratos 9–14
(declarados en FASE 2, implementados aquí), sus esquemas Pydantic y su registro
en la aplicación FastAPI.

| # | Contrato | Método y ruta | Salida |
|---|----------|---------------|--------|
| 9 | `caja.sesion_activa` | `GET /cash/active-session` | `SesionCajaActiva` |
| 10 | `caja.abrir_turno` | `POST /cash/open-session` (201) | `AbrirTurnoSalida` |
| 11 | `caja.registrar_movimiento` | `POST /cash/movements` (201) | `MovimientoSalida` |
| 12 | `caja.resumen_del_turno` | `GET /cash/session-summary/{cash_session_id}` | `ResumenTurnoSalida` |
| 13 | `caja.cerrar_turno` | `POST /cash/close-session` | `CerrarTurnoSalida` |
| 14 | `caja.reporte_diario` | `GET /cash/daily-report/{fecha}` | `ReporteDiarioSalida` |

---

## 2. Archivos tocados

| Archivo | Cambio |
|---------|--------|
| [`apps/api/schemas.py`](../../apps/api/schemas.py:255) | +11 esquemas de caja y `from datetime import datetime` |
| [`apps/api/routers/cash.py`](../../apps/api/routers/cash.py:1) | **NUEVO** — router con los 6 endpoints |
| [`apps/api/main.py`](../../apps/api/main.py:27) | `include_router(cash.router)` |
| [`apps/api/tests/test_f4_1_caja_api.py`](../../apps/api/tests/test_f4_1_caja_api.py:1) | **NUEVO** — puerta de la sub-fase (7 tests) |

---

## 3. Reglas de negocio aplicadas (con su llamada real)

Ninguna regla se reimplementó: todas se **llaman** desde `rules/registry.py`.

| Regla | Dónde se usa | Qué garantiza |
|-------|--------------|---------------|
| **RN-49** | `POST /cash/open-session` | Solo un turno `OPEN` por terminal → 409 |
| **RN-50** | `POST /cash/open-session` | El fondo inicial no puede ser negativo |
| **RN-51** | `POST /cash/movements` | El movimiento es ENTRADA o SALIDA, con concepto |
| **RN-53** | `GET /cash/session-summary` y `POST /cash/close-session` | `esperado = fondo + entradas − salidas + ventas_efectivo` |
| **RN-54** | `POST /cash/close-session` | El cierre registra los 3 conteos físicos |
| **RN-55** | `POST /cash/movements` y `POST /cash/close-session` | Una sesión `CLOSED` es inmutable |
| **RN-57 / RN-58** | `_ventas_en_efectivo` | Clasifica los pagos por método y suma solo el efectivo |
| **RN-59** | `GET /cash/daily-report/{fecha}` | El reporte usa el **día local**, no el UTC |

---

## 4. La puerta (gate) — salida real

### 4.1 Puerta de la sub-fase

```
$ docker compose exec -T api pytest tests/test_f4_1_caja_api.py -v
tests/test_f4_1_caja_api.py::test_contratos_9_a_14_declarados PASSED     [ 14%]
tests/test_f4_1_caja_api.py::test_abrir_turno_y_sesion_activa PASSED     [ 28%]
tests/test_f4_1_caja_api.py::test_no_se_abren_dos_turnos_409 PASSED      [ 42%]
tests/test_f4_1_caja_api.py::test_movimiento_entrada_y_salida PASSED     [ 57%]
tests/test_f4_1_caja_api.py::test_resumen_del_turno PASSED               [ 71%]
tests/test_f4_1_caja_api.py::test_cerrar_turno_con_descuadre PASSED      [ 85%]
tests/test_f4_1_caja_api.py::test_reporte_diario_usa_dia_local PASSED    [100%]
============================== 7 passed in 1.90s ===============================
```

### 4.2 Suite completa (sin regresiones)

```
$ docker compose exec -T api pytest -q
207 passed in 3.77s
```

> Antes de F4.1 la suite tenía **200** pruebas. Ahora tiene **207** (+7).

### 4.3 Runner unificado del proyecto

```
$ npm run test
  Tests de Node      : 3/3 archivo(s) en verde
  Tests de componentes: PASA
  Tests de API       : PASA
  ✅ RESULTADO: TODOS LOS TESTS EN VERDE.
```

### 4.4 Guardianes de estándares

```
$ node scripts/guards.mjs
Archivos de código escaneados: 91
[OK  ] E-05 — Silencios en ruta crítica (except ... pass) → 0 coincidencia(s)
[OK  ] A-04 — Silencios en la ruta crítica de guardianes → 0 coincidencia(s)
[OK  ] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
[OK  ] E-15 — TODOs sin formato declarado → 0 coincidencia(s)
[OK  ] R-01 — Ancho fijo en la superficie → 0 coincidencia(s)
[OK  ] E-09 — Dinero en Float → 0 coincidencia(s)
[OK  ] E-10 — Tiempo naive → 0 coincidencia(s)
PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE
```

---

## 5. Criterios de aceptación

| # | Criterio | Evidencia | Estado |
|---|----------|-----------|--------|
| 1 | Los 6 contratos de caja están declarados y tienen firma | `test_contratos_9_a_14_declarados` | ✅ |
| 2 | Abrir turno crea la sesión y `active-session` la devuelve | `test_abrir_turno_y_sesion_activa` | ✅ |
| 3 | No se pueden abrir dos turnos en la misma terminal (RN-49) | `test_no_se_abren_dos_turnos_409` | ✅ |
| 4 | Los movimientos de entrada y salida se registran y afectan el resumen | `test_movimiento_entrada_y_salida` | ✅ |
| 5 | El resumen calcula `esperado` con RN-53 (100 + 200 − 30 = 270) | `test_resumen_del_turno` | ✅ |
| 6 | El cierre registra los conteos y calcula la diferencia (−10) | `test_cerrar_turno_con_descuadre` | ✅ |
| 7 | El reporte diario agrupa por canal/cajero/terminal usando día local | `test_reporte_diario_usa_dia_local` | ✅ |
| 8 | La suite completa no tiene regresiones | 207 passed | ✅ |
| 9 | Los guardianes de estándares están limpios | 7/7 OK | ✅ |

---

## 6. Hallazgos y decisiones

### 6.1 `rn49` espera `estado`, no `status`

La regla [`rn49_una_sesion_caja_por_terminal()`](../../apps/api/rules/registry.py:401)
filtra por las claves `terminal_id` **y** `estado` del diccionario. El modelo ORM
expone la columna como `status`. Por eso el router traduce antes de llamar:

```python
rn49_una_sesion_caja_por_terminal(
    [{"terminal_id": s.terminal_id, "estado": s.status} for s in sesiones],
    terminal_id,
)
```

Sin esta traducción la regla lanzaría `KeyError` (500) en lugar de un 409 limpio.
**Este mismo defecto se detectó y corrigió en F4.0** en `pos.py`; aquí se aplicó
la lección desde el inicio.

### 6.2 `monto_inicial` con `ge=0` (doble defensa)

`AbrirTurnoEntrada.monto_inicial` declara `Field(default=Decimal("0.00"), ge=0)`,
así que un valor negativo lo rechaza Pydantic con **422** antes de llegar a RN-50.
La regla sigue aplicándose en el router como segunda barrera. Se documenta para
que nadie "arregle" el 422 pensando que es un bug.

### 6.3 El reporte diario usa el día local (RN-59)

`GET /cash/daily-report/{fecha}` compara `rn59_reporte_usa_dia_local(t.created_at)`
contra la fecha pedida. Esto respeta la zona horaria del negocio
(`America/Mexico_City`, UTC−6) en lugar del día UTC, que es lo que exige RN-59.

### 6.4 La frontera no se rompió

[`test_f2_frontera.py`](../../apps/api/tests/test_f2_frontera.py:100) escanea
`models/` y `contracts/` — **no** `routers/`. Por diseño, los routers **sí**
pueden importar modelos (son la capa que los orquesta); lo que no puede es un
modelo importar otro modelo ajeno. `routers/cash.py` importa `models` y eso es
correcto según A-02.

---

## 7. Deudas registradas

| ID | Deuda | Por qué se difiere |
|----|-------|--------------------|
| **D-13** | `GET /cash/active-session` no filtra por `terminal_id` | El contrato 9 no lo declara; se resuelve cuando F4.3 (GestorDeCaja) defina cómo elige la terminal |
| **D-14** | `CashSession.employee_id` / `employee_name` se llenan con el `usuario_id` recibido, sin resolver el nombre | Requiere el módulo de personal (fuera del alcance de F4) |
| **D-15** | El reporte diario no pagina | El contrato 14 no lo declara; un día de operación cabe en una respuesta |

---

## 8. Estado de la fase

- **F4.0** — Ligar `Ticket.cash_session_id` al cobrar → ✅ cerrada (commit `bcc024b`)
- **F4.1** — Backend de caja (contratos 9–14) → ✅ **cerrada con esta ficha**
- **F4.2** — `cashService.js` (6 llamadas con `{outcome, reason}`) → pendiente
- **F4.3** — `GestorDeCaja.jsx` (abrir, movimientos, resumen, arqueo, cierre) → pendiente
- **F4.4** — `CorteTicketTemplate.jsx` (plantilla de impresión) → pendiente

**Regla dura #4 respetada:** la sub-fase 4.2 no comienza hasta que esta puerta
esté en verde — y lo está, con evidencia.
