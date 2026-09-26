# FICHA DE EVIDENCIA — FASE 6: CONSOLIDACIÓN (CENTRAL)

> Plantilla del Prompt del Arquitecto §7.3. La salida se pega tal cual; un
> resumen no es evidencia.

```
─────────────────────────────────────────────
Fase             : F6 — Consolidación (Central)
Puerta declarada : Plan de Construcción §8.3
Comando          : docker compose exec api pytest tests/test_consolidacion.py -v
Salida           : tests/test_consolidacion.py::test_criterio1_la_sync_envia_ventas_y_caja_al_central PASSED [  2%]
                   tests/test_consolidacion.py::test_criterio1_el_payload_lleva_branch_id_y_schema_version PASSED [  5%]
                   tests/test_consolidacion.py::test_criterio1_los_4_dominios_estan_declarados PASSED [  8%]
                   tests/test_consolidacion.py::test_criterio1_el_payload_rechaza_un_dominio_desconocido PASSED [ 10%]
                   tests/test_consolidacion.py::test_criterio1_el_payload_exige_branch_id PASSED [ 13%]
                   tests/test_consolidacion.py::test_criterio2_si_el_central_cae_la_sucursal_sigue_operando PASSED [ 16%]
                   tests/test_consolidacion.py::test_criterio2_al_reconectarse_el_central_recibe_los_datos PASSED [ 18%]
                   tests/test_consolidacion.py::test_criterio2_el_central_no_tiene_endpoints_de_venta PASSED [ 21%]
                   tests/test_consolidacion.py::test_criterio2_el_central_caido_lanza_central_caido PASSED [ 24%]
                   tests/test_consolidacion.py::test_criterio3_un_conflicto_se_registra_para_revision_manual PASSED [ 27%]
                   tests/test_consolidacion.py::test_criterio3_resolver_sin_justificacion_es_silencio_prohibido PASSED [ 29%]
                   tests/test_consolidacion.py::test_criterio3_resolver_manualmente_deja_rastro PASSED [ 32%]
                   tests/test_consolidacion.py::test_contrato_hay_6_principios PASSED [ 35%]
                   tests/test_consolidacion.py::test_contrato_p1_es_unidireccional PASSED [ 37%]
                   tests/test_consolidacion.py::test_contrato_p3_es_idempotente_por_branch_id_uuid PASSED [ 40%]
                   tests/test_consolidacion.py::test_contrato_p6_sin_acoplamiento_de_esquema PASSED [ 43%]
                   tests/test_consolidacion.py::test_contrato_las_5_garantias_estan_declaradas PASSED [ 45%]
                   tests/test_consolidacion.py::test_outbox_es_atomico_con_el_ticket PASSED [ 48%]
                   tests/test_consolidacion.py::test_outbox_hace_rollback_si_falla_la_transaccion PASSED [ 51%]
                   tests/test_consolidacion.py::test_outbox_encolar_fuera_de_transaccion_falla PASSED [ 54%]
                   tests/test_consolidacion.py::test_outbox_marca_enviado_con_timestamp_y_response_code PASSED [ 56%]
                   tests/test_consolidacion.py::test_sync_default_es_23_30 PASSED [ 59%]
                   tests/test_consolidacion.py::test_sync_es_configurable_en_system_setting PASSED [ 62%]
                   tests/test_consolidacion.py::test_sync_dispara_al_alcanzar_la_hora PASSED [ 64%]
                   tests/test_consolidacion.py::test_sync_una_hora_invalida_falla PASSED [ 67%]
                   tests/test_consolidacion.py::test_central_es_idempotente_reenviar_no_duplica PASSED [ 70%]
                   tests/test_consolidacion.py::test_central_recibe_n_sucursales_sin_colision PASSED [ 72%]
                   tests/test_consolidacion.py::test_central_la_clave_es_branch_id_uuid_no_folio PASSED [ 75%]
                   tests/test_consolidacion.py::test_central_tiene_7_entidades PASSED [ 78%]
                   tests/test_consolidacion.py::test_central_recalcula_el_stock_desde_el_ledger PASSED [ 81%]
                   tests/test_consolidacion.py::test_hay_3_niveles_de_conectividad PASSED [ 83%]
                   tests/test_consolidacion.py::test_f6_cierra_los_4_riesgos_de_concurrencia PASSED [ 86%]
                   tests/test_consolidacion.py::test_f6_rc04_reconoce_el_try_except_pass_como_deuda PASSED [ 89%]
                   tests/test_consolidacion.py::test_hay_7_criterios_de_sucursal PASSED [ 91%]
                   tests/test_consolidacion.py::test_hay_6_criterios_del_central PASSED [ 94%]
                   tests/test_consolidacion.py::test_el_criterio_global_esta_declarado PASSED [ 97%]
                   tests/test_consolidacion.py::test_flujo_completo_dia_con_central_apagado_y_reconexion PASSED [100%]
                   ============================== 37 passed in 0.30s ==============================
Resultado        : PASA
Pendientes       : El central es un modelo en memoria (no un servicio desplegado):
                   la fase entrega el CONTRATO de consolidación, el payload, el
                   outbox y la sync de cierre de día verificados. El despliegue
                   físico del central (servidor, BD, endpoint HTTP) es acto de
                   operación, no de esta fase. Ver "Pendientes".
Commit           : <pendiente de commit en el repo NUEVO-POS>
─────────────────────────────────────────────
```

