# FICHA F9.1.3 — UI de Pagos Mixtos (`CheckoutScreen`)

> **Sub-fase:** 9.1.3 — UI de pagos mixtos
> **Fase:** 9.1 — Pagos mixtos (rescate de UX del viejo POS)
> **Estado:** ✅ CERRADA — gate 10/10 en verde, suite completa 511/511 en verde, CI completo en verde
> **Fecha:** 2026-09-30
> **Plan rector:** `PLAN_DE_ABORDAJE_FASE_9_1_PAGOS_MIXTOS.md` §3.4

---

## 1. Qué se construyó

La **superficie de cobro con pagos mixtos**: el `CheckoutScreen` ahora permite
cobrar un ticket con **varios abonos** (efectivo + tarjeta + transferencia),
mostrando en vivo cuánto falta y cuánto cambio hay que devolver.

Es el último eslabón de la cadena vertical de la Fase 9.1:

```
Contrato + reglas (F9.1.0)  →  Arqueo lee N pagos (F9.1.1)  →  Servicio + hook (F9.1.2)  →  UI (F9.1.3)
RN-94 / RN-95                  cash.py _ventas_en_efectivo      checkoutService.js + useCheckout.js   CheckoutScreen.jsx
```

### Archivos

| Archivo | Rol | Cambio |
|---|---|---|
| `apps/pos/src/components/CheckoutScreen.jsx` | La superficie de cobro (interfaz 12) | Reescrito con soporte de abonos |
| `apps/pos/src/components/CheckoutScreen.f9_1_3.test.jsx` | La puerta de F9.1.3 (10 criterios) | Nuevo |
| `apps/pos/src/RetailVisionPOS.jsx` | Cableado del cobro | `confirmarCobro` acepta ambas formas |
| `apps/api/routers/pos.py` | Normalización del cobro | `_normalizar_pagos` reconstruye `monto` |

---

## 2. Decisión de diseño

### 2.1 El componente NO habla con la red

`CheckoutScreen` **no importa** `client.js` ni `checkoutService.js` directamente.
Consume el hook `useCheckout`, que ya entrega
`{ abonos, resumen, puedeCobrar, cambio, faltante, agregarPago, editarPago, borrarPago, limpiarPagos, construirPayload }`.

Esto respeta el principio de la cadena vertical: cada capa solo conoce a la
inmediata inferior. El componente no sabe si los datos vienen de HTTP, de un
mock o de una caché.

### 2.2 Se preserva el caso de UN solo pago (regresión)

El flujo de pago único de F9.0.2 (efectivo con `TecladoNumerico` + billetes
rápidos, o tarjeta con cobro exacto) **sigue funcionando idéntico**. La UI
detecta si hay abonos:

- **Sin abonos** → envía la forma legacy `{metodo, recibido, cambio}`.
- **Con abonos** → envía la forma nueva `{abonos: [...]}`.

Esto garantiza que el cambio sea **aditivo**, no sustitutivo.

### 2.3 El método canónico se resuelve en la UI

El botón de método "Tarjeta" se mapea al método canónico `DEBITO` mediante
`metodoCanonico(m)`. El backend (`rn57_clasificar_por_metodo`) solo acepta
`EFECTIVO / CREDITO / DEBITO / TRANSFERENCIA`; `TARJETA` no es un método válido.

> **Hallazgo (bug latente corregido):** el POS viejo enviaba `metodo: 'TARJETA'`,
> que el backend nuevo **rechazaría** con RN-95. La UI nueva mapea a `DEBITO`.
> Se actualizó la aserción obsoleta en `components.f3_4.test.jsx` (que esperaba
> `TARJETA`) para reflejar el contrato real.

### 2.4 Confirmar bloqueado mientras falte dinero

El botón "CONFIRMAR PAGO" está **deshabilitado** mientras `faltante > 0`. Solo se
habilita cuando la suma de los abonos cuadra exactamente el total (RN-94). Esto
es la defensa de frontera en la UI: el usuario no puede disparar un cobro que el
backend rechazará.

### 2.5 Resumen en vivo

El resumen muestra cuatro cifras que se recalculan en cada cambio:

| Cifra | Significado |
|---|---|
| **Total** | El total del ticket |
| **Abonado** | La suma de los abonos agregados |
| **Faltante** | `total − abonado` (si es > 0) |
| **Cambio** | `recibido − monto` del abono en efectivo (si es > 0) |

### 2.6 Editar y borrar abonos antes de confirmar

Cada abono de la lista tiene botones "Editar" y "Borrar". Editar entra en modo
edición (el formulario se rellena con el abono); "Guardar" aplica el cambio,
"Cancelar" lo descarta. Borrar elimina el abono y recalcula el resumen.

### 2.7 Contenedor raíz fluido (R-01)

El contenedor raíz usa `w-full max-w-[...] mx-auto` — sin anchos fijos. El guard
R-01 lo verifica.

---

## 3. La corrección crítica del backend (retrocompatibilidad)

### 3.1 El bug

Al correr el CI completo apareció una regresión real:

