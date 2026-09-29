# FICHA F7.3 — La visión cenital que sugiere, nunca la que decide

> **Fase:** 7 (Voz + Visión IA + Selector de Temas) — Sub-fase **7.3**
> **Estado:** ✅ CERRADA — puerta en verde
> **Fecha:** 2026-09-29
> **Commit:** `PENDIENTE` — `feat(f7.3): visión cenital por contrato (17) — cero nube, el POS sugiere`
> **Plan de abordaje:** [`PLAN_DE_ABORDAJE_FASE_7_POR_PARTES.md`](../../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_7_POR_PARTES.md) §8
> **Directriz transversal:** [`DIRECTRICES_TRANSVERSALES_DEL_ERP.md`](../../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/DIRECTRICES_TRANSVERSALES_DEL_ERP.md) §6.7 (**DT-08**)
> **Entregable:** **C — Visión** (el POS consume el Centro de IA **por contrato 17**)

---

## 1. Por qué existe esta sub-fase

El POS viejo tenía visión. Funcionaba, pero estaba **cableada a la nube**:
`VisionScanner.jsx` importaba `@google/generative-ai` y llamaba a
`gemini-2.0-flash` directamente desde el navegador. Tres problemas de fondo:

1. **Acoplamiento a la nube (H-3).** El viejo POS hablaba con Gemini. El nuevo
   POS **no puede** hacer eso: la IA vive en el **Centro de IA** (`apps/ai/`), y
   el POS la consume **por contrato** (**DT-07**). El contrato 17
   (`vision.reconocer_producto`) ya estaba declarado desde F7.0.
2. **La visión tocaba el carrito.** Eso viola la regla de oro: **la visión
   propone, el humano dispone**. Un falso positivo no puede meter un producto
   equivocado a una venta (**RN-74**).
3. **Sin degradación.** Si el motor de visión caía, el POS viejo se rompía. El
   nuevo POS debe seguir vendiendo aunque la IA no exista.

F7.3 corrige los tres. Es la segunda sub-fase de Fase 7 que **cruza la
frontera** (tras F7.2), y la que más se beneficia de la aclaración del dueño
sobre la **cámara cenital** (documentada como **DT-08**).

---

## 2. La aclaración del dueño que cambió el diseño (DT-08)

El dueño aclaró que la visión **no** es una cámara de mano apuntando a cada
producto, sino una **cámara cenital** (montaje fijo sobre el mostrador) con
**iluminación especial para evitar sombras**. Esa aclaración cambió el análisis
por completo y produjo **tres ajustes** que F7.3 implementa:

| Ajuste | Qué cambió | Dónde vive |
|---|---|---|
| **1. Umbral calibrado y configurable** | El 0.35 **no es universal**: es la calibración del montaje cenital. Se lee de configuración, no se hardcodea. | `config/vision.js` → `VISION_CONFIG.umbralConfianza` |
| **2. `modo_captura` en el contrato** | El contrato 17 ahora distingue `cenital` de `manual`. El POS declara `cenital`. | `useVision.js` → `modo_captura: 'cenital'` |
| **3. Flujo persistente ("escáner de charola")** | El visor **no** se cierra por producto: permanece abierto y muestrea el mostrador. | `useVision.js` → `setInterval(analizarFrame, 1500)` |

Estos tres ajustes se convirtieron en los **criterios 9, 10 y 11** de la puerta
de F7.3 (ver §5).

---

## 3. Qué se construyó (3 archivos de código + 2 puertas)

### 3.1 `apps/pos/src/config/vision.js` — NUEVO (configuración centralizada)

La configuración del subsistema de visión. **Decisión clave:** el umbral de
confianza vive aquí, **no** en el hook, porque es la calibración del montaje
cenital (DT-08) y debe poder recalibrarse sin tocar el código.

Expone:

| Constante | Valor | Qué es |
|---|---|---|
| `UMBRAL_CONFIANZA_POR_DEFECTO` | `0.35` | Umbral calibrado para el montaje cenital (RN-72). |
| `MODO_CAPTURA_CENITAL` | `'cenital'` | Modo declarado al contrato 17 (DT-08). |
| `TOP_K_POR_DEFECTO` | `3` | Candidatos máximos pedidos al contrato. |
| `INTERVALO_CAPTURA_MS` | `1500` | Intervalo del visor persistente. |
| `VISION_CONFIG` | `Object.freeze({...})` | Configuración completa, congelada. |

