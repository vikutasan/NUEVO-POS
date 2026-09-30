# FICHA DE EVIDENCIA — FASE 8.5: `TicketDeliveryPanel.jsx`

**Fecha:** 30 Sep 2026
**Sub-fase:** F8.5 — Componente `TicketDeliveryPanel.jsx` (paso post-cobro de entrega)
**Plan que la gobierna:** `PLAN_DE_ABORDAJE_FASE_8_POR_PARTES.md` §3.6 (v2.0)
**Regla que gobierna la ejecución:** REGLA DURA 2 — *"Verificar, no asumir"*
**Estado:** ✅ CERRADA

---

## 1. Qué se construyó

| Archivo | Tipo | Líneas | Propósito |
|---|---|---|---|
| [`TicketDeliveryPanel.jsx`](../../apps/pos/src/components/TicketDeliveryPanel.jsx) | Producción | ~300 | Overlay post-cobro: 🖨️ Imprimir / 📱 WhatsApp / ✉️ Email / Omitir |
| [`TicketDeliveryPanel.f8_5.test.jsx`](../../apps/pos/src/components/TicketDeliveryPanel.f8_5.test.jsx) | Gate | ~290 | 8 criterios, 19 tests |

> **Nota de higiene:** el archivo `TicketDeliveryPanel.jsx` existía **vacío** (1 línea en blanco)
> en el árbol de trabajo — un artefacto suelto de una operación interrumpida. Se **sobrescribió**
> con el componente real. No había contenido previo que preservar.

---

## 2. Los 8 criterios de la puerta (todos verdes)

| # | Criterio | Tests | Resultado |
|---|---|---|---|
| 1 | Renderiza el overlay con los 4 controles (imprimir/whatsapp/email/omitir) | 3 | ✅ |
| 2 | Imprimir SIEMPRE disponible y llama al servicio de impresión (RN-87) | 3 | ✅ |
| 3 | WhatsApp encola por el contrato #27 con el canal correcto (RN-86) | 2 | ✅ |
| 4 | Email encola por el contrato #27 con el canal correcto (RN-86) | 2 | ✅ |
| 5 | Precarga el contacto desde el CRM sin volver a teclear (RN-92) | 3 | ✅ |
| 6 | Degradación: si la cola está caída (503), avisa y NO revierte (DT-07) | 2 | ✅ |
| 7 | Guarda local: sin el dato del canal no se llama al contrato | 2 | ✅ |
| 8 | Omitir cierra el paso sin enviar nada | 2 | ✅ |
| | **TOTAL** | **19** | **✅ 19 passed** |

**Comando del gate:**
```
cd ../NUEVO-POS/apps/pos && npx vitest run src/components/TicketDeliveryPanel.f8_5.test.jsx
```
**Resultado:** `Test Files 1 passed (1) — Tests 19 passed (19)` en 2.19s.

---

## 3. Decisiones de diseño (y por qué)

### 3.1 Es un overlay del screen, NO un paso de `CheckoutScreen` (defecto D-1)

`CheckoutScreen` es el modal de **pago** y se cierra al cobrar. El paso de entrega aparece
**después**, cuando `cobrar()` ya resolvió. Por eso `TicketDeliveryPanel` es hermano de
`OverlayExito`, con el mismo patrón visual (`fixed inset-0 z-50 bg-fondo-profundo/80`,
`role="dialog"`, `aria-modal="true"`).

### 3.2 Inyectable por props, no por mock de módulo

El componente recibe `servicioNotificaciones`, `servicioImpresion` y `generadorTicket` como
props con valores por defecto reales. La puerta pasa **dobles por props**, no `vi.mock`. Eso
prueba la **costura real** (el componente llama a la función que le dan) sin acoplarse al
módulo. Es el mismo principio de inyectabilidad de `useOpenAccounts` y `useCustomerIdentification`.

### 3.3 PROHIBICIÓN #3 respetada desde el inicio

Los callbacks (`onImprimir`, `onEnviado`, `onOmitir`) y el `ticket` se leen de **refs**
(`ticketRef`, `onImprimirRef`, `onEnviadoRef`, `onOmitirRef`), nunca del estado cerrado por el
closure. Tras el `await` de `manejarEnviar`, el estado del render anterior está obsoleto; los
refs garantizan el valor vigente. **Esta es la lección que la puerta de F8.4 cazó** y que aquí
se aplicó preventivamente.

