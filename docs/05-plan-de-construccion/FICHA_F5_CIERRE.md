# FICHA DE CIERRE — FASE 5: Pizarrón de Cuentas Abiertas

> **Fase:** 5 — Pizarrón de Cuentas Abiertas
> **Estado:** ✅ CERRADA — 4 sub-fases construidas, verificadas y respaldadas
> **Fecha:** 2026-09-29
> **Plan rector:** `PLAN_DE_ABORDAJE_FASE_5_POR_PARTES.md` (393 líneas, v1.0)

---

## 1. Qué es la Fase 5

La Fase 5 entrega el **pizarrón de cuentas abiertas**: la superficie que muestra
las cuentas OPEN de una terminal como tarjetas en un corcho, y permite
**recuperar** una cuenta para retomarla donde quedó.

Es la materialización del flujo **E.4 — Recuperación de cuenta** del registro de
la superficie, y la interfaz **13** (`OpenAccountsCorkboard`, Modal).

### El problema que resuelve

En el POS viejo, una cuenta a medias (un cliente que dejó su ticket abierto para
volver) era invisible: no había forma de ver qué cuentas estaban "en el aire" ni
de retomarlas sin conocer su folio. La Fase 5 construye esa superficie.

---

## 2. Las 4 sub-fases

La Fase 5 se ejecutó **de adentro hacia afuera** (cadena vertical): primero el
contrato, luego el servicio, luego el hook, luego el componente.

| Sub-fase | Qué construyó | Gate | Commit |
|---|---|---|---|
| **5.0** | Contrato 23 `pos.cuentas_abiertas` + endpoint `GET /pos/open-accounts` + esquemas Pydantic | 6/6 | `c1ebbb1` |
| **5.1** | `listarCuentasAbiertas` en `client.js` + `openAccountsService.js` | 14/14 | `b2b79d7` |
| **5.2** | `useOpenAccounts.js` (hook) | 9/9 | `d079442` |
| **5.3** | `OpenAccountsCorkboard.jsx` (interfaz 13) | 8/8 | `8a09731` |

**Total: 37 criterios de puerta en verde.**

### La cadena vertical completa

```
Endpoint (F5.0)              Servicio (F5.1)              Hook (F5.2)              Componente (F5.3)
GET /pos/open-accounts  →  openAccountsService.js  →  useOpenAccounts.js  →  OpenAccountsCorkboard.jsx
     ↓                          ↓                          ↓                          ↓
contrato 23 + esquemas    {outcome, reason, data}    {cuentas, cargando,       3 modos, tarjetas,
                          + withRetries              error, refrescar,         recuperar, banner
                                                     recuperarCuenta}          persistente
```

Cada capa **solo conoce a la inmediata inferior**. El componente no sabe que
existe HTTP; el hook no sabe que existe un endpoint; el servicio no sabe que
existe React.

---

## 3. Decisiones de diseño de la fase

### 3.1 Proyección ligera, no la tabla `tickets` (Regla 15)

El contrato 23 devuelve **exactamente 5 campos escalares** por cuenta
(`id`, `account_num`, `status`, `total`, `version`). No expone la tabla
`tickets` ni sus columnas internas. Esto respeta la frontera por contratos
(A-02) y la regla de respuesta ligera.

### 3.2 Filtro por terminal + status (RN-31)

El endpoint filtra por `terminal_id` **y** `status = 'OPEN'`. Una cuenta PAID
no aparece en el pizarrón. Una terminal solo ve **sus** cuentas (RN-31: el draft
pertenece a su terminal).

### 3.3 La versión fresca la trae el contrato 21 (lección v6.0)

El botón "Recuperar" **no** confía en la `version` de la proyección ligera.
Llama a `recuperarCuenta(id)`, que usa el contrato 21 (`GET /pos/tickets/{id}`)
para traer la versión **fresca** antes de retomar. Esto evita el bug de la
versión obsoleta (RN-25/RN-26) que costó $453 en la v6.0 del POS viejo.

### 3.4 `{outcome, reason}` de punta a punta

El servicio nunca lanza; envuelve todo en `aOutcome` + `withRetries`. El hook
traduce a `{cuentas, cargando, error}`. El componente nunca usa `try/catch`.
Esto respeta la regla arquitectónica #1 derivada de la batalla.

### 3.5 Banner de error persistente (Regla 19 / prohibición #2)

