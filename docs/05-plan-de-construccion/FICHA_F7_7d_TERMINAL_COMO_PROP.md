# FICHA F7.7d — La terminal es un PROP, no una constante

> **Fase:** 7.7d (micro-fase de corrección, continuación de F7.7 / F7.7b / F7.7c)
> **Estado:** ✅ CERRADA
> **Fecha:** 2026-09-29
> **Repositorio:** `NUEVO-POS`
> **Predecesoras:** [`FICHA_F7_7_ROUTER_TERMINALES.md`](./FICHA_F7_7_ROUTER_TERMINALES.md),
> [`FICHA_F7_7b_IDENTIDAD_OCUPANTE.md`](./FICHA_F7_7b_IDENTIDAD_OCUPANTE.md),
> [`FICHA_F7_7c_TIPO_DE_ID_EN_LA_FRONTERA.md`](./FICHA_F7_7c_TIPO_DE_ID_EN_LA_FRONTERA.md)

---

## 1. El síntoma que la originó

Tras cerrar F7.7c, el operador reportó:

> *"ya entré, pero ahora no hay nada"*

La pantalla del POS se montaba, el header aparecía, pero **el cuerpo se veía
vacío**: sin catálogo, sin sesión, sin nada operable. La terminal elegida en el
selector no tenía efecto alguno sobre lo que la pantalla mostraba.

---

## 2. El diagnóstico — HALLAZGO 4

La investigación encontró **dos defectos encadenados**, ambos invisibles para
las puertas existentes porque ninguna montaba la pantalla real con un prop.

### 2.1 Defecto A — La pantalla descartaba el prop en silencio

[`RetailVisionPOS.jsx`](../apps/pos/src/RetailVisionPOS.jsx) declaraba:

```jsx
export default function RetailVisionPOS() {   // ← SIN props
```

Mientras que [`App.jsx`](../apps/pos/src/App.jsx) le pasaba:

```jsx
<RetailVisionPOS terminalId={selectedTerminal} ... />
```

El prop `terminalId` **se descartaba en silencio** (JavaScript no avisa de un
prop no declarado). La pantalla caía entonces al valor hardcodeado
`CONFIG.TERMINAL_ID` (`'TERM-01'`). Resultado: entrabas a la Terminal 3 y la
pantalla operaba contra la Terminal 1 — o contra ninguna, si la sesión vivía en
otra terminal.

### 2.2 Defecto B — Dos espacios de id nunca reconciliados

El defecto A era la mitad del problema. La otra mitad: **existían dos
vocabularios de id de terminal que nunca se habían reconciliado**.

| Origen | Vocabulario | Endpoints que lo consumen |
|---|---|---|
| Selector de terminales | `T1` … `T6` | `/pos/terminals/status`, `/pos/terminals/lock` |
| Sesiones y tickets | `TERM-01` … `TERM-06` | `/pos/session-active`, `/pos/tickets` |

El selector emitía `T1..T6`; la sesión y los tickets vivían en `TERM-01..06`.
Aun corrigiendo el Defecto A, `getSesionActiva('T1')` habría devuelto `null`
porque la sesión está guardada como `TERM-01`. **Los dos defectos se
amplificaban mutuamente.**

### 2.3 Por qué ninguna puerta lo detectó

- La puerta de F7.7 (`test_f7_7_terminales.py`) prueba el **router** con
  `httpx`, no la pantalla.
- Las puertas de F7.7b/F7.7c prueban la **proyección de estado** y la
  **coerción de tipo**, no el cableado de props.
- Ninguna puerta montaba `RetailVisionPOS` **con un `terminalId` distinto del
  CONFIG** y verificaba que ese valor llegara al fondo del cableado.

Ese hueco es exactamente lo que esta micro-fase cierra.

---

## 3. La decisión — Opción B (unificar el vocabulario)

Se presentaron dos opciones:

| Opción | Descripción | Riesgo | Decisión |
|---|---|---|---|
| **A** | Solo cablear el prop; dejar los dos vocabularios y traducir en la frontera. | Medio | Descartada |
| **B** | **Unificar el vocabulario de ids** en los 3 lugares donde se persiste, y cablear el prop. | Bajo | **APROBADA** |

