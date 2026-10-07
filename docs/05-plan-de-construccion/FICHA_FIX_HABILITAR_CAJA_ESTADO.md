# FICHA FIX — "Habilitar caja" quedaba inconsistente: el botón no cambiaba y el landing no marcaba la terminal

> **Tipo:** Corrección de bug en producción (estado de caja inconsistente entre modal, botón y landing)
> **Componentes:**
> - [`apps/pos/src/GestorDeCaja.jsx`](../../apps/pos/src/GestorDeCaja.jsx:100) — callbacks `onCajaHabilitada` / `onCajaDeshabilitada` + recuperación 409
> - [`apps/pos/src/RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:1219) — cableado de los callbacks a `turnoCaja`
> - [`apps/api/routers/terminals.py`](../../apps/api/routers/terminals.py:262) — `caja_habilitada` en `GET /pos/terminals/status`
> - [`apps/pos/src/hooks/useTerminals.js`](../../apps/pos/src/hooks/useTerminals.js:67) — `getCajaHabilitada`
> - [`apps/pos/src/components/TerminalSelector.jsx`](../../apps/pos/src/components/TerminalSelector.jsx:138) — badge "Caja habilitada"
> - [`apps/api/tests/test_f7_7_terminales.py`](../../apps/api/tests/test_f7_7_terminales.py:1) — 4 tests del campo nuevo
> **Estado:** ✅ CERRADA — `caja_habilitada: true` confirmado en vivo para TERM-01; 314 tests backend + 708 tests frontend en verde
> **Fecha:** 2026-10-07
> **Plan rector:** §6.8 (la UX heredada del viejo POS — la integración se hereda, la implementación se reescribe) + §10.6.5 (la lección de la FASE 10.6 — el inventario de componentes no ve la PARIDAD DE OPERACIÓN) + REGLA DURA 2 ("verificar, no asumir") + RN-49 (una sesión de caja OPEN por terminal)

---

## 1. Síntoma reportado

El dueño del proyecto reportó, textualmente:

> *"pues pasan varias cosas indeseables, quise habilitar caja y sale que ya hay una
> sesion de caja habilitada, sin embargo el boton aun dice caja habilitar y en landing
> no aparece esa terminal como habilitada caja, sugiero mejor que revises la logica de
> habilitar caja del vieejo pos y la implementemos en el nuevo ya que la implementadcion
> actual de esto en el nuevo pos esta muy mal"*

Tres síntomas simultáneos, todos sobre el MISMO estado (si la terminal tiene caja
habilitada):

1. **Al intentar habilitar caja**, el sistema respondía que **ya había una sesión de
   caja habilitada** — pero el operador no la veía por ningún lado.
2. **El botón seguía diciendo "○ Habilitar"** aunque la caja ya estaba abierta.
3. **En el landing** (el selector de terminales) **la terminal NO aparecía como
   habilitada de caja**.

El estado de la caja estaba **desincronizado en tres lugares a la vez**: el modal, el
botón del encabezado y el landing.

---

## 2. Diagnóstico (causa raíz)

El fallo era el resultado de **tres defectos independientes** que, combinados, producían
la sensación de que "la lógica de habilitar caja está muy mal". Cada uno por separado ya
rompía una parte de la experiencia.

### 2.1 Defecto A (frontend) — el modal no avisaba al padre

El `GestorDeCaja` nuevo **no exponía callbacks** `onCajaHabilitada` / `onCajaDeshabilitada`.
El único canal de salida era `onCerrar`. Por lo tanto, mientras el modal estaba abierto y
el operador abría el turno, el estado `turnoCaja` del padre **no se actualizaba**. Al
cerrar el modal, el botón seguía leyendo el estado viejo (`null`) y pintaba "○ Habilitar".

En el **viejo POS** esto no pasaba: [`GestorDeCaja.jsx`](../../../ERP-R-DE-RICO/apps/pos/components/GestorDeCaja.jsx:74)
recibe `onCajaHabilitada` / `onCajaDeshabilitada` y los invoca en cuanto abre/cierra el
turno, actualizando el estado del padre **al instante**.

### 2.2 Defecto B (frontend) — sin recuperación del 409

Si ya existía un turno OPEN (por ejemplo, de una sesión anterior que no se cerró), el
backend responde **409 `ya_hay_turno_abierto`** (RN-49). El `GestorDeCaja` nuevo **no
tenía rama de recuperación**: mostraba el error y dejaba al operador atascado, sin forma
de "adoptar" el turno que ya existía.

El **viejo POS** sí recuperaba: [`GestorDeCaja.jsx`](../../../ERP-R-DE-RICO/apps/pos/components/GestorDeCaja.jsx:255)
detecta el mensaje de "ya existe / activa", **relee la sesión activa** y la adopta,
llamando a `onCajaHabilitada`.

### 2.3 Defecto C (backend + landing) — el status no exponía el estado de caja

El endpoint `GET /pos/terminals/status` construía el mapa de estado **solo desde
`TerminalLock`** (el candado: quién está en la terminal). **Nunca consultaba
`CashSession`**, así que el landing no tenía forma de saber si una terminal tenía caja
habilitada. Por eso el badge no existía.

**El candado y la caja son DOS estados INDEPENDIENTES** (paridad con el viejo POS §6.8):

- **Candado** (`TerminalLock`): quién está usando la terminal ahora mismo.
- **Caja** (`CashSession` con `status = "OPEN"`): si hay un turno de caja abierto (RN-49).

Una terminal puede tener caja habilitada **sin** candado (el cajero cerró el navegador
pero el turno sigue abierto) y viceversa. El status solo exponía el primero.

### 2.4 La cadena de la inconsistencia

1. El operador abre el turno en el modal → el backend lo persiste (HTTP 201).
2. El modal **no avisa al padre** (Defecto A) → `turnoCaja` sigue `null`.
3. El botón lee `turnoCaja` → pinta "○ Habilitar" aunque la caja está abierta.
4. El operador reintenta → el backend responde **409** (ya hay turno) → el modal **no
   recupera** (Defecto B) → mensaje "ya hay una sesión de caja habilitada".
5. El landing consulta el status → **no trae `caja_habilitada`** (Defecto C) → no marca
   la terminal.

**Es la MISMA clase de fallo que la lección de la FASE 10.6.5**: el inventario de
componentes no ve la **paridad de operación**. La operación "habilitar caja" existía en
el viejo POS con una UX concreta (callbacks inmediatos + recuperación 409 + indicador en
el landing) y el nuevo POS la había reimplementado **a medias**.

---

## 3. Corrección aplicada

### 3.1 Defecto A — callbacks explícitos en `GestorDeCaja`

Se añadieron las props `onCajaHabilitada` / `onCajaDeshabilitada` y se invocan en los
tres puntos que cambian el estado de la caja:

```javascript
// Al cargar y encontrar una sesión activa:
onCajaHabilitada?.(r.data.cash_session_id);

// Al abrir el turno con éxito:
onCajaHabilitada?.(r.data.cash_session_id);

// Al cerrar el turno:
onCajaDeshabilitada?.();
```

### 3.2 Defecto B — recuperación del 409 (`ya_hay_turno_abierto`)

En `alAbrirTurno`, si el backend responde con `reason === 'ya_hay_turno_abierto'`, se
**relee la sesión activa** y se adopta, en vez de dejar al operador atascado:

```javascript
if (r.reason === 'ya_hay_turno_abierto') {
  // Releer la sesión activa y adoptarla (paridad con el viejo POS).
  const activa = await servicio.obtenerSesionActiva(terminalId);
  if (esOk(activa) && activa.data) {
    onCajaHabilitada?.(activa.data.cash_session_id);
  }
}
```

### 3.3 Defecto A (cierre) — cableado en `RetailVisionPOS`

El montaje de `GestorDeCaja` ahora actualiza `turnoCaja` **al instante**:

```javascript
onCajaHabilitada={(cashSessionId) => {
  setTurnoCaja({ cash_session_id: cashSessionId });
}}
onCajaDeshabilitada={() => {
  setTurnoCaja(null);
}}
```

Con esto, el botón del encabezado ([`POSHeader.jsx`](../../apps/pos/src/components/POSHeader.jsx:306))
pasa de "○ Habilitar" a "● Activa" en cuanto se abre el turno, sin recargar.

### 3.4 Defecto C — `caja_habilitada` en el status (backend)

En [`terminals.py`](../../apps/api/routers/terminals.py:262) el endpoint ahora consulta
los turnos OPEN y los proyecta por terminal:

```python
# Turnos de caja ABIERTOS por terminal (RN-49: a lo sumo uno por terminal).
sesiones_abiertas = (
    await db.execute(select(CashSession).where(CashSession.status == "OPEN"))
).scalars().all()
caja_por_terminal = {s.terminal_id for s in sesiones_abiertas}
```

Y `_a_estado` incluye `caja_habilitada` en **ambas** ramas (libre y ocupada), porque el
candado y la caja son independientes.

### 3.5 Defecto C — `getCajaHabilitada` + badge en el landing (frontend)

En [`useTerminals.js`](../../apps/pos/src/hooks/useTerminals.js:67) se expone:

```javascript
const getCajaHabilitada = useCallback(
  (terminalId) => Boolean(statuses[terminalId]?.caja_habilitada),
  [statuses]
);
```

Y en [`TerminalSelector.jsx`](../../apps/pos/src/components/TerminalSelector.jsx:138) se
pinta un badge verde "Caja habilitada" (`data-testid="caja-habilitada-{id}"`) cuando la
terminal tiene turno abierto.

---

## 4. Verificación (REGLA DURA 2 — verificar, no asumir)

### 4.1 Verificación en vivo del backend

```
$ curl -s http://localhost:5101/pos/terminals/status
{
  "TERM-01": { ..., "caja_habilitada": true  },   ← tiene turno OPEN
  "TERM-02": { ..., "caja_habilitada": false },
  ...
}
```

**Confirmado:** TERM-01 (con la sesión OPEN `63b8ff34-…`) reporta `caja_habilitada: true`;
el resto, `false`. El backend estaba bien desde el principio — el bug era de integración.

### 4.2 Tests backend (4 nuevos, en `test_f7_7_terminales.py`)

| Test | Qué fija |
|---|---|
| `test_criterio11_status_sin_turno_caja_deshabilitada` | Sin turno, `caja_habilitada` es `False` en todas |
| `test_criterio11_status_con_turno_abierto_marca_caja_habilitada` | Un turno OPEN marca SOLO su terminal |
| `test_criterio11_turno_cerrado_no_marca_caja_habilitada` | Un turno CLOSED NO marca (solo cuentan los OPEN) |
| `test_criterio11_caja_y_candado_son_independientes` | Caja y candado son estados independientes |

### 4.3 Resultado de las suites

| Suite | Resultado |
|---|---|
| `pytest tests/test_f7_7_terminales.py` | **28 passed** (24 + 4 nuevos) |
| `pytest tests/` (backend completo) | **314 passed** |
| `npm test -- --run` (frontend completo) | **708 passed** (64 archivos) |

---

## 5. Lección (por qué se documenta)

Esta corrección pertenece a la **misma clase** que la lección de la FASE 10.6.5: *el
inventario de componentes no ve la paridad de operación*. La operación "habilitar caja"
existía en el viejo POS con **tres piezas inseparables**:

1. **Callbacks inmediatos** del modal al padre (el botón refleja el estado al instante).
2. **Recuperación del 409** (adoptar un turno ya abierto en vez de atascarse).
3. **Indicador en el landing** (el estado de caja es visible desde la puerta de entrada).

El nuevo POS había portado la operación **a medias**: persistía el turno (el backend
estaba correcto) pero no propagaba el estado a la UI. La regla que se refuerza:

> **Una operación heredada no está portada hasta que su ESTADO es visible y consistente
> en TODOS los puntos donde el viejo POS lo mostraba.** Portar el endpoint no es portar
> la operación.

Y la regla de diseño que se fija para siempre:

> **El candado y la caja son DOS estados independientes.** El status de terminales debe
> exponer ambos por separado; confundirlos produce exactamente esta clase de
> inconsistencia.

---

## 6. Archivos tocados

| Archivo | Cambio |
|---|---|
| [`apps/api/routers/terminals.py`](../../apps/api/routers/terminals.py:262) | Import `CashSession`; `_a_estado(..., caja_habilitada)`; query de turnos OPEN en `estado_terminales` |
| [`apps/api/tests/test_f7_7_terminales.py`](../../apps/api/tests/test_f7_7_terminales.py:1) | Import `CashSession`; helper `_sembrar_turno_abierto`; 4 tests del criterio 11 |
| [`apps/pos/src/hooks/useTerminals.js`](../../apps/pos/src/hooks/useTerminals.js:67) | `getCajaHabilitada` + exposición en el return |
| [`apps/pos/src/components/TerminalSelector.jsx`](../../apps/pos/src/components/TerminalSelector.jsx:138) | Badge verde "Caja habilitada" |
| [`apps/pos/src/GestorDeCaja.jsx`](../../apps/pos/src/GestorDeCaja.jsx:100) | Callbacks `onCajaHabilitada`/`onCajaDeshabilitada` + recuperación 409 |
| [`apps/pos/src/RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:1219) | Cableado de los callbacks a `turnoCaja` |

