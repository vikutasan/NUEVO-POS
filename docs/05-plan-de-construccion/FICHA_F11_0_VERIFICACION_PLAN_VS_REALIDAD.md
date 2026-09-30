# FICHA F11.0 — Verificación de lo construido (plan vs. realidad)

> **Fase:** 11.0 — Verificación previa a la documentación final
> **Estado:** ✅ CERRADA (30 Sep 2026)
> **Tipo:** Auditoría de verificación (no construye producto; verifica y corrige)
> **Regla que la gobierna:** REGLA DURA 2 / E-19 — *"Verificar, no asumir"*

---

## 1. Por qué existe esta fase

Antes de redactar la **documentación final del POS** (§11 del Plan Maestro), el
usuario pidió una revisión manual de lo construido:

> *"ANTES DE ESTO QUIERO DARLE UNA REVISADA MANUAL A LO CONSTRUIDO PARA DETECTAR
> OMISIONES O DIVERGENCIAS."*

La **Revisión A** (paridad viejo POS vs. nuevo POS) ya se había hecho en la
**Fase 10**. Esta es la **Revisión B**: verificar que lo que el **plan y las
fichas AFIRMAN** coincide con lo que el **código REALMENTE contiene**.

La diferencia es importante:

| Revisión | Pregunta | Contra qué compara |
|---|---|---|
| **A (Fase 10)** | ¿Falta algo respecto al POS viejo? | El POS viejo (el oráculo) |
| **B (Fase 11.0)** | ¿Lo que el plan dice que hay, existe? | El código real |

Una documentación final construida sobre cifras falsas sería una documentación
que **miente con autoridad**. Esta fase existe para que eso no ocurra.

---

## 2. Método

Se verificaron **cuatro capas** contra el código real, sin asumir ninguna cifra:

1. **Contratos** — `contracts/registry.py` vs. `test_f2_frontera.py` vs. las fichas.
2. **Reglas** — `rules/registry.py` vs. `test_f3_comportamiento.py` vs. las fichas.
3. **Superficie** — `superficie/registry.py` vs. `test_f5_superficie.py` vs. el código del POS.
4. **Fichas** — las 60 fichas de `docs/05-plan-de-construccion/` vs. el código y la suite.

**Estado real de la suite al momento de la verificación:**

| Suite | Comando | Resultado |
|---|---|---|
| Backend | `docker compose exec -T api pytest -q` | **284 passed** |
| Frontend | `npm run test -- --run` (en `apps/pos`) | **49 files / 560 tests passed** |
| CI completo | `npm run ci` | **verde** (lint + test + guards) |

---

## 3. Hallazgos

### 3.1 Contratos (F11.0.1)

| # | Severidad | Hallazgo | Estado |
|---|---|---|---|
| **H1** | Media | `contracts/registry.py:1` dice *"Registro de los **28** contratos"* pero `listar_contratos()` devuelve **29**. | Corregido en F11.0.5 |
| **H2** | Baja | Comentarios intermedios con conteos de contratos obsoletos (17/22/23/25). | Historia legítima (ver H13) |
| **H3** | Baja | Idem H2. | Historia legítima |
| **H4** | Baja | Idem H2. | Historia legítima |
| **H5** | Baja | Contratos 24/25 (CRM/Notificaciones) declarados sin endpoint POS. | **Intencional** (frontera F8) |
| **H6** | Baja | Contratos 7/8 (seguridad) declarados sin endpoint POS. | **Intencional** (frontera F2) |

**Conclusión de contratos:** el registro real tiene **29 contratos**, y la puerta
`test_f2_frontera.py` los afirma **exactamente 29** (`LOS_29_CONTRATOS`,
`test_criterio2_hay_exactamente_29_contratos`). La única divergencia real era el
docstring (H1). Los contratos "sin endpoint" (H5/H6) son **frontera arquitectónica
deliberada**, no omisión.

### 3.2 Reglas (F11.0.2)

| # | Severidad | Hallazgo | Estado |
|---|---|---|---|
| **H7** | **Alta** | Las reglas **RN-82..RN-93** NO tienen `test_rnXX` en el backend. RN-82..RN-88 están implementadas; RN-89..RN-93 están **solo declaradas** (levantan `NotImplementedError`). | Registrado como deuda D-11.1 |
| **H8** | **Alta** | `test_criterio2_ninguna_regla_sin_test` (`test_f3_comportamiento.py:43`) solo valida que `r.test.startswith("test_rn")` — **nunca comprueba que la función exista**. El guardián de trazabilidad no ve la existencia. | Registrado como deuda D-11.2 |
| **H9** | Media | `FICHA_F8_0:226-237` presenta una tabla de trazabilidad que afirma que existen `test_rn82`..`test_rn93`. **Búsqueda en `tests/`: 0 resultados.** | Registrado como deuda D-11.3 |

