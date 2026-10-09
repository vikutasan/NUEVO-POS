# FICHA FASE 13.3 — Selector de color de post-it en el Gestor de Terminales

> **Estado:** COMPLETA (9 Oct 2026).
> **Origen:** BUG-03. El usuario pidió que el color del post-it del pizarrón se
> pueda elegir **desde el Gestor de Terminales**, con un selector que despliegue
> la paleta disponible, en vez de editar el código a mano.
> **Plan:** [`PLAN_SELECTOR_COLOR_POST_IT.md`](PLAN_SELECTOR_COLOR_POST_IT.md).
> **Tipo:** Feature nueva (no bug). Commit propio.

---

## 1. Objetivo

Que cada terminal tenga un **color de post-it configurable desde la interfaz**
(modo Gestor de Terminales), eligiéndolo de la paleta de 21 colores. El pizarrón
de cuentas abiertas pinta cada post-it con el color configurado para la terminal
que creó la cuenta.

**Resultado:** el usuario abre el Gestor → en cada terminal ve un selector de
color → al abrirlo se despliegan los colores disponibles → elige uno → guarda →
el pizarrón refleja el color.

---

## 2. Decisiones del usuario (9 Oct 2026)

1. **SIN semilla.** Las terminales arrancan SIN color (amarillas). El usuario las
   configura él mismo desde el gestor.
2. **CAJA es configurable.** Se agrega CAJA como una terminal más en la config
   (antes no existía en `CONFIG_POR_DEFECTO`).
3. **SIN colores repetidos.** Si un color ya está en uso por otra terminal, se
   **bloquea** en el selector (no aparece como opción) y el backend lo rechaza
   con 400.
4. **Los 21 colores** de la paleta, de momento.

---

## 3. Cambios por capa

### 3.1 Backend — [`routers/terminals.py`](../../apps/api/routers/terminals.py)

- **`CONFIG_POR_DEFECTO`** ahora incluye CAJA como terminal configurable:
  ```python
  CONFIG_POR_DEFECTO: list[dict[str, str]] = [
      {"id": f"TERM-{n:02d}", "name": f"Terminal {n}", "icon": "🖥️"}
      for n in range(1, 7)
  ] + [
      {"id": "CAJA", "name": "Caja", "icon": "💰"},
  ]
  ```
- **`PALETA_POST_ITS`** (21 colores) declarada como constante, espejo del
  frontend. Sirve para validar que un color entrante pertenece al catálogo.
- **`TerminalConfigItem`** gana `color: str | None = None`.
- **`_leer_config()`** normaliza cada item a 4 claves (`id`, `name`, `icon`,
  `color`); `color = None` cuando falta.
- **`guardar_config()`** valida:
  - **Catálogo:** un `color` fuera de `PALETA_POST_ITS` → **400**.
  - **Unicidad:** dos terminales con el mismo `color` → **400** (`None` no cuenta).
- **`leer_config()`** devuelve `list[dict[str, str | None]]`.

### 3.2 Catálogo compartido — [`src/constants/paletaPostIts.js`](../../apps/pos/src/constants/paletaPostIts.js)

Fuente única de verdad de la paleta en el frontend. Exporta:

- `PALETA_POST_ITS` — los 21 colores.
- `COLOR_SIN_ASIGNAR = 'bg-yellow-100'` — el amarillo por defecto.
- `etiquetaDeColor(token)` — etiqueta legible (`bg-blue-400` → `blue 400`).

Documenta que el `PALETA_POST_ITS` del backend es un espejo que debe mantenerse
en sincronía.

### 3.3 Pizarrón — [`src/components/OpenAccountsCorkboard.jsx`](../../apps/pos/src/components/OpenAccountsCorkboard.jsx)

- Importa `{ PALETA_POST_ITS, COLOR_SIN_ASIGNAR }` del módulo compartido y
  re-exporta `PALETA_POST_ITS` para consumidores históricos.
- Se **elimina** el mapa local `COLOR_POR_TERMINAL`.
- `colorDe` lee del prop:
  ```js
  export function colorDe(terminal, coloresPorTerminal = {}) {
    return coloresPorTerminal[terminal] || COLOR_SIN_ASIGNAR;
  }
  ```
- El componente recibe `coloresPorTerminal = {}` (con JSDoc) y lo pasa a
  `colorDe` en el call site.

### 3.4 Gestor — [`src/components/TerminalSelector.jsx`](../../apps/pos/src/components/TerminalSelector.jsx)

- Importa `{ PALETA_POST_ITS, etiquetaDeColor }` del módulo compartido.
- Nuevo estado `editColor`.
- `startEdit` / `cancelEdit` / `applyEdit` manejan el color:
  ```js
  function applyEdit() {
    updateTerminal(editingId, { name: editName, icon: editIcon, color: editColor });
    cancelEdit();
  }
  ```
- Helper `colorEnUso(token, exceptoId)` — true si OTRA terminal ya usa el token.
- UI: dentro del formulario de edición, tras el selector de icono, una rejilla
  con un botón "sin color" (∅) y los 21 swatches. Cada swatch se **deshabilita**
  si `colorEnUso(token, t.id)`. `data-testid` por terminal y por color.