---

## 7. Segunda vuelta — Defecto D: `GET /cash/active-session` sin `terminal_id` (422)

### 7.1 Síntoma reportado (tras la primera corrección)

El dueño reportó, textualmente:

> *"en el landing dice caja habilitada la terminal , al entrar el boton aun dice caja
> habilitar , invoco una cuenta del pizarron y aun no esta habilitado el boton de cobrar"*

El **Defecto C quedó resuelto** (el landing ya marca la terminal), pero persistían DOS
síntomas que la primera vuelta no cubría:

1. **Al entrar al POS**, el botón del encabezado seguía diciendo "○ Habilitar".
2. **Al invocar una cuenta del pizarrón**, el botón de **Cobrar** seguía deshabilitado.

### 7.2 Diagnóstico (causa raíz)

El endpoint `GET /cash/active-session` **EXIGE** `terminal_id` como query param:

```python
# apps/api/routers/cash.py:175
async def sesion_activa(
    terminal_id: str = Query(..., description="Terminal a consultar"),
    ...
```

Pero el cliente del POS lo llamaba **sin el parámetro**:

```javascript
// apps/pos/src/api/client.js:248 (ANTES)
export function getSesionCajaActiva() {
  return peticion('/cash/active-session');   // ← sin terminal_id
}
```

