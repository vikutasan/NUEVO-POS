# 🔍 FICHA F10.5 — PARIDAD DE DATOS DE CAJA (viejo POS → nuevo POS)

**Fase:** 10.5 (sub-fase hermana de F10.4)
**Fecha:** 30 Sep 2026
**Estado:** ✅ CERRADA
**Origen:** Análisis del usuario — la analogía del **trasplante de corazón**:
*"el nuevo POS debe recibir la misma 'presión sanguínea' (datos) que el viejo,
o el cuerpo (ERP) rechazará el órgano."*

---

## 1. POR QUÉ EXISTIÓ ESTA SUB-FASE

F10 auditó **componentes** (¿existe el botón? ¿existe el modal?). F10.4 descubrió
que el inventario de componentes **no ve las integraciones** POS→ERP.

F10.5 lleva la lección un paso más allá: el inventario de componentes **tampoco
ve los FLUJOS DE DATOS**. Un componente puede existir, pasar su test y aun así
**consumir menos datos** que su equivalente viejo. El POS "funciona", pero le
llega menos información al ERP — y el ERP decide peor.

### La evidencia decisiva

El viejo `CashSummaryResponse` (backend del ERP viejo) devolvía **8 campos**:

```
efectivo_esperado, total_credito, total_debito, total_ventas,
num_transacciones, fondo_inicial, total_entradas, total_salidas
```

El nuevo `ResumenTurnoSalida` (contrato 12) devolvía **2 campos**:

```
esperado, movimientos
```

**7 campos faltaban.** El cajero del nuevo POS no veía el desglose por método
de pago; el viejo sí. Y el nombre del cajero (`usuario_nombre`) tampoco viajaba
al abrir el turno (contrato 10).

### Las cinco instancias de la misma clase de falla

| # | Falla | Fase | Naturaleza |
|---|-------|------|------------|
| 1 | `GestorDeCaja` huérfano | F4.5 | Integración olvidada |
| 2 | `payment_details` no expuesto | F9.1.4a | Dato construido, no expuesto |
| 3 | "Copiar URL" ausente | F10 | Omisión total |
| 4 | "Contexto diario post-corte" ausente | F10.4 | Integración POS→ERP no portada |
| 5 | **Resumen de caja incompleto (7 campos)** | **F10.5** | **Flujo de datos incompleto** |

**Causa raíz común:** el método "de adentro hacia afuera" verifica la **calidad**
de cada pieza, pero no la **COMPLETITUD del conjunto** ni la **COMPLETITUD de los
datos que fluyen entre las piezas**.

---

## 2. LAS DOS BRECHAS CERRADAS

### 2.1 Brecha #1 — El nombre del cajero no viajaba (contrato 10)

**Viejo:** `abrirSesion({ terminal_id, employee_id, employee_name, opening_float })`
— el nombre del empleado viajaba al abrir el turno.

**Nuevo (antes):** `AbrirTurnoEntrada` solo tenía `terminal_id`, `usuario_id`,
`monto_inicial`. El nombre **no viajaba** → el reporte diario agrupaba por cajero
con un ID, no con un nombre legible.

**Cierre:** se añadió `usuario_nombre` (opcional) a `AbrirTurnoEntrada` y se
propaga a la sesión de caja. El frontend lo envía desde `RetailVisionPOS.jsx`
(prop `usuarioNombre` → `GestorDeCaja.jsx` → `abrirTurno`).

### 2.2 Brecha #2 — El resumen del turno perdía 7 campos (contrato 12)

**Viejo:** 8 campos (desglose por método + fondo + entradas/salidas + transacciones).

**Nuevo (antes):** 2 campos (`esperado`, `movimientos`).

**Cierre:** `ResumenTurnoSalida` se amplió a los 8 campos del viejo, alimentados
por la clasificación RN-58 (`_clasificar_ventas_del_turno`):

```
esperado, movimientos, fondo_inicial, total_entradas, total_salidas,
total_credito, total_debito, total_ventas, num_transacciones
```

El frontend (`GestorDeCaja.jsx`) muestra el **"Desglose del turno"** con los 8
`data-testid` correspondientes.

---

## 3. ARCHIVOS MODIFICADOS

### Backend

| Archivo | Cambio |
|---------|--------|
| `../NUEVO-POS/apps/api/schemas.py` | `AbrirTurnoEntrada` + `usuario_nombre`; `ResumenTurnoSalida` + 7 campos |
| `../NUEVO-POS/apps/api/routers/cash.py` | `_clasificar_ventas_del_turno` (RN-58) alimenta el resumen; `cerrar_turno` usa `.get("EFECTIVO", 0)` |
| `../NUEVO-POS/apps/api/rules/registry.py` | `rn58_clasificacion_alimenta_resumen` (ya existía; se reutiliza) |

