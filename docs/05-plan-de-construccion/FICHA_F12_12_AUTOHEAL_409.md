# FICHA F12.12 — Auto-heal del conflicto de versión (409) + filtro de errores de negocio

> **Sub-fase:** 12.12 — filtro de errores de negocio en `withRetries` (REGLA 18) + auto-heal del 409 (REGLA 9)
> **Fase:** 12 — Portar funcionalidades del POS viejo al POS nuevo
> **Estado:** ✅ CERRADA — gate componente 5/5 en verde, CI completo en verde, guards 7/7 en verde
> **Fecha:** 2026-10-06
> **Commit:** `326622c` — F12.12: auto-heal del 409 + filtro de errores de negocio en withRetries (REGLA 18/9)
> **Plan rector:** §6.8 (UX heredada) + §10.6 (lecciones por clase de fallo) + REGLA 18 + REGLA 9 + RN-25/RN-26

---

## 1. Qué se construyó

F12.11 (la auditoría handler-por-handler) recorrió los 21 efectos del viejo POS y
clasificó el handler `handleTicketAction` como **INFIEL**: el POS nuevo tenía el
`withRetries` pero **SIN** el filtro de errores de negocio, y **NO** tenía auto-heal
del conflicto de versión. F12.12 cierra ambos huecos.

El viejo POS, en `apps/pos/hooks/useTicketActions.js` → `handleTicketAction`
(líneas 123–348), hacía **2 cosas** que el POS nuevo no hacía:

```js
// viejo POS — handleTicketAction(status, paymentData)
1. const isBusinessError = (err) => { ... }        // ← filtro de errores de negocio
   savedTicket = await withRetries(fn, { debeReintentar: !isBusinessError })
2. // 409 → CollisionModal bloqueante (resolución manual)
```

El POS nuevo (F12.11) hacía solo **1** (llamaba a `withRetries` con el default
`debeReintentar = () => true`). Faltaban: el **filtro de errores de negocio** y el
**auto-heal** del 409.

### Los 2 huecos

| # | Hueco | Clase | Decisión |
|---|---|---|---|
| 1 | `withRetries` reintentaba **cualquier** error, incluido un 409 (viola REGLA 18) | INFIEL | **CERRAR** — filtro `debeReintentar` |
| 2 | Un 409 mostraba un error críptico y **no** recuperaba la versión fresca | INFIEL | **CERRAR** — auto-heal (contrato 30) |

### Archivos

| Archivo | Rol | Cambio |
|---|---|---|
| `apps/pos/src/hooks/useTicketActions.js` | Helpers `esErrorDeNegocio` / `esConflictoDeVersion` | +2 exports |
| `apps/pos/src/hooks/useTicketActions.js` | `crearTicket` — filtro en `withRetries` | actualizado |
| `apps/pos/src/hooks/useTicketActions.js` | `cobrar` — captura `errorCrudo`, devuelve `reason: 'version_conflict'` | actualizado |
| `apps/pos/src/RetailVisionPOS.jsx` | `confirmarCobro` — bloque de auto-heal | +bloque |
| `apps/pos/src/RetailVisionPOS.f12_12.test.jsx` | La puerta de componente (3 criterios, 5 tests) | nuevo |

---

## 2. Decisión de diseño

### 2.1 Hueco 1 — Filtro de errores de negocio (REGLA 18)

`withRetries` del POS nuevo tiene `debeReintentar = () => true` por **defecto**
(`utils/withRetries.js`, línea 59). Eso significa que, sin filtro, un 409
(conflicto de versión, RN-25/RN-26) se reintentaría **3 veces**
(`INTENTOS_POR_DEFECTO = 3`), lo que viola la REGLA 18 ("PROHIBIDO reintentar 409")
y podía **cobrar dos veces** (RN-23: un ticket PAID no se re-cobra).

Se añaden dos helpers puros:

```js
export function esErrorDeNegocio(err) {
  if (!err) return false;
  if (err.codigo === 409) return true;
  const mensaje = String(err.message || '').toLowerCase();
  return mensaje.includes('ya ha sido pagado') || mensaje.includes('conflicto de versión');
}

export function esConflictoDeVersion(err) {
  return Boolean(err) && err.codigo === 409;
}
```

`crearTicket` y `cobrar` pasan el filtro a `withRetries`:

```js
withRetries(fn, { debeReintentar: (err) => !esErrorDeNegocio(err) })
```

Un error de **red** (código 0, sin `codigo`) **sí** se reintenta: el filtro solo
bloquea los errores de negocio. Esto preserva la resiliencia ante caídas
transitorias (REGLA 17).

### 2.2 Hueco 2 — Auto-heal del 409 (REGLA 9)

Cuando el cobro choca con un 409, el ticket **sigue siendo VÁLIDO**: solo está
desactualizado porque otro vendedor lo modificó entre que se abrió el checkout y
se cobró. En vez de mostrar un error críptico, el POS:

1. Descarga la versión fresca de las líneas (contrato 30 `pos.leer_lineas`).
2. Re-hidrata el carrito con `carrito.hidratarLineas(...)` — lo que sincroniza
   `lineasRef`/`versionRef` **ANTES** de `setState` (REGLA 9).
3. Avisa por banner (`tipo: 'aviso'`): "⚠️ ¡Atención! Otro vendedor modificó esta
   cuenta. Totales actualizados."
4. Reabre el checkout (`setCheckoutAbierto(true)`) para reintentar.

```js
if (pagado.reason === 'version_conflict') {
  const fresco = await aOutcome(() => api.leerLineas(ticketIdRef.current));
  if (esOk(fresco)) {
    const datos = fresco.data || {};
    carrito.hidratarLineas(
      Array.isArray(datos.lineas) ? datos.lineas : [],
      datos.version,
    );
    setBanner({ tipo: 'aviso', mensaje: '⚠️ ¡Atención! Otro vendedor modificó esta cuenta. Totales actualizados.' });
    setCheckoutAbierto(true);
  } else {
    setError('Otro vendedor modificó esta cuenta y no se pudo descargar la versión fresca. Reintenta.');
  }
  return;
}
```

El viejo POS resolvía el 409 con un `CollisionModal` **bloqueante** (resolución
manual). El POS nuevo lo resuelve **en línea**, sin bloquear al operador. Es una
mejora de UX, no una pérdida de paridad: el efecto observable (el operador ve los
totales actualizados y puede reintentar) se conserva.

### 2.3 Por qué el auto-heal vive en `RetailVisionPOS.jsx` y no en el hook

`cobrar` (en `useTicketActions.js`) **no** tiene acceso al carrito (`carrito` es un
hook separado). El único punto donde `acciones` y `carrito` están ambos en scope es
`confirmarCobro` en `RetailVisionPOS.jsx`. Por eso el hook devuelve un `reason`
distinto (`'version_conflict'`) y la pantalla ejecuta el auto-heal. Esto respeta la
separación de responsabilidades: el hook **detecta**, la pantalla **reacciona**.

### 2.4 `cobrar` NO limpia los refs en un 409

En un 409, el ticket sigue vivo. `cobrar` devuelve el `reason` **sin** llamar a
`limpiarRefs()` (REGLA 19: la limpieza espejo solo aplica a las salidas reales). Si
limpiara los refs, el auto-heal no tendría `ticketIdRef.current` para pedir la
versión fresca.

---

## 3. La puerta de componente (3 criterios, 5 tests)

`apps/pos/src/RetailVisionPOS.f12_12.test.jsx` — **5/5 en verde**.

