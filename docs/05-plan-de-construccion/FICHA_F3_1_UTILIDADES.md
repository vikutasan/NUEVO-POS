# 📋 FICHA DE EVIDENCIA — FASE 3.1 (Utilidades transversales)

> **Fecha:** 29 Sep 2026
> **Sub-fase:** 3.1 — Cimientos de comportamiento (utilidades transversales)
> **Plan:** [`PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md:226) §4 FASE 3.1
> **Estado:** ✅ **PUERTA EN VERDE**
> **Depende de:** Fase 3.0 (runner real) — cerrada y en verde

---

## 1. Qué se construyó

| Archivo | Qué resuelve | Cicatriz / Regla | Estado |
|---|---|---|---|
| [`apps/pos/src/utils/withRetries.js`](../../apps/pos/src/utils/withRetries.js:1) | 3 intentos, backoff 1s/2s/3s, centralizado | v7.0.1 (asimetría) | ✅ |
| [`apps/pos/src/utils/outcome.js`](../../apps/pos/src/utils/outcome.js:1) | Contrato `{ outcome, reason }` | v7.0.3 (cuentas perdidas) | ✅ |
| [`apps/pos/src/state/sessionReset.js`](../../apps/pos/src/state/sessionReset.js:1) | `buildResetPatch()` — limpieza espejo explícita | Regla 19 | ✅ |
| [`apps/pos/src/hooks/useBeforeUnload.js`](../../apps/pos/src/hooks/useBeforeUnload.js:1) | `sendBeacon` al cerrar pestaña | H3 | ✅ |
| [`apps/pos/src/hooks/useNetworkHealth.js`](../../apps/pos/src/hooks/useNetworkHealth.js:1) | Banner rojo fijo + botón bloqueado | v6.1 ($453) | ✅ |

**Tests:**

| Archivo | Tipo | Tests |
|---|---|---|
| [`apps/pos/src/utils/utilidades.test.js`](../../apps/pos/src/utils/utilidades.test.js:1) | Node (hand-rolled, patrón existente) | 17 |
| [`apps/pos/src/hooks/hooks.test.jsx`](../../apps/pos/src/hooks/hooks.test.jsx:1) | Vitest (jsdom) | 8 |

---

## 2. Decisiones de diseño

### 2.1 Inyección de dependencias para tests deterministas

| Utilidad | Punto de inyección | Por qué |
|---|---|---|
| `withRetries` | `opciones.dormir` | Verificar el backoff **sin esperar 6 s reales** (evita tests lentos y frágiles) |
| `useNetworkHealth` | `opciones.sonda` | Simular red caída/arriba sin depender de la red real |
| `useBeforeUnload` | `opciones.enviar` | Verificar `sendBeacon` sin depender de `navigator` |

### 2.2 `useRef` para callbacks (prohibición #3)

`useBeforeUnload` guarda `obtenerPayload` en un `useRef` y lo actualiza en cada render.
Así el listener de `beforeunload` **no se re-registra** en cada render y nunca lee
estado "cerrado" (Ticket #906).

### 2.3 `sessionReset` garantiza simetría por construcción

`buildResetPatch` devuelve **siempre** las claves canónicas de `VALOR_INICIAL`, más
cualquier ref extra declarado por el llamador. Por construcción, **toda rama de salida
limpia exactamente los mismos refs** — no depende de que el programador recuerde hacerlo.

---

## 3. Puerta 3.1 — Evidencia

### 3.1 Comando y salida

```text
Comando : npm run test
Salida  :
  ── Tests de Node (3 archivo(s)) ──
    ✅ apps/pos/src/theme/theme.test.js
    ✅ apps/pos/src/utils/utilidades.test.js
    ✅ packages/theme-engine/theme-engine.test.js
  ── Tests de componentes React (Vitest) ──
    ✅ vitest — todos los tests de componentes pasaron.   (8 tests)
  ── Tests de la API (pytest en Docker) ──
    ⚠️  OMITIDO — el contenedor `api` no está arriba.
  ════════════════════════════════════════════════════════
    Tests de Node      : 3/3 archivo(s) en verde
    Tests de componentes: PASA
    Tests de API       : OMITIDO
    ✅ RESULTADO: TODOS LOS TESTS EN VERDE.
Resultado: PASA (exit 0)
```

### 3.2 Criterios de la puerta (del plan §4 FASE 3.1)

| Criterio del plan | Test que lo prueba | Estado |
|---|---|---|
| `withRetries` reintenta 3 veces con backoff 1s/2s/3s | `withRetries reintenta 3 veces con backoff 1s/2s/3s` | ✅ |
| `withRetries` es idempotente (2× = mismo estado) | `withRetries es idempotente (2× = mismo estado)` | ✅ |
| `outcome` discrimina éxito de fallo sin asumir excepción | `aOutcome() NUNCA lanza` + `esOk() discrimina` | ✅ |
| `sessionReset` limpia EXACTAMENTE los mismos refs en toda rama | `resetearSesion limpia EXACTAMENTE los mismos refs en toda rama` | ✅ |
| `useBeforeUnload` registra sendBeacon y lo limpia al desmontar | `registra sendBeacon...` + `limpia el listener al desmontar` | ✅ |
| `useNetworkHealth` expone banner fijo + botón bloqueado | `expone banner fijo + botón bloqueado cuando la red cae` | ✅ |

### 3.3 Prueba negativa (OBLIGATORIA)

Se creó un test temporal que falla a propósito:

```text
Comando : npm run test   (con apps/pos/src/utils/__prueba_negativa__.test.js presente)
Salida  :
    ✅ apps/pos/src/theme/theme.test.js
    ✅ apps/pos/src/utils/utilidades.test.js
    ❌ apps/pos/src/utils/__prueba_negativa__.test.js  (exit 1)
         ❌ FALLO INTENCIONAL — el runner debe salir con código 1
    ✅ packages/theme-engine/theme-engine.test.js
  ════════════════════════════════════════════════════════
    Tests de Node : 3/4 archivo(s) en verde
    ❌ RESULTADO: 1 test(s) fallaron.
Resultado: FALLA (exit 1)  ← CORRECTO
```

El archivo temporal fue **borrado** tras la prueba (verificado: `utils/` solo contiene
`outcome.js`, `terminalCardState.js`, `utilidades.test.js`, `withRetries.js`).

---

## 4. Defecto detectado y corregido durante 3.1 (D-8)

| # | Defecto | Gravedad | Evidencia | Corrección |
|---|---|---|---|---|
| **D-8** | **El runner de 3.0 ejecutaba `.jsx` como Node.** `NODE_TEST_RE` incluía `jsx`, pero Node no entiende JSX → `ERR_UNKNOWN_FILE_EXTENSION`. Al añadir el primer test `.jsx` (hooks), el runner falló con un falso negativo. | Media | Salida de `npm run test` con `hooks.test.jsx` presente | [`scripts/test.mjs:35`](../../scripts/test.mjs:35) — regex ahora es `/\.(test\|spec)\.(js\|mjs\|cjs)$/`; los `.jsx` van solo a Vitest |

**Nota:** este defecto **no existía en 3.0** porque no había ningún `.test.jsx`. Se
manifestó al introducir el primer test de hook. Es exactamente el tipo de fallo que la
puerta de 3.0 debía atrapar — y lo atrapó.

---

## 5. Deuda registrada (no bloqueante)

| # | Deuda | Origen | Candidato |
|---|---|---|---|
| **D-7** | `guards.mjs` no excluye `dist/` ni archivos de test, y no reconoce `TODO(scope)` | Detectado en 3.0 | 3.0-bis o dentro de 3.4 |

---

## 6. Criterios de cierre

- [x] Los 5 archivos existen y exportan lo especificado en el plan.
- [x] 17 tests de utilidades puras en verde.
- [x] 8 tests de hooks React en verde (Vitest).
- [x] `npm run test` sale con código 0.
- [x] Prueba negativa: `npm run test` sale con código 1 ante un test que falla.
- [x] Archivo temporal de prueba negativa eliminado.
- [x] Defecto D-8 (runner ejecutaba `.jsx`) corregido y documentado.

**PUERTA 3.1: EN VERDE.**

---

*Ficha de evidencia de la Fase 3.1. Alineada al Plan de Abordaje v1.2 §4 FASE 3.1.*
