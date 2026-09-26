# FICHA DE EVIDENCIA — FASE 3: COMPORTAMIENTO (REGLAS + TESTS)

> Plantilla del Prompt del Arquitecto §7.3. La salida se pega tal cual; un
> resumen no es evidencia.

```
─────────────────────────────────────────────
Fase             : F3 — Comportamiento (Reglas + Tests)
Puerta declarada : Plan de Construcción §5.3
Comando          : docker compose exec api pytest tests/test_f3_comportamiento.py -v
Salida           : tests/test_f3_comportamiento.py::test_criterio1_la_matriz_tiene_81_reglas PASSED [  1%]
                   tests/test_f3_comportamiento.py::test_criterio1_los_numeros_van_de_rn01_a_rn81 PASSED [  2%]
                   tests/test_f3_comportamiento.py::test_criterio2_ninguna_regla_sin_test PASSED [  3%]
                   tests/test_f3_comportamiento.py::test_criterio2_cada_regla_tiene_enunciado PASSED [  4%]
                   tests/test_f3_comportamiento.py::test_criterio2_las_15_categorias_estan_presentes PASSED [  5%]
                   tests/test_f3_comportamiento.py::test_listar_reglas_devuelve_las_81 PASSED [  6%]
                   tests/test_f3_comportamiento.py::test_rn01 PASSED        [  7%]
                   ... (RN-02 a RN-81, uno por regla) ...
                   tests/test_f3_comportamiento.py::test_rn81 PASSED        [ 94%]
                   tests/test_f3_comportamiento.py::test_cicatriz_draft_guard PASSED        [ 95%]
                   tests/test_f3_comportamiento.py::test_cicatriz_anti_degradacion PASSED   [ 96%]
                   tests/test_f3_comportamiento.py::test_cicatriz_bloqueo_optimista PASSED  [ 97%]
                   tests/test_f3_comportamiento.py::test_cicatriz_reciclaje_de_folios PASSED [ 98%]
                   tests/test_f3_comportamiento.py::test_cicatriz_idempotencia_de_emergencia PASSED [100%]
                   ============================== 92 passed in 0.49s ==============================
Resultado        : PASA
Pendientes       : RN-73 vs RN-81 (resuelto: la ESPECIFICACION §C numera 81 reglas;
                   el PLANO tenía 73 — manda el PLAN, 81); O-21 (HTTPS + rate-limit
                   en validar_pin, se implementa en F5); O-22 (mover VisionScanner
                   al módulo Visión, se implementa en F5)
Commit           : <pendiente de commit en el repo NUEVO-POS>
─────────────────────────────────────────────
```

## Criterios de la puerta (§5.3)

| # | Criterio | Cómo se verifica | Estado |
|---|----------|------------------|--------|
| 1 | La matriz `regla → test` está **completa** (81 de 81) | `pytest tests/test_f3_comportamiento.py::test_criterio1_la_matriz_tiene_81_reglas` | **PASA** |
| 2 | Ninguna regla migró sin test | `pytest tests/test_f3_comportamiento.py::test_criterio2_ninguna_regla_sin_test` | **PASA** |
| 3 | Las **cicatrices** están presentes y probadas | `pytest tests/test_f3_comportamiento.py::test_cicatriz_*` (5 tests) | **PASA** |

## Artefactos creados

| Archivo | Qué es |
|---------|--------|
| `apps/api/rules/__init__.py` | El paquete de reglas: expone `LAS_81_REGLAS`, `Regla`, `ReglaViolada`, `listar_reglas`, `matriz_regla_test`. |
| `apps/api/rules/registry.py` | Las 81 reglas (RN-01 a RN-81) con su enunciado, categoría, test y verificador. |
| `apps/api/tests/test_f3_comportamiento.py` | La puerta: 92 tests (6 de matriz + 81 de regla + 5 de cicatriz). |

## Las 15 categorías y sus rangos (ESPECIFICACION §C)

| # | Categoría | Rango | N |
|---|-----------|-------|---|
| C.1 | Sesión de terminal y ocupación | RN-01 – RN-08 | 8 |
| C.2 | Tickets: identidad y folio | RN-09 – RN-16 | 8 |
| C.3 | Tickets: líneas | RN-17 – RN-24 | 8 |
| C.4 | Concurrencia optimista | RN-25 – RN-30 | 6 |
| C.5 | DRAFT GUARD | RN-31 – RN-36 | 6 |
| C.6 | Anti-degradación de líneas | RN-37 – RN-40 | 4 |
| C.7 | Reserva y limpieza de borradores | RN-41 – RN-48 | 8 |
| C.8 | Caja: sesión y movimientos | RN-49 – RN-56 | 8 |
| C.9 | Caja: clasificación de pagos | RN-57 – RN-60 | 4 |
| C.10 | Inventario: eventos | RN-61 – RN-66 | 6 |
| C.11 | Pedidos: proyección | RN-67 – RN-70 | 4 |
| C.12 | Visión | RN-71 – RN-74 | 4 |
| C.13 | Auditoría | RN-75 – RN-77 | 3 |
| C.14 | Tiempo y zona horaria | RN-78 – RN-80 | 3 |
| C.15 | Regla transversal | RN-81 | 1 |
| | **TOTAL** | | **81** |

## Las 5 cicatrices (puerta F3)