| # | Criterio | Test | Qué verifica |
|---|---|---|---|
| 1 | REGLA 18 | el cobro que recibe 409 llama a `cobrarTicket` UNA sola vez | Sin el filtro serían 3 llamadas |
| 2 | REGLA 9 | tras el 409, el carrito se re-hidrata con las líneas frescas | Aparece "Café Americano" (línea que no estaba) |
| 2 | REGLA 9 | el auto-heal avisa por banner que otro vendedor modificó la cuenta | Banner "Otro vendedor modificó esta cuenta" |
| 2 | REGLA 9 | si la descarga fresca falla, se muestra un error y NO se pierde el ticket | Mensaje "no se pudo descargar la versión fresca" |
| 3 | REGLA 18 | un fallo de red (sin código) reintenta y luego tiene éxito | `cobrarTicket` > 1 llamada + NO auto-heal |

### Notas de implementación de los tests

- El test monta la **pantalla real** (`RetailVisionPOS`) con el cliente `api`
  simulado, igual que las compuertas F8.6/F12.10/F12.10b.
- **NO** se simula `cashService`: se simulan los métodos de caja del cliente `api`
  (`getSesionCajaActiva`, etc.) y se deja correr el `cashService` REAL. Simular el
  servicio entero devolvía `data: null` en `obtenerTurnoActivo`, lo que dejaba la
  terminal **sin caja abierta** (RN-49) y bloqueaba el cobro. Se siembra una sesión
  de caja `OPEN` en `sembrarApiFeliz()`.
- El flujo de cobro replica el de F8.6: producto → `COBRAR` (gateado por caja) →
  `Tarjeta` (habilita sin capturar efectivo) → `CONFIRMAR PAGO`.
- Las aserciones de texto usan `findAllByText` porque el nombre del producto aparece
  en la rejilla **y** en el ticket, y el mensaje de error se pinta en varios sitios
  (aviso en línea + overlay).

---

## 4. Por qué existe esta compuerta (21ª instancia de §10.6)

§10.6 documenta las lecciones por **clase de fallo**. F12.12 es la **21ª instancia**
y pertenece a la clase **"de adentro hacia afuera"**, con un matiz nuevo: no es un
hueco de contrato (como F12.10) ni de paridad de handler completa (como F12.10b),
es un hueco de **paridad de un efecto interno del handler**.

La lección: **tener la infraestructura no es tener el comportamiento.** El POS nuevo
tenía `withRetries` (la infraestructura), pero le faltaba el **filtro** que le da
sentido (el comportamiento). La auditoría F12.11 lo detectó porque comparó el
handler viejo **efecto por efecto**, no la presencia de las funciones.

### Las 21 instancias (contexto)

| # | Fase | Clase de fallo |
|---|---|---|
| 16 | F12.9 | Un botón conflacionaba DOS operaciones |
| 17 | F12.9.1 | El esquema asumía el flujo inverso |
| 18 | F12.10 | Recuperar adoptaba identidad pero no hidrataba el carrito (hueco A-02) |
| 19 | F12.10b | El handler hidrataba pero omitía 2 efectos del viejo POS (guardia + contexto) |
| 20 | F12.11 | La auditoría handler-por-handler (no es un hueco, es el método) |
| **21** | **F12.12** | **El handler tenía `withRetries` pero sin el filtro de errores de negocio, y sin auto-heal del 409** |

---

## 5. Verificación

```
Componente (Vitest):
  npx vitest run src/RetailVisionPOS.f12_12.test.jsx
  → 5 passed

CI completo (npm run ci desde NUEVO-POS):
  lint OK (0 errores) · vitest PASA · pytest PASA · guards 7/7 OK
  → TODOS LOS TESTS EN VERDE
```

---

## 6. Estado

✅ **CERRADA.** `withRetries` ahora recibe el filtro `debeReintentar` que bloquea
los errores de negocio (REGLA 18), y el cobro que choca con un 409 descarga la
versión fresca, re-hidrata el carrito (REGLA 9) y reabre el checkout. El viejo
`CollisionModal` bloqueante se reemplaza por un auto-heal en línea.

Quedan abiertas **F12.13** (mutex de acciones de persistencia, REGLA 2) y el cierre
documental de **F12.14/F12.15** (ya cubiertos / disparador prohibido por §10.4).
