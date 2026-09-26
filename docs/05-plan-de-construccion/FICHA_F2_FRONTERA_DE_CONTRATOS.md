# FICHA DE EVIDENCIA — FASE 2: FRONTERA (CONTRATOS)

> Plantilla del Prompt del Arquitecto §7.3. La salida se pega tal cual; un
> resumen no es evidencia.

```
─────────────────────────────────────────────
Fase             : F2 — Frontera (Contratos)
Puerta declarada : Plan de Construcción §4.3
Comando          : docker compose exec api pytest -v
Salida           : tests/test_f1_cimiento.py::test_ca06_todas_las_pk_son_uuid PASSED        [  7%]
                   tests/test_f1_cimiento.py::test_ca07_todos_los_timestamps_son_utc PASSED [ 15%]
                   tests/test_f1_cimiento.py::test_ca08_el_dinero_nunca_es_float PASSED     [ 23%]
                   tests/test_f1_cimiento.py::test_ca09_el_ledger_rechaza_update PASSED     [ 30%]
                   tests/test_f2_frontera.py::test_criterio1_el_pos_no_importa_modelos_ajenos PASSED [ 38%]
                   tests/test_f2_frontera.py::test_criterio1_los_contratos_no_importan_modelos PASSED [ 46%]
                   tests/test_f2_frontera.py::test_criterio2_hay_exactamente_17_contratos PASSED [ 53%]
                   tests/test_f2_frontera.py::test_criterio2_cada_contrato_tiene_firma_documentada PASSED [ 61%]
                   tests/test_f2_frontera.py::test_criterio2_la_operacion_es_una_operacion_no_una_tabla PASSED [ 69%]
                   tests/test_f2_frontera.py::test_criterio3_ningun_contrato_expone_una_tabla PASSED [ 76%]
                   tests/test_f2_frontera.py::test_criterio3_ninguna_salida_es_select_estrella PASSED [ 84%]
                   tests/test_f2_frontera.py::test_criterio3_el_pos_solo_es_proveedor_en_dos_contratos PASSED [ 92%]
                   tests/test_f2_frontera.py::test_listar_contratos_devuelve_los_17 PASSED  [100%]
                   ============================== 13 passed in 0.73s ==============================
Resultado        : PASA
Pendientes       : RN-73 vs RN-81 (se resuelve en F3); O-21 (HTTPS + rate-limit
                   en validar_pin, se implementa en F5); O-22 (mover VisionScanner
                   al módulo Visión, se implementa en F5)
Commit           : <pendiente de commit en el repo NUEVO-POS>
─────────────────────────────────────────────
```

## Criterios de la puerta (§4.3)

| # | Criterio | Cómo se verifica | Estado |
|---|----------|------------------|--------|
| 1 | El test de arquitectura pasa: **0 imports** del POS a modelos ajenos | `pytest tests/test_f2_frontera.py::test_criterio1_el_pos_no_importa_modelos_ajenos` | **PASA** |
| 2 | Cada contrato tiene su firma (entrada/salida) documentada | `pytest tests/test_f2_frontera.py::test_criterio2_cada_contrato_tiene_firma_documentada` | **PASA** |
| 3 | Ningún contrato expone una tabla; todos exponen una operación | `pytest tests/test_f2_frontera.py::test_criterio3_ningun_contrato_expone_una_tabla` | **PASA** |

## Artefactos creados

| Archivo | Qué es |
|---------|--------|
| `apps/api/contracts/__init__.py` | La frontera: expone `CONTRATOS`, `Contrato`, `listar_contratos`. |
| `apps/api/contracts/registry.py` | Los 17 contratos con su firma completa (entrada/salida), proveedor y garantías. |
| `apps/api/tests/test_f2_frontera.py` | La puerta: 9 tests (arquitectura + firma + no-tabla). |

## Los 17 contratos (Documento 9 §10)

