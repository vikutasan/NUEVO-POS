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

---

## 10. El turno de caja pertenece a la terminal que COBRA (BUG-08)

> **Ficha asociada:** [`FICHA_FIX_BUG08_CAJA_COBRA_CUENTAS_AJENAS.md`](../05-plan-de-construccion/FICHA_FIX_BUG08_CAJA_COBRA_CUENTAS_AJENAS.md)
> **Reglas relacionadas:** RN-12, RN-24, RN-49, RN-53, RN-55.

El principio «toda terminal es una caja en potencia» tiene una consecuencia
operativa directa: **una terminal con turno abierto puede cobrar cuentas de OTRAS
terminales**. El dinero se cuenta en la caja que lo **recibió** (RN-53), no en la
de origen del ticket.

### 10.1 La regla

- El **turno de caja** del cobro lo determina la **terminal que COBRA**, no la
  terminal de **origen** del ticket.
- El `terminal_id` del ticket **NUNCA se sobreescribe** (RN-12): el origen es
  trazabilidad inmutable. La CAJA cobra, pero **no se adueña** del ticket.
- El frontend **declara** el turno (`cash_session_id`); el backend lo **VALIDA**
  (E-13): existe (RN-49) + está `OPEN` (RN-55) + su terminal tiene sesión activa
  (RN-24). Nunca se confía en el cliente.
- `cash_session_id` es **opcional** (retrocompatibilidad): si falta, el backend
  cae al turno de la terminal del ticket.

### 10.2 El anti-patrón que se corrigió

Antes, el backend derivaba el turno de la terminal de ORIGEN del ticket
(`_sesion_caja_activa_o_400(db, ticket.terminal_id)`). Cuando la CAJA cobraba una
cuenta creada en TERM-01, buscaba el turno de **TERM-01** (inexistente) y
respondía `400 "No hay turno de caja abierto para esta terminal"` — un error
**falso**, porque la CAJA sí tenía su turno abierto.

Ahora el turno lo declara la terminal que COBRA y el backend lo valida con
`_sesion_caja_por_id_o_400` (existe + OPEN + sesión activa).

### 10.3 Cómo se prueba

| Test | Qué fija |
|---|---|
| `test_1_cobra_cuenta_ajena_con_turno_propio` (backend) | La CAJA cobra una cuenta de otra terminal con SU turno |
| `test_2_terminal_id_del_ticket_es_inmutable` (backend) | El `terminal_id` de origen NO se sobreescribe (RN-12) |
| `test_3_retrocompat_sin_cash_session_id` (backend) | Sin `cash_session_id` cae al turno del ticket |
| `test_4/5/6_*_da_400` (backend) | Turno inexistente / cerrado / sin sesión → 400 |
| `hooks.f3_3.test.jsx` (frontend) | `cobrar` reenvía `cash_session_id` solo si se declara |