**Prueba en vivo (REGLA DURA 2):**

```
$ curl -s "http://localhost:5101/cash/active-session"
{"detail":[{"type":"missing","loc":["query","terminal_id"],
            "msg":"Field required","input":null}]}          ← HTTP 422

$ curl -s "http://localhost:5101/cash/active-session?terminal_id=TERM-01"
{"cash_session_id":"d7e69762-24f6-4850-bbc3-496c3966a0d1",
 "abierta_en":"2026-10-07T04:23:44.867723Z"}                ← HTTP 200
```

**La cadena del fallo:**

1. `refrescarTurnoCaja` llama a `caja.obtenerTurnoActivo()` → `getSesionCajaActiva()` sin
   `terminal_id` → **HTTP 422**.
2. `aOutcome` traduce el 422 a `{ outcome: 'error', reason: 'datos_invalidos' }`.
3. `refrescarTurnoCaja` **solo actúa si `outcome === 'ok'`** → `turnoCaja` se queda en `null`.
4. El botón lee `turnoCaja` → pinta "○ Habilitar" (síntoma 1).
5. La guarda de cobro lee `cajaHabilitada={Boolean(turnoCaja)}` → `false` → el botón
   **Cobrar** queda bloqueado aunque la caja esté abierta (síntoma 2).

