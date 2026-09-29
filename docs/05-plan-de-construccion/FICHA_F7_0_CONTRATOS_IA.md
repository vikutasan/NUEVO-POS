# FICHA F7.0 — La frontera con el Centro de IA: contratos 24 y 25

> **Fase:** 7 (Voz + Visión IA + Selector de Temas) — Sub-fase **7.0**
> **Estado:** ✅ CERRADA — puerta en verde
> **Fecha:** 2026-09-29
> **Commit:** _(se registra al final de esta ficha)_
> **Plan de abordaje:** [`PLAN_DE_ABORDAJE_FASE_7_POR_PARTES.md`](../../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_7_POR_PARTES.md) §5
> **Directriz que la origina:** **DT-07** — El Centro de IA es el único lugar donde
> se gestionan las capacidades de IA; cada módulo las consume **por contrato**.

---

## 1. Por qué existe esta sub-fase

La Fase 7 tiene **tres entregables**, y solo uno es del POS:

| Entregable | ¿De quién es? | Sub-fase |
|---|---|---|
| **A — Selector de Temas** | ✅ Del POS (cero dependencias) | F7.1 |
| **B — Voz** (transcribir + interpretar) | ⚠️ Del **Centro de IA** | F7.2 |
| **C — Visión** (reconocer producto) | ⚠️ Del **Centro de IA** | F7.3 |

El POS **no construye** los motores de voz ni de visión: los **consume**. Pero
para consumirlos sin violar **A-02** (frontera por contratos: prohibido leer
tablas o servicios ajenos sin contrato declarado), la frontera debe existir
**primero**.

La autocrítica del plan de Fase 7 (**hallazgo H-2**) detectó, con evidencia, que
esa frontera **no existía**:

- El POS viejo (`apps/pos/hooks/useVoiceCart.js`) llamaba a
  `POST /ai/voice/transcribe` y `POST /ai/voice/parse-intent` **sin ningún
  contrato declarado** en `contracts/registry.py`. Es exactamente la violación
  que A-02 prohíbe: consumir un servicio ajeno "a mano".
- El contrato **17** (`ia.estado_del_motor`) existía, pero con
  `estado_hoy="Deuda"`: declaraba el *estado* del motor, no las *capacidades*.
- El POS viejo (`apps/pos/VisionScanner.jsx`) usaba **Gemini en la nube** para
  visión, lo que viola **DT-07** (la IA vive en el Centro de IA, no en la nube
  de un tercero).

Sin este prerrequisito, las sub-fases 7.2 (voz) y 7.3 (visión) no tendrían a qué
llamar legítimamente. **F7.0 construye la frontera primero** — el mismo patrón
que F5.0 usó para el pizarrón de cuentas.

---

## 2. Qué se construyó (4 archivos tocados)

### 2.1 `apps/api/contracts/registry.py` — los contratos 24 y 25

Se añadieron **dos contratos al final de la tupla** (después del 23), con
comentarios de sección `# ── §11 IA — Voz ──` y `# ── §11 IA — NLU ──`:

```python
Contrato(
    numero=24,
    nombre="ia.transcribir_voz",
    consumidor="POS",
    proveedor="Centro de IA",
    operacion="POST /ai/voice/transcribe",
    entrada={"audio_base64": "String", "formato": "String = 'webm'", "idioma": "String = 'es-MX'"},
    salida={"texto": "String", "confianza": "Float(0..1)", "duracion_ms": "Integer"},
    garantias=(
        "Transcribe el audio a texto en español. NO interpreta la intención.",
        "El POS decide qué hacer con el texto: la IA solo transcribe.",
        "Si el audio es silencio o ininteligible, devuelve `texto` vacío (200), no error.",
    ),
    errores=(
        "400 si `audio_base64` está vacío o excede 10 MB.",
        "503 `IA_NO_DISPONIBLE` si el motor de voz no está cargado.",
    ),
    estado_hoy="FASE 7.0",
),
Contrato(
    numero=25,
    nombre="ia.interpretar_intencion",
    consumidor="POS",
    proveedor="Centro de IA",
    operacion="POST /ai/voice/parse-intent",
    entrada={"texto": "String", "contexto": "Dict = {}"},
    salida={"intent": "String", "entidades": "Dict", "confianza": "Float(0..1)"},
    garantias=(
        "Traduce el texto a una intención estructurada (intent + entidades).",
        "El POS valida el intent contra su allowlist: la IA PROPONE, el operador CONFIRMA.",
        "Si no reconoce la intención, devuelve `intent='desconocido'` (200), no error.",
    ),
    errores=(
        "400 si `texto` está vacío.",
        "503 `IA_NO_DISPONIBLE` si el motor NLU no está cargado.",
    ),
    estado_hoy="FASE 7.0",
),
```