Ni el error de lectura ni el de recuperación se auto-ocultan. No hay
`setTimeout` para hacer desaparecer un error. El usuario lo ve hasta que la
operación se resuelve.

### 3.6 Sin timers ni auto-guardado (prohibición #1)

La recarga es **a demanda** (botón "Actualizar"). No hay polling ni
`setInterval`. El pizarrón no se auto-refresca.

### 3.7 Contenedor fluido + 3 modos + táctil (R-01/R-03/R-04)

`w-full max-w-[1000px] mx-auto` (fluido), grid que cambia según
MOSTRADOR/COMPACTO/MOVIL, y `min-h-tactil` (≥ 44px) en tarjetas y botones.

---

## 4. Verificación consolidada

| Puerta | Comando | Resultado |
|---|---|---|
| Gate F5.0 | `pytest tests/test_f5_cuentas.py` | ✅ 6/6 |
| Gate F5.1 | `npx vitest run src/services/openAccountsService.f5_1.test.jsx` | ✅ 14/14 |
| Gate F5.2 | `npx vitest run src/hooks/useOpenAccounts.f5_2.test.jsx` | ✅ 9/9 |
| Gate F5.3 | `npx vitest run src/components/OpenAccountsCorkboard.f5_3.test.jsx` | ✅ 8/8 |
| Suite completa | `npm run test` | ✅ Node 3/3, Vitest PASA, pytest PASA |
| Guards | `node scripts/guards.mjs` | ✅ 7/7 (104 archivos) |

---

## 5. Trazabilidad

| Artefacto | Referencia |
|---|---|
| Contrato 23 | `pos.cuentas_abiertas` — proyección ligera de cuentas OPEN |
| Contrato 21 | `pos.leer_ticket` — versión fresca para recuperar |
| Interfaz 13 | `superficie/registry.py` — `OpenAccountsCorkboard`, Modal, 3 modos |
| Flujo E.4 | Recuperación de cuenta |
| Reglas de negocio | RN-25/RN-26 (versión), RN-31 (draft de su terminal) |
| Prohibiciones | #1 (sin timers), #2 (banner persistente) |
| Reglas de batalla | R-01 (fluido), R-03 (3 modos), R-04 (táctil), Regla 15 (ligero), Regla 19 (banner) |
| Estándares | E-05 (sin console.log), E-14 (evidencia), E-16 (funciones atómicas) |
| Lección v6.0 | Versión fresca vía contrato 21 antes de retomar |

---

## 6. Deuda declarada (no entra en Fase 5)

1. **Sin paginación.** El endpoint devuelve **todas** las cuentas OPEN de la
   terminal. Para una terminal con decenas de cuentas abiertas esto es
   aceptable; si el volumen crece, se añadirá paginación en una fase posterior.
2. **El guard de `terminal_id` vacío es defensivo.** El endpoint rechaza un
   `terminal_id` vacío, pero el frontend nunca lo envía vacío (el servicio tiene
   una guarda local que evita la llamada). Es código defensivo, no un camino
   vivo.
3. **El pizarrón no está montado en `RetailVisionPOS`.** Es una superficie Modal
   independiente. Su integración en el flujo del POS (cuándo se abre, cómo se
   cierra, qué pasa al recuperar) es trabajo de integración posterior.
4. **No permite cerrar/cancelar una cuenta** desde el pizarrón. Solo recuperar.

---

## 7. Veredicto

La **Fase 5 está cerrada**. Las 4 sub-fases (5.0, 5.1, 5.2, 5.3) están
construidas, cada una con su puerta en verde, su ficha de evidencia y su commit
respaldado en `origin/main`.

La cadena vertical está completa de punta a punta: del contrato 23 al pizarrón
visual, pasando por el servicio y el hook. El pizarrón respeta los 3 modos, la
paleta canónica, el táctil ≥ 44px, el contenedor fluido y el banner persistente.

**Commits de la fase:**

```
8a09731  F5.3: pizarron de cuentas abiertas (interfaz 13) + gate 8/8 + ficha
d079442  F5.2: hook useOpenAccounts (pizarron de cuentas abiertas)
b2b79d7  F5.1: servicio de cuentas abiertas (openAccountsService + listarCuentasAbiertas)
c1ebbb1  F5.0: contrato 23 + endpoint GET /pos/open-accounts + esquema
```

**Siguiente paso natural:** la **Fase 6 — Impresión + PDF de Catálogo**
(Plan Maestro §7), o el cierre formal del proyecto si el dueño lo decide.