**Es la MISMA clase de fallo que el Defecto A/B/C**: la operación existía, el backend
estaba correcto, pero el **cableado** estaba roto. Aquí el cableado roto era el **query
param obligatorio** que el cliente omitía.

### 7.3 Corrección aplicada

Se siguió el patrón ya establecido en el propio archivo (`getSesionActiva`, línea 103):

```javascript
// apps/pos/src/api/client.js — AHORA
export function getSesionCajaActiva(terminalId = CONFIG.TERMINAL_ID) {
  const qs = new URLSearchParams({ terminal_id: terminalId });
  return peticion(`/cash/active-session?${qs.toString()}`);
}
```

Y se propagó el `terminalId` por toda la cadena de llamada:

| Capa | Archivo | Cambio |
|---|---|---|
| Cliente | [`client.js`](../../apps/pos/src/api/client.js:255) | `getSesionCajaActiva(terminalId)` + `URLSearchParams` |
| Servicio | [`cashService.js`](../../apps/pos/src/services/cashService.js:54) | `obtenerTurnoActivo(terminalId)` reenvía el id |
| Contenedor | [`RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:314) | `obtenerTurnoActivo(terminalEfectiva)` + dep `[terminalEfectiva]` |
| Modal | [`GestorDeCaja.jsx`](../../apps/pos/src/GestorDeCaja.jsx:232) | `obtenerTurnoActivo(terminalId)` en `cargar` y en la recuperación 409 |

### 7.4 Verificación

| Suite | Resultado |
|---|---|
| `curl /cash/active-session?terminal_id=TERM-01` | **HTTP 200** con `cash_session_id` |
| `npx vitest run src/services/cashService.f4_2.test.jsx` | **14 passed** (13 + 1 nuevo) |
| `npm test -- --run` (frontend completo) | **708 passed** (64 archivos) |

Test de regresión añadido en [`cashService.f4_2.test.jsx`](../../apps/pos/src/services/cashService.f4_2.test.jsx:80):

```javascript
it('obtenerTurnoActivo reenvía el terminalId al cliente', async () => {
  apiSimulada.getSesionCajaActiva.mockResolvedValue({ cash_session_id: 'caja-1' });
  await caja.obtenerTurnoActivo('TERM-03');
  expect(apiSimulada.getSesionCajaActiva).toHaveBeenCalledWith('TERM-03');
});
```

### 7.5 Lección (Defecto D)

> **Un query param obligatorio que el cliente omite es un fallo silencioso**: el 422 se
> traduce a `outcome: 'error'` y el componente, que solo actúa en `'ok'`, se queda con el
> estado viejo SIN mostrar error. La operación "parece" no hacer nada.

La regla que se refuerza (hermana de la §5):

> **Cuando un endpoint declara un parámetro obligatorio (`Query(...)`), el cliente DEBE
> enviarlo SIEMPRE.** Un `terminal_id` opcional con default en el cliente es una bomba de
> tiempo: si el default no coincide con la terminal real, el estado se lee de la terminal
> equivocada. Por eso el default es `CONFIG.TERMINAL_ID` y el contenedor SIEMPRE pasa la
> terminal efectiva.

---

## 8. Archivos tocados (segunda vuelta)

| Archivo | Cambio |
|---|---|
| [`apps/pos/src/api/client.js`](../../apps/pos/src/api/client.js:255) | `getSesionCajaActiva(terminalId)` con `URLSearchParams` |
| [`apps/pos/src/services/cashService.js`](../../apps/pos/src/services/cashService.js:54) | `obtenerTurnoActivo(terminalId)` |
| [`apps/pos/src/RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:314) | `obtenerTurnoActivo(terminalEfectiva)` + dep |
| [`apps/pos/src/GestorDeCaja.jsx`](../../apps/pos/src/GestorDeCaja.jsx:232) | `obtenerTurnoActivo(terminalId)` (cargar + 409) |
| [`apps/pos/src/services/cashService.f4_2.test.jsx`](../../apps/pos/src/services/cashService.f4_2.test.jsx:80) | Test de regresión del reenvío del `terminalId` |
