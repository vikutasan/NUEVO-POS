# FICHA DE CIERRE — FASE 7 (Voz + Visión IA + Selector de Temas)

> **Fase:** 7 — Voz + Visión IA + Selector de Temas
> **Plan de abordaje:** `PLAN_DE_ABORDAJE_FASE_7_POR_PARTES.md` (v1.1, 543 líneas)
> **Sub-fases:** F7.0, F7.1, F7.2, F7.3, F7.4
> **Estado:** CERRADA — gates en verde, suite completa en verde, guards 7/7
> **Fecha de cierre:** 2026-09-29

---

## 1. Resumen de las 5 sub-fases ejecutadas

La Fase 7 se ejecutó **de adentro hacia afuera**: primero los **contratos**
(F7.0, sin UI), luego los tres entregables de UI (temas, voz, visión), y
finalmente el cierre. Cada sub-fase cerró con gate en verde, suite completa,
guards 7/7, ficha propia, commit y push. **No se abrió una sub-fase sin cerrar
la anterior.**

| Sub-fase | Qué construyó | Archivos | Gate | Commit |
|---|---|---|---|---|
| **F7.0** | Contratos 24 (`ia.transcribir_voz`) y 25 (`ia.interpretar_intencion`) declarados + test F2 23→25 | `apps/api/contracts/registry.py` + `apps/api/tests/test_f2_frontera.py` + `FICHA_F7_0_CONTRATOS_IA.md` | 6 criterios / 13 tests | `3bfe309` |
| **F7.1** | Selector de Temas (Entregable A): motor de temas cableado + UI | `apps/pos/src/hooks/useTheme.js` + `apps/pos/src/components/ThemeSelector.jsx` + gates + `FICHA_F7_1_TEMAS.md` | 9 criterios / 25 tests | `7a01aca` |
| **F7.2** | Voz (Entregable B): mapper + config + hook + panel | `apps/pos/src/utils/voiceCartMapper.js` + `apps/pos/src/config/voz.js` + `apps/pos/src/hooks/useVoiceCart.js` + `apps/pos/src/components/VoiceCartPanel.jsx` + gates + `FICHA_F7_2_VOZ.md` | 11 criterios / 47 tests | `19b45ac` |
| **F7.3** | Visión cenital (Entregable C): hook + visor persistente | `apps/pos/src/config/vision.js` + `apps/pos/src/hooks/useVision.js` + `apps/pos/src/components/VisionVisor.jsx` + gates + `FICHA_F7_3_VISION.md` | 11 criterios / 26 tests | `e697ee7` |
| **F7.4** | Ficha de cierre de la fase (este documento) | `docs/05-plan-de-construccion/FICHA_F7_CIERRE.md` | — | (este commit) |

**Total de tests nuevos de la fase:** 13 + 25 + 47 + 26 = **111 tests**.
**Suite completa al cierre:** **225 tests de API + 111 de la fase**, todos en verde.

---

## 2. Los 3 entregables y su naturaleza arquitectónica

La aclaración del dueño (29 Sep 2026) fue decisiva: **los temas son del POS;
la voz y la visión son del Centro de IA**. Eso separó la Fase 7 en **3
entregables con dueños distintos**:

| Entregable | Sub-fase | ¿Quién lo posee? | ¿Cómo lo consume el POS? |
|---|---|---|---|
| **A — Selector de Temas** | F7.1 | El POS (motor propio en `packages/theme-engine/`) | Directo (import del motor) |
| **B — Voz** | F7.2 | El Centro de IA | Por **contratos 24 y 25** |
| **C — Visión cenital** | F7.3 | El Centro de IA | Por **contrato 17** |

**Consecuencia:** los entregables B y C **no implementan IA**. Solo **declaran
contratos** (F7.0) y los **consumen** (F7.2/F7.3). Cuando el Centro de IA se
construya, el POS **no se toca**: solo cambia quién implementa el contrato.

---

## 3. La frontera, respetada (A-02 / DT-07)

Fase 7 es la primera que **cruza la frontera** del POS. Lo hace sin violarla:

- El POS **no importa** `@google/generative-ai` (corrige **H-3**, el defecto del
  POS viejo que llamaba a Gemini).
- El POS **no importa** `torch`, `whisper`, `ultralytics` ni `tesseract`.
- El POS **no importa** nada de `apps/ai/`.
- El POS habla con el Centro de IA **solo** por los contratos 17, 24 y 25.
- Si el Centro de IA no existe todavía, el POS **degrada** (`disponible = false`)
  y sigue operando en modo manual.

Esto es exactamente lo que pidió el dueño: **dejar todo preparado** para que,
cuando el Centro de IA se construya, el POS se integre **sin tocar una línea**.

---

## 4. El patrón de degradación (DT-07) aplicado a las 3 sub-fases

| Sub-fase | Si el proveedor falla | Qué ve el operador | ¿Se bloquea la venta? |
|---|---|---|---|
| **F7.1** (temas) | El tema no carga | El motor cae al default del módulo (ya implementado) | **No** |
| **F7.2** (voz) | Contrato 24/25 devuelve 503 | `disponible=false`; el POS sigue en modo manual | **No** |
| **F7.3** (visión) | Contrato 17 devuelve 503 | "IA no disponible"; el POS sigue en modo manual | **No** |