**Decisiones de diseño (las 4 que importan):**

1. **`proveedor="Centro de IA"`, no `"POS"`.** El POS es el **consumidor**, nunca
   el proveedor. Esto es la aplicación literal de **DT-07**: la capacidad de IA
   vive en el Centro de IA; el POS solo la pide. Un test lo verifica
   explícitamente (criterio 2).
2. **La transcripción NO interpreta.** El contrato 24 devuelve *texto*; el 25
   devuelve *intención*. Separarlos permite que el POS decida qué hacer con el
   texto (y que un fallo del NLU no tumbe la transcripción). Es la separación
   clásica ASR ≠ NLU.
3. **`503 IA_NO_DISPONIBLE` es obligatorio en ambos.** Es la política inviolable
   del Centro de IA: *"cualquier fallo del motor → 503 `IA_NO_DISPONIBLE`. Nunca
   se propaga un 500 al POS."* Un test lo verifica (criterio 4).
4. **La IA PROPONE, el operador CONFIRMA.** Está escrito en las garantías del
   contrato 25. El POS valida el `intent` contra su *allowlist* antes de tocar el
   carrito. La IA nunca escribe en el carrito por sí sola.

Además se actualizó el **encabezado** del archivo (`22 contratos` → `25
contratos`, con la mención de `FASE 7.0 (IA)`) y la **nota DT-07** que antes
decía "Deuda": ahora dice **"CERRADA por F7.0"** con los dos contratos
DECLARADOS.

### 2.2 `apps/api/contracts/__init__.py` — el docstring del paquete

Se actualizó el encabezado del paquete (`22 contratos` → `25 contratos`) para que
la documentación de la frontera no mienta.

### 2.3 `apps/api/tests/test_f2_frontera.py` — la puerta de F2 se actualiza

La puerta de Fase 2 verificaba "hay exactamente 23 contratos". Al declarar los
contratos 24 y 25, esa aserción **debía** actualizarse (no es un test roto: es un
test que **cuenta la frontera** y la frontera creció legítimamente):

- `LOS_23_CONTRATOS` → **`LOS_25_CONTRATOS`** (se añadieron
  `"ia.transcribir_voz"` e `"ia.interpretar_intencion"`).
- `test_criterio2_hay_exactamente_23_contratos` →
  **`test_criterio2_hay_exactamente_25_contratos`**.
- `test_listar_contratos_devuelve_los_23` →
  **`test_listar_contratos_devuelve_los_25`**.

**Decisión de diseño:** se renombró el símbolo en vez de dejar el nombre viejo
con un número nuevo. Un test llamado `..._23_...` que verifica 25 es una mentira
documental; el nombre debe decir la verdad.

### 2.4 `apps/api/tests/test_f7_contratos_ia.py` — la puerta de F7.0 (NUEVA)

El gate de esta sub-fase. **6 criterios, 13 tests**, todos en verde:

| Criterio | Qué verifica |
|---|---|
| **1** | Los contratos 24 y 25 existen, con esos números y esos nombres; el registro tiene 25. |
| **2** | El proveedor de ambos es **"Centro de IA"**; el POS **no** es proveedor de ningún contrato `ia.*`. |
| **3** | El consumidor de ambos es **"POS"**. |
| **4** | Ambos declaran `503` + `IA_NO_DISPONIBLE` y `400` en sus errores. |
| **5** | Ninguno expone una tabla; ambos tienen firma documentada (entrada + salida). |
| **6** | **Ningún archivo del backend importa un motor de IA** (`torch`, `whisper`, `ultralytics`, `tesseract`, `openai`, `google.generativeai`) — escaneo AST de `API_ROOT`, excluyendo tests y `__pycache__`. |

El **criterio 6** es el más importante a largo plazo: es el guardián que impide
que, dentro de seis meses, alguien "resuelva rápido" importando `whisper`
directamente en el POS. Si eso pasa, la puerta se pone roja.

---

## 3. La frontera, en un dibujo

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│           POS NUEVO          │         │        CENTRO DE IA          │
│      (apps/pos + apps/api)   │         │   (apps/ai — aún no existe)  │
│                              │         │                              │
│  useVoiceCart (F7.2) ────────┼────────►│  POST /ai/voice/transcribe   │  contrato 24
│                              │         │  POST /ai/voice/parse-intent │  contrato 25
│  useVision (F7.3) ───────────┼────────►│  POST /ai/vision/recognize   │  contrato 17 (estado)
│                              │         │                              │
│  ❌ NO importa torch/whisper │         │  ✅ Es el ÚNICO que los usa  │
│  ❌ NO llama a la nube       │         │  ✅ Motor local (YOLO/Whisper)│
└──────────────────────────────┘         └──────────────────────────────┘
        consumidor                                proveedor
