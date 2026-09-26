# FICHA DE EVIDENCIA — FASE 4: GUARDIANES (A-03, A-04, A-05)

> Plantilla del Prompt del Arquitecto §7.3. La salida se pega tal cual; un
> resumen no es evidencia.

```
─────────────────────────────────────────────
Fase             : F4 — Guardianes (A-03, A-04, A-05)
Puerta declarada : Plan de Construcción §6.3
Comando          : docker compose exec api pytest tests/test_f4_guardianes.py -v
Salida           : tests/test_f4_guardianes.py::test_criterio1_hay_un_guardian_por_cada_cicatriz PASSED [  4%]
                   tests/test_f4_guardianes.py::test_criterio1_cada_guardian_tiene_regla_nombre_y_amenaza PASSED [  8%]
                   tests/test_f4_guardianes.py::test_criterio1_la_matriz_guardian_regla_esta_completa PASSED [ 13%]
                   tests/test_f4_guardianes.py::test_criterio1_romper_una_regla_hace_fallar_al_guardian PASSED [ 17%]
                   tests/test_f4_guardianes.py::test_criterio1_el_escenario_sano_no_dispara_al_guardian PASSED [ 21%]
                   tests/test_f4_guardianes.py::test_guardian_draft_guard PASSED            [ 26%]
                   tests/test_f4_guardianes.py::test_guardian_anti_degradacion PASSED       [ 30%]
                   tests/test_f4_guardianes.py::test_guardian_bloqueo_optimista PASSED      [ 34%]
                   tests/test_f4_guardianes.py::test_guardian_reciclaje_de_folios PASSED    [ 39%]
                   tests/test_f4_guardianes.py::test_guardian_idempotencia_de_emergencia PASSED [ 43%]
                   tests/test_f4_guardianes.py::test_guardian_identidad_no_es_folio PASSED  [ 47%]
                   tests/test_f4_guardianes.py::test_guardian_sin_offset_hardcodeado PASSED [ 52%]
                   tests/test_f4_guardianes.py::test_guardian_evento_en_misma_transaccion PASSED [ 56%]
                   tests/test_f4_guardianes.py::test_guardian_sin_silencios_en_ruta_critica PASSED [ 60%]
                   tests/test_f4_guardianes.py::test_criterio2_el_outbox_guarda_ticket_y_evento_en_la_misma_transaccion PASSED [ 65%]
                   tests/test_f4_guardianes.py::test_criterio2_el_outbox_propaga_la_excepcion_nunca_la_silencia PASSED [ 69%]
                   tests/test_f4_guardianes.py::test_criterio2_la_idempotencia_por_evento_id_evita_el_doble_descuento PASSED [ 73%]
                   tests/test_f4_guardianes.py::test_criterio2_no_se_puede_operar_fuera_de_una_transaccion PASSED [ 78%]
                   tests/test_f4_guardianes.py::test_criterio3_la_identidad_es_un_uuid PASSED [ 82%]
                   tests/test_f4_guardianes.py::test_criterio3_usar_el_folio_como_identidad_es_una_violacion PASSED [ 86%]
                   tests/test_f4_guardianes.py::test_criterio3_la_identidad_y_el_folio_se_separan_explicitamente PASSED [ 91%]
                   tests/test_f4_guardianes.py::test_criterio3_un_ticket_sin_identidad_uuid_es_rechazado PASSED [ 95%]
                   tests/test_f4_guardianes.py::test_criterio3_un_folio_mal_formado_es_rechazado PASSED [100%]
                   ============================== 23 passed in 0.31s ==============================
Resultado        : PASA
Pendientes       : DEUDA-04 (offset de zona horaria hardcodeado en el POS viejo,
                   `cash/service.py:189-190`) queda cubierta por el guardián
                   `no_hay_offset_de_zona_horaria_hardcodeado` (RN-81); su
                   corrección efectiva en el POS nuevo se completa en F5.
Commit           : <pendiente de commit en el repo NUEVO-POS>
─────────────────────────────────────────────
```

## Criterios de la puerta (§6.3)

