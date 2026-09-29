# FICHA F7.1 — El cable que faltaba: el motor de temas, por fin conectado

> **Fase:** 7 (Voz + Visión IA + Selector de Temas) — Sub-fase **7.1**
> **Estado:** ✅ CERRADA — puerta en verde
> **Fecha:** 2026-09-29
> **Commit:** _(se registra al final de esta ficha)_
> **Plan de abordaje:** [`PLAN_DE_ABORDAJE_FASE_7_POR_PARTES.md`](../../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_7_POR_PARTES.md) §6
> **Entregable:** **A — Selector de Temas** (el único de los 3 entregables de Fase 7 que es 100% del POS)

---

## 1. Por qué existe esta sub-fase

El motor de temas (`packages/theme-engine/`) se construyó en Fase 1. Tiene 300
líneas, 5 funciones públicas, 3 capas de resolución (tema del módulo → identidad
del negocio → paleta canónica) y su propia prueba. **Pero nadie lo llamaba.**

Ese es el **hallazgo H-1** del plan de Fase 7: el POS tenía un motor de temas
completo, probado y **muerto**. El operador no podía cambiar el tema porque no
existía ni el hook que lo cableara ni la UI que lo ofreciera.

F7.1 es, literalmente, **el cable que faltaba**. No toca el motor (está bien
como está); construye las dos piezas que lo conectan a la realidad:

1. **`useTheme`** — el hook que resuelve, aplica y persiste el tema.
2. **`ThemeSelector`** — la UI que el operador toca para cambiarlo.

Y lo cablea en `App.jsx`, la raíz del POS, para que el tema se aplique **al
montar** y no solo cuando alguien lo cambie.

---

## 2. Qué se construyó (5 archivos)

### 2.1 `apps/pos/src/hooks/useTheme.js` — NUEVO (el cable)

El hook que conecta el contrato del módulo (`TEMA_DEL_MODULO`) con el motor
compartido. Expone:

| Retorno | Tipo | Qué es |
|---|---|---|
| `tema` | `string` | El tema activo (nombre técnico). |
| `temas` | `string[]` | Los temas permitidos por el contrato. |
| `ofreceSelector` | `boolean` | Si el módulo ofrece selector (viene del contrato). |
| `cargando` | `boolean` | Si el motor aún está resolviendo. |
| `cambiarTema` | `(nombre) => void` | Cambia y persiste el tema. |

Decisiones de diseño (plan §6.2):

- **El motor NO se toca.** El hook solo lo llama.
- **`resolverTema(TEMA_DEL_MODULO, tema, null)`** — la identidad es `null`
  porque Vista General aún no existe (**DT-06**). Cuando exista, se pasa aquí.
- **`aplicarTema(resuelto, contenedor || document.documentElement)`** — se
  aplica al contenedor raíz del POS, **no a `:root`**, para no contaminar otros
  módulos del ERP.
- **Persistencia en `localStorage`** con la clave `pos.tema`, el mismo patrón
  que `pos.ordenTerminales` (F6.5).
- **Defensa:** si el motor falla, el hook **no propaga la excepción** (se
  detectó y corrigió durante la puerta — ver §4). Un fallo de tema jamás
  bloquea una venta.
- **Degradación:** si `localStorage` tiene un tema inválido, se cae al default
  del módulo sin romper.

### 2.2 `apps/pos/src/components/ThemeSelector.jsx` — NUEVO (la UI)

El selector visual. Lista los 3 temas permitidos con etiquetas humanas
(Clásico / Nocturno / Minimal) e iconos. Reglas que respeta:

- **Criterio del contrato:** si `ofreceSelector` es `false`, **no se renderiza**
  (devuelve `null`). El contrato manda.
- **R-03:** visible en los 3 modos (MOSTRADOR / COMPACTO / MÓVIL), sin
  ocultamiento por breakpoint.
- **R-04:** cada opción es un target táctil ≥44px (`min-h-tactil`).
- **R-01:** contenedor fluido (`w-full`), sin ancho fijo en px.
- **Accesibilidad:** `role="group"` con `aria-label`, y `aria-pressed` en el
  tema activo.

### 2.3 `apps/pos/src/App.jsx` — MODIFICADO (el cableado)

Se añadió el import y la llamada `useTheme()` al inicio del componente. Con
esto, el tema se resuelve y se aplica **al montar la app**, no solo al pulsar
el selector.

```jsx
import { useTheme } from './hooks/useTheme.js';

export default function App() {
  // F7.1 — cablea el motor de temas: resuelve y aplica el tema al montar.
  useTheme();
  ...
}
```

