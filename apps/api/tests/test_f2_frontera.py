"""Puerta de FASE 2 — Frontera (Contratos).

Verifica los 3 criterios de la puerta (Plan de Construcción §4.3):

  1. El test de arquitectura pasa: 0 imports del POS a modelos ajenos.
  2. Cada contrato tiene su firma (entrada/salida) documentada.
  3. Ningún contrato expone una tabla; todos exponen una operación.

La evidencia es el análisis del código y del registro, no la intención.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

from contracts import CONTRATOS, listar_contratos

# Raíz del backend: .../apps/api
API_ROOT = Path(__file__).resolve().parent.parent

# Módulos ajenos al POS. El POS NO puede importar sus modelos.
MODULOS_AJENOS = (
    "catalog",
    "warehouse",
    "orders",
    "security",
    "cash",
    "production",
    "vision",
    "audit",
    "stats",
)

# Los 17 contratos esperados (Documento 9 §10).
LOS_17_CONTRATOS = (
    "catalogo.productos_para_venta",
    "almacenes.consumir_por_venta",
    "almacenes.disponibilidad",
    "produccion.disponible_para_vender",
    "pos.eventos_auditables",
    "pos.resumen_de_venta",
    "seguridad.identidad_del_empleado",
    "seguridad.validar_pin",
    "caja.sesion_activa",
    "caja.abrir_turno",
    "caja.registrar_movimiento",
    "caja.resumen_del_turno",
    "caja.cerrar_turno",
    "caja.reporte_diario",
    "pedidos.registrar_desde_ticket",
    "pedidos.pedido_del_ticket",
    "vision.reconocer_producto",
)


def _imports_absolutos_de(archivo: Path) -> list[str]:
    """Devuelve los módulos importados de forma ABSOLUTA por un archivo .py.

    Solo se consideran los imports absolutos (nivel 0). Un import relativo
    (`from .cash import ...`, nivel >= 1) apunta a un submódulo PROPIO del
    paquete, no a un módulo ajeno. Confundirlos produce falsos positivos:
    el POS tiene su propio `models/cash.py` (tablas `cash_sessions`), que no
    es el módulo ajeno `cash`.
    """
    arbol = ast.parse(archivo.read_text(encoding="utf-8"), filename=str(archivo))
    modulos: list[str] = []
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            # `import x.y` es siempre absoluto.
            modulos.extend(alias.name for alias in nodo.names)
        elif isinstance(nodo, ast.ImportFrom):
            # `from .x import y` tiene level >= 1 → es relativo, se ignora.
            if nodo.module and nodo.level == 0:
                modulos.append(nodo.module)
    return modulos


def _archivos_python(directorio: Path) -> list[Path]:
    """Todos los .py de un directorio, recursivo, sin cachés."""
    return [
        p
        for p in directorio.rglob("*.py")
        if "__pycache__" not in p.parts and ".pytest_cache" not in p.parts
    ]


# ── Criterio 1: test de arquitectura ───────────────────────────────────────


def test_criterio1_el_pos_no_importa_modelos_ajenos():
    """0 imports del POS a modelos ajenos.

    Se revisan los paquetes del POS (`models/`, `contracts/`) buscando
    cualquier import que apunte a un módulo ajeno. Debe haber 0.
    """
    violaciones: list[str] = []
    for paquete in ("models", "contracts"):
        directorio = API_ROOT / paquete
        if not directorio.exists():
            continue
        for archivo in _archivos_python(directorio):
            for modulo in _imports_absolutos_de(archivo):
                raiz = modulo.split(".")[0]
                if raiz in MODULOS_AJENOS:
                    violaciones.append(f"{archivo.relative_to(API_ROOT)} importa '{modulo}'")
    assert violaciones == [], (
        "El POS importa modelos ajenos (viola P-01 / Regla de Oro #5):\n  "
        + "\n  ".join(violaciones)
    )


def test_criterio1_los_contratos_no_importan_modelos():
    """El paquete `contracts/` no importa NINGÚN modelo (ni propio ni ajeno).

    Un contrato es una frontera: describe operaciones, no toca tablas.
    """
    directorio = API_ROOT / "contracts"
    violaciones: list[str] = []
    for archivo in _archivos_python(directorio):
        for modulo in _imports_absolutos_de(archivo):
            raiz = modulo.split(".")[0]
            if raiz == "models" or raiz in MODULOS_AJENOS:
                violaciones.append(f"{archivo.relative_to(API_ROOT)} importa '{modulo}'")
    assert violaciones == [], (
        "Un contrato importa un modelo (debe ser pura frontera):\n  "
        + "\n  ".join(violaciones)
    )


# ── Criterio 2: cada contrato tiene su firma ───────────────────────────────


def test_criterio2_hay_exactamente_17_contratos():
    """El registro declara los 17 contratos del Documento 9 §10."""
    assert len(CONTRATOS) == 17, f"Se esperaban 17 contratos, hay {len(CONTRATOS)}"
    nombres = tuple(c.nombre for c in CONTRATOS)
    assert nombres == LOS_17_CONTRATOS, f"Los nombres no coinciden:\n{nombres}"


def test_criterio2_cada_contrato_tiene_firma_documentada():
    """Cada contrato declara entrada y salida no vacías, y una operación."""
    for contrato in CONTRATOS:
        assert contrato.operacion, f"{contrato.nombre} no declara operación"
        assert contrato.entrada, f"{contrato.nombre} no declara entrada"
        assert contrato.salida, f"{contrato.nombre} no declara salida"
        assert contrato.consumidor, f"{contrato.nombre} no declara consumidor"
        assert contrato.proveedor, f"{contrato.nombre} no declara proveedor"
        # La firma legible debe poder construirse.
        assert "->" in contrato.firma, f"{contrato.nombre} no produce firma legible"


def test_criterio2_la_operacion_es_una_operacion_no_una_tabla():
    """La operación declarada es un endpoint (verbo HTTP), no un nombre de tabla."""
    verbos = ("GET ", "POST ", "PUT ", "PATCH ", "DELETE ")
    for contrato in CONTRATOS:
        assert contrato.operacion.startswith(verbos), (
            f"{contrato.nombre}: '{contrato.operacion}' no es una operación HTTP"
        )


# ── Criterio 3: ningún contrato expone una tabla ───────────────────────────


def test_criterio3_ningun_contrato_expone_una_tabla():
    """Ningún contrato expone una tabla; todos exponen una operación (O-23)."""
    for contrato in CONTRATOS:
        assert contrato.tabla_expuesta is None, (
            f"{contrato.nombre} expone la tabla '{contrato.tabla_expuesta}'"
        )


def test_criterio3_ninguna_salida_es_select_estrella():
    """Ninguna salida declara `SELECT *` ni una fila completa (O-23)."""
    for contrato in CONTRATOS:
        for campo, tipo in contrato.salida.items():
            assert "*" not in tipo, f"{contrato.nombre}.{campo} expone '*'"
            assert tipo != "Row", f"{contrato.nombre}.{campo} expone una fila completa"


def test_criterio3_el_pos_solo_es_proveedor_en_dos_contratos():
    """El POS solo es proveedor en auditoría y estadísticas (Documento 9 §12)."""
    proveedor_pos = [c.nombre for c in CONTRATOS if c.proveedor == "POS"]
    assert proveedor_pos == ["pos.eventos_auditables", "pos.resumen_de_venta"], (
        f"El POS es proveedor en contratos inesperados: {proveedor_pos}"
    )


def test_listar_contratos_devuelve_los_17():
    """La función pública del paquete devuelve los 17 contratos."""
    assert len(listar_contratos()) == 17