### Frontend

| Archivo | Cambio |
|---------|--------|
| `../NUEVO-POS/apps/pos/src/GestorDeCaja.jsx` | Prop `usuarioNombre`; envía `usuario_nombre`; `useMemo` `desglose`; bloque "Desglose del turno" |
| `../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx` | Pasa `usuarioNombre` a `GestorDeCaja` |

### Tests

| Archivo | Cobertura |
|---------|-----------|
| `../NUEVO-POS/apps/api/tests/test_f10_5_paridad_caja.py` | 5/5 — paridad de datos de caja (contratos 10 y 12) |
| `../NUEVO-POS/apps/pos/src/GestorDeCaja.f10_5.test.jsx` | 4/4 — el desglose se muestra; el nombre viaja |

---

## 4. LA REGRESIÓN QUE ESTA SUB-FASE EXPUSO (y corrigió)

Al ampliar el resumen, el refactor de `cash.py` dejó **dos regresiones** que la
compuerta de F4.1 atrapó de inmediato:

1. **`NameError`:** `cerrar_turno` seguía llamando a la vieja `_ventas_en_efectivo`
   (renombrada a `_clasificar_ventas_del_turno`). → corregido.
2. **`KeyError: 'EFECTIVO'`:** RN-58 **solo incluye las claves de los métodos
   PRESENTES** en los pagos. Sin ventas en efectivo, la clave `EFECTIVO` no existe.
   → corregido con `clasificacion.get("EFECTIVO", Decimal("0.00"))`.

> **Lección técnica:** una regla que "alimenta un resumen" puede **omitir claves
> ausentes** (no las pone en cero). El consumidor debe usar `.get` con default,
> nunca indexar directo. Esto es exactamente el tipo de detalle que la paridad de
> datos destapa.

---

## 5. COMPUERTA COMPLETA

`npm run ci` desde `../NUEVO-POS`:

```
Lint OK: 0 errores.
Tests de Node      : 3/3 archivo(s) en verde
Tests de componentes: PASA
Tests de API       : PASA
✅ RESULTADO: TODOS LOS TESTS EN VERDE.
PUERTA F0 EN VERDE / F4-A-04 EN VERDE / F5-R-01 EN VERDE
```

Backend focalizado: `test_f4_1_caja_api.py` + `test_f10_5_paridad_caja.py` → **12/12**.
Frontend focalizado: `GestorDeCaja.f10_5.test.jsx` → **4/4**.

---

## 6. LECCIÓN CODIFICADA (§10.6.4)

> *"el componente existe y pasa su test" ≠ "el usuario puede llegar a él"* (F4.5)
>
> *"el componente existe y pasa su test" ≠ "el conjunto está completo"* (F10)
>
> *"el inventario de componentes no ve las integraciones."* (F10.4)
>
> **F10.5 la extiende (§10.6.4):**
> *"el inventario de componentes no ve los FLUJOS DE DATOS."*

Un componente puede existir, pasar su test y aun así **consumir menos datos** que
su equivalente viejo. La auditoría de paridad debe inventariar, además de los
componentes y las integraciones, **los campos que fluyen en cada contrato** —
comparando el payload viejo contra el nuevo, campo por campo.

**Regla nueva para el futuro:** antes de cerrar un módulo que reemplaza a otro,
se compara **el payload de cada contrato** (entrada y salida) contra el del módulo
viejo. Un contrato "que funciona" puede estar **incompleto**.

---

## 7. TRAZABILIDAD

| Documento | Relación |
|-----------|----------|
| `PLAN_DE_ABORDAJE_F10_5_PARIDAD_DE_DATOS_DE_CAJA.md` | El plan de esta sub-fase |
| `FICHA_F10_PARIDAD.md` | La ficha madre (brechas #1 y #2) |
| `FICHA_F10_4_CONTEXTO_DIARIO.md` | La sub-fase hermana (B-02) |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §6.8 | UX heredada — la integración se hereda |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §10.6.4 | La lección de F10.5 — el inventario no ve los flujos de datos |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §11 | Documentación final (se ejecuta DESPUÉS de F10) |

### 7.1 Contratos tocados

| Contrato | Cambio |
|----------|--------|
| 10 `caja.abrir_turno` | entrada `+ usuario_nombre` |
| 12 `caja.resumen_del_turno` | salida `+ fondo_inicial, total_entradas, total_salidas, total_credito, total_debito, total_ventas, num_transacciones` |

### 7.2 Commits

| Repo | Commit | Contenido |
|------|--------|-----------|
| `NUEVO-POS` | _(pendiente F10.5.5)_ | Backend + frontend + tests + esta ficha |
| `PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS` | _(pendiente F10.5.5)_ | Plan Maestro §10.6.4 |
