# FICHA F7.2 — La voz que propone, nunca la que decide

> **Fase:** 7 (Voz + Visión IA + Selector de Temas) — Sub-fase **7.2**
> **Estado:** ✅ CERRADA — puerta en verde
> **Fecha:** 2026-09-29
> **Commit:** `19b45ac` — `feat(f7.2): voz por contrato (24/25) — el POS propone, el humano dispone`
> **Plan de abordaje:** [`PLAN_DE_ABORDAJE_FASE_7_POR_PARTES.md`](../../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_7_POR_PARTES.md) §7
> **Entregable:** **B — Voz** (el POS consume el Centro de IA **por contrato**)

---

## 1. Por qué existe esta sub-fase

El POS viejo tenía voz. Funcionaba, pero estaba **cableada a la nube y al
carrito**: el hook `useVoiceCart` llamaba directamente a Gemini, y el panel
escribía en el carrito sin pedir permiso. Tres problemas de fondo:

1. **Acoplamiento a la nube.** El viejo POS hablaba con un proveedor externo.
   El nuevo POS **no puede** hacer eso: la IA vive en el **Centro de IA**
   (`apps/ai/`), y el POS la consume **por contrato** (**DT-07**).
2. **La voz tocaba el carrito.** Eso viola la regla de oro: **la voz propone,
   el humano dispone**. Un error de transcripción no puede meter un producto
   equivocado a una venta.
3. **Sin degradación.** Si el motor de voz caía, el POS viejo se rompía. El
   nuevo POS debe seguir vendiendo aunque la IA no exista.

F7.2 corrige los tres. Es la primera sub-fase de Fase 7 que **cruza la
frontera**: el POS deja de ser autosuficiente y empieza a consumir el Centro
de IA — pero **solo por los contratos 24 y 25** declarados en F7.0.

---

## 2. Qué se construyó (4 archivos de código + 3 puertas)

### 2.1 `apps/pos/src/utils/voiceCartMapper.js` — NUEVO (lógica pura, portada)

El mapeador de intención → propuesta de carrito. Es **lógica pura**: no toca
red, no toca DOM, no toca el carrito. Portado del viejo POS **con su prueba**
(**A-01**), con dos correcciones:

- **Alias de intención:** acepta tanto `intent` (nombre del contrato 25) como
  `intencion` (nombre interno), para no romper si el Centro de IA cambia el
  vocabulario.
- **`entidades`:** el contrato 25 devuelve `entidades`; el mapeador las
  interpreta (SKU, cantidad, unidad) sin asumir una forma rígida.

Expone:

| Función | Qué hace |
|---|---|
| `POS_VOICE_INTENTS` | El catálogo de intenciones que el POS entiende. |
| `resolverProductoPorVoz(skuRaw, productos)` | Resuelve un SKU dictado contra el catálogo real. |
| `mapVoiceIntentToCartProposal(intent, productos)` | Convierte la salida del contrato 25 en una **propuesta**. |
| `validateVoiceCartProposal(proposal)` | Valida la propuesta antes de ofrecerla. |
| `buildCartItemsFromProposal(proposal)` | Construye las líneas de carrito **solo tras confirmación**. |

### 2.2 `apps/pos/src/config/voz.js` — NUEVO (configuración centralizada)

Porta `VOZ_CONFIG`, `ETIQUETA_PARAMETRO_VOZ` e `INTENCIONES_POR_MODULO` del
viejo `apps/ai/utils/aiCenterConstants.js`. **Decisión clave:** el nuevo POS
**no importa nada de `apps/ai/`** — la configuración vive en el POS, y el
Centro de IA es un vecino al que se le habla por contrato, no un módulo del que
se depende por import.

### 2.3 `apps/pos/src/hooks/useVoiceCart.js` — NUEVO (el hook por contrato)

El hook que graba, transcribe e interpreta — **siempre por contrato**:

- **Contrato 24** (`ia.transcribir_voz` → `POST /ai/voice/transcribe`):
  audio → texto.
- **Contrato 25** (`ia.interpretar_intencion` → `POST /ai/voice/parse-intent`):
  texto → intención + entidades.

Reglas que respeta:

- **Nunca toca el carrito.** Solo produce una `propuesta`. El carrito lo
  escribe el humano, tras confirmar (**H-5**).
- **Allowlist de intenciones (H-6):** solo `AGREGAR_ITEM` se traduce a
  propuesta. Cualquier otra intención se marca como "no entendida".
- **Umbral de confianza 0.7:** por debajo, la propuesta se marca `revisar`.
- **Degradación elegante:** si no hay soporte de audio **o** el motor responde
  `503 IA_NO_DISPONIBLE`, el hook expone `disponible = false` y **el POS sigue
  vendiendo**. Un fallo de voz jamás bloquea una venta (**DT-07**).
- **Sin excepciones hacia arriba:** todo se resuelve con el contrato
  `{outcome, reason}` (`utils/outcome.js`).

### 2.4 `apps/pos/src/components/VoiceCartPanel.jsx` — NUEVO (la UI)