```
tests/test_f4_caja.py::test_liga_ticket_a_sesion_de_caja - KeyError: 'monto'
  routers/pos.py:409: in cobrar_ticket
      rn94_suma_de_pagos_cuadra_total(pagos, ticket.total)
  rules/registry.py:486: in rn94_suma_de_pagos_cuadra_total
      suma = sum((Decimal(str(p["monto"])) for p in pagos), Decimal("0.00"))
  E   KeyError: 'monto'
```

### 3.2 La causa raíz

El POS viejo **nunca enviaba `monto`** en el pago único: cobraba el total exacto
y solo mandaba `{metodo, recibido, cambio}`. La normalización de F9.1.0
(`_normalizar_pagos`) solo copiaba `monto` **si estaba presente**, así que un
cobro legacy llegaba a RN-94 sin `monto` → `KeyError`.

### 3.3 La corrección

`_normalizar_pagos` ahora recibe el `total` del ticket y, cuando falta `monto`,
lo **reconstruye desde el total** (el pago único cubre el total):

```python
def _normalizar_pagos(payment_details: dict, total: Decimal | None = None) -> dict:
    ...
    if "monto" in detalles:
        pago["monto"] = detalles["monto"]
    elif total is not None:
        pago["monto"] = str(total)
```

Y el llamador pasa el total:

```python
detalles_normalizados = _normalizar_pagos(entrada.payment_details, ticket.total)
```

Esto cierra el círculo de retrocompatibilidad: un cobro viejo se normaliza a la
forma canónica `pagos[]` **con** su `monto`, y RN-94 lo valida sin excepción.

---

## 4. La puerta de F9.1.3 (10 criterios)

`CheckoutScreen.f9_1_3.test.jsx` — **10/10 en verde**:

| # | Criterio | Qué verifica |
|---|---|---|
| 1 | Agregar un abono de efectivo | Aparece en la lista y muestra el faltante |
| 2 | Agregar un segundo abono (tarjeta) | Dos abonos; el faltante llega a cero |
| 3 | Editar un abono | Recalcula el faltante |
| 4 | Borrar un abono | Vuelve el mensaje "Sin abonos" |
| 5 | Confirmar deshabilitado con faltante | El botón está `disabled` |
| 6 | Confirmar habilitado al cuadrar | El botón se habilita |
| 7 | Confirmar envía la lista de abonos | `payload.abonos` con 2 elementos |
| 8 | Regresión: pago único efectivo | `{metodo:'EFECTIVO', recibido:100, abonos:undefined}` |
| 9 | Regresión: efectivo insuficiente | El botón está `disabled` |
| 10 | Regresión: tarjeta sin abonos | `{metodo:'DEBITO', recibido:100}` |

### 4.1 Nota sobre los localizadores de prueba

El `CheckoutScreen` tiene **dos** inputs con `placeholder="0.00"` (el "Efectivo
recibido" y el "Monto del abono"), y el primero solo existe cuando el método es
efectivo. Por eso las pruebas localizan los inputs **por etiqueta**
(`getByLabelText`), no por placeholder. Se corrigieron también dos pruebas
preexistentes (`components.f3_4.test.jsx` y `TecladoNumerico.f9_0_2.test.jsx`)
que usaban `getByPlaceholderText('0.00')` y ahora chocaban con la ambigüedad.

---

## 5. Evidencia de la puerta

```
✓ src/components/CheckoutScreen.f9_1_3.test.jsx (10 tests) 282ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
```

Suite completa del frontend:

```
 Test Files  41 passed (41)
      Tests  511 passed (511)
```

API (F9.1.0 + F9.1.1 + F3 comportamiento):

```
114 passed in 2.41s
```

CI completo (`npm run ci`):

```
Lint OK: 0 errores.
Tests de Node      : 3/3 archivo(s) en verde
Tests de componentes: PASA
Tests de API       : PASA
✅ RESULTADO: TODOS LOS TESTS EN VERDE.
PUERTA F0 EN VERDE / F4-A-04 EN VERDE / F5-R-01 EN VERDE
```

---

## 6. Trazabilidad

| Regla | Dónde se aplica |
|---|---|
| **RN-94** | `rn94_suma_de_pagos_cuadra_total` — la suma de abonos cuadra el total |
| **RN-95** | `rn95_metodos_de_pago_validos` — cada abono usa un método válido |
| **RN-57** | `rn57_clasificar_por_metodo` — reutilizada por RN-95 |
| **RN-53** | El arqueo (F9.1.1) suma SOLO los abonos en efectivo |
| **DT-02** | El dinero viaja como String; se coacciona a `Decimal` en la frontera |
| **R-01** | Contenedor raíz fluido (guard en verde) |

---

## 7. Lo que NO se hizo (y por qué)

- **No se tocó el arqueo** (F9.1.1 ya lo dejó leyendo `pagos[]`).
- **No se añadió una cola local** — la decisión arquitectónica v1.1 sigue en pie.
- **No se cambió el contrato de `payment_details`** — la forma canónica `pagos[]`
  ya estaba definida en F9.1.0; esta sub-fase solo la consume.

---

## 8. Estado

✅ **F9.1.3 CERRADA.** La UI de pagos mixtos está construida, cableada y probada.
El siguiente paso es **F9.1.4 — Impresión + cierre** (el ticket debe imprimir
los N pagos, y se cierra la Fase 9.1 con su ficha de cierre + Plan Maestro).