**Conclusión de reglas:** el registro real tiene **95 reglas** (RN-01..RN-95).
Las RN-01..RN-81 son las heredadas del POS viejo; RN-82..RN-88 nacieron en F8.0
(CRM/Notificaciones) y RN-89..RN-95 en F8.0/F9.1. De las RN-89..RN-93, **solo
están declaradas**. La ficha F8.0 afirmaba tests que no existen (H9).

### 3.3 Superficie (F11.0.3)

| # | Severidad | Hallazgo | Estado |
|---|---|---|---|
| **H10** | **Alta** | De las **24 interfaces** declaradas, solo **15 existen** en el código. Las **9 restantes** (TableServicePOS, VisionTrainingUI, GrandezaParamsUI, GrandezaDailyUI, GrandezaDriverUI, RepartoPanGrandezaUI, GestionPersonal, VisionScanner, CategoryEditor) pertenecen a **otros módulos** y se **DESCARTARON** — pero **no están marcadas como tales** en el registro. | Registrado como deuda D-11.4 |
| **H10b** | Media | El campo `anclaje` de las interfaces apunta al **POS VIEJO** (`apps/pos/...`), que *"solo contiene `.gitkeep`"*. El anclaje no resuelve a código real. | Registrado como deuda D-11.4 |
| **H10c** | Media | `test_r03_cada_interfaz_tiene_anclaje_al_codigo` (`test_f5_superficie.py:318`) solo comprueba que el campo sea *truthy* — **nunca resuelve la ruta**. Mismo patrón que H8. | Registrado como deuda D-11.2 |

**Las 15 interfaces presentes:** RetailVisionPOS, CheckoutScreen, TerminalSelector,
OpenAccountsCorkboard, SalesReceipt, POSHeader, POSOverlays, VisionVisor,
ProductGrid, ProductCard, CategoryBar, TicketTemplate, CorteTicketTemplate,
GestorDeCaja (`src/GestorDeCaja.jsx`), ProgramacionPedidoModal
(`OrderProgrammingModal.jsx`).

**Conclusión de superficie:** las 9 interfaces DESCARTADAS son una **decisión
arquitectónica de F10** (pertenecen a Grandeza, RRHH, Centro IA, KDS/Mesas y
Gestión de Productos). El defecto no es descartarlas — es **no marcarlas como
descartadas** en el registro, lo que hace que el conteo "24" parezca 24
implementadas cuando son 15 + 9.

### 3.4 Fichas (F11.0.4)

| # | Severidad | Hallazgo | Estado |
|---|---|---|---|
| **H11** | Media | `FICHA_F2:23` pega la salida de la compuerta con `test_listar_contratos_devuelve_los_17` — un test que **ya no existe** (renombrado a `_los_29`). | Historia legítima (ver H13) |
| **H12** | Baja | `FICHA_F5:200` afirma *"155 passed"* y `FICHA_F6:201` afirma *"192 passed"* — son **snapshots históricos** presentados como estado actual. | Registrado como deuda D-11.5 |
| **H13** | **Positiva** | La cadena de renombres `_los_17` → `_los_22` → `_los_23` → `_los_25` → `_los_29` **SÍ está documentada** en F3.2/F5.0/F7.0. Es **historia legítima**, no defecto. | Sin acción |

**Conclusión de fichas:** las fichas son honestas en su mayoría. El único patrón
problemático (H12) es presentar snapshots de suite como si fueran el estado
actual. La cadena de renombres (H13) demuestra que el proyecto **sí documenta su
propia evolución** — es una fortaleza, no una debilidad.

---

## 4. El patrón transversal (lo más importante de esta fase)

Tres hallazgos — **H8, H10c y H11** — son **la misma clase de fallo**:

> **Un guardián de trazabilidad que valida la FORMA (el string) pero no la
> EXISTENCIA (el objeto).**

- **H8:** `test_criterio2_ninguna_regla_sin_test` valida que el nombre del test
  empiece con `"test_rn"` — pero no que la función exista.
- **H10c:** `test_r03_cada_interfaz_tiene_anclaje_al_codigo` valida que el campo
  `anclaje` sea *truthy* — pero no que la ruta resuelva a un archivo real.
- **H11:** la ficha F2 pega una salida de compuerta con un nombre de test que ya
  no existe — nadie lo detectó porque nadie re-ejecutó la compuerta.

Esto es la **octava instancia** de la misma clase de fallo que el Plan Maestro
documenta en §10.6:

| # | Instancia | Fase |
|---|---|---|
| 1 | El componente existe pero el usuario no llega a él (GestorDeCaja huérfano) | F4.5 |
| 2 | `payment_details` no expuesto | F9.1.4a |
| 3 | "Copiar URL" faltante | F10 / B-01 |
| 4 | "Contexto diario post-corte" faltante | F10.4 / B-02 |
| 5 | Resumen de caja incompleto | F10.5 |
| 6 | Paridad de operación de caja | F10.6.1-3 |
| 7 | Impresión de corte no cableada | F10.6.4 |
| **8** | **El guardián de trazabilidad no ve la EXISTENCIA** | **F11.0** |