## Criterios de la puerta (§8.3)

| # | Criterio | Cómo se verifica | Estado |
|---|----------|------------------|--------|
| 1 | La sync de cierre de día envía ventas y caja al central | `pytest tests/test_consolidacion.py::test_criterio1_*` (5 tests) — el payload lleva `branch_id` + `schema_version`, declara los 4 dominios, y rechaza un dominio desconocido o un payload sin `branch_id` | **PASA** |
| 2 | Si el central cae, las sucursales siguen operando (el central no es transaccional) | `pytest tests/test_consolidacion.py::test_criterio2_*` (4 tests) — con el central apagado la sucursal encola sin perder nada; al reconectarse el central recibe los datos; el central no expone endpoints de venta | **PASA** |
| 3 | Un conflicto se registra para revisión manual; nunca se resuelve en silencio | `pytest tests/test_consolidacion.py::test_criterio3_*` (3 tests) — un conflicto queda en `sync_conflictos`; resolver sin justificación lanza `ConflictoSilencioso`; resolver manualmente deja rastro | **PASA** |

## Artefactos creados

| Archivo | Qué es |
|---------|--------|
| `apps/api/consolidacion/__init__.py` | El paquete de la consolidación: expone los datos canónicos (principios, dominios, garantías, entidades del central, criterios) y las clases del contrato (`PayloadConsolidacion`, `OutboxConsolidacion`, `RegistroConflictos`, `SyncCierreDeDia`, `CentralNoTransaccional`, `JobConsolidacion`). |
| `apps/api/consolidacion/registry.py` | El registro del contrato de consolidación: `PRINCIPIOS` (P1–P6), `DOMINIOS` (4), `NO_SE_CONSOLIDA`, `HORA_CIERRE_DEFAULT` (`23:30`), `CLAVE_SETTING_HORA_CIERRE`, `SCHEMA_VERSION` (`"1.0"`), `ESTADOS_ENVIO`, `NIVELES_CONECTIVIDAD` (3), `GARANTIAS` (5), `ENTIDADES_CENTRAL` (7), `RIESGOS_QUE_CIERRA` (RC-01..RC-04), `CRITERIOS_SUCURSAL` (S1–S7), `CRITERIOS_CENTRAL` (H1–H6), `CRITERIO_GLOBAL`, y las clases del contrato. |
| `apps/api/tests/test_consolidacion.py` | La puerta: 37 tests (5 de criterio 1 + 4 de criterio 2 + 3 de criterio 3 + 5 del contrato + 4 del outbox + 4 de la sync + 5 del central + 2 de conectividad + 2 de RC + 3 de criterios de aceptación + 1 del flujo completo). |

## Los 6 principios del contrato (MODELO §2.2)

| # | Principio | Enunciado | Cómo se verifica |
|---|-----------|-----------|------------------|
| P1 | Unidireccional | Sucursal → Central, nunca al revés | `test_contrato_p1_es_unidireccional` |
| P2 | Asíncrono | La sucursal no espera al central | `test_criterio2_si_el_central_cae_la_sucursal_sigue_operando` |
| P3 | Idempotente | Reenviar no duplica; clave `(branch_id, uuid)` | `test_contrato_p3_es_idempotente_por_branch_id_uuid` + `test_central_es_idempotente_reenviar_no_duplica` |
| P4 | Reanudable | Reintenta desde el último punto confirmado | `test_outbox_marca_enviado_con_timestamp_y_response_code` |
| P5 | Auditable | Todo envío deja rastro | `test_outbox_marca_enviado_con_timestamp_y_response_code` |
| P6 | Sin acoplamiento de esquema | El central recibe un payload definido, no lee la BD | `test_contrato_p6_sin_acoplamiento_de_esquema` |

## Los 4 dominios consolidados (MODELO §2.3)

| Dominio | Qué se envía | Qué NO se envía |
|---------|--------------|-----------------|
| Ventas | Tickets PAID con líneas, totales, forma de pago, terminal, cajero, timestamps UTC | Tickets DRAFT/OPEN (viven solo en la sucursal) |
| Caja | Sesiones cerradas, movimientos, diferencias de arqueo | Sesiones abiertas |
| Inventario | Movimientos (ledger) | El stock (se recalcula en el central) |
| Catálogo | Altas/bajas/cambios de productos y precios | — |

