# FICHA — BUG-08: La caja cobra cuentas de OTRAS terminales

**Fecha:** 10 Oct 2026
**Origen:** prueba manual del usuario en el navegador (workflow de bugs)
**Estado:** ✅ CERRADO
**Reglas relacionadas:** RN-12, RN-24, RN-49, RN-53, RN-55, RN-75/76/77
**Documento de arquitectura:** [`ARQUITECTURA_TERMINALES_Y_CAJA.md`](../01-logica-del-negocio/ARQUITECTURA_TERMINALES_Y_CAJA.md) §10 y §11

---

## 1. El síntoma

Al cobrar desde una terminal con turno de caja abierto una cuenta **creada en
otra terminal**, el backend respondía:

```
400 "No hay turno de caja abierto para esta terminal"
```

El error era **falso**: la terminal que cobraba **sí** tenía su turno abierto.
El mensaje apuntaba a la terminal equivocada.

---

## 2. La causa raíz

El backend derivaba el turno de caja de la terminal de **ORIGEN** del ticket:

```python
# ANTES (incorrecto)
sesion = await _sesion_caja_activa_o_400(db, ticket.terminal_id)
```

Cuando la CAJA cobraba una cuenta creada en `TERM-01`, buscaba el turno de
**`TERM-01`** (que no existía) y fallaba. Pero el turno que importa es el de la
terminal que **COBRA**, no el de la que **creó** el ticket.

El principio «toda terminal es una caja en potencia» (BUG-05) tiene una
consecuencia operativa directa: **una terminal con turno abierto puede cobrar
cuentas de OTRAS terminales**. El dinero se cuenta en la caja que lo **recibió**
(RN-53).

---

## 3. La corrección

El frontend **declara** el turno (`cash_session_id`); el backend lo **VALIDA**
(E-13: el backend es la autoridad, nunca confía en el cliente) con
`_sesion_caja_por_id_o_400`:

1. El turno **existe** (si no, 400).
2. Está **`OPEN`** (RN-55: una sesión cerrada es inmutable).
3. Su terminal tiene **sesión de terminal activa** (RN-24).

El `terminal_id` del ticket **NUNCA se sobreescribe** (RN-12): el origen es
trazabilidad inmutable. La CAJA cobra, pero **no se adueña** del ticket.

`cash_session_id` es **opcional** (retrocompatibilidad): si falta, el backend
cae al turno de la terminal del ticket.

---

## 4. Cómo se prueba

| Test | Qué fija |
|---|---|
| `test_1_cobra_cuenta_ajena_con_turno_propio` (backend) | La CAJA cobra una cuenta de otra terminal con SU turno |
| `test_2_terminal_id_del_ticket_es_inmutable` (backend) | El `terminal_id` de origen NO se sobreescribe (RN-12) |
| `test_3_retrocompat_sin_cash_session_id` (backend) | Sin `cash_session_id` cae al turno del ticket |
| `test_4/5/6_*_da_400` (backend) | Turno inexistente / cerrado / sin sesión → 400 |
| `test_7_regresion_cobro_normal_sigue_funcionando` (backend) | El cobro normal (misma terminal) sigue funcionando |
| `hooks.f3_3.test.jsx` (frontend) | `cobrar` reenvía `cash_session_id` solo si se declara |

---

## 5. Las cuatro observaciones de la deuda (cerradas en una sola tanda)

Al cerrar BUG-08 quedaron cuatro observaciones. Se abordaron **las cuatro**:

| # | Observación | Severidad | Decisión |
|---|---|---|---|
| **Obs-1** | El nombre `cash_session_id` es heredado y engañoso | Baja | **NO renombrar**; documentar el vocabulario + registrar la deuda |
| **Obs-2** | El fallback silencioso puede ocultar bugs | Media | Hacerlo **OBSERVABLE**: asiento de auditoría + flag `POS_ESTRICTO_TURNO_CAJA` |
| **Obs-3** | La validación de RN-24 es sutil (3 pasos) | Baja | **Documentar el por qué** en el helper y en la ficha |
| **Obs-4** | ¿Quién cuadra la caja? El corte no distinguía propio de ajeno | Alta | **Desglosar por origen** en el corte (`ventas_propias`/`ventas_ajenas`) |

### 5.1 Obs-1 — Vocabulario de `cash_session_id`