### 3.2 `apps/pos/src/hooks/useVision.js` — NUEVO (el hook por contrato)

El hook que abre la cámara, captura frames y consulta el contrato 17 —
**siempre por contrato, nunca por nube**:

- **Contrato 17** (`vision.reconocer_producto` → `POST /vision/predict`):
  `frame_base64` + `channel` + `top_k` + `modo_captura` → `detecciones`.

Reglas que respeta:

- **Nunca toca el carrito.** Solo produce `sugerencias`. El carrito lo escribe
  el humano, tras decidir (**RN-74** / **H-5**).
- **Umbral configurable (DT-08):** lee `umbral` de `VISION_CONFIG`, no lo
  hardcodea. Descarta detecciones por debajo (**RN-72**).
- **Resolución por SKU (RN-73):** `resolverPorSku` + `filtrarYResolver` cruzan
  cada detección contra el catálogo POS por SKU.
- **Flujo persistente (DT-08):** `iniciar()` abre `getUserMedia` y arranca un
  `setInterval(analizarFrame, 1500)`. El visor **no** se cierra por producto.
- **Degradación elegante:** si no hay cámara **o** el motor responde
  `503 IA_NO_DISPONIBLE` (o fallo de red → `status:0`), el hook expone
  `disponible = false` y **el POS sigue vendiendo**. Un fallo de visión jamás
  bloquea una venta (**DT-07**).
- **Sin excepciones hacia arriba:** `llamarContrato` devuelve siempre
  `{ok, status, data}` y **nunca lanza**.

Expone: `activo`, `analizando`, `sugerencias`, `disponible`, `error`,
`modeloVersion`, `umbral`, `modoCaptura`, `videoRef`, `canvasRef`, `iniciar`,
`detener`, `alternar`, `analizarFrame`, `limpiarSugerencias`.

### 3.3 `apps/pos/src/components/VisionVisor.jsx` — NUEVO (la UI)

El visor cenital. Presentación pura: recibe estado y callbacks por props.

- **R-03:** overlay a pantalla completa, visible en los 3 modos (mostrador /
  compacto / móvil) — `max-w-3xl` + `max-h-[80vh]` con scroll interno, nunca un
  ancho fijo en px.
- **R-04:** todo control táctil usa `min-h-tactil` (≥44px).
- **Sugerencia explícita:** cada detección tiene su propio botón "➕ Agregar",
  **deshabilitado** si el SKU no está en el catálogo. La visión propone; el
  humano decide.
- **Flujo persistente (DT-08):** el visor permanece abierto entre detecciones;
  el operador lo cierra explícitamente.
- **Degradación visible:** banner ámbar "⚠️ IA no disponible. Usa la captura
  manual." cuando `disponible = false`.

### 3.4 Las 2 puertas (gates)

| Puerta | Archivo | Criterios | Tests |
|---|---|---|---|
| Hook | `src/hooks/useVision.f7_3.test.jsx` | 1–5, 9, 10 + flujo persistente | 15 |
| Visor | `src/components/VisionVisor.f7_3.test.jsx` | 6–8, 11 | 11 |
| **Total** | | **11** | **26** |

---

## 4. La frontera, respetada

F7.3 cruza la frontera del POS sin violarla:

- El POS **no importa** `@google/generative-ai` (el defecto H-3 del viejo POS).
- El POS **no importa** `torch`, `ultralytics` ni ningún motor de visión.
- El POS **no importa** nada de `apps/ai/`.
- El POS habla con el Centro de IA **solo** por el contrato 17.
- Si el Centro de IA no existe todavía, el POS **degrada** a
  `disponible = false` y sigue operando en modo manual.

---

## 5. Los 11 criterios de la puerta