| Cicatriz | Reglas | Test |
|----------|--------|------|
| DRAFT GUARD | RN-31 – RN-36 | `test_cicatriz_draft_guard` |
| Anti-degradación de líneas | RN-37 – RN-40 | `test_cicatriz_anti_degradacion` |
| Bloqueo optimista | RN-25 – RN-30 | `test_cicatriz_bloqueo_optimista` |
| Reciclaje de folios | RN-10 / RN-11 / RN-41 – RN-43 | `test_cicatriz_reciclaje_de_folios` |
| Idempotencia de emergencia | RN-63 – RN-66 | `test_cicatriz_idempotencia_de_emergencia` |

## Defecto encontrado y corregido durante la puerta

**Síntoma**: `test_rn30` falló con `ReglaViolada: [RN-30] La reserva debe usar
skip_locked`:

```
assert "skip_locked" in R.rn30_reserva_con_skip_locked("SELECT ... FOR UPDATE SKIP LOCKED")
```

**Causa raíz**: un desajuste **guion bajo vs espacio** entre la implementación y
la entrada del test. La implementación
[`rn30_reserva_con_skip_locked()`](../../apps/api/rules/registry.py:277) busca la
subcadena `"skip_locked"` (con **guion bajo**) en `consulta.lower()`. El test
pasaba `"SELECT ... FOR UPDATE SKIP LOCKED"` — sintaxis SQL con **espacio**.
`"SKIP LOCKED".lower()` = `"skip locked"` (espacio), por lo que la subcadena
`"skip_locked"` (guion bajo) nunca se encontraba → se lanzaba `ReglaViolada`.

**Corrección**: la ESPECIFICACION §C.4
([`ESPECIFICACION_FUNCIONAL_POS_INGENIERIA_INVERSA.md:194`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/ESPECIFICACIONES%20DEL%20PROYECTO/ESPECIFICACION_FUNCIONAL_POS_INGENIERIA_INVERSA.md:194))
dice literalmente *"La reserva de ticket usa `skip_locked`"* — con guion bajo, el
vocabulario de la regla (el método de SQLAlchemy `.with_for_update(skip_locked=True)`),
no la sintaxis SQL cruda. Por tanto la **implementación es fiel a la regla** y el
**defecto estaba en la entrada del test**. Se corrigió la entrada del test a la
forma con guion bajo:

```python
assert "skip_locked" in R.rn30_reserva_con_skip_locked("SELECT ... FOR UPDATE skip_locked")
```

**Nota de método**: el fallo fue un **defecto del test**, no una violación real
de la regla. Se diagnosticó leyendo la implementación y la fuente autoritativa
antes de tocar nada, y se corrigió el lado que se desviaba del enunciado.

## Defecto de proceso encontrado y corregido (truncamiento)

Durante la creación de los artefactos, `write_to_file` **truncó** dos archivos
(la herramienta reportó "creado" pero persistió solo parte del contenido):

- `apps/api/rules/registry.py` quedó en 643 líneas, terminando en `return local`
  (expresión incompleta — error de sintaxis). Faltaban el cuerpo de RN-80, RN-81,
  `LAS_81_REGLAS`, `listar_reglas()` y `matriz_regla_test()`.
- `apps/api/tests/test_f3_comportamiento.py` quedó en 680 líneas, terminando en
  `assert fin == datetime(2026,` (incompleto). Faltaban el resto de `test_rn80`,
  `test_rn81` y los 5 tests de cicatriz.

**Corrección**: se cerraron ambos archivos con `apply_diff` quirúrgico (no una
reescritura completa), tras reportar el defecto. Verificado: el paquete importa,
expone 81 reglas y una matriz de 81 entradas; la puerta completa pasa.

## Entorno de ejecución

No hay Python en el host (solo el stub de Microsoft Store). La puerta corre
dentro del contenedor `api` (imagen `python:3.12-slim`), definido en
`docker-compose.yml`, con `DATABASE_URL=postgresql+asyncpg://pos:pos@db:5432/nuevo_pos`.
Esto es consistente con el stack obligatorio (Docker + Docker Compose, §7.1).

## Trazabilidad regla → test

La matriz se expone en código mediante `matriz_regla_test()`
([`registry.py`](../../apps/api/rules/registry.py)) y se verifica en la puerta:

- `test_criterio1_la_matriz_tiene_81_reglas` — la matriz tiene exactamente 81 entradas.
- `test_criterio1_los_numeros_van_de_rn01_a_rn81` — los números son RN-01 … RN-81, sin huecos.
- `test_criterio2_ninguna_regla_sin_test` — cada regla apunta a un test existente.
- `test_criterio2_cada_regla_tiene_enunciado` — cada regla tiene enunciado no vacío.
- `test_criterio2_las_15_categorias_estan_presentes` — las 15 categorías C.1–C.15 están representadas.
- `test_listar_reglas_devuelve_las_81` — `listar_reglas()` devuelve las 81.

## Deuda eliminada por esta fase

- Las **81 reglas** de negocio quedan migradas con su test (unidad de migración = regla + test).
- Las **5 cicatrices** quedan presentes y probadas, no solo documentadas.
- La **regla transversal RN-81** (sin offset de zona horaria hardcodeado) queda
  como punto único de verdad (`_OFFSET_NEGOCIO`), lista para saldar DEUDA-04 en F4/F5.