**Propuesta:** añadir **§10.6.6** al Plan Maestro con esta lección. (Pendiente de
redacción en la Fase 11.)

---

## 5. Correcciones aplicadas al Plan Maestro (F11.0.5)

Se aplicaron **10 correcciones** a `PLAN_MAESTRO_DEFINITIVO_POS.md`:

| # | Sección | Antes | Después |
|---|---|---|---|
| 1 | §9 | "las **8 fases**" | "las **10 fases**" |
| 2 | §10.1 (título) | "Las **81** reglas de negocio se portan CON su test" | "Las reglas de negocio se portan CON su test" + nota F11.0 (95 reglas) |
| 3 | §10.1 (cuerpo) | "las 81 reglas (RN-01 a RN-81)" | "las 81 reglas **heredadas** (RN-01 a RN-81)" + nota F11.0 |
| 4 | §10.6 (diagrama) | 17 tablas / 17 contratos / 81 reglas / 26 interfaces | Preservado como historia + nota F11.0 (29 contratos / 95 reglas / 24 interfaces 15+9) |
| 5 | §10.6 (línea 931) | "17 contratos y las 81 reglas" | + "(Cifras del plan original de DeepSeek; la realidad construida fue 29 contratos y 95 reglas)" |
| 6 | §11.1 | "Al terminar las **8 fases**" | "Al terminar las **10 fases**" |
| 7 | §11.1 | "las **81** reglas de negocio" | "las **95** reglas de negocio" |
| 8 | §11.3 | "Las **81** reglas de negocio (RN-01 a RN-81)" | "Las **95** reglas de negocio (RN-01 a RN-95)" + origen |
| 9 | §11.5 | "Las **81** reglas / RN-01 a RN-81" + "Los **23** contratos" + "Las **24** interfaces" | "Las **95** reglas / RN-01 a RN-95" + "Los **29** contratos" + "Las **24** interfaces declaradas (15 portadas + 9 DESCARTADAS)" |
| 10 | §11.6 | "al cerrar la **Fase 8**" | "al cerrar la **Fase 10** (y tras la verificación F11.0 plan-vs-realidad)" |

**Principio aplicado:** las cifras del plan original de DeepSeek **no se borran**
(son historia); se **anotan** con la realidad construida. Igual que el proyecto
hace con la cadena de renombres (H13).

---

## 6. Deudas registradas

| # | Deuda | Origen | Prioridad |
|---|---|---|---|
| **D-11.1** | RN-89..RN-93 están declaradas pero no implementadas (levantan `NotImplementedError`). | H7 | Media (son de módulos futuros: CRM/Notificaciones) |
| **D-11.2** | Los guardianes de trazabilidad validan la forma, no la existencia (H8, H10c). | H8, H10c | **Alta** (es un fallo de la red de seguridad) |
| **D-11.3** | `FICHA_F8_0` afirma tests que no existen. | H9 | Media (corregir la ficha) |
| **D-11.4** | Las 9 interfaces DESCARTADAS no están marcadas como tales; el `anclaje` apunta al POS viejo vacío. | H10, H10b | Media |
| **D-11.5** | Fichas con snapshots de suite presentados como estado actual. | H12 | Baja |

---

## 7. Veredicto

| Capa | ¿Coincide plan vs. realidad? | Observación |
|---|---|---|
| **Contratos** | ✅ Sí (29) | Solo el docstring estaba desactualizado (H1, corregido) |
| **Reglas** | ⚠️ Parcial (95) | RN-89..RN-93 declaradas sin implementar (D-11.1); fichas afirman tests inexistentes (D-11.3) |
| **Superficie** | ⚠️ Parcial (15+9) | Las 9 DESCARTADAS son decisión correcta, pero no están marcadas (D-11.4) |
| **Fichas** | ✅ Mayormente sí | Snapshots históricos (D-11.5); la evolución SÍ está documentada (H13) |
| **Plan Maestro** | ✅ Corregido | 10 correcciones aplicadas (F11.0.5) |

**Conclusión:** el POS construido es **sólido y honesto**. Los hallazgos no son
fallos del producto, sino **fallos de la red de seguridad** (guardianes que
validan la forma y no la existencia) y **de la documentación** (cifras
desactualizadas). Ambos quedan registrados como deudas y el Plan Maestro queda
corregido.

**La documentación final (§11) puede redactarse sobre una base verificada.**

---

## 8. Commits

| Repo | Commit | Descripción |
|---|---|---|
| `NUEVO-POS` | `c7aa49e` | Ficha F11.0 |
| `PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS` | `df24655` | 10 correcciones al Plan Maestro |

**Push:** `NUEVO-POS` `4b6a05e..c7aa49e` · `PLANOS` `2e8eb21..df24655`.

---

## 9. Qué sigue

**Fase 11 — Documentación final del POS (§11 del Plan Maestro).**

La estructura de 7 tomos está definida en §11.5 (ya corregida a 29 contratos,
95 reglas, 24 interfaces 15+9). Se redactará sobre la base verificada por esta
fase.