| # | Criterio | Qué verifica |
|---|---|---|
| 1 | Contrato 17 | El hook consume `POST /vision/predict` con la firma declarada. |
| 2 | Cero nube | El hook **no** importa `@google/generative-ai` ni ningún SDK de nube. |
| 3 | Degradación 503 | Un `503` (o fallo de red) expone `disponible = false`. |
| 4 | Umbral 0.35 | Las detecciones por debajo del umbral se descartan (RN-72). |
| 5 | Resolución por SKU | Cada detección se resuelve contra el catálogo por SKU (RN-73). |
| 6 | Sugiere, no agrega | El visor **nunca** agrega al carrito por sí solo (RN-74). |
| 7 | "IA no disponible" | El banner de degradación aparece y ofrece captura manual. |
| 8 | R-03 / R-04 | Overlay responsivo + controles táctiles ≥44px. |
| 9 | `modo_captura: 'cenital'` | El hook declara el modo cenital al contrato (DT-08). |
| 10 | Umbral configurable | El umbral se lee de `VISION_CONFIG`, no está hardcodeado (DT-08). |
| 11 | Visor persistente | El visor permanece abierto entre detecciones (DT-08). |

---

## 6. Defectos reales encontrados y corregidos durante la puerta

**Defecto 1 — grep ingenuo sobre el fuente.** El criterio 2 leía el fuente de
`useVision.js` y afirmaba `not.toMatch(/@google\/generative-ai/)`, pero el
**docstring** del archivo menciona `@google/generative-ai` precisamente para
decir que **no** se usa. La prueba fallaba por un falso positivo del propio
comentario.

**Corrección:** la aserción ahora **filtra primero** las líneas de
`import`/`require` y solo entonces verifica que ninguna dependencia de nube
aparezca:

```js
const lineasDeImport = fuente
  .split('\n')
  .filter((l) => /^\s*(import|const\s+\w+\s*=\s*require)/.test(l));
expect(lineasDeImport.join('\n')).not.toMatch(/@google\/generative-ai/);
```

**Defecto 2 — consulta ambigua.** El criterio 7 usaba
`getByText(/IA no disponible/i)`, que encontraba **dos** elementos: el banner
ámbar (`⚠️ IA no disponible. Usa la captura manual.`) y el indicador de estado
(`IA no disponible`).

**Corrección:** se usa `getAllByText` para el texto repetido y se afirma sobre
el texto **único** del banner (`/Usa la captura manual/i`).

**Lección:** una consulta ambigua en una prueba es un defecto de la prueba, no
del código. Se corrige la prueba, no se debilita la aserción.

---

## 7. Cómo se verificó (evidencia)

```
npx vitest run src/hooks/useVision.f7_3.test.jsx \
               src/components/VisionVisor.f7_3.test.jsx

 ✓ src/hooks/useVision.f7_3.test.jsx        (15 tests)
 ✓ src/components/VisionVisor.f7_3.test.jsx (11 tests)

 Test Files  2 passed (2)
      Tests  26 passed (26)
```

Y la puerta completa del proyecto (`npm run ci`):

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

**Cero regresiones.** Las 26 pruebas nuevas conviven con las 225 de la API y
las anteriores de componentes sin romper nada.

---

## 8. Qué NO se hizo (y por qué)

- **No se tocó el Centro de IA.** No existe todavía. F7.3 solo **prepara** al
  POS para consumirlo.
- **No se cableó el visor en `RetailVisionPOS.jsx`.** El visor está construido
  y probado, pero su integración en la pantalla de venta se hará cuando el
  Centro de IA exista y devuelva detecciones reales. Cablearlo ahora sería
  cablear una UI contra un motor que responde `503`.
- **No se portó la dependencia de Gemini.** El viejo POS llamaba a la nube; el
  nuevo POS **jamás** lo hará. Esa es la diferencia arquitectónica central
  (corrige H-3).
- **No se implementó el motor de visión.** El motor (ORB, RN-71) vive en el
  Centro de IA, no en el POS.

---

## 9. Estado de la Fase 7 tras F7.3

| Sub-fase | Entregable | Estado |
|---|---|---|
| F7.0 | Contratos 24 y 25 declarados | ✅ CERRADA |
| F7.1 | Selector de Temas (Entregable A) | ✅ CERRADA |
| F7.2 | Voz (Entregable B) | ✅ CERRADA |
| **F7.3** | **Visión cenital (Entregable C)** | ✅ **CERRADA** |
| F7.4 | Cierre de Fase 7 | ⏳ Pendiente |

---

## 10. Commit

- **Hash:** `PENDIENTE`
- **Mensaje:** `feat(f7.3): visión cenital por contrato (17) — cero nube, el POS sugiere`
- **Archivos:** 6 (3 nuevos de código + 2 puertas + esta ficha)
- **Push:** `PENDIENTE` → `origin/main`
