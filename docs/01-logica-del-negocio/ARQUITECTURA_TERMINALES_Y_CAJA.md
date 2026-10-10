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

### 10.4 ¿Quién cuadra la caja? El corte explica el cobro ajeno (DEUDA-BUG08 · Obs. 4)

> **Origen:** Observación 4 del plan [`PLAN_DEUDA_BUG08_CUATRO_OBSERVACIONES.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DEUDA_BUG08_CUATRO_OBSERVACIONES.md).
> **Reglas relacionadas:** RN-53.

Si una caja puede cobrar cuentas de OTRAS terminales (§10), el cajero necesita saber
**cuánto de su caja no nació en su terminal**. Sin ese desglose, el corte muestra un
total que no cuadra con «lo que vendió esta terminal» y el cajero no entiende por qué.

El contrato 12 (`caja.resumen_del_turno`) expone tres campos nuevos:

| Campo | Qué es |
|---|---|
| `ventas_propias` | Suma de los tickets cuyo `terminal_id` == la terminal del turno |
| `ventas_ajenas` | Suma de los tickets cobrados en este turno pero originados en OTRA terminal |
| `num_transacciones_ajenas` | Cuántos tickets ajenos se cobraron |

**Invariante:** `ventas_propias + ventas_ajenas == total_ventas`. El total NO cambia;
el desglose solo lo **explica**.

**Nota operativa:** el desglose por origen es **informativo**. El arqueo (esperado vs.
contado) sigue siendo la única fuente de verdad del descuadre. La fila «De otras
terminales (N)» solo aparece cuando `ventas_ajenas > 0`; si la caja no cobró cuentas
ajenas, el corte no la muestra.

Se materializa en:

- **Backend:** `_clasificar_ventas_del_turno()` en `routers/cash.py` (recibe
  `terminal_del_turno` y separa por origen).
- **Frontend (pantalla):** `GestorDeCaja.jsx` (memo `desglose` + fila condicional).
- **Frontend (impresión):** `CorteTicketTemplate.jsx` y `generarCorteHTML()`
  (`utils/ticketGenerator.js`), que alimenta el corte térmico real.

### 10.5 El fallback del turno es legítimo pero OBSERVABLE (DEUDA-BUG08 · Obs. 2)

> **Origen:** Observación 2 del plan de las cuatro observaciones.
> **Reglas relacionadas:** RN-75, RN-76, RN-77.

Cuando el cliente **no** declara `cash_session_id`, el backend cae al turno de la
terminal del ticket (§10.1). Ese fallback es **legítimo** (retrocompatibilidad), pero
**silencioso**: si un cliente olvida declarar el turno, el cobro se registra en la caja
equivocada sin dejar rastro. Para que el fallback sea **observable**:

1. **Asiento de auditoría.** Cada vez que se usa el fallback, el backend escribe un
   `PosAuditLog` con `extras.observacion = "DEUDA-BUG08-OBS2"` y el motivo
   `fallback_turno_de_la_terminal_del_ticket`. El log es append-only (RN-75/76/77).
2. **Modo estricto (opt-in).** Si la variable de entorno `POS_ESTRICTO_TURNO_CAJA`
   está activa (`1`/`true`/`yes`/`on`), un cobro **sin** `cash_session_id` falla
   ruidosamente con **400** en vez de caer al fallback. Por defecto está **apagada**:
   el comportamiento retrocompatible se conserva.

| `POS_ESTRICTO_TURNO_CAJA` | Cliente declara turno | Cliente NO declara turno |
|---|---|---|
| Apagada (default) | Cobra con el turno declarado | Cobra con el turno del ticket + **asiento de auditoría** |
| Activa | Cobra con el turno declarado | **400** (no cobra) |

### 10.6 Nota de vocabulario: `cash_session_id` (DEUDA-BUG08 · Obs. 1)

El nombre `cash_session_id` es **heredado** del POS viejo y puede confundir: no es «el
id de la caja» como entidad, sino **el id del turno de caja** (`CashSession`) de la
terminal que cobra. Se conserva por retrocompatibilidad de contrato; léase siempre como
«el turno de caja que cobra». No se renombra (deuda de nomenclatura registrada junto a
BUG-02/03).

### 10.7 Por qué la validación del turno declarado tiene tres pasos (DEUDA-BUG08 · Obs. 3)

`_sesion_caja_por_id_o_400` valida **tres** cosas, y las tres son necesarias:

1. **Existe** el `cash_session_id` (si no, 400).
2. **Está `OPEN`** (RN-55: una sesión cerrada es inmutable; cobrar en ella sería
   escribir en el pasado).
3. **Su terminal tiene sesión de terminal activa** (RN-24: sin sesión activa no se
   opera).

Omitir cualquiera de las tres permitiría cobrar en una caja inexistente, cerrada o
muerta. La validación es la frontera E-13: el backend nunca confía en el cliente.

---

## 11. Las cuatro observaciones de la deuda BUG-08

> **Plan asociado:** [`PLAN_DEUDA_BUG08_CUATRO_OBSERVACIONES.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DEUDA_BUG08_CUATRO_OBSERVACIONES.md)
> **Origen:** Revisión crítica del usuario tras cerrar BUG-08.

