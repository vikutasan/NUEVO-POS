# FICHA — FIX BUG-04: El contexto de pedido no se restaura al recuperar del pizarrón

**Estado:** COMPLETADA
**Fecha:** 2026-10-10
**Tipo:** Corrección de bug en vivo (paridad funcional con el viejo POS)
**Regla de negocio implicada:** RN-31 (`rn31_pizarron_solo_open_de_la_terminal`), RN-15 (proyección ligera)
**Contratos implicados:** contrato 23 (`pos.cuentas_abiertas`) — **ampliado**; contrato 3 (`pos.bloque_pedido`) — consumido

---

## 1. Síntoma reportado en vivo

El operador reportó (verbatim):

> HAY UN DETALLE AL COBRAR PEDIDOS INVOCÁNDOLOS DESDE EL PIZARRÓN YA QUE AL
> INVOCARLOS NO PERSISTEN LA INFORMACIÓN DE LA FECHA COMPROMISO DE ENTREGA,
> SOLO LA PERSISTEN SI SE LA AGREGO DESDE ESA MISMA TERMINAL, O AL MENOS ESA
> FUE MI IMPRESIÓN, INVESTIGA Y ME REPORTAS.

Es decir: al **recuperar** un pedido desde el pizarrón (post-it) y cobrarlo, la
**fecha compromiso de entrega** (`committed_at`) aparecía vacía. Si el pedido se
programaba y cobraba **en la misma terminal**, la fecha sí sobrevivía.

---

## 2. Diagnóstico

### 2.1 La impresión del operador era CORRECTA

La fecha **nunca se perdía en la base de datos**: el `Ticket` siempre conservó
`committed_at`. Lo que se perdía era el **estado local del cliente**
(`bloquePedido`) al reconstruir el pedido desde el post-it.

### 2.2 Cadena del fallo

1. **Backend — contrato 23 incompleto.** `CuentaAbiertaSalida`
   (`apps/api/schemas.py`) proyectaba 12 campos escalares (Regla 15), pero
   **omitía** `committed_at`, `packaging_type`, `delivery_address` y
   `order_notes`. El post-it, por tanto, **nunca recibía** esos datos.
2. **Frontend — handler incompleto.** `recuperarCuentaAlCarrito`
   (`apps/pos/src/RetailVisionPOS.jsx`) reconstruía el bloque de pedido con
   `construirBloquePedido(...)` pero **no pasaba** los 4 campos ausentes. Aunque
   el backend los hubiera enviado, el cliente los habría descartado.
3. **Frontend — desajuste de nombre de campo (bug latente).**
   `OrderProgrammingModal.jsx` leía `datosIniciales?.notes`, pero el bloque de
   pedido (contrato 3) nombra las notas **`order_notes`**. Al reabrir el modal
   sobre un pedido recuperado, el campo de notas salía **en blanco**.

**Por qué "solo sobrevivía en la misma terminal":** al programar y cobrar sin
salir de la terminal, el `bloquePedido` local **nunca se destruía** — no había
recuperación de por medio. Al recuperar desde el pizarrón, el bloque se
reconstruía desde cero y los 4 campos se perdían.

### 2.3 Frontera A-02

El arreglo respeta la frontera por contratos: el POS **no** importa modelos
ajenos. Se amplía la **proyección** del contrato 23 (lado backend) y se
**consume** correctamente en el cliente (lado frontend).

---

## 3. Corrección (dos partes + un bug latente)

### 3.1 Backend — ampliar el contrato 23

`apps/api/schemas.py` — `CuentaAbiertaSalida` pasa de 12 a **16** campos:

```python
committed_at: datetime | None = None
packaging_type: str | None = None
delivery_address: str | None = None
order_notes: str | None = None
```

`apps/api/contracts/registry.py` — la declaración del contrato 23 documenta la
garantía BUG-04 y actualiza `estado_hoy`.

El router `cuentas_abiertas` (`apps/api/routers/pos.py`) usa
`CuentaAbiertaSalida.model_validate(t)` con `from_attributes=True`, por lo que
proyecta los nuevos campos **sin cambios adicionales**.

### 3.2 Frontend — pasar los campos al bloque de pedido

`apps/pos/src/RetailVisionPOS.jsx` — `recuperarCuentaAlCarrito` ahora pasa
`committed_at`, `packaging_type`, `delivery_address` y `order_notes` a
`construirBloquePedido(...)`.

### 3.3 Frontend — corregir el nombre de las notas (bug latente)

`apps/pos/src/components/OrderProgrammingModal.jsx`:

```js
// BUG-04 — el bloque `order_*` (contrato 3) nombra las notas `order_notes`,
// no `notes`. Leer `notes` dejaba el campo vacío al reabrir el modal sobre
// un pedido recuperado del pizarrón. Se acepta `notes` como respaldo por
// compatibilidad con cualquier consumidor que use el nombre corto.
order_notes: datosIniciales?.order_notes || datosIniciales?.notes || '',
```

---

## 4. Pruebas

### 4.1 Backend — `apps/api/tests/test_f5_cuentas.py` (ampliado)

- `CAMPOS_ESPERADOS` pasa de 12 a **16** campos.
- Nuevo test `test_contexto_de_pedido_completo`: siembra un ticket con
  `order_type`, `delivery_type`, `packaging_type`, `delivery_address`,
  `order_notes` y `committed_at`, y verifica que el post-it (contrato 23) los
  expone **todos**, incluida la fecha compromiso exacta (UTC).

### 4.2 Frontend — `apps/pos/src/RetailVisionPOS.bug04.test.jsx` (nuevo, 2 tests)

| Test | Verifica |
|---|---|
| criterio 1 | Al recuperar del pizarrón, `#input-committed-at` muestra la fecha compromiso (convertida a local) |
| criterio 2 | Se restauran nombre, teléfono, dirección y notas del pedido |

### 4.3 Suites completas (sin regresiones)

- **Backend:** `352 passed` (351 previos + 1 nuevo).
- **Frontend:** `801 passed` en 72 archivos (799 previos + 2 nuevos).

> Nota de entorno: la suite backend puede fallar por **contaminación de la BD de
> desarrollo** (filas de `cash_movements`/`tickets` que referencian
> `cash_sessions`, rompiendo el aislamiento de `test_f7_7_terminales.py`). Se
> limpia con `DELETE FROM ticket_items; DELETE FROM tickets; DELETE FROM
> cash_movements; DELETE FROM cash_sessions;`. No es una regresión de BUG-04.

---

## 5. Archivos tocados

| Archivo | Cambio |
|---|---|
| `apps/api/schemas.py` | `CuentaAbiertaSalida` +4 campos (contrato 23) |
| `apps/api/contracts/registry.py` | Declaración del contrato 23 (garantía BUG-04) |
| `apps/api/tests/test_f5_cuentas.py` | 16 campos + `test_contexto_de_pedido_completo` |
| `apps/pos/src/RetailVisionPOS.jsx` | `recuperarCuentaAlCarrito` pasa los 4 campos |
| `apps/pos/src/components/OrderProgrammingModal.jsx` | Lee `order_notes` (con respaldo `notes`) |
| `apps/pos/src/RetailVisionPOS.bug04.test.jsx` | **Nuevo** — 2 tests |

---

## 6. Verificación en vivo

Pendiente de confirmación del operador: programar un pedido con fecha compromiso
en una terminal, enviarlo al pizarrón, recuperarlo desde **otra** terminal y
verificar que la fecha compromiso, el empaque, la dirección y las notas se
restauran correctamente antes de cobrar.
