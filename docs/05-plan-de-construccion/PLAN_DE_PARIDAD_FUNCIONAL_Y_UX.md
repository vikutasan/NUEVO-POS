# PLAN DE PARIDAD FUNCIONAL Y UX — Nuevo POS vs. Viejo POS

**Fecha:** 2026-10-09
**Autor:** Ingeniería (Code mode)
**Estado:** Propuesta — pendiente de aprobación
**Base:** `69e9375` (F12.22) · Backend 339 tests ✅ · Frontend 780 tests ✅

---

## 0. CORRECCIÓN DE RÉCORD (leer primero)

En mi opinión personal previa afirmé que el nuevo POS **no había replicado** cuatro
funciones del viejo. Al investigar para este plan, **verifiqué archivo por archivo y
me equivoqué en las cuatro**. Todas existen ya en el nuevo POS, con tests:

| Función que dije "falta" | Realidad en el nuevo POS | Evidencia |
|---|---|---|
| `ProgramacionPedidoModal` + `calcMaxLeadTime` | **Existe** como [`OrderProgrammingModal.jsx`](../NUEVO-POS/apps/pos/src/components/OrderProgrammingModal.jsx:57) con `calcularAnticipacionMaxima()` | Montado en [`RetailVisionPOS.jsx`](../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx:1272) |
| Recuperación de cuentas (`handleRecoverAccount`) | **Existe** como `recuperarCuenta()` en [`useOpenAccounts.js`](../NUEVO-POS/apps/pos/src/hooks/useOpenAccounts.js:129) (contrato 21) | Montado vía [`OpenAccountsCorkboard.jsx`](../NUEVO-POS/apps/pos/src/components/OpenAccountsCorkboard.jsx:168) |
| `VoiceCartPanel` | **Existe** en [`VoiceCartPanel.jsx`](../NUEVO-POS/apps/pos/src/components/VoiceCartPanel.jsx:1) + [`useVoiceCart.js`](../NUEVO-POS/apps/pos/src/hooks/useVoiceCart.js:79) (F7.2) | Montado en [`RetailVisionPOS.jsx`](../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx:1226) |
| `VisionScanner` | **Existe** como [`VisionVisor.jsx`](../NUEVO-POS/apps/pos/src/components/VisionVisor.jsx:1) + [`useVision.js`](../NUEVO-POS/apps/pos/src/hooks/useVision.js:1) (F7.3) | Montado en [`RetailVisionPOS.jsx`](../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx:1038) |

**Conclusión honesta:** la brecha funcional **no es de features grandes** — esas ya
están. La brecha real es de **pulido de UX** (atajos, tamaños táctiles, flujos de
teclado) y de **unos pocos detalles de comportamiento** que sí difieren. Este plan
se enfoca ahí.

---

## 1. METODOLOGÍA

1. Leí los 4 archivos del viejo POS que cité (`ProgramacionPedidoModal.jsx`,
   `useTicketActions.js`, `VoiceCartPanel.jsx`, `VisionScanner.jsx`).
2. Busqué sus equivalentes en `../NUEVO-POS/apps/pos/src` (recursivo).
3. Verifiqué el **cableado real** en [`RetailVisionPOS.jsx`](../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx:1)
   (no basta que el archivo exista: hay que confirmar que se monte).
4. Audité atajos de teclado con búsqueda regex en ambos POS.

---

## 2. HALLAZGOS: LO QUE YA ESTÁ EN PARIDAD

