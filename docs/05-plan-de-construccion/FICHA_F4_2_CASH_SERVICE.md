# FICHA DE EVIDENCIA — FASE 4.2: Servicio de Caja (`cashService.js`)

> **Regla E-14 (evidencia, no opinión):** todo lo afirmado aquí está respaldado por
> una salida de terminal o por una ruta de archivo concreta. Nada se da por hecho.

---

## 1. Qué se construyó

La **capa de servicio** que consume los 6 endpoints de caja del backend (F4.1) y
los expone envueltos en el contrato `{ outcome, reason, data }`. Es la frontera
entre el transporte HTTP y la UI: el componente de F4.3 nunca verá una excepción.

| Operación | Endpoint | Contrato | Reglas |
|-----------|----------|----------|--------|
| `obtenerTurnoActivo()` | `GET /cash/active-session` | 9 | — |
| `abrirTurno(datos)` | `POST /cash/open-session` | 10 | RN-49, RN-50 |
| `registrarMovimiento(datos)` | `POST /cash/movements` | 11 | RN-51, RN-55 |
| `obtenerResumen(id)` | `GET /cash/session-summary/{id}` | 12 | RN-53 |
| `cerrarTurno(datos)` | `POST /cash/close-session` | 13 | RN-54, RN-55 |
| `obtenerReporteDiario(fecha)` | `GET /cash/daily-report/{fecha}` | 14 | RN-57/58/59 |

---

## 2. Arquitectura en dos capas

```
GestorDeCaja.jsx (F4.3)
        │  usa esOk(resultado) / resultado.reason
        ▼
cashService.js (F4.2)  ← contrato { outcome, reason, data }, NUNCA lanza
        │  aOutcome(() => cliente.x(), motivo)
        ▼
api/client.js          ← transporte HTTP, lanza ApiError
        │  fetch()
        ▼
API del POS nuevo (F4.1)
```

**Por qué dos capas y no una:** el cliente HTTP *debe* lanzar (`ApiError`) para
que el error viaje con su código; el servicio *debe* no lanzar para que la UI
decida sin `try/catch`. Mezclarlas fue la cicatriz v7.0.3 (cuentas perdidas):
una promesa rechazada sin capturar dejaba el turno en estado ambiguo.

---

## 3. Archivos tocados

| Archivo | Cambio |
|---------|--------|
| [`apps/pos/src/api/client.js`](../../apps/pos/src/api/client.js:217) | +6 funciones de caja (contratos 9–14) y su registro en el export |
| [`apps/pos/src/services/cashService.js`](../../apps/pos/src/services/cashService.js:1) | **NUEVO** — las 6 operaciones con `{outcome, reason}` |
| [`apps/pos/src/services/cashService.f4_2.test.jsx`](../../apps/pos/src/services/cashService.f4_2.test.jsx:1) | **NUEVO** — puerta de la sub-fase (13 tests) |

---

## 4. Traducción de errores a `reason`

El mapeo es explícito y vive en un solo lugar (`motivo(err)`), no disperso en la UI:

| Situación | `reason` |
|-----------|----------|
| No se pudo contactar el API (`codigo === 0`) | `sin_conexion` |
| Turno inexistente (`404`) | `turno_no_encontrado` |
| Ya hay turno abierto (`409`, RN-49) | `ya_hay_turno_abierto` |
| Datos inválidos (`422`) | `datos_invalidos` |
| Otro código HTTP | `error_<codigo>` |
| Error no-API | el `message` del error |

Esto permite que F4.3 muestre un mensaje humano sin conocer los códigos HTTP.

---

## 5. La puerta (gate) — salida real

### 5.1 Puerta de la sub-fase

```
$ npx vitest run src/services/cashService.f4_2.test.jsx --reporter=verbose
 ✓ cashService — superficie > expone las 6 operaciones de caja (contratos 9–14)
 ✓ cashService — éxito > obtenerTurnoActivo devuelve ok con la sesión
 ✓ cashService — éxito > abrirTurno pasa el cuerpo tal cual al cliente
 ✓ cashService — éxito > registrarMovimiento devuelve el id del movimiento
 ✓ cashService — éxito > obtenerResumen devuelve el esperado del turno
 ✓ cashService — éxito > cerrarTurno devuelve la diferencia del arqueo
 ✓ cashService — éxito > obtenerReporteDiario pasa la fecha en la ruta
 ✓ cashService — fallo (nunca lanza) > un fallo de red se traduce a sin_conexion
 ✓ cashService — fallo (nunca lanza) > un 409 al abrir turno → ya_hay_turno_abierto
 ✓ cashService — fallo (nunca lanza) > un 404 al leer el resumen → turno_no_encontrado
 ✓ cashService — fallo (nunca lanza) > un 422 al cerrar turno → datos_invalidos
 ✓ cashService — fallo (nunca lanza) > un error inesperado no rompe el contrato
 ✓ cashService — fallo (nunca lanza) > ninguna operación lanza aunque el cliente falle

 Test Files  1 passed (1)
      Tests  13 passed (13)
```