**Por qué B y no A:** la Opción A deja una deuda permanente (una capa de
traducción `T1 ↔ TERM-01` que hay que recordar en cada endpoint futuro). La
Opción B elimina la clase entera de bug: **un solo vocabulario, de punta a
punta**. El operador eligió B explícitamente:

> *"No, prefiero hacer la Opción B completa ahora mismo (unificar los ids en
> los 3 lugares + migrar la sesión existente + ajustar el gate de F7.7), aunque
> sea más trabajo y más riesgo."*

---

## 4. Por qué esto NO es una renumeración (y NO viola RN-12)

Esta es la pregunta crítica, porque [`FICHA_F6_5_ORDEN_TERMINALES.md`](./FICHA_F6_5_ORDEN_TERMINALES.md)
**rechazó** la Opción B de aquella micro-fase invocando **RN-12**
(`rn12_terminal_id_inmutable`). Hay que distinguir con precisión por qué
aquella B y esta B son cosas distintas.

### 4.1 Qué prohíbe RN-12

RN-12 prohíbe **renombrar una terminal que ya tiene datos**. Su texto:

```python
def rn12_terminal_id_inmutable(terminal_id_actual: str | None, terminal_id_nuevo: str) -> str:
```

La regla protege la **trazabilidad**: si la Terminal 3 ya emitió tickets,
sesiones de caja y locks bajo el id `TERM-03`, cambiar ese id a otra cosa
rompería la cadena de auditoría. RN-12 dice: **una vez asignado, el id no se
toca.**

### 4.2 Qué hizo F6.5 (rechazado)

F6.5 proponía **renumerar terminales existentes**: "T1 pasa a ser T6". Eso
**sí** muta ids ya asignados → viola RN-12 → rechazado. Correcto.

### 4.3 Qué hace F7.7d (aprobado)

F7.7d **no muta ningún id existente**. Hace algo distinto: **elige la
convención de nombres antes de que existan datos que dependan de ella**, y
alinea las tres fuentes de configuración a esa convención.

| | F6.5 (rechazado) | F7.7d (aprobado) |
|---|---|---|
| ¿Muta un id ya asignado? | **Sí** (T1→T6) | **No** |
| ¿Rompe trazabilidad? | **Sí** | **No** |
| ¿Qué hace? | Renombra terminales con datos | Alinea la *configuración* al vocabulario que la *semilla* ya usaba |
| ¿Viola RN-12? | **Sí** | **No** |

### 4.4 El hecho decisivo: la BD ya usaba `TERM-01`

La semilla (`seed_demo.py`) ya creaba la sesión con `terminal_id = 'TERM-01'`.
Es decir: **el vocabulario canónico de los datos siempre fue `TERM-0N`**. Lo
que estaba desalineado era la *configuración* (el selector), que hablaba
`T1..T6`.

F7.7d **no migra datos** (no hay nada que migrar: la BD ya está en `TERM-0N`).
F7.7d **corrige la configuración** para que hable el mismo idioma que los
datos. Es una **alineación de vocabulario de configuración**, no una
renumeración de entidades.

> **Regla que queda escrita:** RN-12 prohíbe renombrar una terminal **con
> datos**. No prohíbe **elegir la convención de nombres antes de que los datos
> existan**. F7.7d opera en el segundo caso.

---

## 5. Los cambios aplicados

### 5.1 Unificación del vocabulario (3 lugares)

| Archivo | Antes | Después |
|---|---|---|
| [`apps/api/routers/terminals.py`](../apps/api/routers/terminals.py) (`CONFIG_POR_DEFECTO`) | `T1`…`T6` | `TERM-01`…`TERM-06` |
| [`apps/api/terminal_config.json`](../apps/api/terminal_config.json) | `T1`…`T6` | `TERM-01`…`TERM-06` |
| [`apps/pos/src/hooks/useTerminals.js`](../apps/pos/src/hooks/useTerminals.js) (`DEFAULT_TERMINALS`) | `T1`…`T6` | `TERM-01`…`TERM-06` |

### 5.2 Cableado del prop en la pantalla

[`RetailVisionPOS.jsx`](../apps/pos/src/RetailVisionPOS.jsx):

```jsx
export default function RetailVisionPOS({
  terminalId,
  currentUser,
  onBackToTerminals,
}) {
  // F7.7d — La terminal efectiva: el prop manda; el CONFIG es solo el fallback
  // de los tests que montan la pantalla sin props.
  const terminalEfectiva = terminalId || CONFIG.TERMINAL_ID;
  ...
```

