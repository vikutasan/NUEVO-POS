# 🧩 FICHA F4.5 — MONTAJE DEL GESTOR DE CAJA (micro-fase correctiva)

> **Versión:** 1.0
> **Fecha:** 30 Sep 2026
> **Autor:** Arquitecto del Nuevo POS
> **Estado:** ✅ CERRADA
> **Naturaleza:** Micro-fase **CORRECTIVA** — cierra un hueco de INTEGRACIÓN
> detectado en la Fase 4. No es una fase nueva del Plan Maestro.
> **Plan de referencia:** `PLAN_DE_ABORDAJE_FASE_4_5_MONTAJE_CAJA.md` (v1.0)

---

## 1. EL HALLAZGO QUE ORIGINÓ LA MICRO-FASE

El usuario reportó: *"acabo de ver que no está el botón de habilitar caja y no sé
si esté la lógica de habilitar caja"*.

**Diagnóstico verificado contra el código real (REGLA DURA 2):**

| Pieza | ¿Existía? | Evidencia |
|---|---|---|
| Backend de caja (6 endpoints) | ✅ SÍ | `cash.py` — 371 líneas, contratos 9–14 |
| Servicio de caja (frontend) | ✅ SÍ | `cashService.js` — 6 operaciones |
| Componente Gestor de Caja | ✅ SÍ | `GestorDeCaja.jsx` — 467 líneas, 3 estados |
| Test del componente | ✅ SÍ | `GestorDeCaja.test.jsx` — verde |
| **Punto de entrada (botón)** | ❌ **NO** | `POSHeader.jsx` no tenía botón de caja |
| **Montaje en la pantalla** | ❌ **NO** | `RetailVisionPOS.jsx` no importaba ni renderizaba `GestorDeCaja` |

**Conclusión:** `GestorDeCaja.jsx` era un **componente huérfano**. Existía, estaba
probado, pero **ningún usuario podía llegar a él**.

**Impacto real (severidad ALTA):** RN-49 exige una sesión de caja `OPEN` para
cobrar (`_sesion_caja_activa_o_400` en `pos.py`). Sin punto de entrada, el
operador **no podía abrir el turno**, y por lo tanto **el POS no podía cobrar**.
El sistema estaba funcionalmente incompleto para producción.

**Lección registrada:** *"el componente existe y pasa su test" ≠ "el usuario puede
llegar a él"*. Es exactamente el riesgo que el propio Plan Maestro advirtió en
§10.6 ("de adentro hacia afuera"): cada sub-fase pasó su compuerta en aislamiento,
pero **el paso de INTEGRACIÓN se olvidó**.

---

## 2. LO QUE SE CONSTRUYÓ (5 puntos)

### F4.5.1 — Punto de entrada: botón "Caja" en el header ✅

- Botón **"Caja"** añadido al grupo de acciones de la derecha de `POSHeader.jsx`.
- Props nuevas: `onAbrirCaja` (callback) y `cajaAbierta` (booleano, para resaltar
  el botón cuando hay turno abierto — mismo patrón que `pedidoProgramado` y
  `clienteIdentificado`).
- Sigue el patrón visual existente: `min-h-tactil min-w-tactil`, `aria-label`,
  `title`, resaltado con `bg-acento` cuando `cajaAbierta`.
- **Gate cumplido:** el botón es visible y clickeable; dispara `onAbrirCaja`.

### F4.5.2 — Montaje del `GestorDeCaja` en `RetailVisionPOS` ✅

- `GestorDeCaja` importado en `RetailVisionPOS.jsx`.
- Estado nuevo: `const [cajaAbierta, setCajaAbierta] = useState(false)`.
- El gestor se renderiza como **overlay** (mismo patrón que `temaAbierto`,
  `vozAbierta`, `clienteAbierto`), recibiendo:
  - `terminalId={terminalEfectiva}`
  - `usuarioId={sesion?.employee_id || null}`
  - `onCerrar={() => { setCajaAbierta(false); refrescarTurnoCaja(); }}`
- `onAbrirCaja={() => setCajaAbierta(true)}` cableado al `POSHeader`.
- **Gate cumplido:** al pulsar "Caja", el gestor se abre; al cerrar, se oculta.

### F4.5.3 — Guarda de cobro (aviso proactivo, no solo 400) ✅

- Antes: si no había turno abierto, el cobro fallaba con un `400` críptico del
  backend (RN-49).
- Ahora: **guarda proactiva** al tope de `confirmarCobro` en `RetailVisionPOS.jsx`:
  ```jsx
  if (!turnoCaja) {
    setCheckoutAbierto(false);
    setAvisoCaja(true);
    return;
  }
  ```
- Estado nuevo `avisoCaja` + overlay `role="alertdialog"` con el mensaje
  **"Abre la caja antes de cobrar"**, un botón **"Abrir caja"** (que cierra el
  aviso y abre el gestor) y un botón **"Cancelar"**.
- El estado `turnoCaja` se refresca vía `refrescarTurnoCaja()` (que consulta
  `getSesionCajaActiva`), y se añadió `turnoCaja` al array de dependencias de
  `confirmarCobro`.
- **Gate cumplido:** intentar cobrar sin turno muestra el aviso y **no** dispara
  el cobro.

### F4.5.4 — Test de integración ✅

