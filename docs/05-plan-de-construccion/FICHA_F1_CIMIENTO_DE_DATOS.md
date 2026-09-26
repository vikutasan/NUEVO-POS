# FICHA DE EVIDENCIA — FASE 1: CIMIENTO DE DATOS

> Plantilla del Prompt del Arquitecto §7.3. La salida se pega tal cual; un
> resumen no es evidencia.

```
─────────────────────────────────────────────
Fase             : F1 — Cimiento de datos
Puerta declarada : Plan de Construcción §3.3
Comando          : alembic upgrade head && alembic downgrade base && alembic upgrade head
Salida           : (1) upgrade head
                   INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
                   INFO  [alembic.runtime.migration] Will assume transactional DDL.
                   INFO  [alembic.runtime.migration] Running upgrade  -> 0001_initial_schema, Esquema inicial: las 17 tablas del POS nuevo — FASE 1.
                   (2) downgrade base
                   INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
                   INFO  [alembic.runtime.migration] Will assume transactional DDL.
                   INFO  [alembic.runtime.migration] Running downgrade 0001_initial_schema -> , Esquema inicial: las 17 tablas del POS nuevo — FASE 1.
                   (3) upgrade head
                   INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
                   INFO  [alembic.runtime.migration] Will assume transactional DDL.
                   INFO  [alembic.runtime.migration] Running upgrade  -> 0001_initial_schema, Esquema inicial: las 17 tablas del POS nuevo — FASE 1.
Resultado        : PASA
Pendientes       : O-15 (folio único por sucursal), O-17 (cantidad por item_type),
                   O-18 (tabla sucursales) — se resuelven en F6 (Consolidación)
Commit           : <pendiente de commit en el repo NUEVO-POS>
─────────────────────────────────────────────
```

## Criterios de la puerta (§3.3)

| # | Criterio | Cómo se verifica | Estado |
|---|----------|------------------|--------|
| 1 | Las migraciones aplican y revierten sin error | `alembic upgrade head && downgrade base && upgrade head` | **PASA** |
| 2 | Ninguna columna de dinero es `Float` | `pytest tests/test_f1_cimiento.py::test_ca08` | **PASA** |
| 3 | Ningún `DateTime` es naive | `pytest tests/test_f1_cimiento.py::test_ca07` | **PASA** |
| 4 | El ledger rechaza un `UPDATE` directo | `pytest tests/test_f1_cimiento.py::test_ca09` | **PASA** |

### Salida de `pytest -v` (4/4 en verde)

```
tests/test_f1_cimiento.py::test_ca06_todas_las_pk_son_uuid PASSED        [ 25%]
tests/test_f1_cimiento.py::test_ca07_todos_los_timestamps_son_utc PASSED [ 50%]
tests/test_f1_cimiento.py::test_ca08_el_dinero_nunca_es_float PASSED     [ 75%]
tests/test_f1_cimiento.py::test_ca09_el_ledger_rechaza_update PASSED     [100%]
============================== 4 passed in 0.40s ===============================
```

### Carga de los 17 modelos (verificación de metadata)

```
MODELS OK: 17 tables
['almacenes', 'cash_movements', 'cash_sessions', 'categories',
 'heladeria_product_config', 'movimientos_inventario', 'orders',
 'product_technical_sheets', 'products', 'stock_almacen', 'terminal_locks',
 'terminal_sessions', 'ticket_item_components', 'ticket_items', 'tickets',
 'warehouse_eventos_sin_almacen', 'warehouse_events']
```

## Defecto encontrado y corregido durante la puerta

**Síntoma**: `ImportError: attempted relative import beyond top-level package`
en `models/cash.py:14` (y los otros 5 archivos de modelos).

**Causa raíz**: los 6 archivos de `models/` usaban import relativo al padre
(`from ..core.base import Base`), pero `migrations/env.py` importa `models`
como paquete de primer nivel (`import models`). Un módulo importado como
primer nivel no tiene padre, así que `..` es ilegal.

**Corrección**: se alinearon los 6 archivos al layout de primer nivel que ya
usaba `env.py` — `from ..core.X` → `from core.X`. Verificado: los 17 modelos
cargan y la puerta completa pasa.

## Entorno de ejecución

No hay Python en el host (solo el stub de Microsoft Store). La puerta corre
dentro del contenedor `api` (imagen `python:3.12-slim`), definido en
`docker-compose.yml`, con `DATABASE_URL=postgresql+asyncpg://pos:pos@db:5432/nuevo_pos`.
Esto es consistente con el stack obligatorio (Docker + Docker Compose, §7.1).

## Las 17 tablas (Documento 8)

| # | Tabla | Origen (ERP) | Cambio |
|---|-------|--------------|--------|
| 1 | `terminal_sessions` | `pos/models.py:17` | UUID + UTC |
| 2 | `tickets` | `pos/models.py:28` | UUID + UTC + version |
| 3 | `ticket_items` | `pos/models.py:72` | UUID |
| 4 | `terminal_locks` | `pos/models.py:7` | UUID + UTC |
| 5 | `cash_sessions` | `cash/models.py:7` | UUID + UTC |
| 6 | `cash_movements` | `cash/models.py:32` | UUID + UTC |
| 7 | `categories` | `catalog/models.py:5` | UUID |
| 8 | `products` | `catalog/models.py:42` | UUID, **sin `stock`** |
| 9 | `product_technical_sheets` | `catalog/models.py:82` | UUID |
| 10 | `orders` | `orders/models.py:12` | UUID + UTC, `delivery_fee` a Numeric |
| 11 | `almacenes` | `warehouse/models.py:54` | UUID + UTC |
| 12 | `stock_almacen` | `warehouse/models.py:74` | UUID + UTC + version |
| 13 | `movimientos_inventario` | `warehouse/models.py:90` | UUID + UTC + trigger inmutable |
| 14 | `warehouse_events` | `warehouse/models.py:110` | UUID + UTC |
| 15 | `warehouse_eventos_sin_almacen` | `warehouse/models.py:125` | UUID + UTC |
| 16 | `heladeria_product_config` | `heladeria/models.py:11` | UUID |
| 17 | `ticket_item_components` | `heladeria/models.py:40` | UUID |

## Deuda eliminada (Documento 8 §7)

- `products.stock` → NO existe. Fuente única: `stock_almacen` (contrato con Almacenes).
- `products.warehouse` → NO existe. Ubicación real: `stock_almacen.almacen_id`.
- Lecturas directas a `employees` / `doughs` → prohibidas. Solo contratos (F2).

## Cicatrices conservadas

- Bloqueo optimista (`version`) en `tickets` y `stock_almacen` (C-04).
- Outbox transaccional (`warehouse_events`) — elimina el `try/except pass`.
- Auditoría capturó/cobró (`captured_by_id`, `cashed_by_id`).
- Diagnóstico sin-almacén (`warehouse_eventos_sin_almacen`).
- Ledger inmutable (`movimientos_inventario` + trigger).
