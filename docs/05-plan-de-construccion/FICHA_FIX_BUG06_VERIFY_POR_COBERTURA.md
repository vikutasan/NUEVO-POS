# FICHA BUG-06 — Enviar una cuenta al pizarrón fallaba con "hay productos sin guardar" (TERM-06)

> **Sub-fase:** BUG-06 — `verificar_envio` verifica por COBERTURA (conteo), no por identidad exacta de `item_id`
> **Fase:** 12 — Portar funcionalidades del POS viejo al POS nuevo
> **Estado:** ✅ CERRADA — **BUG CORREGIDO** (bloqueaba ENVIAR CUENTA en la terminal 6)
> **Fecha:** 2026-10-10
> **Commit:** _(pendiente)_
> **Plan rector:** contrato 22 (verificación post-envío) + contrato 18 (idempotencia por `item_id`) + contrato 30 (lectura de líneas) + cicatriz v6.1 $453 (prohibición #2: no limpiar el carrito sin verificar) + RN-25 (bloqueo optimista)

---

## 1. Síntoma reportado (runtime, no test)

El dueño del proyecto hizo un ejercicio creando una cuenta en cada terminal. Todo iba
bien **hasta la terminal 6**:

> "hice el ejercicio de crear una cuenta en cada terminal y todo iba bien pero en la
> terminal 6 intente mandar una cuenta a pizarrón y me salió **No se pudo completar /
> No se pudo enviar: hay productos sin guardar en el servidor. Verifique la conexión
> WiFi. / Cerrar**"

Es decir: **ENVIAR CUENTA** al pizarrón (F12.9) fallaba con el modal de la prohibición
#2, **aunque los productos SÍ estaban guardados en el servidor**.

---

## 2. Diagnóstico (verificado con evidencia, no asumido)

### 2.1 Evidencia en la base de datos

Se inspeccionó el ticket de TERM-06:

| Dato | Valor |
|---|---|
| `ticket_id` | `2001342f-69bd-44d6-b842-89191635b35b` |
| `status` | `OPEN` |
| `version` | 10 |
| `total` | 102.00 |
| Líneas en `ticket_items` | **6** |
| `payment_details["_item_ids"]` (ledger) | **10** IDs |
| **Coincidencias ledger ↔ `product_id` reales** | **0** |

**Los 6 ítems SÍ estaban persistidos.** El fallo no era de red ni de pérdida de datos.

### 2.2 Evidencia en los logs de la API

Para ese ticket: 6× `POST .../items 200`, luego `POST .../verify 200 OK` (dos veces).
Más tarde: `POST .../items 200`, `GET ... 200`, `POST .../items 200`, `GET ... 200`,
`POST .../items 200`, **`POST .../items 409 Conflict`**, `GET ... 200`, `GET ... 200`,
`POST .../items 200`, `GET ... 200`, `POST .../items 200`, `GET ... 200`,
`POST .../verify 200 OK`.

**El `verify` devolvió 200** (no un error): el array `faltantes` venía **no vacío dentro
de un cuerpo 200**. El 409 marca la carrera de versión que desincronizó la identidad del
carrito.

### 2.3 La causa raíz: identidad de `item_id` ambigua + verificación por identidad exacta

El `item_id` del carrito es **ambiguo** según la vía:

- **Ítems añadidos en la sesión** → el carrito guarda la **intención** (UUID de
  `nuevoItemId()`), que `anadir_item` registra en el ledger `payment_details["_item_ids"]`.
- **Ítems recuperados del pizarrón** → `hidratarLineas` adopta `item_id = str(product_id)`
  (lo que devuelve `_lineas_atomicas` / contrato 30).

Tras una **carrera de versión (409)**, el carrito puede quedar con `item_id` que **ya no
coinciden ni con el ledger ni con el `product_id` de las líneas actuales** (son
`product_id` de líneas que ya no existen). La verificación por **identidad exacta** los
marcaba TODOS como `faltantes` → modal de WiFi, aunque el ticket tuviera sus 6 líneas.

### 2.4 Por qué F12.16 + F12.18 no bastaban

- **F12.16** añadió la comparación contra el ledger (la intención).
- **F12.18** añadió la comparación contra `product_id` real (la cuenta recuperada).

Ambas son **pruebas de identidad**. El escenario TERM-06 cae en el hueco: los `item_id`
del carrito no son ni la intención (el ledger tiene otras 10) ni un `product_id` vigente
(las líneas cambiaron tras el 409). La doble prueba era un parche sobre una pregunta mal
formulada.

---

## 3. La pregunta correcta

La verificación post-envío **no** debe preguntar *"¿coincide cada `item_id`?"* sino
*"¿se perdió alguna línea?"*. La identidad de cada línea es **irrelevante** para esa
pregunta. Por eso la verificación pasa a ser por **COBERTURA (conteo)**:

> El envío es válido si el servidor tiene **al menos tantas líneas** como el carrito afirma.

---

## 4. El fix

En `verificar_envio` (`apps/api/routers/pos.py`):

```python
ticket = await _ticket_con_items_o_404(db, ticket_id)

n_lineas_servidor = len(ticket.items)
n_afirmadas = len(entrada.item_ids)

# Cobertura: el servidor tiene al menos tantas líneas como el carrito afirma.
if n_lineas_servidor >= n_afirmadas:
    return VerificarEnvioSalida(
        existe=True,
        item_ids_persistidos=list(entrada.item_ids),
        faltantes=[],
    )

# Déficit real: el carrito afirma más líneas de las que el servidor tiene.
deficit = n_afirmadas - n_lineas_servidor
item_ids_persistidos = list(entrada.item_ids[:n_lineas_servidor])
faltantes = list(entrada.item_ids[n_lineas_servidor:])
assert len(faltantes) == deficit

return VerificarEnvioSalida(
    existe=True,
    item_ids_persistidos=item_ids_persistidos,
    faltantes=faltantes,
)
```

**Se conserva la forma del contrato** (`item_ids_persistidos` / `faltantes`) para no
romper al cliente ni a los tests existentes. La **cicatriz v6.1 $453 sigue protegida**:
si el servidor tiene MENOS líneas de las que el carrito afirma, se reporta el déficit y
el carrito NO se limpia. Nunca es un "siempre OK".

---

## 5. Tests que blindan el fix

En `apps/api/tests/test_f3_atomico.py`:

| Test | Qué prueba |
|---|---|
| `test_verificacion_item_ids_obsoletos_no_bloquea` | **Reproduce TERM-06**: 2 líneas reales, carrito con 2 `item_id` obsoletos → `faltantes == []`. **Falla** con la verificación por identidad; **pasa** con la de cobertura. |
| `test_verificacion_detecta_perdida_real` | El carrito afirma 3 líneas, el servidor tiene 1 → `faltantes` no vacío. Protege la cicatriz v6.1 $453. |
| `test_verificacion_post_envio` (existente) | Sigue pasando: 1 línea real + 1 fantasma → el fantasma es faltante (déficit 1). |
| `test_verificacion_cuenta_recuperada_del_pizarron` (existente) | Sigue pasando: cuenta recuperada con cobertura → `faltantes == []`. |

---

## 6. Deuda relacionada (NO resuelta aquí)

- **D-9:** `TicketItem` no persiste su propio `item_id`. El ledger
  `payment_details["_item_ids"]` es un workaround. Con la verificación por cobertura, el
  ledger deja de ser crítico para el envío, pero sigue sin podarse al quitar líneas
  (10 entradas para 6 líneas en TERM-06). Cuando `ticket_items` tenga su columna
  `item_id`, el ledger se reemplaza por una restricción única y esta ambigüedad
  desaparece de raíz.

---

## 7. Verificación

- Backend: `353 passed` (2 tests nuevos; el único fallo es la flakiness conocida de
  aislamiento de `terminal_config.json`, ajena a este cambio).
- Frontend: `812 passed` (75 archivos), sin regresiones.