- Test nuevo `RetailVisionPOS.f4_5.test.jsx` con **5 escenarios**:
  1. El botón "Caja" existe en el header.
  2. Al pulsarlo, `GestorDeCaja` se monta (aparece su contenido).
  3. Cobrar sin turno muestra el aviso y **no** llama a `cobrarTicket`.
  4. El aviso ofrece "Abrir caja" y abre el gestor.
  5. Con turno abierto, el cobro procede normalmente.
- **Gate cumplido:** 5/5 en verde.

### F4.5.5 — Cierre documental ✅

- Esta ficha (`FICHA_F4_5_MONTAJE_CAJA.md`).
- Actualización de §10.6 del Plan Maestro con la lección ("el paso de integración
  también es una compuerta").
- Registro del hash real del commit (patrón ficha-hash).
- **Gate cumplido:** CI completo en verde + push.

---

## 3. REGRESIONES DETECTADAS Y CORREGIDAS

La guarda de F4.5.3 (que exige turno abierto para cobrar) rompió **dos tests
existentes** que ejercitaban el flujo de cobro sin sembrar el contrato de caja.
Ambos se corrigieron sembrando un turno `OPEN` en su `sembrarApiFeliz()`:

| Test | Síntoma | Corrección |
|---|---|---|
| `RetailVisionPOS.f8_6.test.jsx` | `criterio5` fallaba en `expect(apiSimulada.cobrarTicket).toHaveBeenCalled()` | Se añadieron los mocks de caja (`getSesionCajaActiva` con turno `OPEN`, etc.) a `apiSimulada` y a `sembrarApiFeliz()` |
| `RetailVisionPOS.f3_cierre.test.jsx` | `verificarEnvio` no se llamaba (el cobro se bloqueaba) | Se añadieron los mismos mocks de caja a `apiSimulada` y a `sembrarApiFeliz()` |

**Lección secundaria:** una guarda nueva en la ruta crítica de cobro **obliga** a
revisar todos los tests que cobran. La guarda es correcta (refleja RN-49); lo que
faltaba era que los tests declararan el contrato de caja que la pantalla ahora
consume.

---

## 4. EVIDENCIA DEL CIERRE

### CI completo (`npm run ci` desde `NUEVO-POS`)

```
=== LINT (F0) ===
Archivos en la obra: 250
Lint OK: 0 errores.

── Tests de Node (3 archivo(s)) ──
  ✅ apps/pos/src/theme/theme.test.js
  ✅ apps/pos/src/utils/utilidades.test.js
  ✅ packages/theme-engine/theme-engine.test.js

── Tests de componentes React (Vitest) ──
  ✅ vitest — todos los tests de componentes pasaron.

── Tests de la API (pytest en Docker) ──
  ✅ pytest — todos los tests de la API pasaron.

  Tests de Node      : 3/3 archivo(s) en verde
  Tests de componentes: PASA
  Tests de API       : PASA
  ✅ RESULTADO: TODOS LOS TESTS EN VERDE.

=== GUARDIANES DE ESTÁNDARES (F0 + F4/A-04) ===
Archivos de código escaneados: 166
[OK  ] E-05 — Silencios en ruta crítica (except ... pass) → 0 coincidencia(s)
[OK  ] A-04 — Silencios en la ruta crítica de guardianes → 0 coincidencia(s)
[OK  ] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
[OK  ] E-15 — TODOs sin formato declarado → 0 coincidencia(s)
[OK  ] R-01 — Ancho fijo en la superficie → 0 coincidencia(s)
[OK  ] E-09 — Dinero en Float (Float en models.py) → 0 coincidencia(s)
[OK  ] E-10 — Tiempo naive (DateTime() en models.py) → 0 coincidencia(s)

PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE
```

### Test de integración F4.5

```
npx vitest run src/RetailVisionPOS.f4_5.test.jsx
  ✅ 5/5 tests passed
```

---

## 5. ARCHIVOS TOCADOS

| Archivo | Cambio |
|---|---|
| `apps/pos/src/components/POSHeader.jsx` | Props `onAbrirCaja` + `cajaAbierta`; botón "Caja" |
| `apps/pos/src/RetailVisionPOS.jsx` | Import de `GestorDeCaja` y `cashService`; estados `cajaAbierta`, `turnoCaja`, `avisoCaja`; guarda de cobro; overlay del gestor; overlay del aviso |
| `apps/pos/src/RetailVisionPOS.f4_5.test.jsx` | **NUEVO** — test de integración (5 escenarios) |
| `apps/pos/src/RetailVisionPOS.f8_6.test.jsx` | Mocks de caja añadidos (regresión) |
| `apps/pos/src/RetailVisionPOS.f3_cierre.test.jsx` | Mocks de caja añadidos (regresión) |

---

## 6. LO QUE **NO** SE HIZO (anti-alcance respetado)

- ❌ **No** se reescribió `GestorDeCaja.jsx` (ya funcionaba y estaba probado).
- ❌ **No** se tocó el backend `cash.py` (los 6 endpoints ya existían).
- ❌ **No** se creó una ruta nueva en `App.jsx` (el gestor es un overlay, no una
  pantalla; coherente con el resto de paneles del POS).
- ❌ **No** se implementaron pagos mixtos (eso es F9.1, fase separada).
- ❌ **No** se añadió cola local ni modo offline-first (decisión arquitectónica ya
  tomada: el servidor es la única fuente de verdad).

---

## 7. BITÁCORA

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 30 Sep 2026 | Ficha inicial de cierre de la micro-fase F4.5. CI completo en verde. |