### 2.4 `apps/pos/src/hooks/useTheme.f7_1.test.jsx` — NUEVO (puerta, 13 tests)

Cubre los criterios **1, 2, 3, 4 y 9** del plan §6.4. El motor se **mockea**:
esta puerta prueba el **cableado**, no el motor (que ya tiene su propia prueba
en `packages/theme-engine/theme-engine.test.js`).

### 2.5 `apps/pos/src/components/ThemeSelector.f7_1.test.jsx` — NUEVO (puerta, 12 tests)

Cubre los criterios **5, 6, 7 y 8** del plan §6.4.

---

## 3. La frontera: quién es quién

```
┌─────────────────────────────────────────────────────────────┐
│  apps/pos/src/theme/index.js                                │
│  TEMA_DEL_MODULO  ← el CONTRATO del módulo POS              │
│  (3 temas: default, nocturno, minimal; ofreceSelector:true) │
└───────────────────────────┬─────────────────────────────────┘
                            │ lo lee
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  apps/pos/src/hooks/useTheme.js   ← F7.1 (el cable)         │
│  · resolverTema(TEMA_DEL_MODULO, eleccion, null)            │
│  · aplicarTema(resuelto, contenedor)                        │
│  · persiste en localStorage['pos.tema']                     │
└───────────────────────────┬─────────────────────────────────┘
                            │ llama
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  packages/theme-engine/index.js   ← YA EXISTÍA (Fase 1)     │
│  · resolverTema()  · aplicarTema()  · 3 capas de resolución │
│  NO SE TOCA. Vive en packages/ para NO ser de Vista General.│
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  apps/pos/src/components/ThemeSelector.jsx  ← F7.1 (la UI)  │
│  · Solo pinta botones y llama a onCambiarTema.              │
│  · NO resuelve ni aplica el tema (eso es de useTheme).      │
└─────────────────────────────────────────────────────────────┘
```

**Por qué el motor vive en `packages/`:** para que **no sea propiedad de Vista
General**. Es infraestructura compartida del ERP. Cualquier módulo futuro
(CRM, Centro de IA, Vista General) podrá declarar su propio `TEMA_DEL_MODULO`
y reutilizar el mismo motor. El POS es el **primer consumidor**, no el dueño.

---

## 4. Evidencia de la puerta

### 4.1 La puerta de F7.1 (25 tests, 2 archivos)

```
✓ src/components/ThemeSelector.f7_1.test.jsx (12 tests)
✓ src/hooks/useTheme.f7_1.test.jsx (13 tests)

Test Files  2 passed (2)
     Tests  25 passed (25)
```

### 4.2 Los 9 criterios del plan §6.4, uno por uno

| # | Criterio | Test que lo prueba | ✅ |
|---|---|---|---|
| 1 | `useTheme` llama a `resolverTema` con `TEMA_DEL_MODULO` | `criterio 1: llama a resolverTema con TEMA_DEL_MODULO` | ✅ |
| 2 | `useTheme` llama a `aplicarTema` | `criterio 2: llama a aplicarTema con el tema resuelto` + `aplica al contenedor indicado` | ✅ |
| 3 | La elección persiste en `localStorage` (`pos.tema`) | `criterio 3: cambiarTema persiste…` + `tema NO permitido no persiste` | ✅ |
| 4 | Al montar aplica el tema guardado (o el default) | `criterio 4: aplica el tema GUARDADO` + `sin nada guardado aplica el default` + `expone los temas permitidos` | ✅ |
| 5 | `ThemeSelector` lista los 3 temas permitidos | `criterio 5: lista exactamente los 3` + `etiquetas humanas` + `aria-pressed` | ✅ |
| 6 | `ThemeSelector` NO se renderiza si `ofreceSelector` es false | `criterio 6: NO se renderiza si ofreceSelector es false` + `SÍ se renderiza si es true` | ✅ |
| 7 | Cambiar de tema aplica el nuevo sin recargar | `criterio 7: al pulsar llama a onCambiarTema` + `idempotente` + `no rompe sin callback` | ✅ |
| 8 | El selector respeta R-03 y R-04 | `criterio 8 (R-04): min-h-tactil` + `(R-01): w-full sin px` + `(R-03): visible en 3 modos` + `role=group` | ✅ |
| 9 | Un tema inválido en `localStorage` cae al default | `criterio 9: tema inválido cae al default` + `leerTemaGuardado` (3 casos) + `motor que falla no propaga` | ✅ |

### 4.3 Un defecto real detectado y corregido durante la puerta

