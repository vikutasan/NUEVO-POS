# 🔍 FICHA F10 — AUDITORÍA DE PARIDAD (viejo POS → nuevo POS)

**Fase:** 10 (Auditoría de Paridad) + 10.4 (Contexto diario) + 10.5 (Paridad de datos de caja)
**Fecha:** 30 Sep 2026
**Estado:** ✅ CERRADA
**Origen:** Hallazgo del usuario — *"en el gestor de terminales no aparece la opción copiar url que sí aparece en el pos viejo"*

---

## 1. POR QUÉ EXISTIÓ ESTA FASE

Las Fases 1–9.1 construyeron el nuevo POS **"de adentro hacia afuera"**: cada
pieza se verificó **en aislamiento** y pasó su compuerta. Ese método garantiza
que **lo que se construyó funciona**, pero **no garantiza que se haya
construido TODO lo que el viejo POS hacía**.

La prueba viva fue el hallazgo del usuario: el **"Copiar URL"** del gestor de
terminales existía en el viejo POS y **no existía** en el nuevo — ni el botón ni
la lógica. Una **OMISIÓN TOTAL**.

### Las cinco instancias de la misma clase de falla

| # | Falla | Fase donde se detectó | Naturaleza |
|---|-------|----------------------|------------|
| 1 | `GestorDeCaja` huérfano (existía, nadie llegaba a él) | F4.5 | Integración olvidada |
| 2 | `payment_details` no expuesto en la salida del ticket | F9.1.4a | Dato construido, no expuesto |
| 3 | "Copiar URL" ausente en el gestor de terminales | F10 | Omisión total |
| 4 | "Contexto diario post-corte" ausente | F10.4 | Integración POS→ERP no portada |
| 5 | **Resumen de caja incompleto (7 campos perdidos)** | **F10.5** | **Flujo de datos incompleto** |

**Causa raíz común:** el método "de adentro hacia afuera" verifica la **calidad**
de cada pieza, pero **no la COMPLETITUD del conjunto** contra el viejo POS.

> **Nota (F10.4):** la instancia 4 no es un componente del POS, sino una **escritura
> del POS hacia la tabla de otro módulo** (Estadísticas). El inventario de componentes
> no la veía. Lección codificada en §10.6.3.

> **Nota (F10.5):** la instancia 5 no es un componente ausente, sino un **contrato
> incompleto**: el componente existía y pasaba su test, pero consumía menos datos
> que su equivalente viejo. El inventario de componentes no ve los **flujos de
> datos**. Lección codificada en §10.6.4.

---

## 2. LAS CUATRO CATEGORÍAS DE PARIDAD

| Categoría | Significado | Acción |
|-----------|-------------|--------|
| **PORTADA** | Existe en el viejo y existe (y funciona) en el nuevo | Nada. Solo registrar evidencia. |
| **OMITIDA** | Existe en el viejo y **NO** existe en el nuevo | Decidir: portar o descartar con razón. |
| **HUÉRFANA** | La lógica existe en el nuevo pero **no hay punto de entrada** | Cablear (como F4.5). |
| **DESCARTADA** | Se decidió **deliberadamente** no portar | Registrar el POR QUÉ (no es un olvido). |

---

## 3. RESULTADO DEL TRIAJE (F10.1)

De **12 brechas** sospechadas (B-01 + B-02 + V-01…V-10):

- **2 se PORTARON** (B-01 en F10.2, B-02 en F10.4).
- **4 son PORTADAS** (V-02, V-04, V-05 + las confirmadas en F10.0).
- **6 se DESCARTARON** con razón documentada (V-01, V-03, V-06, V-07, V-08, V-09, V-10).

> **B-02** no salió del inventario F10.0: la detectó el **dueño al probar la auditoría**
> (30 Sep 2026). Es la prueba viva de que el inventario de componentes no ve las
> integraciones POS→ERP.

> **F10.5** tampoco salió del inventario F10.0: la detectó el **dueño con la analogía
> del trasplante de corazón** (30 Sep 2026). Es la prueba viva de que el inventario
> de componentes no ve los **flujos de datos** (payloads de contrato incompletos).

