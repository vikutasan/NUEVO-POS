# PLAN — Selector de color de post-it en el Gestor de Terminales

> **Estado:** APROBADO (decisiones del usuario registradas en §8). En implementación.
> **Origen:** BUG-03 (9 Oct 2026). El usuario pidió que el color del post-it del
> pizarrón se pueda elegir **desde el Gestor de Terminales**, con un selector que
> despliegue la paleta disponible, en vez de editar el código a mano.
> **Tipo:** Feature nueva (no bug). Merece su propia ficha y su propio commit.

---

## 1. Objetivo

Que cada terminal tenga un **color de post-it configurable desde la interfaz**
(modo Gestor de Terminales), eligiéndolo de la paleta de 21 colores. El pizarrón
de cuentas abiertas pintará cada post-it con el color configurado para la
terminal que creó la cuenta.

**Resultado esperado:** el usuario abre el Gestor → en cada terminal ve un
selector de color → al abrirlo se despliegan los colores disponibles → elige uno
→ guarda → el pizarrón refleja el color.

---

## 2. Estado actual (punto de partida)

### 2.1 Cómo se guarda hoy la config de terminales
- **Backend:** archivo JSON `apps/api/terminal_config.json`, leído/escrito por
  [`routers/terminals.py`](../../apps/api/routers/terminals.py:68).
- **Modelo:** `TerminalConfigItem` con `id`, `name`, `icon`
  ([`terminals.py`](../../apps/api/routers/terminals.py:96)).
- **Endpoints:** `GET /pos/terminals/config` y `POST /pos/terminals/config`.
- **Servicio front:** [`fetchTerminalConfig()`](../../apps/pos/src/services/terminalService.js:104)
  y [`saveTerminalConfig()`](../../apps/pos/src/services/terminalService.js:115).
- **Hook:** [`useTerminals`](../../apps/pos/src/hooks/useTerminals.js:68) con
  `updateTerminal`, `saveConfig`.
- **UI:** modo Gestor en [`TerminalSelector.jsx`](../../apps/pos/src/components/TerminalSelector.jsx:184)
  con edición de `name`/`icon`.

### 2.2 Cómo se pinta hoy el post-it
- [`OpenAccountsCorkboard.jsx`](../../apps/pos/src/components/OpenAccountsCorkboard.jsx:77)
  tiene `COLOR_POR_TERMINAL` (mapa fijo) + `colorDe(terminal)`.
- El pizarrón **NO conoce la config de terminales**: solo recibe `terminal_id`
  de cada cuenta y consulta el mapa fijo.
- `PALETA_POST_ITS` (21 colores) ya existe como catálogo.

### 2.3 Brecha a cerrar
El pizarrón debe dejar de usar el mapa fijo y **leer el color desde la config de
terminales**. La config debe ganar un campo `color`.

---

## 3. Diseño propuesto

### 3.1 Modelo de datos
Agregar un campo opcional `color` a cada terminal en la config:

```json
{ "id": "TERM-01", "name": "Terminal 1", "icon": "🖥️", "color": "bg-cyan-300" }
```

- `color` es **opcional** (`str | None = None`). Si falta → el pizarrón usa el
  amarillo claro `bg-yellow-100` (aviso "sin color asignado").
- El valor es una **clase Tailwind** de `PALETA_POST_ITS` (p. ej. `bg-cyan-300`).
  Se valida contra el catálogo para no aceptar clases arbitrarias.
- **DECISIÓN (usuario):** NO se siembra color por defecto. Las terminales
  arrancan SIN color (amarillas) hasta que el usuario las configure.
- **DECISIÓN (usuario):** NO se permiten colores repetidos. Si un color ya está
  en uso por otra terminal, se rechaza (400) en el backend y NO aparece como
  opción en el selector del gestor.

### 3.2 Backend (`apps/api/routers/terminals.py`)
1. `TerminalConfigItem`: agregar `color: str | None = None`.
2. `CONFIG_POR_DEFECTO`: **SIN color** (decisión del usuario). Las 6 terminales
   por defecto arrancan sin `color` → amarillas hasta que el usuario las
   configure. Se agrega CAJA como terminal configurable (ver §3.7).
3. `_leer_config()` / `_guardar_config()`: preservar `color` (hoy solo manejan
   `id/name/icon`; hay que incluirlo en la normalización).
4. Validación: si `color` viene y no está en el catálogo permitido → 400.
   (El catálogo se declara como constante en el backend, espejo de
   `PALETA_POST_ITS`.)
5. **Validación de unicidad:** si dos terminales comparten el mismo `color` →
   400 con mensaje claro ("el color X ya está en uso por la terminal Y").

### 3.3 Servicio front (`terminalService.js`)
- Sin cambios de firma: `saveTerminalConfig(terminals)` ya envía el array
  completo; basta con que cada item incluya `color`.

### 3.4 Hook (`useTerminals.js`)
- `updateTerminal(id, { color })` ya funciona genéricamente (hace spread de
  `updates`). No requiere cambio de lógica.
- Exponer un helper `getColorDe(terminalId)` que devuelva el color configurado
  (o `null`). Útil para el pizarrón.

### 3.5 UI — Gestor (`TerminalSelector.jsx`)
- En el bloque de edición de cada terminal (junto a nombre/icono), agregar un
  **selector de color**:
  - Un botón/“swatch” que muestra el color actual.
  - Al abrirlo, despliega una **rejilla con los 21 colores** de `PALETA_POST_ITS`
    como cuadritos clicables.
  - **DECISIÓN (usuario):** los colores ya usados por OTRAS terminales se
    muestran **bloqueados** (deshabilitados, con marca de "en uso") y no se
    pueden elegir. El color actual de la propia terminal sí aparece como
    seleccionado.
  - Al elegir uno, se actualiza el estado local (`updateTerminal`) y se guarda
    con `saveConfig`.