La primera corrida de la puerta **falló con un unhandled rejection**: el
`useEffect` de `useTheme` no capturaba el rechazo de `resolverTema`. Si el
motor fallaba, la promesa rechazada quedaba sin manejar.

Esto **violaba el plan §6.2** ("si el motor falla, el hook no rompe"). Se
corrigió envolviendo la resolución en `try/catch/finally`:

```js
try {
  const resuelto = await resolverTema(TEMA_DEL_MODULO, tema, null);
  if (!vigente) return;
  aplicarTema(resuelto, contenedor || document.documentElement);
} catch {
  /* El motor falló: se conserva el tema actual. No se propaga. */
} finally {
  if (vigente) setCargando(false);
}
```

La segunda corrida quedó **verde y sin errores no manejados**. Este es el
valor de la puerta: no solo confirma lo que funciona, **descubre lo que no**.

### 4.4 CI completo (sin regresiones)

```
=== LINT (F0) ===
Archivos en la obra: 196
Lint OK: 0 errores.

── Tests de Node (3 archivo(s)) ──
  ✅ apps/pos/src/theme/theme.test.js
  ✅ apps/pos/src/utils/utilidades.test.js
  ✅ packages/theme-engine/theme-engine.test.js

── Tests de componentes React (Vitest) ──
  ✅ vitest — todos los tests de componentes pasaron.

── Tests de la API (pytest en Docker) ──
  ✅ pytest — todos los tests de la API pasaron.

✅ RESULTADO: TODOS LOS TESTS EN VERDE.

=== GUARDIANES DE ESTÁNDARES (F0 + F4/A-04) ===
[OK] E-05 · [OK] A-04 · [OK] E-15 (×2) · [OK] R-01 · [OK] E-09 · [OK] E-10
PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE
```

---

## 5. Límites explícitos (lo que F7.1 NO hace)

- **NO toca el motor de temas.** `packages/theme-engine/` queda intacto.
- **NO construye temas nuevos.** Los 3 temas (default, nocturno, minimal) ya
  existían desde Fase 1.
- **NO integra la identidad del negocio.** `resolverTema` se llama con
  `identidad=null` porque Vista General aún no existe (**DT-06**). Cuando
  exista, se pasa aquí sin cambiar el motor.
- **NO monta el `ThemeSelector` en una pantalla concreta todavía.** El
  componente existe, está probado y es reutilizable; su ubicación visual
  definitiva (¿en el header? ¿en un panel de ajustes?) se decide cuando el
  operador lo use. El cableado crítico —que el tema se aplique al montar— ya
  está hecho en `App.jsx`.
- **NO persiste en el backend.** La elección de tema es local al dispositivo
  (`localStorage`), como el orden de terminales (F6.5). Si en el futuro se
  quiere sincronizar entre dispositivos, será un contrato nuevo.

---

## 6. Por qué esto importa para el ERP completo

El motor de temas es **infraestructura compartida**, no una feature del POS.
Vive en `packages/` precisamente para que **cualquier módulo del ERP** pueda
declarar su propio `TEMA_DEL_MODULO` y reutilizarlo.

F7.1 convierte al POS en el **primer consumidor real** del motor. Eso valida
el diseño de 3 capas con un caso de uso verdadero:

1. **Capa 1 — tema del módulo:** el POS elige entre sus 3 temas.
2. **Capa 2 — identidad del negocio:** cuando Vista General exista, impondrá
   logo, colores y tipografía de "R de Rico" sobre cualquier tema.
3. **Capa 3 — paleta canónica:** el piso que garantiza que nada quede sin
   definir.

Cuando el Centro de IA, el CRM y Vista General se construyan, **heredarán este
motor ya probado en producción**. Ese es el principio "de adentro hacia
afuera": construir la pieza bien una vez, y que los demás módulos la consuman
por contrato.

---

## 7. Cierre

| Aspecto | Resultado |
|---|---|
| Archivos creados | 3 (`useTheme.js`, `ThemeSelector.jsx`, 2 puertas) |
| Archivos modificados | 1 (`App.jsx`) |
| Tests de la puerta | **25** (13 + 12) |
| Criterios cubiertos | **9 / 9** |
| Defecto detectado y corregido | **1** (unhandled rejection en `useTheme`) |
| CI completo | ✅ verde (lint 0, 3/3 Node, Vitest, pytest, 7 guardianes) |
| Regresiones | **0** |

**F7.1 queda CERRADA.** El motor de temas ya no está muerto: está cableado,
probado y listo para que el operador elija su tema.

**Siguiente:** F7.2 — Voz (consumiendo los contratos 24 y 25 declarados en F7.0).