### 3.1 Tabla de decisiones (verificada contra el código)

| # | Brecha | Decisión | Evidencia |
|---|--------|----------|-----------|
| **B-01** | "Copiar URL" en el gestor de terminales | **PORTADA** (F10.2) | Nuevo `TerminalSelector.jsx`: botón + `copyUrl` con Clipboard API + fallback. Test 4/4. |
| **B-02** | "Contexto diario post-corte" (clima/atípico/notas) | **PORTADA (con deuda de acople)** (F10.4) | Contrato 28 `pos.contexto_diario` + `dailyContextService.js` + `DailyContextModal.jsx` + integración en `GestorDeCaja.jsx`. Test 7/7. El endpoint vive en el ERP viejo (`estado_hoy="Deuda"`); se acopla en F11. |
| **V-01** | Zero-Auto-Restore | **DESCARTADA (no aplica)** | El nuevo POS no persiste sesión en `localStorage`; la persistencia es por ítem en el servidor. El problema que resolvía no existe. |
| **V-02** | `getProductEmoji` | **PORTADA (reubicada al backend)** | `ProductCard.jsx:58` usa `producto.icono \|\| '🍞'`; el emoji viene del API. |
| **V-03** | `handleImageUpload` | **DESCARTADA (diseño)** | El nuevo usa `PRESET_ICONS` (emojis); no hay subida de imagen. Simplificación deliberada. |
| **V-04** | `loadTerminalsConfig` | **PORTADA** | `useTerminals.js:103` llama `fetchTerminalConfig()`. |
| **V-05** | `DEFAULT_TERMINALS` | **PORTADA** | `useTerminals.js:54-61` con `TERM-01..TERM-06` (F7.7d unificó IDs). |
| **V-06** | `ForceLogoutModal` | **DESCARTADA (reemplazada)** | El heartbeat de `useTerminalLocking.js:100-124` expira el lock por TTL. Ya no hace falta desbloqueo forzado por admin. |
| **V-07** | `OfflineBanner` con `pendingCount` | **DESCARTADA (intencional)** | El nuevo POS no tiene cola local (v1.1). `POSOverlays.jsx:155-169`. |
| **V-08** | `useVisitDraft` | **DESCARTADA (fuera de alcance)** | Vive en `GrandezaDriverUI.jsx` (app del repartidor). |
| **V-09** | `calcularDenominaciones` | **DESCARTADA (no aplica)** | El nuevo captura el efectivo con `BILLETES_RAPIDOS`; muestra el cambio como monto, no desglosado. |
| **V-10** | `calcularPuntosAGanar` / `infoRedencionCheckout` | **DESCARTADA (la lealtad es del CRM)** | El POS consume el contrato 26; el CRM calcula los puntos (A-02). |

---

## 4. LAS BRECHAS CERRADAS (B-01 y B-02)

### 4.1 B-01 — "Copiar URL" (F10.2)

**Archivo modificado:** `../NUEVO-POS/apps/pos/src/components/TerminalSelector.jsx`
**Test:** `../NUEVO-POS/apps/pos/src/components/TerminalSelector.f10_2.test.jsx` (4/4)
**Ficha:** `FICHA_F10_2_B01_COPIAR_URL.md`

Se portó la **INTEGRACIÓN** (botón en la tarjeta del gestor) y se **reescribió la
IMPLEMENTACIÓN** (§6.8): `navigator.clipboard.writeText()` con fallback a
`execCommand`.

### 4.2 B-02 — "Contexto diario post-corte" (F10.4)

**Archivos creados/modificados:**
- `../NUEVO-POS/apps/api/contracts/registry.py` — contrato 28 `pos.contexto_diario`
  (POS proveedor → Estadísticas consumidor, `estado_hoy="Deuda"`).
- `../NUEVO-POS/apps/pos/src/services/dailyContextService.js` — servicio (nunca lanza).
- `../NUEVO-POS/apps/pos/src/components/DailyContextModal.jsx` — el modal heredado.
- `../NUEVO-POS/apps/pos/src/GestorDeCaja.jsx` — integración (se abre al cerrar el turno).
- `../NUEVO-POS/apps/pos/src/api/client.js` — `enviarContextoDiario`.

