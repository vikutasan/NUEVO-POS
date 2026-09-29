# 📋 FICHA DE EVIDENCIA — FASE 3.0 (Runner de tests real)

> **Fecha:** 29 Sep 2026
> **Sub-fase:** 3.0 — Prerrequisito: runner de tests real
> **Plan:** [`PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md:195) §4 FASE 3.0
> **Estado:** ✅ **PUERTA EN VERDE**
> **Defecto que corrige:** D-3 (puertas con un runner que no existe)

---

## 1. Qué se construyó

| Archivo | Cambio | Estado |
|---|---|---|
| [`scripts/test.mjs`](../../scripts/test.mjs:1) | Reemplazado el stub F0 (que solo contaba archivos y siempre hacía `exit 0`) por un runner real que **ejecuta** los tests y **falla** si alguno falla | ✅ |
| [`apps/pos/package.json`](../../apps/pos/package.json:7) | Añadido script `"test": "vitest run"` + devDeps `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` | ✅ |
| [`apps/pos/vitest.config.js`](../../apps/pos/vitest.config.js:1) | **Nuevo** — entorno `jsdom`, `globals: true`, `passWithNoTests: true`, `include: src/**/*.test.{jsx,tsx}` | ✅ |

---

## 2. Diseño del runner

El runner ejecuta **tres bloques** y falla si cualquiera falla:

| # | Bloque | Cómo | Cuándo |
|---|---|---|---|
| 1 | **Tests de Node** | Cada `*.test.js` / `*.test.mjs` se corre como subproceso `node <archivo>` | Siempre |
| 2 | **Tests de componentes React** | `npm run test` (Vitest) dentro de `apps/pos` | Solo si hay `*.test.jsx` |
| 3 | **Tests de la API** | `docker compose exec -T api pytest -q` | Solo si el contenedor `api` está arriba |

**Decisión de diseño clave:** los tests existentes (`theme.test.js`, `theme-engine.test.js`) son **scripts de Node a mano** (usan su propio `test()`/`assert()` y `process.exit`), NO son tests de Vitest. Por eso el runner los ejecuta como subprocesos, y Vitest queda como la vía para los tests **nuevos** de componentes React (sub-fases 3.3 y 3.4). Así no hay doble ejecución ni falsos positivos.

**Honestidad de cobertura:** cuando un bloque no aplica (sin tests `.jsx`, o Docker abajo), se reporta **OMITIDO**, nunca como verde. Esto respeta E-14 ("evidencia, no opinión").

---

## 3. Puerta 3.0 — Evidencia

### 3.1 Comando y salida (árbol limpio)

```text
Comando : npm run test
Salida  :
  ── Tests de Node (2 archivo(s)) ──
    ✅ apps/pos/src/theme/theme.test.js
    ✅ packages/theme-engine/theme-engine.test.js
  ── Tests de componentes React (Vitest) ──
    ⚠️  OMITIDO — no hay tests de componentes (*.test.jsx) todavía.
  ── Tests de la API (pytest en Docker) ──
    ⚠️  OMITIDO — el contenedor `api` no está arriba.
  ════════════════════════════════════════════════════════
    Tests de Node      : 2/2 archivo(s) en verde
    Tests de componentes: OMITIDO (sin tests .jsx aún)
    Tests de API       : OMITIDO
    ✅ RESULTADO: TODOS LOS TESTS EN VERDE.
Resultado: PASA (exit 0)
```

### 3.2 Prueba negativa — bloque Node (OBLIGATORIA)

Se creó un test temporal que falla a propósito:

```text
Comando : npm run test   (con apps/pos/src/__prueba_negativa__.test.js presente)
Salida  :
    ✅ apps/pos/src/theme/theme.test.js
    ❌ apps/pos/src/__prueba_negativa__.test.js  (exit 1)
         (prueba negativa) este test falla a propósito
    ✅ packages/theme-engine/theme-engine.test.js
  ════════════════════════════════════════════════════════
    Tests de Node : 2/3 archivo(s) en verde
    ❌ RESULTADO: 1 test(s) fallaron.
Resultado: FALLA (exit 1)  ← CORRECTO
```

El archivo temporal fue **borrado** tras la prueba.

### 3.3 Prueba negativa — bloque Vitest (OBLIGATORIA)

Se creó un test de componente temporal que falla a propósito:

```text
Comando : npm run test   (en apps/pos, con __prueba_negativa__.test.jsx presente)
Salida  :
    ❯ src/__prueba_negativa__.test.jsx (1 test | 1 failed)
      × prueba negativa de Vitest > falla a propósito
        → expected 1 to be 2 // Object.is equality
    Test Files  1 failed (1)
         Tests  1 failed (1)
Resultado: FALLA (exit 1)  ← CORRECTO
```

El archivo temporal fue **borrado** tras la prueba.

---

## 4. Hallazgo colateral: `npm run guards` está en ROJO (PRE-EXISTENTE)

Al correr `npm run ci` (lint + test + guards) se detectó que **`npm run guards` falla**, pero **NO por causa de la Fase 3.0**. Se verificó con `git stash` que el fallo existe **idéntico en el árbol limpio** (commit `8801c58`).

| Grep | Coincidencias | Causa raíz |
|---|---|---|
| E-15 `console.log` | 24 | Los archivos de test usan `console.log` para reportar; el guard **no excluye archivos de test** |
| E-15 `TODO` sin `TODO:` | 2 | [`App.jsx:12`](../../apps/pos/src/App.jsx:12) usa `TODO(integración)`, que el guard no reconoce |
| R-01 ancho fijo | 4 | El guard escanea `apps/pos/dist/` (artefacto de build); **no excluye `dist/`** |

> **Conclusión:** es un defecto del **guard** (familia D-3: "una puerta que no mide lo que dice medir"), no del runner. La Fase 3.0 **no lo introduce ni lo empeora**.
>
> **No se corrigió aquí** para no expandir el alcance de 3.0. Se registra como **defecto D-7** propuesto para una sub-fase de saneamiento de guards (candidata: 3.0-bis o dentro de 3.4, que ya usa `npm run guards` como puerta).

---

## 5. Criterio de cierre de la Fase 3.0

| Criterio | Estado |
|---|---|
| `npm run test` ejecuta tests reales (no cuenta archivos) | ✅ |
| El runner **falla (exit 1)** cuando un test de Node falla | ✅ (prueba negativa 3.2) |
| El runner **falla (exit 1)** cuando un test de Vitest falla | ✅ (prueba negativa 3.3) |
| El contrato `npm run test` no cambió | ✅ (sigue siendo el comando de CI) |
| Vitest queda disponible para 3.3/3.4 | ✅ |
| Los bloques no aplicables se reportan OMITIDO, no verde | ✅ |

**PUERTA 3.0: EN VERDE.** Se puede avanzar a la Fase 3.1 (utilidades transversales).

---

## 6. Deuda registrada (no bloquea 3.0)

| # | Deuda | Severidad | Dónde se paga |
|---|---|---|---|
| D-7 | `guards.mjs` no excluye `dist/` ni archivos de test, y no reconoce `TODO(scope)` | Media | Sub-fase de saneamiento (3.0-bis o 3.4) |
| — | El contenedor `api` no estaba arriba durante la verificación → pytest OMITIDO | Baja | Levantar `docker compose up -d` antes de la puerta 3.2 |

---

*Ficha de evidencia de la Fase 3.0. Generada el 29 Sep 2026. Alineada al Plan de Abordaje v1.2 §4.*