### 5.2 Runner unificado del proyecto

```
$ npm run test
  Tests de Node      : 3/3 archivo(s) en verde
  Tests de componentes: PASA
  Tests de API       : PASA
  ✅ RESULTADO: TODOS LOS TESTS EN VERDE.
```

### 5.3 Guardianes de estándares

```
$ node scripts/guards.mjs
Archivos de código escaneados: 93
[OK  ] E-05 · A-04 · E-15 (logs) · E-15 (TODOs) · R-01 · E-09 · E-10 → 0 coincidencia(s)
PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE
```

---

## 6. Criterios de aceptación

| # | Criterio | Evidencia | Estado |
|---|----------|-----------|--------|
| 1 | Las 6 operaciones existen y son funciones | `cashService — superficie` | ✅ |
| 2 | Cada operación llama al endpoint correcto con el argumento correcto | 6 tests de éxito | ✅ |
| 3 | El éxito devuelve `outcome:'ok'`, `reason:null` y la carga en `data` | 6 tests de éxito | ✅ |
| 4 | Un fallo de red → `sin_conexion` | test dedicado | ✅ |
| 5 | Un 409 → `ya_hay_turno_abierto` (RN-49) | test dedicado | ✅ |
| 6 | Un 404 → `turno_no_encontrado` | test dedicado | ✅ |
| 7 | Un 422 → `datos_invalidos` | test dedicado | ✅ |
| 8 | **Ninguna** operación lanza, ni con el cliente caído | `ninguna operación lanza…` | ✅ |
| 9 | La suite completa no tiene regresiones | `npm run test` verde | ✅ |
| 10 | Los guardianes de estándares están limpios | 7/7 OK | ✅ |

---

## 7. Hallazgos y decisiones

### 7.1 `vi.hoisted` es obligatorio para el mock del cliente

`vi.mock('../api/client.js', …)` se eleva por encima de los `import`, así que la
fábrica no puede referenciar una variable declarada con `const` normal. Se usa
`vi.hoisted` para crear la referencia antes de la elevación:

```js
const apiSimulada = vi.hoisted(() => ({ getSesionCajaActiva: vi.fn(), … }));
vi.mock('../api/client.js', () => apiSimulada);
```

Es la misma lección que dejó F3.4; se aplicó desde el inicio aquí.

### 7.2 El mock incluye `ApiError`

El servicio discrimina por `err.name === 'ApiError'` y `err.codigo`. Si el mock
no exportara una clase con ese `name`, todos los fallos caerían en la rama
genérica y los tests de traducción de `reason` pasarían en falso. Por eso el mock
define su propia `ApiError` con `name = 'ApiError'`.

### 7.3 `cashService` no conoce `CONFIG`

A diferencia de `client.js`, el servicio no importa `CONFIG` ni construye rutas:
solo delega. Así el servicio es testeable sin variables de entorno y la
configuración de red queda en un único punto (el cliente).

---

## 8. Deudas registradas

| ID | Deuda | Por qué se difiere |
|----|-------|--------------------|
| **D-16** | `obtenerTurnoActivo()` no recibe `terminal_id` | Coherente con D-13: el contrato 9 no lo declara. Se resuelve en F4.3 cuando el Gestor sepa su terminal |
| **D-17** | No hay reintentos (`withRetries`) en las operaciones de caja | Las operaciones de caja son **mutaciones con efecto contable**; reintentar a ciegas un cierre podría duplicar conteos. Se decide en F4.3 con el dueño |

---

## 9. Estado de la fase

- **F4.0** — Ligar `Ticket.cash_session_id` al cobrar → ✅ cerrada (`bcc024b`)
- **F4.1** — Backend de caja (contratos 9–14) → ✅ cerrada (`53a35de`)
- **F4.2** — `cashService.js` (6 llamadas con `{outcome, reason}`) → ✅ **cerrada con esta ficha**
- **F4.3** — `GestorDeCaja.jsx` (abrir, movimientos, resumen, arqueo, cierre) → pendiente
- **F4.4** — `CorteTicketTemplate.jsx` (plantilla de impresión) → pendiente

**Regla dura #4 respetada:** la sub-fase 4.3 no comienza hasta que esta puerta
esté en verde — y lo está, con evidencia.
