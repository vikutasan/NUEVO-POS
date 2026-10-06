# FICHA F12.9.1 — EL TICKET PUEDE NACER SIN LÍNEAS

**Fase:** 12.9.1 (Rescate de UX del viejo POS — cierre del hueco A-02 del endpoint `POST /pos/tickets`)
**Estado:** ✅ CERRADA
**Fecha:** 6 Oct 2026
**Commit:** `PENDIENTE` (push a `main`)
**Compuertas:** `test_f12_9_ticket_vacio.py` (5) + `test_f2_frontera.py` (actualizada a 30 contratos) = **backend 289/289 verde**
**CI:** `npm run ci` → guards 7/7 limpios · Vitest verde · pytest **289/289 verde**

---

## 1. La lección (17ª)

**DE ADENTRO HACIA AFUERA — el esquema asumía el flujo inverso.**

F12.9 (16ª instancia) descubrió que un **botón** representaba DOS operaciones. F12.9.1 descubre
que un **esquema** representaba un flujo que el POS **nunca ejecuta**.

> El esquema `CrearTicketEntrada` declaraba `items` con `min_length=1`: *"un ticket se crea CON
> líneas"*. Ese supuesto era **falso**. El flujo REAL del POS es **crear-vacío-luego-llenar**:
> `asegurarTicket` crea la cuenta **vacía** (para obtener folio y `account_num`) y cada producto
> entra **después**, uno a uno, por el contrato atómico 18 (`pos.añadir_item`).

**Regla derivada:** cuando un esquema declara una restricción (`min_length`, `required`, un
`enum`), esa restricción es una **afirmación sobre el flujo real**. Si el flujo real no la
cumple, el esquema está **mintiendo** — y el defecto no está en el dato, sino en la **frontera
del esquema**, que asumió el flujo inverso.

Esta es la **17ª instancia** del principio §10.6 ("de adentro hacia afuera"): el defecto no
estaba en la lógica del endpoint (que iteraba `items` sin problema), sino en la **frontera del
esquema** — una restricción que describía un flujo inexistente.

---

## 2. Diagnóstico

### 2.1 El síntoma (el cambio "postizo")

Al cerrar F12.9 quedó un cambio **sin commitear** en `apps/api/schemas.py`:

```diff
-    items: list[LineaEntrada] = Field(min_length=1)
+    items: list[LineaEntrada] = Field(default_factory=list)
```

El cambio **funcionaba**, pero se percibía **postizo**: no tenía documentación, no tenía
contrato que lo respaldara y no tenía test que lo anclara. Un cambio huérfano es deuda.

### 2.2 La fuente de verdad (el viejo POS + el POS nuevo)

`apps/pos/src/RetailVisionPOS.jsx` (POS nuevo), función `asegurarTicket`, línea 393:

```js
const creado = await acciones.crearTicket([], bloque);
```

El POS llama a `crearTicket` con un **array VACÍO**. No es un caso borde: es el **flujo
primario**. La cuenta nace vacía para obtener su folio, y se llena producto a producto.

### 2.3 La brecha (doble)

1. **El esquema mentía:** `min_length=1` prohibía el flujo real del POS. Un `POST /pos/tickets`
   con `items: []` habría respondido **422** — el POS no podría crear la cuenta vacía.