| # | Criterio | Cómo se verifica | Estado |
|---|----------|------------------|--------|
| 1 | El CI **falla** si se viola una regla crítica (verificable rompiendo una a propósito) | `pytest tests/test_f4_guardianes.py::test_criterio1_romper_una_regla_hace_fallar_al_guardian` + los 9 `test_guardian_*` | **PASA** |
| 2 | **0** `try/except pass` en la ruta crítica (búsqueda automatizada en CI) | `node scripts/guards.mjs` (grep `A-04`) + `test_criterio2_el_outbox_propaga_la_excepcion_nunca_la_silencia` | **PASA** |
| 3 | Ninguna regla de negocio usa el folio como identidad | `pytest tests/test_f4_guardianes.py::test_criterio3_*` (5 tests) | **PASA** |

## Artefactos creados

| Archivo | Qué es |
|---------|--------|
| `apps/api/guards/__init__.py` | El paquete de guardianes: expone A-03, A-04 y A-05. |
| `apps/api/guards/guardians.py` | A-03: el catálogo de 9 guardianes críticos (`Guardia`, `GuardianViolado`, `GUARDIANES_CRITICOS`, `listar_guardianes`, `matriz_guardian_regla`). |
| `apps/api/guards/outbox.py` | A-04: el Outbox transaccional (`OutboxTransaccional`, `EventoOutbox`, `SinSilenciosEnRutaCritica`). |
| `apps/api/guards/identity.py` | A-05: la separación identidad (UUID) ≠ presentación (folio) (`IdentidadDeTicket`, `folio_no_es_identidad`, `identidad_es_uuid`, `separar_identidad_de_folio`). |
| `apps/api/tests/test_f4_guardianes.py` | La puerta: 23 tests (5 de criterio 1 + 9 de guardián + 4 de criterio 2 + 5 de criterio 3). |
| `scripts/guards.mjs` | Extendido con el grep `A-04` (silencios acotados a la ruta crítica `guards/`). |

## Los 9 guardianes críticos (A-03)

| Guardián | Regla | Amenaza que detecta |
|----------|-------|---------------------|
| `draft_no_se_escribe_desde_otra_terminal` | RN-31 | una terminal escribe el DRAFT de otra terminal |
| `no_se_degradan_las_lineas_sin_confirmar` | RN-37 | las líneas caen por debajo del 50% sin confirmación explícita |
| `no_se_escribe_con_version_obsoleta` | RN-25 | se escribe con una versión que no es la actual (lost update) |
| `no_se_reutiliza_un_folio_emitido` | RN-10 | se reutiliza un folio ya emitido |
| `el_evento_no_se_aplica_dos_veces` | RN-63 | un evento se aplica dos veces sin clave de idempotencia |
| `el_folio_no_es_la_identidad` | RN-09 | una regla de negocio usa el folio como identidad |
| `no_hay_offset_de_zona_horaria_hardcodeado` | RN-81 | se hardcodea un offset de zona horaria fuera del punto único |
| `el_evento_vive_en_la_misma_transaccion` | RN-63 | el evento se emite fuera de la transacción del guardado del ticket |
| `no_hay_silencios_en_ruta_critica` | RN-63 | una excepción se silencia con `except ... pass` en ruta crítica |

## Las 5 cicatrices cubiertas por guardianes

| Cicatriz | Reglas | Guardián |
|----------|--------|----------|
| DRAFT GUARD | RN-31 – RN-36 | `draft_no_se_escribe_desde_otra_terminal` |
| Anti-degradación de líneas | RN-37 – RN-40 | `no_se_degradan_las_lineas_sin_confirmar` |
| Bloqueo optimista | RN-25 – RN-30 | `no_se_escribe_con_version_obsoleta` |
| Reciclaje de folios | RN-10 / RN-11 / RN-41 – RN-43 | `no_se_reutiliza_un_folio_emitido` |
| Idempotencia de emergencia | RN-63 – RN-66 | `el_evento_no_se_aplica_dos_veces` |

## Defecto encontrado y corregido durante la puerta

**Síntoma**: la puerta falló en la colección con `ImportError: attempted relative
import beyond top-level package`:

```
tests/test_f4_guardianes.py:24: in <module>
    from guards import (
guards/__init__.py:28: in <module>
    from .guardians import (
guards/guardians.py:28: in <module>
    from ..rules import ReglaViolada
E   ImportError: attempted relative import beyond top-level package
```