| Capacidad | Viejo POS | Nuevo POS | Veredicto |
|---|---|---|---|
| Programación de pedido (lead time, entrega, empaque) | `ProgramacionPedidoModal` | `OrderProgrammingModal` + `useOrderProgramming` | ✅ Paridad |
| Recuperar cuenta al carrito | `handleRecoverAccount` | `recuperarCuenta` + `leerTicket` (contrato 21) | ✅ Paridad (mejor: contrato) |
| Pizarrón de cuentas abiertas | fetch manual | `OpenAccountsCorkboard` + polling | ✅ Paridad (mejor) |
| Voz (dictado → propuesta → confirmar) | `VoiceCartPanel` | `VoiceCartPanel` + `useVoiceCart` (F7.2) | ✅ Paridad |
| Visión (cámara → sugerencias → confirmar) | `VisionScanner` (Gemini) | `VisionVisor` + `useVision` (F7.3) | ✅ Paridad |
| Lector de código de barras | (implícito) | `useBarcodeScanner` (velocidad <50 ms) | ✅ Paridad |
| Doble copia al cobrar pedido | `combineOrderTicketsForPrint` | `combinarCopiasPedido` (F12.21) | ✅ Paridad |
| Envío de ticket WhatsApp/email | (directo) | Outbox contrato 27 (F12.22) | ✅ Superior |
| Revisión pre-cobro de pedido | (parcial) | `CheckoutScreen` + `orderData` (F12.20/21) | ✅ Superior |

---

## 3. HALLAZGOS: LA BRECHA REAL (UX)

### 3.1 Atajos de teclado globales — **BRECHA CONFIRMADA**

**Viejo POS:** no encontré atajos globales tipo F-key tampoco (búsqueda `F2|F4|F8|F9|Ctrl+|Alt+` → 0 resultados). Lo que sí tiene son **flujos de teclado locales**:
- [`CheckoutScreen.jsx`](../apps/pos/components/CheckoutScreen.jsx:271): `Enter` guarda la edición de un pago.
- [`GestorDeCaja.jsx`](../apps/pos/components/GestorDeCaja.jsx:466): `Enter` valida PIN y agrega movimiento.
- [`AnnotationCanvas.jsx`](../apps/pos/components/AnnotationCanvas.jsx:125): `Delete`/`Backspace` borra anotación.

**Nuevo POS:** tiene los equivalentes:
- [`CustomerIdentificationPanel.jsx`](../NUEVO-POS/apps/pos/src/components/CustomerIdentificationPanel.jsx:152): `Enter` busca cliente.
- [`OpenAccountsCorkboard.jsx`](../NUEVO-POS/apps/pos/src/components/OpenAccountsCorkboard.jsx:292): `Enter`/`Space` recupera cuenta (accesible).
- `useBarcodeScanner`: escucha global de teclado para el lector.

**Brecha concreta:** el nuevo POS **no tiene atajos de teclado para las acciones
frecuentes del cajero** (cobrar, enviar cuenta, abrir pizarrón, abrir voz). En un POS
de mostrador con teclado físico, esto es la diferencia de UX más sentida.

### 3.2 Tamaños táctiles y densidad — **BRECHA PARCIAL**

El nuevo POS usa tokens (`min-h-tactil`, `bg-acento`, `text-fondo-profundo`) que
sugieren un sistema de diseño. El viejo tiene años de ajustes empíricos. **Riesgo:**
los tokens pueden no cubrir todos los casos (botones de modal, chips de categoría,
teclado numérico del checkout).

### 3.3 Flujos de teclado en el checkout — **BRECHA PARCIAL**

El viejo permite editar un pago y confirmar con `Enter`. Hay que verificar que el
nuevo [`CheckoutScreen.jsx`](../NUEVO-POS/apps/pos/src/components/CheckoutScreen.jsx:1)
tenga el mismo flujo (tiene `manejarGuardarEdicion` pero no vi el `onKeyDown`).

---

## 4. PLAN DE TRABAJO PROPUESTO

### FASE P1 — Atajos de teclado globales (ALTA prioridad)

**Objetivo:** dotar al nuevo POS de atajos para las 6 acciones más frecuentes.