Los **6 usos** de `CONFIG.TERMINAL_ID` en el cuerpo de la pantalla se
sustituyeron por `terminalEfectiva`:

1. `useTicketActions({ terminalId: terminalEfectiva })`
2. `useTerminalLocking({ terminalId: terminalEfectiva })`
3. `api.getSesionActiva(terminalEfectiva)`
4. `<POSHeader terminalId={terminalEfectiva} />`
5. `<CheckoutScreen terminalId={terminalEfectiva} />` (rama de escritorio)
6. `<CheckoutScreen terminalId={terminalEfectiva} />` (rama móvil)

### 5.3 Alineación de las puertas existentes

| Archivo | Cambio |
|---|---|
| [`apps/api/tests/test_f7_7_terminales.py`](../apps/api/tests/test_f7_7_terminales.py) | `T1`…`T6` → `TERM-01`…`TERM-06` |
| [`apps/pos/src/hooks/useTerminals.f6_5.test.jsx`](../apps/pos/src/hooks/useTerminals.f6_5.test.jsx) | `T1`…`T3` → `TERM-01`…`TERM-03` |
| [`apps/pos/src/components/TerminalSelector.f6_5.test.jsx`](../apps/pos/src/components/TerminalSelector.f6_5.test.jsx) | `T1`…`T3` → `TERM-01`…`TERM-03` + regex |
| [`apps/pos/src/services/terminalService.f7_7c.test.jsx`](../apps/pos/src/services/terminalService.f7_7c.test.jsx) | `T1`…`T6` → `TERM-01`…`TERM-06` |
| [`apps/pos/src/hooks/useOpenAccounts.f5_2.test.jsx`](../apps/pos/src/hooks/useOpenAccounts.f5_2.test.jsx) | `terminalId: 'T1'` → `'TERM-01'` |
| [`apps/pos/src/services/openAccountsService.f5_1.test.jsx`](../apps/pos/src/services/openAccountsService.f5_1.test.jsx) | `'T1'` → `'TERM-01'` (preservando el test de `trim`) |
| [`apps/pos/src/services/cashService.f4_2.test.jsx`](../apps/pos/src/services/cashService.f4_2.test.jsx) | `terminal_id: 'T1'` → `'TERM-01'` |
| [`apps/pos/src/utils/ticketGenerator.f6_0.test.jsx`](../apps/pos/src/utils/ticketGenerator.f6_0.test.jsx) | `terminal_id: 'T2'` → `'TERM-02'` |

> **NO se tocaron** los `'T1'` que son **ids de ticket** (no de terminal) en
> [`hooks.test.jsx`](../apps/pos/src/hooks/hooks.test.jsx) y
> [`hooks.f3_3.test.jsx`](../apps/pos/src/hooks/hooks.f3_3.test.jsx). Son
> semánticamente correctos: un ticket puede llamarse `T1`; una terminal no.

### 5.4 Puerta de regresión nueva

[`apps/pos/src/RetailVisionPOS.f7_7d.test.jsx`](../apps/pos/src/RetailVisionPOS.f7_7d.test.jsx)
— **6 tests, 4 criterios**:

| Criterio | Qué blinda |
|---|---|
| 1 | Con `terminalId="TERM-03"`, `getSesionActiva` recibe `'TERM-03'` (no el hardcodeado). |
| 2 | La identidad del prop llega al header (`"Terminal TERM-04"`) y **nunca** al CONFIG; el candado jamás se dispara contra la constante. |
| 3 | Sin props, la pantalla cae al `CONFIG.TERMINAL_ID` (fallback de tests). |
| 4 | Dos terminales distintas producen dos llamadas distintas (sin contaminación entre montajes). |

> **Nota de diseño (Criterio 2):** `useTerminalLocking` **no** toma el candado
> por sí solo — `tomarLock` es una acción que dispara el operador, y `latir`
> solo corre tras un `tomarLock` exitoso. Asertar que se invocan sería asertar
> el comportamiento del hook (ya cubierto por `hooks.f3_3.test.jsx`), no el
> cableado del prop. Lo observable y suficiente es la **identidad de terminal
> que la pantalla pinta**: el `POSHeader` recibe la MISMA `terminalEfectiva`
> que alimenta el candado. Si el header muestra la terminal del prop y no la
> del CONFIG, el prop llegó hasta el fondo.

