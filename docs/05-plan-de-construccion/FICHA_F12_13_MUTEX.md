# FICHA F12.13 — Mutex de acciones de persistencia (REGLA 2)

> **Sub-fase:** 12.13 — mutex que **rechaza** la 2ª llamada concurrente (REGLA 2)
> **Fase:** 12 — Portar funcionalidades del POS viejo al POS nuevo
> **Estado:** ✅ CERRADA — gate componente 5/5 en verde, CI completo en verde, guards 7/7 en verde
> **Fecha:** 2026-10-06
> **Commit:** `438935f` — F12.13: mutex de acciones de persistencia (rechazar 2a llamada concurrente, REGLA 2)
> **Plan rector:** §6.8 (UX heredada) + §10.6 (lecciones por clase de fallo) + REGLA 2 + RN-23

---

## 1. Qué se construyó

F12.11 (la auditoría handler-por-handler) recorrió los 21 efectos del viejo POS y
clasificó el handler `handleTicketAction` como **INFIEL** en un segundo aspecto: el
POS nuevo tenía `enviandoRef` (una **bandera**), pero **NO** un mutex que **rechace**
una segunda llamada concurrente.

El viejo POS, en `apps/pos/hooks/useTicketActions.js` → `handleTicketAction`
(líneas 123–348), usaba un **mutex de cadena de promesas** (`actionMutexRef`):

```js
// viejo POS — handleTicketAction(status, paymentData)
const releaseMutex = await acquireMutex();   // serializa: la 2ª llamada ESPERA
try {
  ...
} finally {
  releaseMutex();                            // libera SIEMPRE
}
```

El viejo POS **serializaba** (la 2ª llamada se encolaba y esperaba). El POS nuevo,
en cambio, **rechaza** la 2ª llamada: es más seguro para acciones finales (un doble
clic en COBRAR no debe encolar un segundo cobro; debe ignorarse). F12.13 cierra el
hueco.

### El hueco

| # | Hueco | Clase | Decisión |
|---|---|---|---|
| 1 | `useTicketActions` tenía `enviandoRef` (bandera) pero **NO** un mutex que rechace la 2ª llamada concurrente | INFIEL | **CERRAR** — mutex `adquirirMutex`/`liberarMutex` |

### Archivos

| Archivo | Rol | Cambio |
|---|---|---|
| `apps/pos/src/hooks/useTicketActions.js` | Helpers `adquirirMutex` / `liberarMutex` | +2 exports |
| `apps/pos/src/hooks/useTicketActions.js` | `mutexRef` (ref del mutex) | +1 ref |
| `apps/pos/src/hooks/useTicketActions.js` | `crearTicket` — adquiere/rechaza + libera en `finally` | actualizado |
| `apps/pos/src/hooks/useTicketActions.js` | `cobrar` — adquiere/rechaza + libera en `finally` | actualizado |
| `apps/pos/src/RetailVisionPOS.jsx` | `asegurarTicket` — guarda `accion_en_curso` | +guarda |
| `apps/pos/src/RetailVisionPOS.jsx` | `confirmarCobro` (rama `crearTicket`) — guarda `accion_en_curso` | +guarda |
| `apps/pos/src/RetailVisionPOS.jsx` | `confirmarCobro` (rama `cobrar`) — guarda `accion_en_curso` | +guarda |
| `apps/pos/src/RetailVisionPOS.f12_13.test.jsx` | La puerta de componente (3 criterios, 5 tests) | nuevo |

---

## 2. Decisión de diseño

### 2.1 Rechazar, no serializar

El viejo POS **serializaba** con una cadena de promesas: la 2ª llamada esperaba a
que la 1ª terminara y **luego se ejecutaba**. Para acciones finales (crear ticket,
cobrar) eso es peligroso: un doble clic en COBRAR encolaría un **segundo cobro**
que se ejecutaría al terminar el primero → doble cargo (viola RN-23: un ticket PAID
no se re-cobra).

El POS nuevo **rechaza** la 2ª llamada: devuelve un outcome benigno
(`reason: 'accion_en_curso'`) y el llamador lo ignora. El primer clic sigue su
camino y resuelve la acción. Es la semántica correcta para un botón de acción final.