2. **El endpoint no tenía contrato:** `POST /pos/tickets` existía **sin** contrato declarado en
   `registry.py`. Violación directa de la **regla A-02** (*"ningún endpoint existe sin
   contrato"*). El hueco A-02 estaba abierto desde la FASE 3.2.

### 2.4 La verificación (git stash)

Se probó el cambio con `git stash` (árbol limpio) y sin él:

| Escenario | Resultado |
|---|---|
| Con el cambio aplicado | **284 passed** |
| Con el cambio revertido (`git stash`) | **284 passed** |

**Evidencia dura:** la suite pasaba **idéntica** con y sin el cambio → **ningún test cubría el
caso del ticket vacío**. El cambio era **requerido** por el flujo real, pero **invisible** para
la suite. Eso es exactamente lo que hace a un cambio "postizo": correcto pero sin ancla.

---

## 3. La decisión de diseño (Opción 1 — capacidad GENERAL, con disciplina)

| Opción | Descripción | Veredicto |
|---|---|---|
| **1** | **Capacidad GENERAL:** todo ticket puede nacer sin líneas. Documentar el flujo, declarar el contrato 29 y anclar con test. | ✅ **Aceptada** |
| 2 | **Acotar** el vacío al caso de la cuenta del pizarrón (un flag `es_cuenta_vacia`). | ❌ Rechazada — introduce una rama que **no existe** en el sistema; el POS no distingue "cuenta vacía" de "ticket vacío". |
| 3 | Revertir el cambio y dejar `min_length=1`. | ❌ Rechazada — rompe el flujo real del POS (422 al crear la cuenta vacía). |

**Por qué la Opción 1:** el vacío **no es un caso especial**, es la **verdad del sistema**. El
POS crea la cuenta vacía primero y la llena después; eso aplica a **todo** ticket, no solo al
del pizarrón. Acotar habría introducido una distinción inexistente. La disciplina (documentar +
contrato + test) es lo que convierte un cambio "postizo" en una **capacidad declarada**.

**Por qué el contrato NO espera a F13:** la regla A-02 es **incondicional**. Un endpoint sin
contrato es una violación **hoy**, no una deuda para la fase siguiente. Declarar el contrato 29
cierra el hueco en el momento correcto.

---

## 4. Lo construido

### 4.1 Esquema (`apps/api/schemas.py`)

`CrearTicketEntrada` — docstring ampliado con el párrafo F12.9.1 y comentario en la línea:

```python
# F12.9.1 — Lista vacía por defecto (no `min_length=1`): el ticket puede
# nacer sin líneas. El POS crea la cuenta vacía primero y la llena después
# vía el contrato atómico 18. Ver la garantía del contrato `pos.crear_ticket`.
items: list[LineaEntrada] = Field(default_factory=list)
```

### 4.2 Contrato (`apps/api/contracts/registry.py`)

Nuevo **contrato 29 `pos.crear_ticket`** (`POST /pos/tickets`), colocado antes del contrato 28.
Declara la garantía explícita:

> *"El ticket puede nacer SIN LÍNEAS (`items` vacío): es el flujo real del POS, que crea la
> cuenta vacía para obtener folio y `account_num`, y luego la llena por el contrato 18
> (`pos.añadir_item`)."*

Se actualizaron: el docstring del módulo ("29 contratos" → "30 contratos"), la tabla de la
matriz (sección F12.9.1) y el docstring de `listar_contratos`.

### 4.3 Compuerta (`apps/api/tests/test_f12_9_ticket_vacio.py`)

5 tests que anclan el flujo completo:

| Test | Qué verifica |
|---|---|
| `test_contrato_29_declarado` | Frontera A-02: el contrato 29 existe, es una operación (O-23) y declara la garantía del vacío. |
| `test_ticket_vacio_nace_open_total_cero` | `POST` con `items: []` → **201**, `status=OPEN`, `total=0.00`, `version=0`, folio `V####`. |
| `test_ticket_vacio_aparece_en_el_pizarron` | La cuenta vacía se lista en el pizarrón (contrato 23, RN-31) — el caso de uso primario. |
| `test_ticket_vacio_se_llena_despues` | Tras crear vacío, el contrato 18 añade la 1ª línea y el total pasa de `0.00` a `30.00`. |
| `test_items_ausente_es_valido` | Omitir `items` por completo también crea un ticket vacío válido (capacidad GENERAL). |

### 4.4 Alineación de la compuerta F2 (`apps/api/tests/test_f2_frontera.py`)

La puerta F2 hardcodeaba **29 contratos**. Al declarar el contrato 29 (que es el **30º** en
número de contratos, por un desfase histórico de numeración), la compuerta se actualizó:

- `LOS_29_CONTRATOS` → `LOS_30_CONTRATOS` (con `pos.crear_ticket` insertado antes de `pos.contexto_diario`).
- `test_criterio2_hay_exactamente_29_contratos` → `..._30_contratos`.
- `test_criterio3_el_pos_es_proveedor_en_sus_contratos` — añadido `pos.crear_ticket` a la lista.
- `test_listar_contratos_devuelve_los_29` → `..._los_30`.

---

## 5. Verificación

| Compuerta | Antes | Después |
|---|---|---|
| `test_f12_9_ticket_vacio.py` | — | **5** (nueva) |
| `test_f2_frontera.py` | 29 contratos | **30 contratos** |
| **Suite backend completa** | 284/284 | **289/289** |
| **Guards** | 7/7 | **7/7** |

**Evidencia dura (git stash):** la suite pasaba **284/284 con y sin** el cambio → el caso del
ticket vacío **no estaba cubierto**. Los 5 tests nuevos lo cubren ahora.

---

## 6. Archivos tocados

**Producción:**
- `apps/api/schemas.py` — docstring + comentario de `CrearTicketEntrada`; `items` con `default_factory=list`.
- `apps/api/contracts/registry.py` — contrato 29 `pos.crear_ticket` + docstring del módulo + tabla + `listar_contratos`.

**Compuertas:**
- `apps/api/tests/test_f12_9_ticket_vacio.py` — **nueva** (5 tests).
- `apps/api/tests/test_f2_frontera.py` — alineada a 30 contratos.

---

## 7. Criterios de cierre

1. ✅ `POST /pos/tickets` con `items: []` responde **201** (no 422).
2. ✅ El ticket vacío nace **OPEN** con `total=0.00` y folio `V####`.
3. ✅ La cuenta vacía **aparece en el pizarrón** (contrato 23) — el caso de uso primario.
4. ✅ La cuenta vacía **se llena después** por el contrato 18 y el total se recalcula.
5. ✅ El contrato 29 `pos.crear_ticket` está **declarado** (cierra el hueco A-02).
6. ✅ La capacidad es **GENERAL** (omitir `items` también es válido), no un caso especial.
7. ✅ Suite backend **289/289 verde**; guards **7/7**.
8. ✅ El cambio dejó de ser "postizo": documentado + contrato + test.

---

## 8. Relación con F12.9

| | F12.9 (16ª) | F12.9.1 (17ª) |
|---|---|---|
| **Defecto** | Un botón = dos operaciones | Un esquema = un flujo inexistente |
| **Frontera** | El control (botón) | El esquema (restricción) |
| **Categoría** | OPERACIÓN (conflación) | CONFLACIÓN (de flujo) |
| **Corrección** | Separar en dos botones | Relajar la restricción + declarar el contrato |
| **Hueco cerrado** | Gate sobre-bloqueante | **A-02** (endpoint sin contrato) |

Ambas son instancias del mismo principio §10.6: el defecto no está en la lógica, sino en la
**frontera** — un control que debía ser dos, un esquema que describía un flujo que no existe.