Al cerrar BUG-08 quedaron cuatro observaciones. Se abordaron **las cuatro** en una
sola tanda. Esta sección deja constancia del **por qué** de cada decisión.

### 11.1 Obs-1 — El nombre `cash_session_id` es heredado y engañoso (Baja)

**Observación:** el campo se llama `cash_session_id`, pero en el cobro ajeno
**no** representa «la sesión de caja del ticket», sino **el turno de la caja que
cobra**. El nombre invita a confundir ambos conceptos.

**Decisión: NO renombrar.** El nombre ya está en el contrato 33, en el frontend y
en los tests. Renombrarlo sería un cambio de contrato con costo alto y beneficio
bajo. En su lugar se documenta el vocabulario (ver §11.4) y se registra la deuda
de nomenclatura junto a las de BUG-02/03.

### 11.2 Obs-2 — El fallback silencioso puede ocultar bugs (Media)

**Observación:** si el cliente **no** declara `cash_session_id`, el backend cae
al turno de la terminal del ticket **sin dejar rastro**. Un frontend que olvide
declarar el turno cobraría en la caja equivocada y nadie se enteraría.

**Decisión: hacer el fallback OBSERVABLE, sin romper la retrocompatibilidad.**

1. **Asiento de auditoría.** Cada vez que se usa el fallback se escribe un
   `PosAuditLog` con `extras.observacion = "DEUDA-BUG08-OBS2"` y
   `extras.motivo = "fallback_turno_de_la_terminal_del_ticket"`. El log es
   append-only (RN-75/76/77); el asiento deja evidencia de que el turno NO se
   declaró.
2. **Modo estricto opcional.** La variable de entorno `POS_ESTRICTO_TURNO_CAJA`
   (`1`/`true`/`yes`/`on`) convierte el fallback en un **400 ruidoso**: el cobro
   exige declarar `cash_session_id`. Por defecto está **apagada** (retrocompat).

| `POS_ESTRICTO_TURNO_CAJA` | `cash_session_id` | Resultado |
|---|---|---|
| apagada (default) | declarado | Cobra con el turno declarado (validado) |
| apagada (default) | ausente | Cobra con el turno del ticket **+ asiento de auditoría** |
| activa | declarado | Cobra con el turno declarado (validado) |
| activa | ausente | **400** — el cobro exige declarar el turno |

### 11.3 Obs-3 — La validación de RN-24 es sutil (Baja)

**Observación:** el turno declarado se valida en **tres** pasos (existe → `OPEN`
→ su terminal tiene sesión activa). El tercero (RN-24) es el menos obvio: un
turno puede existir y estar `OPEN` pero su terminal ya no tener sesión activa.

**Decisión: documentar el por qué.** La validación triple existe porque cada paso
cubre un fallo distinto: RN-49 (existe), RN-55 (no está cerrado), RN-24 (la
terminal sigue operando). Se deja el párrafo explicativo en el helper
`_sesion_caja_por_id_o_400` y en la ficha.

### 11.4 Obs-4 — ¿Quién cuadra la caja? (Alta)

**Observación:** cuando una caja cobra cuentas de otras terminales, el corte
mostraba un `total_ventas` que **no** distinguía lo propio de lo ajeno. El cajero
no podía saber cuánto de su caja nació en su terminal.

**Decisión: desglosar por origen en el corte.**

- El contrato 12 (`caja.resumen_del_turno`) expone tres campos nuevos:
  `ventas_propias`, `ventas_ajenas` y `num_transacciones_ajenas`.
- El **total no cambia** (invariante: `ventas_propias + ventas_ajenas = total_ventas`).
- El **Gestor de Caja** muestra una línea «De otras terminales (N)» **solo si**
  `ventas_ajenas > 0`.
- El **corte impreso** (`CorteTicketTemplate` + `generarCorteHTML`) declara la
  misma línea, también condicional.

| Test | Qué fija |
|---|---|
| `test_1_corte_separa_propias_de_ajenas` (backend) | El corte separa propias de ajenas |
| `test_2_sin_ajenas_el_desglose_es_cero` (backend) | Sin ajenas, `ventas_ajenas` = 0 |
| `test_3_invariante_propias_mas_ajenas_es_total` (backend) | `propias + ajenas = total` |
| `test_4_contrato_12_declara_los_campos_nuevos` (backend) | El contrato 12 declara los campos |
| `GestorDeCaja.deuda_bug08_obs4.test.jsx` (frontend) | La línea aparece solo con ajenas |
| `CorteTicketTemplate.deuda_bug08_obs4.test.jsx` (frontend) | El corte impreso la declara |
| `ticketGenerator.f6_0.test.jsx` (frontend) | `generarCorteHTML` la declara |

### 11.5 Nota operativa para el cajero

> Si en tu corte aparece **«De otras terminales»**, ese dinero **no nació en tu
> terminal**: lo cobraste por una cuenta creada en otro puesto. Cuádralo en **tu**
> caja (RN-53: el dinero se cuenta donde se recibió), pero **no** lo reportes como
> venta de tu terminal. El origen del ticket es trazabilidad inmutable (RN-12).