### 2.2 Los helpers puros

Se añaden dos helpers puros y testeables por unidad:

```js
export function adquirirMutex(mutexRef) {
  if (mutexRef.current) return false;   // ya tomado → rechazar
  mutexRef.current = true;
  return true;                          // adquirido
}

export function liberarMutex(mutexRef) {
  mutexRef.current = false;
}
```

El mutex vive en un `useRef` (no en `useState`): no dispara re-render y es estable
entre renders, igual que el resto de refs del hook.

### 2.3 Adquirir al entrar, liberar SIEMPRE en `finally`

`crearTicket` y `cobrar` adquieren el mutex **después** de sus guardas de
precondición (cliente / ticket actual) y lo liberan en el `finally`:

```js
// crearTicket / cobrar — tras las guardas de precondición
if (!adquirirMutex(mutexRef)) {
  const r = { outcome: 'error', reason: 'accion_en_curso', data: null };
  setUltimoOutcome(r);
  return r;
}
try {
  ...
} finally {
  enviandoRef.current = false;
  setEnviando(false);
  liberarMutex(mutexRef);   // ← SIEMPRE: éxito, fallo o excepción
}
```

Liberar en `finally` garantiza que el candado **no se quede pegado** si la acción
falla (REGLA 19: limpieza espejo — toda rama de salida limpia lo mismo).

### 2.4 El consumidor trata `accion_en_curso` como benigno

`accion_en_curso` **no es un error**: es la señal de que ya hay una acción en curso.
Los tres puntos de consumo en `RetailVisionPOS.jsx` lo ignoran en silencio:

```js
// asegurarTicket
if (creado.reason === 'accion_en_curso') return null;

// confirmarCobro — rama crearTicket
if (creado.reason === 'accion_en_curso') return;

// confirmarCobro — rama cobrar
if (pagado.reason === 'accion_en_curso') return;
```

Sin estas guardas, el 2º clic mostraría un error críptico al operador aunque el
1er clic esté resolviendo la acción con éxito.

---

## 3. La puerta de componente (5 tests, 3 criterios)

`apps/pos/src/RetailVisionPOS.f12_13.test.jsx`:

| Criterio | Test | Qué verifica |
|---|---|---|
| 1 | un doble clic en CONFIRMAR PAGO llama a `cobrarTicket` UNA sola vez | El mutex rechaza la 2ª llamada concurrente (cobro en vuelo con promesa diferida) |
| 1 | tras liberarse el mutex, un cobro posterior SÍ procede | El candado no se queda pegado tras un fallo (se libera en `finally`) |
| 2 | un doble clic en un producto NO crea dos tickets | El mutex también protege la **creación** del ticket |
| 3 | `adquirirMutex` devuelve `true` la 1ª vez y `false` mientras está tomado | Unidad del helper |
| 3 | `liberarMutex` permite volver a adquirir (simetría) | Unidad del helper |

> **Nota de temporizadores:** el test "tras liberarse el mutex…" agota los 3
> reintentos de `withRetries` (backoff 1s/2s/3s con temporizadores reales), por lo
> que su `waitFor` usa `{ timeout: 10000 }` en vez del default de 1000 ms.

---

## 4. Verificación

| Puerta | Comando | Resultado |
|---|---|---|
| Gate componente | `npx vitest run src/RetailVisionPOS.f12_13.test.jsx --reporter=verbose` | ✅ 5/5 |
| CI completo | `npm run ci` (desde `../NUEVO-POS`) | ✅ lint + test + guards |
| Guards | incluidos en `npm run ci` | ✅ 7/7 |

---

## 5. Lección (§10.6 — "de adentro hacia afuera")

F12.13 es la **22ª** instancia del patrón "de adentro hacia afuera": primero se
verificó el comportamiento del viejo POS (`actionMutexRef`), se clasificó el hueco
(INFIEL), y se adaptó la **semántica** (rechazar en vez de serializar) a la
arquitectura del POS nuevo (outcomes `{outcome, reason}`), sin copiar la
implementación literal.

La diferencia clave con el viejo POS es deliberada: **rechazar** una acción final
concurrente es más seguro que **serializarla**, porque evita un doble cargo (RN-23).