```

**Regla de oro:** el POS **declara** los contratos que consume y **valida** lo
que recibe. Nunca implementa el motor. Si el Centro de IA no está construido
todavía, el POS recibe `503 IA_NO_DISPONIBLE` y **sigue vendiendo a mano** — la
IA es asistiva, jamás bloqueante (RN-74).

---

## 4. Evidencia de la puerta (verde)

```
$ docker compose exec -T api pytest -q
225 passed in 5.05s

$ npm run ci
=== LINT (F0) ===
Archivos en la obra: 192
Lint OK: 0 errores.

── Tests de Node (3 archivo(s)) ──
  ✅ apps/pos/src/theme/theme.test.js
  ✅ apps/pos/src/utils/utilidades.test.js
  ✅ packages/theme-engine/theme-engine.test.js

── Tests de componentes React (Vitest) ──
  ✅ vitest — todos los tests de componentes pasaron.

── Tests de la API (pytest en Docker) ──
  ✅ pytest — todos los tests de la API pasaron.

=== GUARDIANES DE ESTÁNDARES (F0 + F4/A-04) ===
[OK  ] E-05 — Silencios en ruta crítica (except ... pass) → 0 coincidencia(s)
[OK  ] A-04 — Silencios en la ruta crítica de guardianes → 0 coincidencia(s)
[OK  ] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
[OK  ] E-15 — TODOs sin formato declarado → 0 coincidencia(s)
[OK  ] R-01 — Ancho fijo en la superficie → 0 coincidencia(s)
[OK  ] E-09 — Dinero en Float (Float en models.py) → 0 coincidencia(s)
[OK  ] E-10 — Tiempo naive (DateTime() en models.py) → 0 coincidencia(s)

PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE
```

**Nota sobre el conteo:** antes de F7.0 la suite tenía **212** tests; ahora tiene
**225** (+13 de la puerta nueva). Los 212 previos siguen verdes: la sub-fase
**añade** frontera, no rompe nada.

---

## 5. Qué NO hace esta sub-fase (límites explícitos)

- **NO construye el Centro de IA.** Solo declara los contratos que el POS
  consumirá cuando el Centro exista. El Centro de IA es un módulo del ERP
  (`apps/ai/`), no del POS.
- **NO implementa la transcripción ni el NLU.** Eso es del Centro de IA.
- **NO toca el frontend.** F7.0 es puramente backend (frontera). El consumo real
  llega en F7.2 (voz) y F7.3 (visión).
- **NO añade dependencias.** Cero. Solo se declaran contratos y se actualizan
  tests.
- **NO declara el contrato de visión.** El contrato 17 (`ia.estado_del_motor`) ya
  existe y cubre el *estado*; el contrato específico de *reconocimiento* se
  decidirá en F7.3, cuando se sepa la forma exacta de la respuesta.

---

## 6. Por qué esto importa para el ERP completo

El POS nuevo es **el primer módulo de un ERP reconstruido** (§8.1 del Plan
Maestro). El mismo patrón que se aplica aquí se aplicará a los demás módulos:

- **Centro de IA** (no existe aún): todos los módulos consumen IA por contrato.
- **CRM** (no existe aún): el POS consumirá `clientes.beneficios_para_ticket`
  (contrato 26) y `notificaciones.encolar_ticket` (contrato 27) — ver la nota de
  coherencia en el Plan Maestro §Fase 8.
- **Vista General** (no existe aún): declara valores transversales (DT-06).

F7.0 deja el **molde** listo: cuando el Centro de IA se construya, el POS ya
tendrá la frontera declarada y solo habrá que **rellenar el proveedor**. El POS
no tendrá que cambiar ni una línea de su lado de la frontera.

---

## 7. Cierre

| Elemento | Estado |
|---|---|
| Contratos 24 y 25 declarados | ✅ |
| Proveedor = "Centro de IA" (no POS) | ✅ |
| `503 IA_NO_DISPONIBLE` en ambos | ✅ |
| Puerta F2 actualizada (23 → 25) | ✅ |
| Puerta F7.0 nueva (6 criterios, 13 tests) | ✅ |
| Suite completa (225 tests) | ✅ verde |
| Lint (0 errores) | ✅ |
| 7 guardianes de estándares | ✅ limpios |
| Cero dependencias nuevas | ✅ |

**Siguiente sub-fase:** **F7.1 — Selector de Temas** (cablear el motor de temas
que ya existe en `packages/theme-engine/` pero que hoy no está conectado a
ninguna pantalla).