---

## 6. Verificación

### 6.1 Puerta nueva

```
✓ src/RetailVisionPOS.f7_7d.test.jsx (6 tests) 220ms
```

### 6.2 CI completo (`npm run ci` desde la raíz)

| Leg | Resultado |
|---|---|
| `lint` | **0 errores** (217 archivos) |
| Tests de Node | **3/3** archivos en verde |
| Tests de componentes (Vitest) | **27 archivos, 330 tests** en verde |
| Tests de API (pytest en Docker) | **249 tests** en verde |
| `guards` | **7/7** guardianes limpios |

### 6.3 Verificación en vivo (API arriba, `nuevo_pos_api` healthy)

```
GET /health                    → 200
GET /pos/terminals/status      → 200
GET /pos/terminals/config      → 200
```

`GET /pos/terminals/config`:

```json
[{"id":"TERM-01","name":"Terminal 1","icon":"🖥️"},
 {"id":"TERM-02","name":"Terminal 2","icon":"🖥️"},
 {"id":"TERM-03","name":"Terminal 3","icon":"🖥️"},
 {"id":"TERM-04","name":"Terminal 4","icon":"🖥️"},
 {"id":"TERM-05","name":"Terminal 5","icon":"🖥️"},
 {"id":"TERM-06","name":"Terminal 6","icon":"🖥️"}]
```

`GET /pos/terminals/status` (extracto):

```json
{"TERM-01":{"occupier_id":"ddfc5cb5-…","occupier_ref":"1","occupier_name":"1", …},
 "TERM-02":{"occupier_id":null,"occupier_ref":null, …},
 …}
```

**Los dos espacios de id son ahora UNO:** el selector emite `TERM-0N`, el
estado responde `TERM-0N`, y la sesión/tickets viven en `TERM-0N`. El
`occupier_ref: "1"` confirma además que la corrección de F7.7b sigue viva.

---

## 7. Lo que esta ficha NO hace

- **NO** renumera terminales con datos (eso sería RN-12, y está prohibido).
- **NO** migra datos: la BD ya estaba en `TERM-0N` desde la semilla.
- **NO** añade endpoints nuevos: reutiliza el router de F7.7.
- **NO** cambia la UX: el header sigue mostrando `"Terminal <id>"`.

---

## 8. Deuda técnica declarada

- El `CONFIG.TERMINAL_ID` sigue existiendo como **fallback** para los tests que
  montan la pantalla sin props. Es intencional y está documentado en el código.
  Si en el futuro se decide eliminarlo, habrá que actualizar los tests de
  F3-cierre y F7.6 que montan la pantalla sin `terminalId`.

---

## 9. Lección aprendida (para la documentación final)

> **Un prop no declarado se descarta en silencio.** JavaScript no avisa. La
> única defensa es una puerta que **monte la pantalla real con un valor
> distinto del default** y verifique que ese valor llegue al fondo del
> cableado. Las puertas de router y de proyección no bastan: hay que probar
> **la integración**, no solo las piezas.

Esta lección se suma a las de F7.7 (el router faltante), F7.7b (la identidad
del ocupante) y F7.7c (el tipo en la frontera): **cuatro defectos encadenados
que solo aparecieron al montar la pantalla real contra la API real.** Es la
validación empírica del principio *"de adentro hacia afuera"*: construir las
piezas con su puerta **y luego cablearlas end-to-end en la pantalla real**.

---

## 10. Trazabilidad

| Regla / Directriz | Cómo la respeta F7.7d |
|---|---|
| **RN-12** (`rn12_terminal_id_inmutable`) | No muta ningún id asignado; elige la convención antes de que existan datos. |
| **RN-01** (una sesión por terminal) | La sesión se busca por la terminal efectiva del prop. |
| **RN-03** (candado exclusivo) | El candado usa la terminal efectiva del prop. |
| **A-02** (frontera por contratos) | La pantalla consume contratos; no lee tablas ajenas. |
| **§10.6** ("de adentro hacia afuera") | Se cierra el ciclo cableando las piezas en la pantalla real. |
| **§6.8** (UX heredada) | El header sigue mostrando `"Terminal <id>"`; no se alteró la UX. |