El panel de voz. Presentación pura: recibe estado y callbacks por props.

- **R-03:** respeta los 3 modos de layout (mostrador / compacto / móvil).
- **R-04:** todo control táctil usa `min-h-tactil` (≥44px).
- **Confirmación explícita:** el botón "Agregar al carrito" está **deshabilitado**
  hasta que el operador marca la casilla de confirmación. La voz propone; el
  humano confirma.

### 2.5 Las 3 puertas (gates)

| Puerta | Archivo | Criterios | Tests |
|---|---|---|---|
| Mapeador | `src/utils/voiceCartMapper.f7_2.test.jsx` | 1–5 | 22 |
| Hook | `src/hooks/useVoiceCart.f7_2.test.jsx` | 6–9 | 9 |
| Panel | `src/components/VoiceCartPanel.f7_2.test.jsx` | 10–11 | 16 |
| **Total** | | **11** | **47** |

---

## 3. La frontera, respetada

F7.2 es la primera sub-fase que **cruza la frontera** del POS. Lo hace sin
violarla:

- El POS **no importa** `torch`, `whisper`, `ultralytics` ni `tesseract`.
- El POS **no importa** nada de `apps/ai/`.
- El POS habla con el Centro de IA **solo** por los contratos 24 y 25.
- Si el Centro de IA no existe todavía (no está construido), el POS **degrada**
  a `disponible = false` y sigue operando.

Esto es exactamente lo que pidió el dueño: **dejar todo preparado** para que,
cuando el Centro de IA se construya, el POS se integre **sin tocar una línea**.

---

## 4. Defecto real encontrado y corregido durante la puerta

**Defecto:** en la primera corrida de la puerta del panel, la aserción
`getByText(/Agregar al carrito/i)` falló porque **dos** elementos coincidían: el
encabezado de la propuesta (`<p>🛒 Agregar al carrito</p>`) y el botón del pie
(`<button>Agregar al carrito</button>`).

**Corrección:** la aserción del encabezado se hizo específica usando el emoji
(`/🛒 Agregar al carrito/i`), que solo tiene el `<p>`. Las aserciones del botón
ya usaban `getByRole('button', ...)`, que es inequívoco.

**Lección:** una consulta ambigua en una prueba es un defecto de la prueba, no
del código. Se corrige la prueba, no se debilita la aserción.

---

## 5. Cómo se verificó (evidencia)

```
npx vitest run src/utils/voiceCartMapper.f7_2.test.jsx \
               src/hooks/useVoiceCart.f7_2.test.jsx \
               src/components/VoiceCartPanel.f7_2.test.jsx

 ✓ src/utils/voiceCartMapper.f7_2.test.jsx   (22 tests)
 ✓ src/components/VoiceCartPanel.f7_2.test.jsx (16 tests)
 ✓ src/hooks/useVoiceCart.f7_2.test.jsx       (9 tests)

 Test Files  3 passed (3)
      Tests  47 passed (47)
```

Y la puerta completa del proyecto (`npm run ci`):

```
=== LINT (F0) ===
Archivos en la obra: 203
Lint OK: 0 errores.

── Tests de Node (3 archivo(s)) ──        ✅ 3/3
── Tests de componentes React (Vitest) ── ✅ PASA
── Tests de la API (pytest en Docker) ──  ✅ PASA

[OK] E-05 · A-04 · E-15 · R-01 · E-09 · E-10  → 0 coincidencias
PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE
```

**Cero regresiones.** Las 47 pruebas nuevas conviven con las 225 de la API y
las anteriores de componentes sin romper nada.

---

## 6. Qué NO se hizo (y por qué)

- **No se tocó el Centro de IA.** No existe todavía. F7.2 solo **prepara** al
  POS para consumirlo.
- **No se cableó el panel en `RetailVisionPOS.jsx`.** El panel está construido
  y probado, pero su integración en la pantalla de venta se hará cuando el
  Centro de IA exista y devuelva propuestas reales. Cablearlo ahora sería
  cablear una UI contra un motor que responde `503`.
- **No se portó la dependencia de Gemini.** El viejo POS llamaba a la nube; el
  nuevo POS **jamás** lo hará. Esa es la diferencia arquitectónica central.

---

## 7. Estado de la Fase 7 tras F7.2

| Sub-fase | Entregable | Estado |
|---|---|---|
| F7.0 | Contratos 24 y 25 declarados | ✅ CERRADA |
| F7.1 | Selector de Temas (Entregable A) | ✅ CERRADA |
| **F7.2** | **Voz (Entregable B)** | ✅ **CERRADA** |
| F7.3 | Visión (Entregable C) | ⏳ Pendiente |
| F7.4 | Cierre de Fase 7 | ⏳ Pendiente |

---

## 8. Commit

- **Hash:** `19b45ac`
- **Mensaje:** `feat(f7.2): voz por contrato (24/25) — el POS propone, el humano dispone`
- **Archivos:** 8 (7 nuevos de código/prueba + esta ficha)
- **Líneas:** +1978
- **Push:** `7a01aca..19b45ac` → `origin/main` ✅