### 3.5 Integración — [`src/RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx)

- Importa `fetchTerminalConfig` de `terminalService.js`.
- Nuevo estado `coloresPorTerminal` (mapa `{ [terminal_id]: token }`).
- Efecto de montaje que lee la config y construye el mapa, **omitiendo** los
  terminales sin color (caen al amarillo por defecto). Fallo **silencioso**: si
  el API no responde, el pizarrón sigue funcionando con el color por defecto.
- Pasa `coloresPorTerminal={coloresPorTerminal}` a `<OpenAccountsCorkboard>`.

### 3.6 Servicio y hook (sin cambios de lógica)

- [`terminalService.js`](../../apps/pos/src/services/terminalService.js):
  `saveTerminalConfig(terminals)` ya envía el array completo → `color` fluye.
- [`useTerminals.js`](../../apps/pos/src/hooks/useTerminals.js): `updateTerminal`
  hace spread genérico de `updates` → `color` funciona sin cambios.

---

## 4. Pruebas

### 4.1 Backend — [`tests/test_f7_7_terminales.py`](../../apps/api/tests/test_f7_7_terminales.py)

- Fixture autouse `aislar_config_terminales`: snapshot de `_RUTA_CONFIG` antes de
  cada test y restauración/borrado después (evita contaminación entre tests).
- 7 tests nuevos (Criterio 12 — Color de post-it por terminal):
  - `test_criterio12_config_incluye_color_none_por_defecto`
  - `test_criterio12_caja_es_terminal_configurable`
  - `test_criterio12_guardar_color_valido_persiste`
  - `test_criterio12_color_fuera_del_catalogo_400`
  - `test_criterio12_color_repetido_400`
  - `test_criterio12_varias_sin_color_es_valido`
  - `test_criterio12_colores_distintos_es_valido`
- `test_criterio8_guardar_y_releer_config` actualizado (default con CAJA y
  `color: None` explícito).
- **Resultado: 35 passed** (archivo) / **351 passed** (suite completa).

### 4.2 Frontend

- [`OpenAccountsCorkboard.bug02.test.jsx`](../../apps/pos/src/components/OpenAccountsCorkboard.bug02.test.jsx)
  — reescrito para pasar `coloresPorTerminal` explícito. **9 tests.**
- [`OpenAccountsCorkboard.f12_6.test.jsx`](../../apps/pos/src/components/OpenAccountsCorkboard.f12_6.test.jsx)
  — criterio 4 actualizado: los dos tests de color pasan el mapa; se agrega un
  tercer test para el fallback sin color (`bg-yellow-100`). **14 tests.**
- [`OpenAccountsCorkboard.f5_3.test.jsx`](../../apps/pos/src/components/OpenAccountsCorkboard.f5_3.test.jsx)
  — sin cambios. **8 tests.**
- [`TerminalSelector.f13_3.test.jsx`](../../apps/pos/src/components/TerminalSelector.f13_3.test.jsx)
  — nuevo. 6 tests: la paleta aparece al editar; 21 colores + "sin color"; elegir
  y confirmar persiste; un color usado por OTRA terminal se deshabilita; el color
  propio NO se deshabilita; guardar envía el color al backend. **6 tests.**
- **Resultado: 71 archivos / 799 tests passed** (suite completa).

---

## 5. Archivos tocados

| Archivo | Cambio |
|---|---|
| `apps/api/routers/terminals.py` | `color` + CAJA + validación catálogo/unicidad |
| `apps/api/tests/test_f7_7_terminales.py` | fixture de aislamiento + 7 tests |
| `apps/api/terminal_config.json` | reset a default (6 terminales + CAJA, sin color) |
| `apps/pos/src/constants/paletaPostIts.js` | **nuevo** — catálogo compartido |
| `apps/pos/src/components/OpenAccountsCorkboard.jsx` | `colorDe` lee del prop |
| `apps/pos/src/components/OpenAccountsCorkboard.bug02.test.jsx` | pasa el mapa |
| `apps/pos/src/components/OpenAccountsCorkboard.f12_6.test.jsx` | criterio 4 + fallback |
| `apps/pos/src/components/TerminalSelector.jsx` | selector de color |
| `apps/pos/src/components/TerminalSelector.f13_3.test.jsx` | **nuevo** — 6 tests |
| `apps/pos/src/RetailVisionPOS.jsx` | fetch config + mapa + prop |

---

## 6. Criterios de aceptación (cumplidos)

1. ✅ Cada terminal tiene un selector de color en el Gestor.
2. ✅ El selector despliega los 21 colores de la paleta.
3. ✅ Un color en uso por otra terminal se bloquea (no elegible).
4. ✅ El color elegido se persiste (backend + JSON).
5. ✅ El pizarrón pinta cada post-it con el color de su terminal.
6. ✅ Una terminal sin color cae al amarillo por defecto (`bg-yellow-100`).
7. ✅ CAJA es configurable como cualquier terminal.
8. ✅ El backend rechaza colores fuera del catálogo (400) y repetidos (400).
9. ✅ Sin regresiones: 351 backend + 799 frontend.