**Tests:** `GestorDeCaja.f10_4.test.jsx` (7/7) + `test_f2_frontera.py` (9/9, 28 contratos).
**Ficha:** `FICHA_F10_4_CONTEXTO_DIARIO.md`

Se portó la **INTEGRACIÓN** (el modal se abre al cerrar el turno) y se **reescribió la
IMPLEMENTACIÓN** (§6.8). El POS **NO crea** la tabla `daily_contexts` (pertenece a
Estadísticas — frontera A-02); escribe vía el contrato que Estadísticas ya expone.

> **Deuda trazable:** el endpoint `PUT /analytics/context` vive en el ERP viejo. El POS
> nuevo lo declara por contrato; **F11** lo acopla cuando se profesionalice Estadísticas.

### 4.3 F10.5 — Paridad de datos de caja (brechas #1 y #2)

**Archivos modificados:**
- `../NUEVO-POS/apps/api/schemas.py` — `AbrirTurnoEntrada` + `usuario_nombre`;
  `ResumenTurnoSalida` + 7 campos (fondo, entradas/salidas, crédito, débito, ventas, transacciones).
- `../NUEVO-POS/apps/api/routers/cash.py` — `_clasificar_ventas_del_turno` (RN-58)
  alimenta el resumen; `cerrar_turno` usa `.get("EFECTIVO", 0)`.
- `../NUEVO-POS/apps/pos/src/GestorDeCaja.jsx` — prop `usuarioNombre`; envía
  `usuario_nombre`; bloque "Desglose del turno".
- `../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx` — pasa `usuarioNombre` a `GestorDeCaja`.

**Tests:** `test_f10_5_paridad_caja.py` (5/5) + `GestorDeCaja.f10_5.test.jsx` (4/4).
**Ficha:** `FICHA_F10_5_PARIDAD_DE_DATOS_DE_CAJA.md`

**Brecha #1 — el nombre del cajero no viajaba (contrato 10):** el viejo enviaba
`employee_name` al abrir el turno; el nuevo solo enviaba el ID. Se añadió
`usuario_nombre` (opcional) y se propaga desde `RetailVisionPOS.jsx`.

**Brecha #2 — el resumen perdía 7 campos (contrato 12):** el viejo
`CashSummaryResponse` devolvía 8 campos; el nuevo `ResumenTurnoSalida` solo 2
(`esperado`, `movimientos`). Se amplió a los 8 campos del viejo, alimentados por
la clasificación RN-58.

> **Regresión expuesta y corregida:** al ampliar el resumen, el refactor dejó un
> `NameError` (llamada a la vieja `_ventas_en_efectivo`) y un `KeyError: 'EFECTIVO'`
> (RN-58 omite las claves de métodos ausentes). Ambos los atrapó la compuerta de
> F4.1. Corregidos con `.get("EFECTIVO", Decimal("0.00"))`.

---

## 5. COMPUERTA COMPLETA

`npm run ci` desde `../NUEVO-POS`:

```
Lint OK: 0 errores.
Tests de Node      : 3/3 archivo(s) en verde
Tests de componentes: PASA
Tests de API       : PASA
✅ RESULTADO: TODOS LOS TESTS EN VERDE.
PUERTA F0 EN VERDE / F4-A-04 EN VERDE / F5-R-01 EN VERDE
```

---

## 6. LECCIÓN CODIFICADA (§10.6.1 extendida)

> *"el componente existe y pasa su test" ≠ "el usuario puede llegar a él"*
> (lección de F4.5)
>
> **F10 la extiende:**
> *"el componente existe y pasa su test" ≠ "el conjunto está completo"*
>
> **F10.4 la extiende otra vez (§10.6.3):**
> *"el inventario de componentes no ve las integraciones."*
>
> **F10.5 la extiende otra vez (§10.6.4):**
> *"el inventario de componentes no ve los FLUJOS DE DATOS."*

