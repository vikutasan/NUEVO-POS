# FICHA — FIX BUG-05: `CAJA` no es una terminal (y el gestor ya avisa al guardar)

**Fecha:** 10 Oct 2026
**Estado:** ✅ CERRADO
**Ámbito:** Backend (`apps/api`) + Frontend (`apps/pos`)
**Origen:** Reporte del usuario durante la prueba manual en navegador.

---

## 1. El reporte

> «NO SE PERSISTIERON LOS CAMBIOS QUE HABÍA HECHO EN EL GESTOR DE CAJAS Y
> AHORA MISMO PRESIONO EL BOTÓN DE GUARDAR CAMBIOS Y PARECE NO REACCIONAR.»

Y, acto seguido, la corrección arquitectónica del usuario:

> «TODA TERMINAL TIENE LA OPCIÓN A CONVERTIRSE EN CAJA, ES DECIR, TODA
> TERMINAL ES UNA CAJA EN POTENCIA, ASÍ QUE ¿POR QUÉ PERSISTIR QUE UNA SE
> LLAME CAJA?»

---

## 2. Diagnóstico — tres defectos encadenados

### 2.1. `addTerminal` generaba ids fuera del vocabulario canónico

`useTerminals.js` creaba terminales nuevas con ids `T1`, `T2`, `T3`… mientras
que el API y la semilla hablan `TERM-01`…`TERM-06`. Al guardar el gestor se
persistían ids que **ninguna sesión ni ticket reconocía**, dejando
`terminal_config.json` corrupto. Ésta es la causa de que «no se persistieran
los cambios»: se persistían, pero con ids inválidos.

### 2.2. El toast de guardado NO se renderizaba en el gestor

`TerminalSelector.jsx` tiene **dos ramas de retorno**:

- `if (showManager) { return (…) }` — el gestor.
- `return (…)` — el selector principal.

El bloque `{toast && (…)}` vivía **sólo en la rama del selector principal**.
Resultado: al pulsar «Guardar cambios» dentro del gestor, `showToast()` sí
actualizaba el estado, pero **el toast no existía en el árbol JSX del gestor**,
así que nunca aparecía. El botón *parecía* muerto. Ésta es la causa raíz del
síntoma literal reportado.

### 2.3. `handleSave` descartaba el `detail` del backend

Ante un fallo de validación (color fuera de la paleta, color repetido…), el
backend responde `400` con un `detail` explicativo, pero `handleSave` lo
ignoraba y mostraba siempre un genérico «❌ Error al guardar». El usuario no
podía saber *por qué* fallaba.

### 2.4. `CAJA` como séptima terminal — un vestigio de diseño

`CONFIG_POR_DEFECTO` incluía una séptima entrada `{"id": "CAJA", …}`. Era un
vestigio: **toda terminal es una caja en potencia**. El modo «ver TODAS las
cuentas» del pizarrón lo gobierna el **turno de caja abierto**
(`caja_habilitada`), no un id de terminal llamado `CAJA`. Mantener esa entrada
contaminaba el vocabulario de ids (una terminal física = un `TERM-0N`).

---

## 3. La corrección

### 3.1. Backend

- **`apps/api/routers/terminals.py`** — se elimina la séptima entrada `CAJA`
  de `CONFIG_POR_DEFECTO`. La semilla queda como 6 terminales `TERM-01`…`TERM-06`.
- **`apps/api/terminal_config.json`** — reparado: 6 terminales canónicas, sin
  `CAJA`, cada una `{id, name, icon: "🖥️", color: null}`.
- **`apps/api/tests/test_f7_7_terminales.py`** — ajustado:
  - el fixture `aislar_config_terminales` ya no menciona `CAJA`;
  - el bloque de restauración de `test_criterio8_guardar_y_releer_config` ya no
    reinyecta `CAJA`;
  - `test_criterio12_caja_es_terminal_configurable` se renombra a
    **`test_criterio12_caja_no_es_terminal`** y ahora afirma
    `"CAJA" not in ids` y `ids == {f"TERM-{n:02d}" for n in range(1, 7)}`.

### 3.2. Frontend

- **`apps/pos/src/hooks/useTerminals.js`** — `addTerminal` calcula el siguiente
  número libre a partir de los ids `TERM-0N` existentes (ignorando ids legados
  que no sigan el patrón) y genera `TERM-0N` con `padStart(2, '0')`.
- **`apps/pos/src/components/POSHeader.jsx`** — se elimina el caso especial
  `CAJA`; el encabezado siempre rotula `Terminal <id>`.
- **`apps/pos/src/components/TerminalSelector.jsx`**:
  - `handleSave` propaga el mensaje real del backend
    (`result.message || 'Error al guardar'`);
  - **el bloque `{toast && (…)}` se replica en la rama del gestor**, de modo que
    el aviso de éxito/error es visible donde se pulsa el botón.

### 3.3. Tests

- **`apps/pos/src/hooks/useTerminals.bug05.test.jsx`** (nuevo, 4 tests) — el id
  continúa la serie `TERM-0N`; el nombre es `Terminal 4`; se ignoran ids legados
  `T*`; `addTerminal('start')` también genera `TERM-0N`.
- **`apps/pos/src/components/TerminalSelector.bug05.test.jsx`** (nuevo, 3 tests)
  — el toast muestra el mensaje del backend; el toast de éxito aparece; cae al
  genérico si el backend no da detalle.
- **`apps/pos/src/hooks/useTerminals.f6_5.test.jsx`** — criterio 8 ahora afirma
  que la terminal añadida es `TERM-04`.
- **`apps/pos/src/components/TerminalSelector.f13_3.test.jsx`** — docstring
  corregido: «CAJA NO es una terminal: toda terminal es una caja en potencia».

---

## 4. Qué NO se toca (y por qué)

- **`packaging_type: 'CAJA'`** — es un tipo de empaque de pedido, sin relación
  con las terminales. Intacto.
- **`TIPOS_EMPAQUE.CAJA`** (`useOrderProgramming.js`) — idem. Intacto.
- **El modo «ver todas las cuentas»** — sigue gobernado por `caja_habilitada`
  (turno de caja abierto), no por un id de terminal.

---

## 5. Verificación

| Suite | Resultado |
|---|---|
| Backend `pytest` (Docker) | **352 passed** |
| Frontend `vitest` | **808 passed** (74 archivos) |

---

## 6. Lección

Un `return` temprano por rama de UI puede dejar fuera elementos transversales
(toasts, modales, banners). Cuando un aviso «no aparece», conviene comprobar
**en qué rama de retorno vive** antes de sospechar del handler o del backend.