En los tres casos, **la venta nunca se bloquea**. Esa es la regla de oro de
DT-07.

---

## 5. La aclaración del hardware de visión (DT-08) y por qué cambió F7.3

El dueño aclaró que la visión del POS opera sobre una **cámara cenital con
iluminación dedicada** que elimina las sombras sobre el mostrador. Esto **no es
un detalle de hardware**: cambia el análisis de riesgo de la visión.

- **Antes de la aclaración**, la visión se veía como el entregable de mayor
  riesgo ("adorno"): un operador apuntando con una webcam a cada producto es
  **más lento** que teclear.
- **Después de la aclaración**, la visión es un **"escáner de charola"**: punto
  de vista fijo, iluminación controlada, el operador coloca los productos y el
  sistema los reconoce sin apuntar. Ese es el caso de uso **fuerte**, y **sí
  agiliza** la captura.

**Los 3 ajustes concretos a F7.3 (implementados):**

1. **El umbral 0.35 es de calibración cenital, configurable (DT-08).** No es un
   valor universal. El hook lo lee de `VISION_CONFIG` (0.35 por defecto), no lo
   hardcodea. El Centro de IA lo calibra.
2. **El contrato 17 declara el `modo_captura` (`cenital` | `manual`).** El hook
   envía `modo_captura: 'cenital'`. Así el Centro de IA aplica la calibración
   correcta.
3. **El visor es un flujo persistente, no bajo demanda.** Permanece abierto
   durante la venta (modo "escáner de charola"), no se abre y cierra por
   producto.

**Lo que NO cambió:** la regla de oro (la visión sugiere, nunca decide — RN-74),
la degradación elegante, y la frontera por contrato (A-02).

---

## 6. Tabla de paridad con el POS viejo (`ERP-R-DE-RICO`)

La Fase 7 no reinventó la IA: **portó lo que funcionaba** del POS viejo,
**mejoró** lo que arrastraba deuda técnica, y **añadió** lo que no existía.

| Aspecto | POS viejo (`ERP-R-DE-RICO`) | POS nuevo (Fase 7) | Veredicto |
|---|---|---|---|
| **Selector de temas** | Existía un motor de temas, pero **sin selector de UI** en el POS | `useTheme.js` + `ThemeSelector.jsx` cableados al motor existente | **Mejorado** (el motor ya existía; se le dio UI) |
| **Voz** | `useVoiceCart.js` llamaba **directo a Gemini** (nube) y escribía en el carrito | `useVoiceCart.js` consume contratos 24/25; **propone**, nunca escribe | **Mejorado** (corrige H-3 y la violación de la regla de oro) |
| **Visión** | `VisionScanner.jsx` importaba `@google/generative-ai` y llamaba a `gemini-2.0-flash` | `useVision.js` consume el contrato 17; **cero nube** | **Mejorado** (corrige H-3) |
| **Degradación** | Si la IA caía, el POS viejo se rompía | `disponible=false`; el POS sigue vendiendo | **Mejorado** (DT-07) |
| **Frontera por contratos** | Convención implícita (H-2) | Contratos 17, 24 y 25 declarados y consumidos | **Nuevo** (A-02) |

**Conclusión de paridad:** los tres entregables existen en ambos POS, pero el
nuevo los **desacopla de la nube**, los **sujeta a contratos** y los hace
**degradar sin bloquear la venta**. Esa es la diferencia arquitectónica central.

---

## 7. Trazabilidad regla → sub-fase

| Regla / Directriz | Sub-fase que la cumple |
|---|---|
| **DT-07** (IA por contrato) | F7.0 (declara) + F7.2/F7.3 (consumen) |
| **DT-08** (visión cenital) | F7.3 (criterios 9, 10 y 11 del gate) |
| **A-02** (frontera por contratos) | F7.0 (cierra la brecha de H-2) |
| **RN-71** (motor ORB) | F7.3 (el motor vive en el Centro de IA) |
| **RN-72** (umbral 0.35) | F7.3 (criterio 4 del gate) |
| **RN-73** (etiquetado por SKU) | F7.3 (criterio 5 del gate) |
| **RN-74** (visión asistiva) | F7.3 (criterio 6 del gate) |
| **R-03** (3 modos) | F7.1, F7.2, F7.3 (criterios de gate) |
| **R-04** (target ≥44px) | F7.1, F7.2, F7.3 (criterios de gate) |
| **A-01** (regla con su test) | F7.2 (el mapper se porta con su test) |
| **DT-06** (Vista General) | F7.1 (identidad=null hasta que exista) |

---

## 8. Defectos reales encontrados y corregidos durante la fase