El nombre es heredado del POS viejo. En el cobro ajeno **no** es «la sesión de
caja del ticket», sino **el turno de la caja que COBRA**. Se conserva por
retrocompatibilidad de contrato; léase siempre como «el turno de caja que cobra».
La deuda de nomenclatura queda registrada junto a la de BUG-02/03 en
`DECISIONES_ARQUITECTONICAS_DEL_NUEVO_POS.md` §7.

### 5.2 Obs-2 — El fallback es legítimo pero OBSERVABLE

1. **Asiento de auditoría.** Cada vez que se usa el fallback, el backend escribe
   un `PosAuditLog` con `extras.observacion = "DEUDA-BUG08-OBS2"` y
   `extras.motivo = "fallback_turno_de_la_terminal_del_ticket"`. El log es
   append-only (RN-75/76/77).
2. **Modo estricto (opt-in).** Si `POS_ESTRICTO_TURNO_CAJA` está activa
   (`1`/`true`/`yes`/`on`), un cobro **sin** `cash_session_id` falla con **400**
   en vez de caer al fallback. Por defecto está **apagada** (retrocompat).

| `POS_ESTRICTO_TURNO_CAJA` | `cash_session_id` | Resultado |
|---|---|---|
| apagada (default) | declarado | Cobra con el turno declarado (validado) |
| apagada (default) | ausente | Cobra con el turno del ticket **+ asiento de auditoría** |
| activa | declarado | Cobra con el turno declarado (validado) |
| activa | ausente | **400** — el cobro exige declarar el turno |

### 5.3 Obs-3 — Por qué la validación tiene tres pasos

Cada paso cubre un fallo distinto: RN-49 (existe), RN-55 (no está cerrado),
RN-24 (la terminal sigue operando). Omitir cualquiera permitiría cobrar en una
caja inexistente, cerrada o muerta.

### 5.4 Obs-4 — ¿Quién cuadra la caja?

El contrato 12 (`caja.resumen_del_turno`) expone tres campos nuevos:
`ventas_propias`, `ventas_ajenas` y `num_transacciones_ajenas`.

**Invariante:** `ventas_propias + ventas_ajenas == total_ventas`. El total NO
cambia; el desglose solo lo **explica**.

Se materializa en:

- **Backend:** `_clasificar_ventas_del_turno()` en `routers/cash.py`.
- **Frontend (pantalla):** `GestorDeCaja.jsx` (memo `desglose` + fila condicional).
- **Frontend (impresión):** `CorteTicketTemplate.jsx` y `generarCorteHTML()`
  (`utils/ticketGenerator.js`).

| Test | Qué fija |
|---|---|
| `test_1_corte_separa_propias_de_ajenas` (backend) | El corte separa propias de ajenas |
| `test_2_sin_ajenas_el_desglose_es_cero` (backend) | Sin ajenas, `ventas_ajenas` = 0 |
| `test_3_invariante_propias_mas_ajenas_es_total` (backend) | `propias + ajenas = total` |
| `test_4_contrato_12_declara_los_campos_nuevos` (backend) | El contrato 12 declara los campos |
| `GestorDeCaja.deuda_bug08_obs4.test.jsx` (frontend) | La línea aparece solo con ajenas |
| `CorteTicketTemplate.deuda_bug08_obs4.test.jsx` (frontend) | El corte impreso la declara |
| `ticketGenerator.f6_0.test.jsx` (frontend) | `generarCorteHTML` la declara |

---

## 6. Nota operativa para el cajero

> Si en tu corte aparece **«De otras terminales»**, ese dinero **no nació en tu
> terminal**: lo cobraste por una cuenta creada en otro puesto. Cuádralo en **tu**
> caja (RN-53: el dinero se cuenta donde se recibió), pero **no** lo reportes como
> venta de tu terminal. El origen del ticket es trazabilidad inmutable (RN-12).

---

## 7. Lo que NO se hizo (y por qué)

- **No se renombró `cash_session_id`.** Está en el contrato 33, en el frontend y
  en los tests; renombrarlo sería un cambio de contrato con costo alto y beneficio
  bajo. Se documenta el vocabulario y se registra la deuda (Obs-1).
- **No se eliminó el fallback.** Es la garantía de retrocompatibilidad; se hizo
  observable (Obs-2) en vez de eliminarlo.
- **No se tocó el arqueo.** El desglose por origen es **informativo**; el arqueo
  (esperado vs. contado) sigue siendo la única fuente de verdad del descuadre.