| # | Contrato | Consumidor | Proveedor | Estado hoy |
|---|----------|-----------|-----------|------------|
| 1 | `catalogo.productos_para_venta` | POS | Catálogo | Ya existe (parcial) |
| 2 | `almacenes.consumir_por_venta` | POS | Almacenes | Deuda |
| 3 | `almacenes.disponibilidad` | POS | Almacenes | Deuda |
| 4 | `produccion.disponible_para_vender` | POS | Producción | Deuda |
| 5 | `pos.eventos_auditables` | Auditoría | POS | Cicatriz |
| 6 | `pos.resumen_de_venta` | Estadísticas | POS | Deuda |
| 7 | `seguridad.identidad_del_empleado` | POS | Seguridad | Deuda |
| 8 | `seguridad.validar_pin` | POS | Seguridad | Deuda |
| 9 | `caja.sesion_activa` | POS | Caja | Ya existe |
| 10 | `caja.abrir_turno` | POS | Caja | Ya existe |
| 11 | `caja.registrar_movimiento` | POS | Caja | Ya existe |
| 12 | `caja.resumen_del_turno` | POS | Caja | Ya existe |
| 13 | `caja.cerrar_turno` | POS | Caja | Ya existe |
| 14 | `caja.reporte_diario` | POS / Estadísticas | Caja | Ya existe |
| 15 | `pedidos.registrar_desde_ticket` | POS | Pedidos | Deuda |
| 16 | `pedidos.pedido_del_ticket` | POS | Pedidos | Deuda |
| 17 | `vision.reconocer_producto` | POS | Visión | Deuda |

**Lectura de la matriz.** De 17 contratos: **1 es cicatriz** (se conserva),
**1 ya existe parcial** (catálogo, se formaliza), **6 ya existen completos**
(Caja, se documentan como referencia) y **9 son deuda** (se corrigen en el POS
nuevo). El POS solo es **proveedor** en 2 contratos (auditoría y estadísticas),
y en ambos expone un **resumen**, nunca su tabla.

## Defecto encontrado y corregido durante la puerta

**Síntoma**: `test_criterio1_el_pos_no_importa_modelos_ajenos` falló con 4
violaciones falsas:

```
models/__init__.py importa 'cash'
models/__init__.py importa 'catalog'
models/__init__.py importa 'orders'
models/__init__.py importa 'warehouse'
```

**Causa raíz**: el analizador AST descartaba el campo `level` del nodo
`ImportFrom`. Un import **relativo** (`from .cash import CashSession`, nivel 1)
apunta a un submódulo **propio** del paquete `models/` — el POS tiene su propio
`models/cash.py` con las tablas `cash_sessions`/`cash_movements`, que **no** es
el módulo ajeno `cash`. Al ignorar `level`, el import relativo se volvía
indistinguible de un import absoluto (`from modules.cash import ...`).

**Corrección**: el analizador ahora solo considera imports **absolutos**
(`nodo.level == 0`). Los imports relativos se ignoran porque apuntan a
submódulos propios. Verificado: 0 violaciones reales, la puerta completa pasa.

**Nota de método**: el fallo fue un **falso positivo del test**, no una
violación real del código. Se diagnosticó leyendo `models/__init__.py` y
confirmando que los 4 imports son relativos (`from .cash`, `from .catalog`,
`from .orders`, `from .warehouse`).

## Entorno de ejecución

No hay Python en el host (solo el stub de Microsoft Store). La puerta corre
dentro del contenedor `api` (imagen `python:3.12-slim`), definido en
`docker-compose.yml`, con `DATABASE_URL=postgresql+asyncpg://pos:pos@db:5432/nuevo_pos`.
Esto es consistente con el stack obligatorio (Docker + Docker Compose, §7.1).

## Los 3 principios de la frontera (Documento 9 §0)

- **P-01** El dueño de la tabla es el único que la escribe.
- **P-02** El consumidor pide por operación, no por tabla.
- **P-03** El contrato es estable; la tabla es libre.

## Deuda eliminada por esta frontera (Documento 9 §12)

- El POS **no lee ni escribe** tablas de otros módulos. Pide por contrato.
- Los **9 acoplamientos de deuda** quedan identificados con su sustituto exacto.
- El POS solo es proveedor en auditoría y estadísticas: expone **resúmenes**,
  nunca tablas.
- El patrón Outbox (`evento_id`) garantiza que el descuento de stock sea
  idempotente.