| # | Defecto | Sub-fase | Cómo se corrigió |
|---|---|---|---|
| **D-1** | El POS viejo llamaba a **Gemini** desde el navegador (H-3). | F7.2 / F7.3 | Se sustituyó por consumo de contratos 24/25 (voz) y 17 (visión). Cero nube. |
| **D-2** | La voz del POS viejo **escribía en el carrito** sin confirmación. | F7.2 | El hook solo produce una `propuesta`; el botón "Agregar" está deshabilitado hasta confirmar (H-5). |
| **D-3** | El POS viejo **no degradaba**: si la IA caía, se rompía. | F7.2 / F7.3 | `disponible=false` + banner; el POS sigue vendiendo (DT-07). |
| **D-4** | El umbral de visión se asumía universal. | F7.3 | Se movió a `VISION_CONFIG` (configurable); DT-08 lo documenta como calibración cenital. |
| **D-5** | El contrato 17 no distinguía el modo de captura. | F7.3 | Se añadió `modo_captura` (`cenital` | `manual`); el hook envía `cenital` (DT-08). |
| **D-6** | La visión se diseñaba como captura bajo demanda (apuntar). | F7.3 | Se cambió a **flujo persistente** ("escáner de charola") tras la aclaración del hardware (DT-08). |
| **D-7** | El gate de F7.3 (criterio 2) hacía un grep ingenuo que coincidía con el **docstring**. | F7.3 | La aserción filtra primero las líneas de `import`/`require`. |
| **D-8** | El gate de F7.3 (criterio 7) usaba una consulta **ambigua** (`IA no disponible` aparecía 2 veces). | F7.3 | Se usa `getAllByText` + aserción sobre el texto único del banner. |

**Lección transversal:** una consulta ambigua en una prueba es un defecto de la
prueba, no del código. Se corrige la prueba, no se debilita la aserción.

---

## 9. Cómo se verificó (evidencia)

Gate de cada sub-fase (todos en verde):

```
F7.0 → 13 tests   (contratos 24/25 + test F2 23→25)
F7.1 → 25 tests   (useTheme + ThemeSelector)
F7.2 → 47 tests   (voiceCartMapper + useVoiceCart + VoiceCartPanel)
F7.3 → 26 tests   (useVision + VisionVisor)
```

Y la puerta completa del proyecto (`npm run ci`) al cierre de F7.3:

```
=== LINT (F0) ===
Archivos en la obra: 208
Lint OK: 0 errores.

── Tests de Node (3 archivo(s)) ──        ✅ 3/3
── Tests de componentes React (Vitest) ── ✅ PASA
── Tests de la API (pytest en Docker) ──  ✅ PASA

[OK] E-05 · A-04 · E-15 · R-01 · E-09 · E-10  → 0 coincidencias
PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE
```

**Cero regresiones.** Los 111 tests nuevos de la fase conviven con los 225 de la
API y los anteriores de componentes sin romper nada.

---

## 10. Qué NO se hizo (y por qué)

- **No se construyó el Centro de IA.** Es otro módulo del ERP, con su propio
  plan. Fase 7 solo **prepara** al POS para consumirlo.
- **No se implementaron los motores de IA** (Whisper, Ollama, YOLO/ORB). Solo se
  declaran contratos y se consumen.
- **No se cablearon el panel de voz ni el visor de visión en
  `RetailVisionPOS.jsx`.** Están construidos y probados, pero su integración en
  la pantalla de venta se hará cuando el Centro de IA exista y devuelva
  propuestas/detecciones reales. Cablearlos ahora sería cablear una UI contra un
  motor que responde `503`.
- **No se portó Gemini** ni ninguna dependencia de nube (corrige H-3).
- **No se implementó `ProgramacionPedidoModal.jsx`** (diferido a Fase 7.5 o
  Fase 8, §12.3 del plan).
- **No se añadieron dependencias nuevas.** El motor de temas ya existía; la voz
  y la visión usan `fetch` nativo.
- **No se modificó el motor de temas** (`packages/theme-engine/`). Solo se
  cableó.

---

## 11. Estado del POS tras la Fase 7

El POS termina la Fase 7 con:

- Un **selector de temas** funcional (Entregable A).
- Un **panel de voz** que propone, nunca ejecuta (Entregable B).
- Un **visor de visión cenital** que sugiere, nunca bloquea (Entregable C).

Los tres **preparados por contrato** para integrarse con el Centro de IA cuando
exista. **La venta nunca se bloquea** por un fallo de IA.

| Fase | Estado |
|---|---|
| Fase 1 — Selector de Terminales | ✅ CERRADA |
| Fase 2 — Sesión y Control de Acceso | ✅ RESUELTA POR EL ERP |
| Fase 3 — POS Completo | ✅ CERRADA |
| Fase 4 — Gestor de Caja | ✅ CERRADA |
| Fase 5 — Pizarrón de Cuentas Abiertas | ✅ CERRADA |
| Fase 6 — Impresión + PDF de Catálogo | ✅ CERRADA |
| **Fase 7 — Voz + Visión IA + Selector de Temas** | ✅ **CERRADA** |
| Fase 8 — Integración con CRM y Notificaciones | ⏳ Pendiente |

---

## 12. Commit

- **Hash:** `PENDIENTE`
- **Mensaje:** `docs(f7.4): cierre de la Fase 7 — voz, visión y temas por contrato`
- **Archivos:** 1 (esta ficha)
- **Push:** `PENDIENTE` → `origin/main`
