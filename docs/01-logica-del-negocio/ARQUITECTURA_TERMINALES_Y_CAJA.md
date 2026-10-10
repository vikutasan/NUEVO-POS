# Arquitectura — Terminales y Caja

> **Fase:** F3 (Comportamiento) — documento de arquitectura.
> **Origen:** Corrección arquitectónica del usuario durante la prueba manual (BUG-05).
> **Ficha asociada:** [`FICHA_FIX_BUG05_CAJA_NO_ES_TERMINAL.md`](../05-plan-de-construccion/FICHA_FIX_BUG05_CAJA_NO_ES_TERMINAL.md)
> **Reglas relacionadas:** RN-01, RN-02, RN-03, RN-31, RN-49, RN-59.

Este documento fija, sin ambigüedad, **qué es una terminal y qué es una caja** en el
nuevo POS. Nace de un error de diseño real (BUG-05) que se corrigió en todo el
sistema. Se escribe para que **nadie vuelva a introducir un id de terminal llamado
`CAJA`**.

---

## 1. El principio

> **Toda terminal es una caja en potencia.**

Una **terminal** es un puesto físico de trabajo (una computadora, una tablet, un
punto de venta). Una **caja** no es un puesto distinto: es un **turno de caja**
abierto sobre una terminal. Cualquier terminal puede convertirse en caja con sólo
**abrir su turno**.

Por tanto:

- **No existe** una terminal especial llamada `CAJA`.
- **No existe** un id de terminal `CAJA` en la configuración.
- El modo «ver TODAS las cuentas» del pizarrón **no** lo activa un id de terminal:
  lo activa el **turno de caja abierto** de esa terminal.

---

## 2. Los dos conceptos, separados

| Concepto | Qué es | Dónde vive | Identidad |
|---|---|---|---|
| **Terminal** | Puesto físico de trabajo | `terminal_config.json` + `TerminalLock` | `TERM-0N` (p. ej. `TERM-01`) |
| **Turno de caja** | Sesión de caja abierta sobre una terminal | `CashSession` (tabla) | `terminal_id` + rango temporal |

Son **ortogonales**:

- Una terminal puede tener **candado** (ocupada por un usuario) sin tener turno de
  caja abierto.
- Una terminal puede tener **turno de caja abierto** sin candado.
- El candado y el turno de caja son **independientes** (probado en
  `test_criterio11_caja_y_candado_son_independientes`).

---

## 3. El vocabulario canónico de ids

Una terminal física **siempre** se identifica con el patrón `TERM-0N`:

```
TERM-01, TERM-02, TERM-03, TERM-04, TERM-05, TERM-06, …
```

Reglas del vocabulario:

1. **Formato:** `TERM-` + número de dos dígitos (`padStart(2, '0')`).
2. **La semilla** (`CONFIG_POR_DEFECTO`) son **6 terminales** `TERM-01`…`TERM-06`.
3. **Al añadir** una terminal, el id se calcula a partir del **mayor** `TERM-0N`
   existente + 1. Nunca se reutiliza un número.
4. **Los ids legados** que no sigan el patrón (`T1`, `T2`, …) se **ignoran** al
   calcular el siguiente número, pero no se borran de golpe: se corrigen al
   guardar.
5. **`CAJA` no es un id válido.** Nunca lo fue; su presencia era un vestigio.

> **RN-12** — no se muta el id de una terminal que ya tiene datos. El id es la
> clave de la sesión, del ticket y del candado.

---

## 4. El modo «ver todas las cuentas»

El pizarrón (`OpenAccountsCorkboard`) puede mostrar dos vistas:

| Vista | Filtro | Cómo se activa |
|---|---|---|
| **Sólo mi terminal** | `terminal_id = TERM-0N` | Por defecto (RN-31) |
| **Todas las cuentas** | sin filtro de terminal | Cuando la terminal tiene **turno de caja abierto** (`caja_habilitada`) |

El backend expone esto en `GET /pos/open-accounts`:

- Con `terminal_id` → devuelve **sólo** las cuentas `OPEN` de esa terminal (RN-31).
- **Sin** `terminal_id` (o vacío) → devuelve las cuentas `OPEN` de **todas** las
  terminales. Un `terminal_id` vacío se trata como «sin filtro», **no** como 422.

El frontend decide qué enviar según `caja_habilitada`, que se deriva del turno de
caja activo (`useTerminals.js`), **no** de un id de terminal.

> **RN-49** — una sola sesión de caja por terminal.
> **RN-59** — el reporte diario se emite por terminal.

---

## 5. Dónde se materializa (mapa de código)

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Backend — semilla | `apps/api/routers/terminals.py` (`CONFIG_POR_DEFECTO`) | 6 terminales `TERM-01`…`TERM-06`, **sin** `CAJA` |
| Backend — persistencia | `apps/api/terminal_config.json` | Config viva: `{id, name, icon, color}` |
| Backend — validación | `apps/api/routers/terminals.py` (`guardar_config`) | Color en catálogo + unicidad |
| Backend — cuentas | `apps/api/routers/pos.py` (`cuentas_abiertas`) | Filtro por `terminal_id` o «todas» |
| Frontend — estado | `apps/pos/src/hooks/useTerminals.js` | `addTerminal` genera `TERM-0N`; `caja_habilitada` |
| Frontend — encabezado | `apps/pos/src/components/POSHeader.jsx` | Rotula `Terminal <id>`, sin caso especial |
| Frontend — gestor | `apps/pos/src/components/TerminalSelector.jsx` | Alta/baja/edición + guardado |

---

## 6. Qué NO es una caja (falsos amigos)

Estos usos de la palabra «CAJA» **no tienen relación** con las terminales y **no
deben tocarse**:

- **`packaging_type: 'CAJA'`** — tipo de **empaque** de un pedido (caja de cartón).
- **`TIPOS_EMPAQUE.CAJA`** (`useOrderProgramming.js`) — el mismo concepto, en el
  programador de pedidos.
- **`cash_sessions` / `cash_movements`** — el **turno de caja** y sus movimientos.
  Esto sí es «caja», pero es una **sesión**, no una terminal.

> Regla mnemotécnica: si la palabra «CAJA» aparece junto a un **id de terminal**,
> es un error. Si aparece junto a un **empaque** o a un **turno**, es correcto.

---

## 7. Anti-patrones prohibidos

1. ❌ Añadir `{"id": "CAJA", …}` a `CONFIG_POR_DEFECTO` o a `terminal_config.json`.
2. ❌ Generar ids de terminal fuera del patrón `TERM-0N` (p. ej. `T1`, `caja1`).
3. ❌ Ramificar la UI por `terminalId === 'CAJA'` para decidir si se ven todas las
   cuentas. Eso lo decide **`caja_habilitada`**.
4. ❌ Reutilizar el número de una terminal eliminada.
5. ❌ Confundir `packaging_type: 'CAJA'` con una terminal.

---

## 8. Cómo se prueba

| Test | Qué fija |
|---|---|
| `test_criterio12_caja_no_es_terminal` (backend) | `"CAJA" not in ids` y `ids == {TERM-01…TERM-06}` |
| `test_criterio11_status_con_turno_abierto_marca_caja_habilitada` | El turno abierto marca `caja_habilitada` |
| `test_criterio11_caja_y_candado_son_independientes` | Candado y caja son ortogonales |
| `test_sin_terminal_id_devuelve_todas` (F5) | Sin filtro → todas las cuentas |
| `test_terminal_id_vacio_devuelve_todas` (F5) | Vacío = «todas», no 422 |
| `useTerminals.bug05.test.jsx` (frontend) | `addTerminal` genera `TERM-0N` |
| `TerminalSelector.f13_3.test.jsx` (frontend) | Docstring: «CAJA NO es una terminal» |

---

## 9. Resumen en una frase

**Una terminal es un puesto; una caja es un turno.** El id de una terminal siempre
es `TERM-0N`; el modo «ver todas las cuentas» lo gobierna el turno de caja abierto
(`caja_habilitada`), nunca un id llamado `CAJA`.