- Accesibilidad: `aria-label`, foco visible, tamaño táctil ≥44px (R-04).
- Reutilizar `PALETA_POST_ITS` importándolo desde un módulo compartido
  `src/constants/paletaPostIts.js` para evitar acoplar gestor↔pizarrón.

### 3.6 Pizarrón (`OpenAccountsCorkboard.jsx`)
- **Punto de integración clave:** el pizarrón necesita el mapa de colores por
  terminal. Dos opciones:
  - **Opción A (recomendada):** el componente que monta el pizarrón le pasa una
    prop `coloresPorTerminal` (mapa `{ 'TERM-01': 'bg-cyan-300', ... }`),
    construida desde `useTerminals`. `colorDe(terminal, coloresPorTerminal)`.
  - **Opción B:** el pizarrón lee la config por su cuenta (fetch propio). Menos
    limpio (duplica la carga de config).
- `colorDe()` pasa a: `coloresPorTerminal?.[terminal] || 'bg-yellow-100'`.
- Se **elimina** `COLOR_POR_TERMINAL` del pizarrón (queda solo como semilla en el
  backend). `PALETA_POST_ITS` se conserva como catálogo (módulo compartido).

---

## 4. Archivos a tocar (estimado)

| Archivo | Cambio |
|---|---|
| `apps/api/routers/terminals.py` | Campo `color`, semilla, validación, normalización |
| `apps/api/tests/test_f7_7_terminales.py` | Tests de `color` (guardar/leer/validar) |
| `apps/pos/src/constants/paletaPostIts.js` | **Nuevo** — catálogo compartido (21 colores) |
| `apps/pos/src/components/OpenAccountsCorkboard.jsx` | `colorDe` lee de prop; quitar mapa fijo |
| `apps/pos/src/components/TerminalSelector.jsx` | Selector de color en el gestor |
| `apps/pos/src/hooks/useTerminals.js` | Helper `getColorDe` (opcional) |
| `apps/pos/src/RetailVisionPOS.jsx` | Pasar `coloresPorTerminal` al pizarrón |
| `apps/pos/src/components/OpenAccountsCorkboard.*.test.jsx` | Actualizar tests |
| `apps/pos/src/components/TerminalSelector.*.test.jsx` | Test del selector de color |
| `docs/05-plan-de-construccion/FICHA_*.md` | Ficha de la feature |

---

## 5. Fases de implementación (orden sugerido)

1. **F1 — Backend:** campo `color` + semilla + validación + tests pytest.
2. **F2 — Catálogo compartido:** extraer `PALETA_POST_ITS` a
   `src/constants/paletaPostIts.js`; actualizar imports.
3. **F3 — Pizarrón:** `colorDe` lee de prop `coloresPorTerminal`; actualizar
   tests del pizarrón (bug02, f12_6, f5_3).
4. **F4 — Gestor UI:** selector de color + guardado; test del selector.
5. **F5 — Integración:** `RetailVisionPOS` construye y pasa `coloresPorTerminal`.
6. **F6 — Cierre:** suite completa (backend + frontend), ficha, commit, push.

---

## 6. Riesgos y decisiones abiertas

- **R1 — Acoplamiento gestor↔pizarrón:** mitigado extrayendo el catálogo a un
  módulo compartido.
- **R2 — Migración de datos:** el `terminal_config.json` existente no tiene
  `color`. `_leer_config()` debe tolerar su ausencia y aplicar la semilla por
  defecto (o dejar `None` → amarillo). Decidir: ¿sembrar automáticamente o dejar
  que el usuario asigne?
- **R3 — Validación del color:** ¿rechazar clases fuera del catálogo (más
  seguro) o aceptar cualquier string (más flexible)? Recomendado: rechazar.
- **R4 — Alcance del selector:** ¿solo las 6 terminales + CAJA, o también
  terminales nuevas? El diseño soporta N terminales.
- **R5 — CAJA:** ¿CAJA es una “terminal” configurable o un caso especial? Hoy es
  una clave fija en el mapa. Decidir si entra al gestor o se queda fija.

---

## 7. Criterios de aceptación

1. En el Gestor, cada terminal muestra un selector de color que despliega la
   paleta de 21 colores.
2. Al elegir un color y guardar, la config persiste (JSON del backend).
3. El pizarrón pinta cada post-it con el color configurado para su terminal.
4. Una terminal sin color asignado sale amarilla (`bg-yellow-100`).
5. Suite backend y frontend verdes, sin regresiones.
6. Ficha de la feature escrita y commit publicado.

---

## 8. Decisiones del usuario (APROBADO — 9 Oct 2026)

1. **Semilla:** NO. El usuario configura los colores él mismo. Las terminales
   arrancan sin color (amarillas).
2. **CAJA:** SÍ es configurable desde el gestor (entra como una terminal más).
3. **Colores repetidos:** NO se permiten. Si un color está en uso, se bloquea
   (no aparece como opción elegible en el selector) y el backend lo rechaza.
4. **Paleta:** de momento, los 21 colores completos.

### 3.7 CAJA como terminal configurable (decisión 2)
- CAJA deja de ser una clave fija en el mapa del pizarrón y pasa a ser un item
  más de la config de terminales (id `CAJA`), con su propio `color`.
- El pizarrón ya recibe `cajaHabilitada`; el color de CAJA se resuelve igual que
  el de cualquier terminal (por `terminal_id` de la cuenta). Nota: las cuentas
  creadas en CAJA llevan `terminal_id = 'CAJA'` (verificar en la semilla).
- En el gestor, CAJA aparece como una tarjeta configurable más.