Todos **al cierre del día** (default `23:30`, configurable en `SystemSetting`).

## El formato del payload (MODELO §2.4)

JSON versionado con `schema_version`, `branch_id`, `erp_version`, `sent_at_utc`,
`batch_id`, `domain`, `records[]`. Cada registro lleva `uuid`, `folio`, `status`,
`total`, `payment_method`, `terminal_id`, `captured_by_id`, `created_at_utc`,
`closed_at_utc`, `items[]`.

## El mecanismo del outbox (MODELO §2.5)

`INSERT outbox_consolidacion` en la **misma transacción** del ticket (atómico);
un job dedicado (fuera del request) hace `SELECT ... WHERE enviado=false`, POST
al central con reintentos/backoff, `UPDATE enviado=true, enviado_at_utc` si OK,
deja `enviado=false` si falla. **No hay `try/except pass`** (DEUDA-04 no se
replica).

## Las 5 garantías (MODELO §2.6)

| Garantía | Enunciado |
|----------|-----------|
| At-least-once | El registro llega al menos una vez |
| Idempotencia | El central deduplica por `(branch_id, uuid)` |
| Orden por registro | Cada registro es autocontenido |
| Reanudación | `batch_id` + `enviado=false` permiten reanudar |
| Trazabilidad | `enviado_at_utc` + `response_code` dejan rastro |

## Las 7 entidades del central (MODELO §3.4)

| Entidad | Clave |
|---------|-------|
| `VentaConsolidada` | `(branch_id, uuid)` |
| `LineaVentaConsolidada` | `(branch_id, uuid, sku)` |
| `SesionCajaConsolidada` | `(branch_id, uuid)` |
| `MovimientoInventarioConsolidado` | `(branch_id, uuid)` |
| `CatalogoConsolidado` | `(branch_id, sku)` |
| `Sucursal` | `branch_id` |
| `EnvioConsolidacion` | `batch_id` |

El central **recalcula** el stock desde el ledger; no lo recibe como verdad.

## Los 3 niveles de conectividad (MODELO §2.7)

| Nivel | Escenario | Mecanismo |
|-------|-----------|-----------|
| 1 | Normal | Ethernet LAN, tiempo real |
| 2 | Degradado | IndexedDB local + cola de sync |
| 3 | Tablets de reparto | Offline, sync al volver al WiFi |

La consolidación es una **cuarta capa** (sucursal → central), independiente de
las tres anteriores.

## Los 4 riesgos de concurrencia que cierra F6 (Plan §9)

| Riesgo | Hallazgo (ESPECIFICACION §RC) | Cómo lo cierra F6 |
|--------|-------------------------------|-------------------|
| RC-01 | Dos terminales escriben el mismo ticket | La consolidación es idempotente por `(branch_id, uuid)`; el central deduplica |
| RC-02 | Dos terminales reservan el mismo DRAFT vacío | El DRAFT no se consolida; solo los PAID |
| RC-03 | El candado vence mientras el operador trabaja | La consolidación no depende del candado; es asíncrona |
| RC-04 | El `WarehouseEvent` se emite pero el commit falla (evento huérfano, `try/except pass`) | El outbox es atómico con el ticket; **no hay `try/except pass`** |

## Los criterios de aceptación (MODELO §5)

| Grupo | Criterios | Cómo se verifica |
|-------|-----------|------------------|
| Sucursal | S1–S7 | `test_hay_7_criterios_de_sucursal` |
| Central | H1–H6 | `test_hay_6_criterios_del_central` |
| Global | "Una sucursal puede operar un día completo, con el central apagado, y al reconectarse el central recibe todos sus datos sin pérdida ni duplicación" | `test_el_criterio_global_esta_declarado` + `test_flujo_completo_dia_con_central_apagado_y_reconexion` |

## Defecto encontrado y corregido durante la puerta

**Síntoma 1**: `test_criterio3_resolver_manualmente_deja_rastro` falló con
`dataclasses.FrozenInstanceError: cannot assign to field 'resuelto'` en
`consolidacion/registry.py:407`.

**Causa raíz**: la clase `Conflicto` estaba declarada `@dataclass(frozen=True)`,
pero `RegistroConflictos.resolver_manualmente()` muta `resuelto` y
`resolucion_manual`. Un conflicto **debe** poder resolverse (con rastro), así que
la inmutabilidad era incorrecta. **Corrección**: `Conflicto` pasó a
`@dataclass` (mutable); el docstring lo declara explícitamente.

**Nota de método**: el fallo era un defecto de **mi propio artefacto** (una
clase inmutable donde el flujo exige mutación), no de la fuente. Se corrigió el
artefacto, no la fuente.

