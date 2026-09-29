# 📋 FICHA DE EVIDENCIA — CIERRE DE FASE 4 (Gestor de Caja)

> **Fecha:** 29 Sep 2026
> **Fase:** Fase 4 — Gestor de Caja (Plan Maestro §7, resultado esperado #4)
> **Plan:** [`PLAN_DE_ABORDAJE_FASE_4_POR_PARTES.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_4_POR_PARTES.md:1) v1.0
> **Estado:** ✅ **FASE CERRADA — PUERTA EN VERDE**
> **Depende de:** Fases 4.0, 4.1, 4.2, 4.3 y 4.4 — todas cerradas y en verde

---

## 1. Qué se construyó (las 5 sub-fases)

| Sub-fase | Entrega | Archivo(s) | Commit | Puerta |
|---|---|---|---|---|
| **4.0** | Ligar `Ticket.cash_session_id` al cobrar (prerrequisito del arqueo) | [`routers/pos.py`](../../apps/api/routers/pos.py:105) | `bcc024b` | 2/2 |
| **4.1** | Backend de caja: 6 endpoints `/cash/*` + esquemas + `include_router` | [`routers/cash.py`](../../apps/api/routers/cash.py:1), [`schemas.py`](../../apps/api/schemas.py:258), [`main.py`](../../apps/api/main.py:1) | `53a35de` | 7/7 |
| **4.2** | `cashService.js`: 6 llamadas con `{outcome, reason}` + 6 en `client.js` | [`services/cashService.js`](../../apps/pos/src/services/cashService.js:1), [`api/client.js`](../../apps/pos/src/api/client.js:230) | `9b720af` | 13/13 |
| **4.3** | `GestorDeCaja.jsx`: pantalla con 3 estados (sin turno / abierto / cierre) | [`GestorDeCaja.jsx`](../../apps/pos/src/GestorDeCaja.jsx:1) | `c2e62d5` | 9/9 |
| **4.4** | `CorteTicketTemplate.jsx`: plantilla de impresión del corte (solo renderiza) | [`CorteTicketTemplate.jsx`](../../apps/pos/src/components/CorteTicketTemplate.jsx:1) | `50e9d9d` | 18/18 |

### 1.1 El flujo completo, de extremo a extremo

```
abrir turno → movimientos → resumen en vivo → arqueo → cierre → plantilla de corte
   (4.1)         (4.1)          (4.3)          (4.3)   (4.3)        (4.4)
```

Cada eslabón está cubierto por su propia puerta. El eslabón 4.0 es el que hace
que el arqueo **no dé cero**: sin él, las "ventas en efectivo" de RN-53 serían
siempre cero porque ningún ticket estaría ligado a su sesión de caja.

---

## 2. El prerrequisito 4.0 (la dependencia oculta)

El diagnóstico §1.3 del plan detectó que [`cobrar_ticket`](../../apps/api/routers/pos.py:309)
**nunca** asignaba `Ticket.cash_session_id`. La columna existía desde la Fase 1
pero permanecía nula. Consecuencia: el contrato 13 (`caja.cerrar_turno`) calcula
`efectivo_esperado = fondo + entradas − salidas + ventas_en_efectivo` (RN-53), y
las "ventas en efectivo" salen de los tickets ligados por `cash_session_id`. Sin
el ligado, el arqueo daría **cero siempre**.

**Solución:** se añadió el helper `_sesion_caja_activa_o_400` y `cobrar_ticket`
ahora **exige** un turno de caja abierto (RN-49) y liga el ticket a él. Si no hay
turno, el cobro falla con un `reason` claro.

> **Hallazgo de rigor:** la primera versión del helper pasaba solo `terminal_id` a
> `rn49_una_sesion_caja_por_terminal`, pero la regla filtra por `terminal_id` **y**
> `estado` (no `status`). Habría lanzado `KeyError`. Se corrigió pasando
> `[{"terminal_id": s.terminal_id, "estado": s.status} for s in sesiones]`.

---

## 3. Evidencia de la puerta final (Fase 4 completa)

### 3.1 Suite completa

```
$ npm run test   (cwd: NUEVO-POS)
=== TESTS (Fase 3.0 — runner real) ===

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
```

### 3.2 Conteos exactos

| Suite | Conteo |
|---|---|
| pytest (API, Docker) | **207 tests** collected |
| Vitest (componentes React) | **99 tests** en **7 archivos** |
| Node (runner propio) | **3 archivos** |

### 3.3 Guardianes de estándares

```
$ node scripts/guards.mjs
=== GUARDIANES DE ESTÁNDARES (F0 + F4/A-04) ===
Archivos de código escaneados: 97
[OK  ] E-05 — Silencios en ruta crítica → 0 coincidencia(s)
[OK  ] A-04 — Silencios en la ruta crítica de guardianes → 0 coincidencia(s)
[OK  ] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
[OK  ] E-15 — TODOs sin formato declarado → 0 coincidencia(s)
[OK  ] R-01 — Ancho fijo en la superficie → 0 coincidencia(s)
[OK  ] E-09 — Dinero en Float → 0 coincidencia(s)
[OK  ] E-10 — Tiempo naive → 0 coincidencia(s)
PUERTA F0 EN VERDE
PUERTA F4/A-04 EN VERDE
PUERTA F5/R-01 EN VERDE
```

---

## 4. Trazabilidad — contratos 9 a 14

| # | Contrato | Endpoint | Sub-fase |
|---|---|---|---|
| 9 | `caja.abrir_turno` | `POST /cash/open-session` | 4.1 |
| 10 | `caja.sesion_activa` | `GET /cash/session-active` | 4.1 |
| 11 | `caja.registrar_movimiento` | `POST /cash/movements` | 4.1 |
| 12 | `caja.resumen_turno` | `GET /cash/summary` | 4.1 |
| 13 | `caja.cerrar_turno` | `POST /cash/close-session` | 4.1 |
| 14 | `caja.reporte_diario` | `GET /cash/daily-report` | 4.1 (endpoint) |

**Reglas de negocio cubiertas:** RN-49 a RN-60 (categorías C.8 y C.9), ya
implementadas y probadas desde la Fase 3, ahora **consumidas** por los endpoints.

**Frontera por contratos (A-02):** el POS consume los contratos 9–14 vía
`cashService.js`; **no** lee las tablas `cash_sessions` ni `cash_movements`
directamente.

---

## 5. Alineación con el objetivo del proyecto (§10.1 del plan)

| Verificación | Resultado |
|---|---|
| ¿Respeta la regla dura (no tocar el ERP viejo)? | ✅ Todo el trabajo va en `NUEVO-POS` |
| ¿Respeta las 6 prohibiciones absolutas? | ✅ Sin timers, sin `clearCart` sin verificación, sin estado en async |
| ¿Respeta las 10 reglas de batalla? | ✅ `{outcome, reason}`, UTC, respuesta ligera, 3 estados |
| ¿Respeta la frontera por contratos (A-02)? | ✅ Consume contratos 9–14, no lee tablas |
| ¿Sigue el orden "de adentro hacia afuera" (§10.6)? | ✅ Rebanadas verticales 4.0 → 4.1 → 4.2 → 4.3 → 4.4 |
| ¿Cada sub-fase tiene puerta verificable? | ✅ 2/2, 7/7, 13/13, 9/9, 18/18 |
| ¿Contribuye al objetivo? | ✅ Es el resultado esperado #4; recupera lo que DeepSeek no hizo |

---

## 6. Delimitación de alcance (§9 del plan) — lo que NO entró

| Qué | Por qué no entra | Dónde va |
|---|---|---|
| Pantalla de **reporte diario** (contrato 14) | Su consumidor es "POS / Estadísticas"; es otra rebanada | Fase futura |
| **Impresión física** del corte | Es infraestructura de salida | **Fase 6** |
| **Job de TTL** de 24 h (lección OMEGA) | Es infraestructura, no una rebanada de negocio | Infraestructura |
| **Pizarrón de cuentas** | Es otra rebanada | **Fase 5** |
| **CRM / notificaciones** | Es otra rebanada | **Fase 8** |

> **Fase 4 entrega:** el flujo completo de caja (abrir turno → movimientos →
> resumen → arqueo → cierre → plantilla de corte), con su backend, su servicio y
> su pantalla. **Nada más.**

---

## 7. Deuda registrada (heredada a fases futuras)

| ID | Deuda | Origen | Se resuelve en |
|---|---|---|---|
| **D-17** | Sin reintentos (`withRetries`) en las operaciones de caja. Son mutaciones con efecto contable; reintentar a ciegas un cierre podría duplicar conteos. | F4.2 | Decisión del dueño |
| **D-18** | La impresión física real del corte no existe todavía. | F4.4 | **Fase 6** |

---

## 8. Riesgo residual aceptado (§10.2 del plan)

| Riesgo | Mitigación aplicada |
|---|---|
| El prerrequisito 4.0 toca el backend de tickets (Fase 3) | Se aisló como sub-fase propia con su puerta; no se relajó ninguna puerta de F3 |
| El contrato 14 podría requerir revisión del arquitecto | Se implementó el endpoint; la pantalla quedó fuera (§9) |
| El orden 4.0→4.1→4.2→4.3→4.4 es estricto | La regla dura #4 lo exigió: ninguna sub-fase sin la puerta anterior en verde |

---

## 9. Historial de commits de la Fase 4

```
50e9d9d F4.4: plantilla de impresion del corte de caja (solo renderiza)
c2e62d5 F4.3: pantalla de caja (GestorDeCaja) con 3 estados + puerta en verde
9b720af F4.2: cashService.js (contratos 9-14) con contrato {outcome, reason}
53a35de F4.1: backend de caja (contratos 9-14) + puerta en verde
bcc024b F4.0: liga Ticket.cash_session_id al cobrar (prerrequisito del arqueo)
```

Los 5 commits están empujados a `origin/main`.

---

## 10. Veredicto

**La Fase 4 está cerrada.** El Gestor de Caja —una de las piezas que DeepSeek
**no construyó** (56 KB en el POS viejo)— existe ahora en `NUEVO-POS` como una
rebanada vertical completa: dato, contrato, servicio y superficie, cada uno con
su puerta en verde y su ficha de evidencia.

| Criterio de cierre | Estado |
|---|---|
| Las 5 sub-fases cerradas | ✅ |
| Todas las puertas en verde | ✅ |
| Suite completa en verde (207 + 99 + 3) | ✅ |
| Guardianes 7/7 en verde | ✅ |
| Cada sub-fase con ficha de evidencia | ✅ |
| Alcance respetado (§9) | ✅ |
| Deuda registrada, no oculta | ✅ (D-17, D-18) |
| Todo commiteado y respaldado en `origin/main` | ✅ |

**Siguiente rebanada natural:** Fase 5 — Pizarrón de Cuentas Abiertas (Plan
Maestro §7).
