# 🔍 FICHA F10 — AUDITORÍA DE PARIDAD (viejo POS → nuevo POS)

**Fase:** 10 (Auditoría de Paridad)
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

### Las tres instancias de la misma clase de falla

| # | Falla | Fase donde se detectó | Naturaleza |
|---|-------|----------------------|------------|
| 1 | `GestorDeCaja` huérfano (existía, nadie llegaba a él) | F4.5 | Integración olvidada |
| 2 | `payment_details` no expuesto en la salida del ticket | F9.1.4a | Dato construido, no expuesto |
| 3 | **"Copiar URL" ausente en el gestor de terminales** | **F10** | **Omisión total** |

**Causa raíz común:** el método "de adentro hacia afuera" verifica la **calidad**
de cada pieza, pero **no la COMPLETITUD del conjunto** contra el viejo POS.

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

De **11 brechas** sospechadas (B-01 + V-01…V-10):

- **1 se PORTÓ** (B-01) → cerrada en F10.2.
- **4 son PORTADAS** (V-02, V-04, V-05 + las confirmadas en F10.0).
- **6 se DESCARTARON** con razón documentada (V-01, V-03, V-06, V-07, V-08, V-09, V-10).

### 3.1 Tabla de decisiones (verificada contra el código)

| # | Brecha | Decisión | Evidencia |
|---|--------|----------|-----------|
| **B-01** | "Copiar URL" en el gestor de terminales | **PORTADA** (F10.2) | Nuevo `TerminalSelector.jsx`: botón + `copyUrl` con Clipboard API + fallback. Test 4/4. |
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

## 4. LA ÚNICA BRECHA CERRADA (B-01)

**Archivo modificado:** `../NUEVO-POS/apps/pos/src/components/TerminalSelector.jsx`
**Test:** `../NUEVO-POS/apps/pos/src/components/TerminalSelector.f10_2.test.jsx` (4/4)
**Ficha:** `FICHA_F10_2_B01_COPIAR_URL.md`

Se portó la **INTEGRACIÓN** (botón en la tarjeta del gestor) y se **reescribió la
IMPLEMENTACIÓN** (§6.8): `navigator.clipboard.writeText()` con fallback a
`execCommand`.

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

El método "de adentro hacia afuera" verifica la **calidad** de cada pieza, pero
no la **COMPLETITUD del conjunto** contra el viejo POS. F10 cierra esa brecha
metodológica con una **auditoría de paridad explícita** antes de declarar el POS
terminado.

**Regla nueva para el futuro:** antes de cerrar un módulo que reemplaza a otro,
se ejecuta una **auditoría de paridad** (inventario crudo → triaje → cierre de
brechas), no solo la compuerta de calidad de cada pieza.

---

## 7. TRAZABILIDAD

| Documento | Relación |
|-----------|----------|
| `PLAN_DE_ABORDAJE_FASE_10_PARIDAD.md` | El plan de la fase (F10.0–F10.3) |
| `FICHA_F10_2_B01_COPIAR_URL.md` | El cierre de la única brecha portada |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §6.8 | UX heredada — la integración se hereda |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §10.6.1 | La lección de F4.5 — la integración es una compuerta |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §11 | Documentación final (se ejecuta DESPUÉS de F10) |
| `FICHA_F4_5_INTEGRACION.md` | Instancia 1 (GestorDeCaja huérfano) |
| `FICHA_F9_1_4_IMPRESION_CIERRE.md` | Instancia 2 (`payment_details`) |
