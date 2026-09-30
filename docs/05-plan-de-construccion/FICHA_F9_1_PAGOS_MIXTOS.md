# FICHA DE CIERRE — FASE 9.1: PAGOS MIXTOS

**Estado:** ✅ CERRADA
**Fecha de cierre:** 30 Sep 2026
**Plan de referencia:** [`PLAN_DE_ABORDAJE_FASE_9_1_PAGOS_MIXTOS.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_9_1_PAGOS_MIXTOS.md) (v1.0)
**Fase padre:** Fase 9 — Rescate de UX del viejo POS

---

## 1. OBJETIVO DE LA FASE

Permitir que un ticket se cobre con **varios métodos de pago a la vez** (pago mixto:
efectivo + tarjeta + transferencia), de forma que:

1. El **arqueo de caja** sume al esperado **solo la parte en efectivo** (RN-53), no el total.
2. El **contrato HTTP** acepte una lista de pagos (`pagos[]`) y siga aceptando el cobro
   viejo de un solo método (retrocompatibilidad).
3. La **UI de cobro** permita agregar, editar y quitar abonos hasta cuadrar el total.
4. El **ticket impreso** muestre el desglose de pagos.

---

## 2. SUB-FASES EJECUTADAS

| Sub-fase | Alcance | Evidencia | Estado |
|----------|---------|-----------|--------|
| **F9.1.0** | Contrato + reglas RN-94/RN-95 | `tests/test_f9_1_pagos.py` — 18/18 | ✅ |
| **F9.1.1** | Arqueo lee N pagos (corrección crítica) | `tests/test_f9_1_arqueo.py` — 4/4 | ✅ |
| **F9.1.2** | Servicio + hook de cobro | `checkoutService.f9_1_2.test.jsx` — 22/22 | ✅ |
| **F9.1.3** | UI de pagos mixtos | `CheckoutScreen.f9_1_3.test.jsx` — 10/10 | ✅ |
| **F9.1.4** | Impresión + cierre | `ticketGenerator.f9_1_4.test.jsx` — 8/8 | ✅ |

---

## 3. LO QUE SE CONSTRUYÓ

### 3.1 Contrato (`schemas.py`)

- `CobrarTicketEntrada.payment_details` acepta la forma canónica
  `{ "pagos": [ {metodo, monto, tipo?, recibido?, cambio?}, ... ], "cajero": str }`
  y la forma vieja `{ metodo, recibido, cambio }`.
- `TicketSalida.payment_details: dict[str, Any] | None` — **expone el desglose al cliente**
  (F9.1.4a). Sin esto, el ticket impreso nunca podría mostrar los pagos.

### 3.2 Reglas de negocio (`rules/registry.py`)

- **RN-94** — `rn94_suma_de_pagos_cuadra_total(pagos, total)`: la suma de los abonos debe
  cuadrar exactamente con el total. Dinero en `Decimal` (DT-02), **sin tolerancia de punto
  flotante**: 0.01 de diferencia se rechaza con 400.
- **RN-95** — `rn95_metodos_de_pago_validos(pagos)`: cada abono usa un método válido
  (reutiliza `rn57_clasificar_por_metodo`).

La matriz pasó de 93 a **95 reglas** (RN-01 a RN-95). El nombre histórico
`LAS_81_REGLAS` se conserva por compatibilidad.

### 3.3 Normalización (`routers/pos.py`)

- `_normalizar_pagos(payment_details, total)`: convierte el cobro viejo a `pagos[]` y
  **reconstruye `monto` desde el total** cuando falta. Nunca lanza.
- `_ticket_a_salida` proyecta `payment_details=ticket.payment_details`.

### 3.4 Arqueo (`routers/cash.py`)

- `_ventas_en_efectivo` lee **N pagos** por ticket y suma **solo los abonos en efectivo**
  (RN-53). Un ticket $40 efectivo + $60 tarjeta sube el esperado **solo $40**.
- Retrocompatible: un ticket viejo sin `pagos[]` sigue sumando su `monto` si es EFECTIVO.

### 3.5 Servicio + hook (frontend)

- `checkoutService.js`: `METODOS_VALIDOS` (EFECTIVO/CREDITO/DEBITO/TRANSFERENCIA),
  `construirPaymentDetails({abonos, total, cajero})`, `resumenDePagos`, `calcularCambio`.
- `CheckoutScreen.jsx`: agregar, editar y quitar abonos; el botón de confirmar se habilita
  solo cuando la suma cuadra el total.

### 3.6 Impresión (`utils/ticketGenerator.js`)

- `etiquetaMetodoPago(pago)`: acepta la forma canónica (`{metodo:'TARJETA', tipo:'DEBITO'}`
  → 'Tarjeta débito') y el método directo (`{metodo:'DEBITO'}` → 'Débito').
- `listaDePagos(paymentDetails)`: extrae los pagos de cualquiera de las dos formas.
- `bloquePagos(paymentDetails)`: imprime el bloque "Forma de pago" con una fila por abono
  y, si hay, una fila "Cambio". Devuelve `''` si no hay pagos (ticket sin cobrar).
- `generarTicketHTML` inserta el bloque entre el TOTAL y el bloque de auditoría.

---

## 4. LA LECCIÓN DE INTEGRACIÓN (F9.1.4a)

Durante F9.1.4 se detectó un **hueco de integración** de la misma clase que el del
`GestorDeCaja` huérfano (micro-fase F4.5):

> El cobro mixto **persistía** `payment_details` en la base (`Ticket.payment_details` JSONB),
> pero `TicketSalida` **no lo exponía** y `_ticket_a_salida` **no lo proyectaba**.
> Resultado: el dato existía en el servidor pero **nunca llegaba al cliente**, así que el
> ticket impreso jamás podría mostrar el desglose.

Esto confirma el principio §10.6.1 del Plan Maestro: **el paso de INTEGRACIÓN también es
una compuerta**. Que un componente exista y pase su test **no** garantiza que el usuario
pueda llegar a él ni que el dato llegue al consumidor final.

**Corrección aplicada:** se añadió `payment_details` a `TicketSalida` y su proyección en
`_ticket_a_salida`, con dos tests que lo blindan
(`test_ticket_salida_expone_payment_details`, `test_ticket_salida_sin_cobro_no_tiene_payment_details`).

---

## 5. EVIDENCIA DE LA PUERTA

### 5.1 Backend

```
tests/test_f9_1_pagos.py    → 18 passed
tests/test_f9_1_arqueo.py   →  4 passed
tests/test_f3_comportamiento.py (matriz 95 reglas) → verde
```

### 5.2 Frontend

```
src/services/checkoutService.f9_1_2.test.jsx   → 22 passed
src/components/CheckoutScreen.f9_1_3.test.jsx  → 10 passed
src/utils/ticketGenerator.f9_1_4.test.jsx      →  8 passed
src/utils/ticketGenerator.f6_0.test.jsx        → 14 passed (regresión)
```

### 5.3 CI completo (`npm run ci` desde `NUEVO-POS/`)

```
LINT (F0)          → 259 archivos, 0 errores
TESTS Node         → 3/3 archivos en verde
TESTS componentes  → PASA
TESTS API (pytest) → PASA
GUARDIANES         → E-05, A-04, E-15, R-01, E-09, E-10 → 0 coincidencias
✅ RESULTADO: TODOS LOS TESTS EN VERDE.
```

---

## 6. CRITERIOS DE ACEPTACIÓN — VERIFICACIÓN

| # | Criterio | Verificación | Estado |
|---|----------|--------------|--------|
| 1 | Un pago mixto que cuadra el total se acepta | `test_rn94_pago_mixto_cuadra` | ✅ |
| 2 | Cobrar de menos / de más se rechaza con 400 | `test_rn94_cobrar_de_menos_se_rechaza`, `..._de_mas_...` | ✅ |
| 3 | Sin tolerancia de punto flotante (0.01 falla) | `test_rn94_sin_tolerancia_de_punto_flotante` | ✅ |
| 4 | Un método inválido en cualquier abono se rechaza | `test_rn95_metodo_invalido_en_cualquier_abono_se_rechaza` | ✅ |
| 5 | El arqueo suma SOLO el efectivo del mixto | `test_mixto_solo_sube_el_efectivo` | ✅ |
| 6 | Retrocompatibilidad con el cobro viejo | `test_retrocompatibilidad_cobro_viejo` | ✅ |
| 7 | 100% tarjeta no sube el esperado | `test_cien_por_ciento_tarjeta_no_sube` | ✅ |
| 8 | La UI permite agregar/editar/quitar abonos | `CheckoutScreen.f9_1_3.test.jsx` | ✅ |
| 9 | El ticket impreso muestra el desglose | `ticketGenerator.f9_1_4.test.jsx` | ✅ |
| 10 | `TicketSalida` expone `payment_details` | `test_ticket_salida_expone_payment_details` | ✅ |

---

## 7. ARCHIVOS TOCADOS

**Backend (`apps/api/`)**
- `schemas.py` — `TicketSalida.payment_details`, `CobrarTicketEntrada.payment_details`
- `rules/registry.py` — RN-94, RN-95, `LAS_81_REGLAS` (95 entradas)
- `rules/__init__.py` — exporta RN-94/RN-95
- `routers/pos.py` — `_normalizar_pagos`, `_ticket_a_salida`, `cobrar_ticket`
- `routers/cash.py` — `_ventas_en_efectivo` lee N pagos
- `tests/test_f9_1_pagos.py`, `tests/test_f9_1_arqueo.py`, `tests/test_f3_comportamiento.py`

**Frontend (`apps/pos/src/`)**
- `services/checkoutService.js` — `METODOS_VALIDOS`, `construirPaymentDetails`, `resumenDePagos`
- `components/CheckoutScreen.jsx` — UI de abonos
- `utils/ticketGenerator.js` — `etiquetaMetodoPago`, `listaDePagos`, `bloquePagos`, `filaPago`
- `services/checkoutService.f9_1_2.test.jsx`, `components/CheckoutScreen.f9_1_3.test.jsx`,
  `utils/ticketGenerator.f9_1_4.test.jsx`

---

## 8. RIESGOS RESIDUALES

- **Ninguno bloqueante.** El cobro viejo sigue funcionando (retrocompatibilidad verificada).
- El nombre `LAS_81_REGLAS` es histórico (hoy son 95); renombrarlo sería un cambio cosmético
  con riesgo de romper imports — se deja como está y se documenta aquí.

---

## 9. HASHES DE COMMIT

| Sub-fase | Commit |
|----------|--------|
| F9.1.3 (UI) | `9069134` |
| F9.1.4 (impresión + cierre) | `0eeae2a` |
| Plan Maestro v2.2 (PLANOS) | `eef9059` |

---

**FASE 9.1 — PAGOS MIXTOS: ✅ CERRADA.**