### 3.4 La guarda local es observable, no solo un `disabled`

**Hallazgo durante la ejecución:** la primera versión deshabilitaba los botones de WhatsApp/Email
cuando faltaba el dato (`disabled={!hayTelefono}`). Eso hacía la guarda **invisible e
intesteable**: un `fireEvent.click` sobre un botón deshabilitado no dispara nada y no produce
mensaje. Se cambió a **botón habilitado + guarda en el handler**, que produce un mensaje legible
("Escribe un teléfono…"). Es una guarda **más explícita** y verificable, y coincide con el
criterio 7 del plan ("guarda local"). El botón solo se deshabilita mientras hay un envío en curso.

### 3.5 La degradación no alarma (DT-07)

Si la cola está caída (503) o la red falla, el mensaje dice *"El envío quedó pendiente… El ticket
impreso sigue siendo válido"*. No se usa la palabra "error" ni se sugiere que algo se perdió: la
venta **ya se cobró** y el ticket impreso sigue disponible (RN-87). El panel **no se desmonta**.

---

## 4. Trazabilidad (regla → test)

| Regla | Enunciado | Test que la verifica |
|---|---|---|
| **RN-86** | El envío es Outbox: se encola, nunca bloquea el cobro | `criterio3`, `criterio4`, `criterio6` |
| **RN-87** | El ticket impreso siempre está disponible | `criterio2` (3 tests) |
| **RN-92** | El cajero elige el canal, el sistema precarga el contacto | `criterio5` (3 tests) |
| **DT-07** | Degradación: nunca bloquea la venta | `criterio6` (2 tests) |
| **A-02** | El POS consume el contrato, no escribe tablas ajenas | `criterio4` (payload = proyección) |

---

## 5. Contrato consumido

**Contrato #27 — `notificaciones.encolar_ticket`** (`POST /notifications/enqueue-ticket`)

```js
encolarTicket({
  evento_id: 'ticket:A-000123',        // idempotencia (RN-86)
  ticket_uuid: 'ticket-uuid-1',
  canales: ['WHATSAPP'],               // o ['EMAIL']
  destinatario: { telefono: '...' },   // o { email: '...' }
  payload: { folio, total, items, fecha },  // proyección, NO la tabla
})
```

El `evento_id` se deriva del folio (`ticket:<folio>`) si no se provee explícitamente. Es la clave
de idempotencia que evita encolar dos veces el mismo ticket si el cajero reintenta.

---

## 6. Lo que esta sub-fase NO hace

1. **No cablea el panel en el screen.** Eso es F8.6 (`RetailVisionPOS`).
2. **No construye el worker de Notificaciones.** Solo consume el contrato.
3. **No define la política de lealtad.** Eso es del CRM (RN-88).

---

## 7. Autocrítica de la ejecución

| # | Observación | ¿Se corrigió? |
|---|---|---|
| 1 | El archivo existía vacío (artefacto suelto) | ✅ Se sobrescribió con el componente real |
| 2 | La guarda local estaba oculta tras `disabled` | ✅ Se movió al handler, ahora es observable |
| 3 | El helper de test usaba `??`, que confunde "no provisto" con `null` | ✅ Se cambió a `hasOwnProperty` |
| 4 | El test "sin ticket" consultaba el documento global, no el container | ✅ Se acotó al `container` |

**Lección:** las 3 fallas iniciales de la puerta fueron **del arnés de test**, no del componente.
La puerta funcionó como debe: obligó a hacer explícito lo que estaba implícito (la guarda local).

---

## 8. Evidencia de cierre

- **Gate:** `19 passed (19)` — 8 criterios cubiertos.
- **Regresiones:** 0 (el componente es nuevo; no toca código existente).
- **Commit:** `d8bf8ca` — *"F8.5: TicketDeliveryPanel.jsx (paso post-cobro de entrega) + gate 8 criterios/19 tests"* (3 archivos, +731)
- **Push:** `2153f70..d8bf8ca` → `origin/main`