El método "de adentro hacia afuera" verifica la **calidad** de cada pieza, pero
no la **COMPLETITUD del conjunto** contra el viejo POS. F10 cierra esa brecha
metodológica con una **auditoría de paridad explícita** antes de declarar el POS
terminado.

**Regla nueva para el futuro:** antes de cerrar un módulo que reemplaza a otro,
se ejecuta una **auditoría de paridad** (inventario crudo → triaje → cierre de
brechas), no solo la compuerta de calidad de cada pieza.

**Regla añadida por F10.4:** la auditoría de paridad debe inventariar no solo los
**componentes**, sino también **los flujos de datos entre módulos** (escrituras del
POS hacia el ERP). Un POS puede tener todos sus componentes y aun así faltarle un
**puente entre módulos**.

**Regla añadida por F10.5:** la auditoría de paridad debe comparar además **el
payload de cada contrato** (entrada y salida) contra el del módulo viejo, campo por
campo. Un contrato "que funciona" puede estar **incompleto**: el componente existe,
pasa su test y aun así consume menos datos que su equivalente viejo.

---

## 7. TRAZABILIDAD

| Documento | Relación |
|-----------|----------|
| `PLAN_DE_ABORDAJE_FASE_10_PARIDAD.md` | El plan de la fase (F10.0–F10.3) |
| `PLAN_DE_ABORDAJE_F10_4_CONTEXTO_DIARIO.md` | El plan de la sub-fase B-02 |
| `PLAN_DE_ABORDAJE_F10_5_PARIDAD_DE_DATOS_DE_CAJA.md` | El plan de la sub-fase F10.5 |
| `FICHA_F10_2_B01_COPIAR_URL.md` | El cierre de la brecha B-01 |
| `FICHA_F10_4_CONTEXTO_DIARIO.md` | El cierre de la brecha B-02 |
| `FICHA_F10_5_PARIDAD_DE_DATOS_DE_CAJA.md` | El cierre de las brechas #1 y #2 (F10.5) |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §6.8 | UX heredada — la integración se hereda |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §8.2 | El ERP viejo existe pero es parchado |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §10.6.1 | La lección de F4.5 — la integración es una compuerta |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §10.6.2 | La lección de F10 — la completitud del conjunto es una compuerta |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §10.6.3 | La lección de F10.4 — el inventario no ve las integraciones |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §10.6.4 | La lección de F10.5 — el inventario no ve los flujos de datos |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §11 | Documentación final (se ejecuta DESPUÉS de F10) |
| `FICHA_F4_5_INTEGRACION.md` | Instancia 1 (GestorDeCaja huérfano) |
| `FICHA_F9_1_4_IMPRESION_CIERRE.md` | Instancia 2 (`payment_details`) |

### 7.1 Commits

| Repo | Commit | Contenido |
|------|--------|-----------|
| `NUEVO-POS` | `168003c` | B-01 (Copiar URL) + test 4/4 + `FICHA_F10_2_B01_COPIAR_URL.md` + `FICHA_F10_PARIDAD.md` |
| `PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS` | `bf58859` | Plan Maestro §7 (Fase 10) + §10.6.2 + `PLAN_DE_ABORDAJE_FASE_10_PARIDAD.md` |
| `NUEVO-POS` | `a202f56` | B-02 (Contexto diario) + contrato 28 + test 7/7 + `FICHA_F10_4_CONTEXTO_DIARIO.md` + esta ficha |
| `PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS` | `8ecea3b` | `PLAN_DE_ABORDAJE_F10_4_CONTEXTO_DIARIO.md` + `PLAN_DE_ABORDAJE_F10_5_PARIDAD_DE_DATOS_DE_CAJA.md` + Plan Maestro §10.6.3 |
| `NUEVO-POS` | _(pendiente F10.5.5)_ | F10.5 (Paridad de datos de caja) + tests 5/5 + 4/4 + `FICHA_F10_5_PARIDAD_DE_DATOS_DE_CAJA.md` + esta ficha |
| `PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS` | _(pendiente F10.5.5)_ | Plan Maestro §10.6.4 |