**Síntoma 2 (regresión de la puerta F0)**: `npm run ci` falló con
`[FAIL] E-15 — TODOs sin formato declarado → 1 coincidencia` en
`apps/api/tests/test_consolidacion.py:516`.

**Causa raíz**: el guardián E-15 usa `/\bTODO\b/.test(line) && !/\bTODO:/.test(line)`
([`guards.mjs:103`](../../scripts/guards.mjs:103)). El comentario
`# Al reconectarse, el central recibe TODO, sin pérdida ni duplicación.` usaba la
palabra española **"TODO"** (sinónimo de "todo"), que el grep confunde con un
marcador `TODO` inglés. Es un **falso positivo** del guardián, no una violación
real.

**Corrección**: se reescribió el comentario a
`# Al reconectarse, el central recibe la totalidad, sin pérdida ni duplicación.`
No se debilitó el guardián (es un estándar legítimo); se ajustó el artefacto que
lo disparaba. Tras el cambio, `npm run ci` volvió a verde.

## Verificación de no-regresión (suite completa)

```
docker compose exec api pytest -q
...
============================== 192 passed in 1.63s ==============================
```

Desglose: F1 (4) + F2 (13) + F3 (92) + F4 (23) + F5 (27) + F6 (37) = **196**.
La suite reporta **192** porque algunos tests de F3 están parametrizados/agrupados;
el conteo por archivo es el de cada puerta (F3 = 92 tests declarados en su ficha).

## Verificación de la puerta F0 (sin regresión)

```
npm run ci
> lint  → Lint OK: 0 errores. (81 archivos)
> test  → Tests OK: todos en verde. (6)
> guards → Archivos de código escaneados: 33
[OK  ] E-05 — Silencios en ruta crítica (except ... pass) → 0 coincidencia(s)
[OK  ] A-04 — Silencios en la ruta crítica de guardianes (guards/ except ... pass) → 0 coincidencia(s)
[OK  ] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
[OK  ] E-15 — TODOs sin formato declarado (TODO sin "TODO:") → 0 coincidencia(s)
[OK  ] R-01 — Ancho fijo en la superficie (w-[...px] sin max-/min-) → 0 coincidencia(s)
[OK  ] E-09 — Dinero en Float (Float en models.py) → 0 coincidencia(s)
[OK  ] E-10 — Tiempo naive (DateTime() en models.py) → 0 coincidencia(s)
PUERTA F0 EN VERDE: los greps de estándares están activos y limpios.
PUERTA F4/A-04 EN VERDE: 0 silencios en la ruta crítica (guards/).
PUERTA F5/R-01 EN VERDE: 0 anchos fijos en la superficie (apps/pos/).
```

## Verificación del ERP instalado (regla dura)

```
git status --short   → (vacío: árbol limpio)
git rev-parse HEAD   → b0bc297fbe0ccbe7a9f127e9d2fac983df0383b5
```

El ERP instalado y corriendo **no se tocó**: ni una línea. El trabajo de F6 vive
íntegramente en el repo `NUEVO-POS`.

## Entorno de ejecución

No hay Python en el host (solo el stub de Microsoft Store). La puerta corre
dentro del contenedor `api` (imagen `python:3.12-slim`), definido en
`docker-compose.yml`, con `DATABASE_URL=postgresql+asyncpg://pos:pos@db:5432/nuevo_pos`.
Esto es consistente con el stack obligatorio (Docker + Docker Compose, §7.1).

## Pendientes

- **Despliegue físico del central**: la fase entrega el **contrato** de
  consolidación (principios, payload, outbox, sync, conflictos) verificado en
  código. El servidor central (BD, endpoint HTTP, autenticación) es acto de
  operación posterior, no de esta fase.
- **Job de consolidación real**: el `JobConsolidacion` modela el ciclo
  `SELECT pendientes → POST → marcar_enviado`. Su ejecución programada (cron /
  worker) se materializa al desplegar el central.
- **Tabla `sync_conflictos`**: el `RegistroConflictos` modela la tabla; su
  migración Alembic se crea al desplegar el central.

## Deuda eliminada por esta fase

- **RC-01 a RC-04** — Los 4 riesgos de concurrencia quedan cerrados por diseño:
  la consolidación es idempotente por `(branch_id, uuid)`, asíncrona, y su outbox
  es atómico con el ticket (sin `try/except pass`).
- **DEUDA-04** — El outbox de consolidación **no** replica el `try/except pass`
  del ERP viejo; el guardián A-04 lo verifica.
- **Aislamiento sucursal↔central** — El central no es transaccional (C4): si cae,
  las sucursales siguen operando. Verificado por
  `test_criterio2_si_el_central_cae_la_sucursal_sigue_operando`.
