# FICHA F5.2 — Hook `useOpenAccounts` (Pizarrón de Cuentas Abiertas)

**Fase:** 5 — Pizarrón de Cuentas Abiertas
**Sub-fase:** 5.2 — Hook de estado del pizarrón
**Fecha:** 2026-09-29
**Estado:** ✅ CERRADA — gate 9/9 en verde, suite completa en verde, guards 7/7

---

## 1. Qué se construyó

Un hook de React que encapsula **todo el estado del pizarrón de cuentas abiertas**:
la lista de cuentas, el indicador de carga, el error, la recarga manual y la
recuperación de una versión fresca de una cuenta concreta.

| Archivo | Líneas | Rol |
|---|---|---|
| `apps/pos/src/hooks/useOpenAccounts.js` | 84 | El hook (lógica de estado) |
| `apps/pos/src/hooks/useOpenAccounts.f5_2.test.jsx` | 9 tests | La puerta de F5.2 |

**Superficie pública del hook:**

```js
const { cuentas, cargando, error, refrescar, recuperarCuenta } = useOpenAccounts({
  terminalId,          // string — la terminal cuyo pizarrón se muestra
  servicioCuentas,     // inyectable (default: openAccountsService.js)
  clienteApi,          // inyectable (default: api/client.js)
});
```

- `cuentas` — array de la proyección ligera (5 campos por cuenta, contrato 23).
- `cargando` — booleano; `true` mientras hay una lectura en vuelo.
- `error` — `null` o el `reason` del fallo (`sin_conexion`, `terminal_invalida`, …).
- `refrescar()` — vuelve a leer el pizarrón (idempotente, seguro de llamar varias veces).
- `recuperarCuenta(ticketId)` — devuelve `{ outcome, reason, data }` con la versión
  **fresca** del ticket (contrato 21), no la que estaba en el pizarrón.

---

## 2. Decisión de diseño

### 2.1 Por qué un hook y no lógica dentro del componente

El pizarrón (F5.3) es una **interfaz de solo lectura con recarga**. Si la lógica
de fetch viviera dentro del componente, no sería testeable sin montar el DOM
completo y no podría reutilizarse. El hook aísla la lógica y la hace verificable
con `renderHook`, sin renderizar el pizarrón.

### 2.2 Prohibición #3 — los callbacks asíncronos leen de refs, no del estado

Los callbacks (`refrescar`, `recuperarCuenta`) se crean con `useCallback` de
dependencias **vacías**. Si leyeran `terminalId` del estado cerrado, capturarían
un valor obsoleto. Por eso leen de `terminalRef.current`, que se actualiza en cada
render. Esto es exactamente la Prohibición #3 del Plan Maestro ("no leer estado en
callbacks asíncronos; usar `useRef`").

```js
const terminalRef = useRef(terminalId);
terminalRef.current = terminalId;   // se refresca en cada render
```

### 2.3 H1 — el `useEffect` depende de una primitiva

La carga inicial y la recarga al cambiar de terminal dependen de `terminalId`
(un string primitivo), no de un objeto. Esto evita el bucle infinito que ocurre
cuando se pasa un objeto nuevo en cada render como dependencia.

```js
useEffect(() => {
  refrescar();
}, [terminalId, refrescar]);   // terminalId es primitiva; refrescar es estable
```

### 2.4 Guardia de desmontaje (`vivoRef`)

Si el componente se desmonta mientras hay una lectura en vuelo, el `setState`
posterior lanzaría un warning de React. El hook usa `vivoRef` para no escribir
estado tras el desmontaje (Regla 19 — espejo de limpieza).

### 2.5 La lección v6.0 — `recuperarCuenta` pide versión fresca

El pizarrón muestra una foto de las cuentas. Si el cajero toca una cuenta para
retomarla, **no puede confiar en la versión que vio en el pizarrón** (pudo cambiar
entre la lectura y el toque). Por eso `recuperarCuenta` llama al contrato 21
(`leerTicket`) para traer la versión **actual** de la BD. Esta es la lección del
bug v6.0 (bloqueo optimista con versión obsoleta).

### 2.6 Inyección de dependencias para test

El hook acepta `servicioCuentas` y `clienteApi` como opciones. En producción usa
los módulos reales; en el test se inyectan dobles. Esto permite verificar los 5
criterios sin tocar la red.

---

## 3. La puerta de F5.2 (5 criterios)

| # | Criterio | Test(s) | Estado |
|---|---|---|---|
| 1 | Carga inicial: al montar con `terminalId`, puebla `cuentas` y apaga `cargando` | 2 | ✅ |
| 2 | `refrescar()` vuelve a leer y actualiza la lista | 1 | ✅ |
| 3 | `recuperarCuenta(id)` devuelve la versión fresca (contrato 21) | 3 | ✅ |
| 4 | Un fallo del servicio deja `cuentas=[]` y `error=reason` | 1 | ✅ |
| 5 | Al desmontar no se escribe estado (guardia `vivoRef`) | 1 | ✅ |
| — | Superficie: expone las 5 claves esperadas | 1 | ✅ |

**Resultado:** `npx vitest run src/hooks/useOpenAccounts.f5_2.test.jsx` → **9/9 en verde** (2.51 s), sin warnings de `act()`.

---

## 4. Verificación de no-regresión

| Verificación | Comando | Resultado |
|---|---|---|
| Gate F5.2 | `npx vitest run src/hooks/useOpenAccounts.f5_2.test.jsx` | ✅ 9/9 |
| Suite completa | `npm run test` | ✅ Node 3/3, Vitest PASA, pytest PASA |
| Guardianes | `node scripts/guards.mjs` | ✅ 7/7 (102 archivos) |

---

## 5. Trazabilidad

| Regla / Estándar | Dónde se cumple |
|---|---|
| Prohibición #3 (no leer estado en callbacks async) | `terminalRef`, `servicioRef`, `clienteRef` |
| H1 (dependencias primitivas) | `useEffect([terminalId, refrescar])` |
| Regla 19 (espejo de limpieza) | `vivoRef` + cleanup del `useEffect` |
| Lección v6.0 (versión fresca) | `recuperarCuenta` → `cliente.leerTicket` (contrato 21) |
| Contrato 23 (proyección ligera) | `cuentas` = `r.data.cuentas` (5 campos) |
| E-16 (funciones atómicas) | `refrescar` y `recuperarCuenta` < 20 líneas |
| E-05 (sin `console.log`) | Verificado por guardián |

---

## 6. Qué NO entra en F5.2

- **El pizarrón visual** (`OpenAccountsCorkboard.jsx`) → F5.3.
- **El polling automático** del pizarrón → no está en el alcance de F5 (el pizarrón
  se recarga a demanda con `refrescar`).
- **La paginación** de cuentas → diferida (documentada en F5.0).
- **La impresión** del corte → F6.

---

## 7. Veredicto

F5.2 **cerrada**. El hook `useOpenAccounts` expone la superficie acordada, cumple
los 5 criterios de la puerta, respeta las prohibiciones y reglas aplicables, y no
introduce regresiones. La F5.3 (pizarrón visual) puede construirse sobre esta base
sin tocar el hook.