| Atajo | Acción | Justificación |
|---|---|---|
| `F2` | Enfocar buscador de productos | El cajero teclea sin ratón |
| `F4` | Abrir/cerrar panel de voz | Manos libres |
| `F8` | Enviar cuenta al pizarrón | Acción frecuente sin caja |
| `F9` | Abrir checkout (cobrar) | La acción más frecuente |
| `F10` | Abrir pizarrón de cuentas | Recuperar cuentas |
| `Esc` | Cerrar modal/overlay activo | Universal |

**Entregables:**
- Nuevo hook `useAtajosPOS.js` (un solo listener global, callbacks en refs —
  respeta prohibición #3 y H1, igual que `useBarcodeScanner`).
- Cableado en [`RetailVisionPOS.jsx`](../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx:1).
- Tests `useAtajosPOS.f13_x.test.jsx` (cada tecla dispara su callback; no dispara
  cuando hay un input enfocado).
- Ficha `FICHA_F13_x_ATAJOS.md`.

**Criterio de aceptación:** con el foco en el cuerpo (no en un input), `F9` abre el
checkout; con el foco en un input, `F9` escribe el carácter (no dispara).

### FASE P2 — Auditoría de tamaños táctiles (MEDIA prioridad)

**Objetivo:** garantizar que todo control interactivo cumpla el mínimo táctil.

**Entregables:**
- Inventario de botones/chips/inputs por pantalla (checklist).
- Ajustes de clases donde falte `min-h-tactil` / padding.
- Test de regresión visual opcional (snapshot de clases).

### FASE P3 — Flujos de teclado en checkout (MEDIA prioridad)

**Objetivo:** paridad con el viejo en edición de pagos.

**Entregables:**
- `onKeyDown` con `Enter` en el input de monto de pago (guardar edición).
- `Enter` en el campo de monto nuevo (agregar pago).
- Tests en `CheckoutScreen.f13_x.test.jsx`.

### FASE P4 — Cierre de detalles funcionales menores (BAJA prioridad)

**Objetivo:** revisar los 3 bugs que encontré en la sesión anterior y que siguen
abiertos (no son de paridad, pero afectan corrección):
- `_mapear_estado` OPEN→TENTATIVO (¿viola RN-69?).
- `orderData.notes` vs `order_notes` (¿se pierde la nota?).
- Contrato 27 declarado pero sin implementar (¿ya resuelto en F12.22?).

**Entregables:** verificación + fix + test por cada uno.

---

## 5. ORDEN DE EJECUCIÓN RECOMENDADO

```
P1 (atajos)  →  P3 (teclado checkout)  →  P2 (táctil)  →  P4 (detalles)
```

P1 primero porque es la brecha de UX más sentida y de menor riesgo (hook aislado).
P4 al final porque son correcciones puntuales, no paridad.

---

## 6. RIESGOS Y MITIGACIONES

| Riesgo | Mitigación |
|---|---|
| Atajos chocan con el lector de barras | El lector usa dígitos + Enter; los atajos usan F-keys. Sin solape. |
| Atajos disparan dentro de inputs | Guarda: si `document.activeElement` es input/textarea, no disparar. |
| Cambios de tamaño rompen layout | Hacer P2 con captura antes/después por pantalla. |
| Regresión en flujos existentes | Suite completa (339 + 780) antes de cada commit. |

---

## 7. DEFINICIÓN DE "PARIDAD LOGRADA"

1. Las 6 acciones frecuentes tienen atajo de teclado y test.
2. Todo control interactivo cumple el mínimo táctil.
3. El checkout se opera 100% con teclado (agregar pago → confirmar).
4. Los 3 detalles funcionales de P4 están verificados o corregidos.
5. Suite verde: backend 339+ y frontend 780+.

---

## 8. NOTA SOBRE EL CUTOVER

Este plan **no** autoriza el cutover. Recomiendo, tras P1–P4, una **operación en
sombra** (ambos POS en paralelo) durante 1–2 semanas antes de apagar el viejo. La
paridad de features ya está; lo que falta es confianza operativa en el piso.