**Causa raíz**: un **desajuste de convención de importación**. En este proyecto
`rules` y `contracts` son paquetes de **nivel superior** (el `rootdir` de pytest
es `/app`, con `pytest.ini` allí). Los tests de F3 importan con la forma absoluta
`from rules import ...` ([`test_f3_comportamiento.py:22`](../../apps/api/tests/test_f3_comportamiento.py:22)).
Mis dos módulos de guardianes usaban la forma **relativa** `from ..rules import
ReglaViolada`; como `guards` también es un paquete de nivel superior, `..rules`
apunta **más allá** del paquete superior → `ImportError`. El paquete `contracts`
nunca chocó con esto porque no importa `rules` (es un registro puro).

**Corrección**: se alineó la importación a la convención del proyecto —
`from rules import ReglaViolada` — en
[`guards/guardians.py`](../../apps/api/guards/guardians.py:28) y
[`guards/identity.py`](../../apps/api/guards/identity.py:24). Verificado: la
puerta completa pasa (23/23) y la suite entera sigue verde (128/128).

**Nota de método**: el fallo fue un **defecto de importación**, no una violación
de regla. Se diagnosticó leyendo la convención real de los tests de F3 antes de
tocar nada, y se corrigió el lado que se desviaba de la convención.

## Verificación de no-regresión (suite completa)

```
docker compose exec api pytest -v
...
============================= 128 passed in 1.18s ==============================
```

Desglose: F1 (4) + F2 (9) + F3 (92) + F4 (23) = **128**.

## Verificación de la puerta F0 (sin regresión)

```
npm run ci
> lint  → Lint OK: 0 errores. (69 archivos)
> test  → Tests OK: todos en verde. (4)
> guards →
[OK  ] E-05 — Silencios en ruta crítica (except ... pass) → 0 coincidencia(s)
[OK  ] A-04 — Silencios en la ruta crítica de guardianes (guards/ except ... pass) → 0 coincidencia(s)
[OK  ] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
[OK  ] E-15 — TODOs sin formato declarado (TODO sin "TODO:") → 0 coincidencia(s)
[OK  ] E-09 — Dinero en Float (Float en models.py) → 0 coincidencia(s)
[OK  ] E-10 — Tiempo naive (DateTime() en models.py) → 0 coincidencia(s)
PUERTA F0 EN VERDE: los greps de estándares están activos y limpios.
PUERTA F4/A-04 EN VERDE: 0 silencios en la ruta crítica (guards/).
```

## Entorno de ejecución

No hay Python en el host (solo el stub de Microsoft Store). La puerta corre
dentro del contenedor `api` (imagen `python:3.12-slim`), definido en
`docker-compose.yml`, con `DATABASE_URL=postgresql+asyncpg://pos:pos@db:5432/nuevo_pos`.
Esto es consistente con el stack obligatorio (Docker + Docker Compose, §7.1).

## Trazabilidad guardián → regla

La matriz se expone en código mediante `matriz_guardian_regla()`
([`guardians.py`](../../apps/api/guards/guardians.py)) y se verifica en la puerta:

- `test_criterio1_hay_un_guardian_por_cada_cicatriz` — las 5 cicatrices + identidad + zona horaria están cubiertas.
- `test_criterio1_cada_guardian_tiene_regla_nombre_y_amenaza` — todo guardián declara regla, nombre y amenaza.
- `test_criterio1_la_matriz_guardian_regla_esta_completa` — la matriz tiene una entrada por guardián.
- `test_criterio1_romper_una_regla_hace_fallar_al_guardian` — romper RN-31 a propósito hace fallar al guardián.
- `test_criterio1_el_escenario_sano_no_dispara_al_guardian` — la dirección opuesta: un escenario sano no dispara.

## Deuda eliminada por esta fase

- **A-03** — Cada regla crítica tiene un **test guardián** que falla si la regla
  se viola. Una regla no automatizada ya no es solo una intención.
- **A-04** — El **Outbox transaccional** garantiza que el evento de inventario
  vive en la MISMA transacción que el guardado del ticket: o se guardan los dos,
  o no se guarda ninguno. Se elimina la pérdida silenciosa de datos
  (`try/except pass`), reforzada por el grep `A-04` en CI.
- **A-05** — La **identidad (UUID)** queda separada explícitamente de la
  **presentación (folio)**. Ninguna regla de negocio puede usar el folio como
  identidad: `folio_no_es_identidad` lo hace imposible.
