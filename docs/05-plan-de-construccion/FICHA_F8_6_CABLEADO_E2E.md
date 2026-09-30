# FICHA DE EVIDENCIA — FASE 8.6: Cableado end-to-end (CRM + Notificaciones)

**Fecha:** 30 Sep 2026
**Sub-fase:** F8.6 — Cableado del header + panel de identificación + paso de entrega en `RetailVisionPOS.jsx`
**Plan que la gobierna:** `PLAN_DE_ABORDAJE_FASE_8_POR_PARTES.md` §3.7 (v2.0)
**Regla que gobierna la ejecución:** REGLA DURA 2 — *"Verificar, no asumir"*
**Estado:** ✅ CERRADA
**Commit:** `99e94cb` — *"F8.6: cableado end-to-end CRM + Notificaciones en el POS"*

---

## 1. Qué se construyó

| Archivo | Tipo | Propósito |
|---|---|---|
| [`POSHeader.jsx`](../../apps/pos/src/components/POSHeader.jsx) | Producción (mod.) | Props nuevas `onAbrirCliente` / `clienteIdentificado` + botón "👤 Cliente" |
| [`RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx) | Producción (mod.) | Cablea el panel de identificación (F8.4) y el paso de entrega (F8.5) |
| [`useCart.js`](../../apps/pos/src/hooks/useCart.js) | Producción (mod.) | `anadirLinea` acepta `linea.ticket_id` como override explícito |
| [`RetailVisionPOS.f8_6.test.jsx`](../../apps/pos/src/RetailVisionPOS.f8_6.test.jsx) | Gate | 9 criterios, 9 tests |

> **Nota de higiene:** se eliminaron dos artefactos sueltos (`apps/pos/f86_out.txt`,
> `apps/pos/f86_out2.txt`) generados por una operación de diagnóstico interrumpida.

---

## 2. Los 9 criterios de la puerta (todos verdes)

| # | Criterio | Resultado |
|---|---|---|
| 1 | El header expone el botón "Identificar cliente" | ✅ |
| 2 | El botón abre el panel de identificación (contrato #26) | ✅ |
| 3 | Identificar por teléfono llama al contrato #26 y cierra el panel | ✅ |
| 4 | El paso de entrega aparece SOLO tras cobrar con éxito | ✅ |
| 5 | Si el cobro falla, el paso de entrega NO aparece | ✅ |
| 6 | El paso de entrega ofrece Imprimir / WhatsApp / Email / Omitir | ✅ |
| 7 | Si Notificaciones está caído (503), la venta continúa con impresión | ✅ |
| 8 | Si el CRM está caído, la venta continúa sin beneficios | ✅ |
| 9 | El POS solo consume los contratos #26/#27 (frontera A-02) | ✅ |
| | **TOTAL** | **✅ 9 passed** |

**Comando del gate:**
```
cd ../NUEVO-POS/apps/pos && npx vitest run src/RetailVisionPOS.f8_6.test.jsx
```
**Resultado:** `Test Files 1 passed (1) — Tests 9 passed (9)`.

**Regresión completa:** `npx vitest run` → `Test Files 35 passed (35) — Tests 444 passed (444)`.
**CI completo:** `npm run ci` → lint 0 errores, todos los tests en verde, 7 guardianes limpios.

---

## 3. El bug de producción que la puerta cazó (hallazgo central)

### 3.1 Síntoma

La puerta falló con `expected "spy" to be called at least once` para `crearVenta` en 6 de 9
criterios. El diagnóstico temporal reveló: `crearVenta`=1, `anadirItem`=1, `getCatalogo`=1,
`enviarCuenta.disabled`=false, `confirmar` encontrado — pero `cobrarTicket`=0.

### 3.2 Causa raíz (dos defectos encadenados)

**Defecto A — el PRIMER ítem nunca se persistía (bug real de producción).**

`asegurarTicket()` llamaba a `acciones.crearTicket()`, que hace `setTicketId(...)` (estado de
React, **asíncrono**) y `ticketRef.current = ...` (ref del hook `useTicketActions`). Pero
`agregarProducto` llamaba **inmediatamente** a `carrito.anadirLinea(...)`, y `useCart` leía
**su propio** `ticketRef.current`, que seguía en `null` porque React aún no había re-renderizado.
Resultado: el primer ítem se quedaba **solo en memoria local** y nunca se enviaba por
`anadirItem` (contrato 18). El ticket nacía vacío en el backend.

**Corrección (dos partes):**
1. `useCart.anadirLinea` ahora acepta un override explícito:
   ```js
   const idTicket = linea.ticket_id || ticketRef.current;
   ```
2. `asegurarTicket` ahora **devuelve el id** (string) en vez de `true`/`false` (devuelve `null`
   si falla), y los 5 puntos de llamada hacen:
   ```js
   const idTicket = await asegurarTicket();
   if (!idTicket) return;
   carrito.anadirLinea({ ticket_id: idTicket, ... });
   ```

**Defecto B — el botón "CONFIRMAR PAGO" estaba deshabilitado (defecto del arnés, no del POS).**

`CheckoutScreen` arranca en `metodo = 'EFECTIVO'`, y con efectivo
`puedeCobrar = montoRecibido >= total`. El arnés pulsaba "CONFIRMAR PAGO" **sin capturar
efectivo**, así que el botón estaba `disabled` y `fireEvent.click` no disparaba nada → `onConfirmar`
nunca se llamaba → `cobrarTicket` nunca se invocaba. **Corrección:** el arnés selecciona "Tarjeta"
antes de confirmar, lo que habilita el botón sin capturar efectivo. Esto es fiel a la UX real: el
cajero elige el método de pago antes de confirmar.

### 3.3 Por qué importa

El Defecto A es un **bug de producción real** que habría hecho que la primera línea de cada venta
se perdiera silenciosamente. La puerta de F8.6 lo cazó **antes** de que llegara a producción. Es
la justificación viva de la REGLA DURA 2 y del principio "de adentro hacia afuera": la puerta de
integración end-to-end es la que revela los defectos de costura que las puertas unitarias no ven.

---

## 4. Decisiones de diseño (y por qué)

### 4.1 El paso de entrega aparece SOLO tras el cobro exitoso (punto delicado §3.7)

`confirmarCobro` retorna temprano si `cobrar()` falla (`pagado.outcome !== 'ok'`). El
`setEntregaAbierta(true)` está **después** de esa guarda. Si el cobro falla, el paso de entrega
NUNCA se abre. El criterio 5 lo verifica explícitamente.

### 4.2 El header recibe dos props, no una (defecto D-2 corregido)

`onAbrirCliente` (abre el panel) y `clienteIdentificado` (resalta el botón, igual que
`pedidoProgramado`). Separar "abrir" de "está identificado" permite que el botón muestre el estado
sin acoplar la apertura al estado.

### 4.3 El POS nunca importa `Order` ni escribe `customers` (Guard E-15 / A-02)

El criterio 9 inspecciona las llamadas reales del mock y verifica que **no** existe ninguna llamada
a `customers` ni a `notification_outbox`. El POS consume los contratos **por operación**
(`getBeneficiosParaTicket`, `encolarTicket`), nunca por tabla. La frontera se respeta.

### 4.4 La degradación no bloquea la venta (DT-07)

Los criterios 7 y 8 fuerzan el fallo del CRM y de Notificaciones respectivamente. En ambos casos la
venta **se cobra igual** y el paso de entrega sigue ofreciendo Imprimir. La ausencia de un módulo
externo degrada al comportamiento más conservador, nunca bloquea.

---

## 5. Trazabilidad (regla → test)

| Regla | Enunciado | Test que la verifica |
|---|---|---|
| **RN-82** | El cliente es opcional y no bloquea la venta | `criterio8` |
| **RN-86** | El envío es Outbox: se encola, nunca bloquea el cobro | `criterio6`, `criterio7` |
| **RN-87** | El ticket impreso siempre está disponible | `criterio7` |
| **RN-88** | El fallo de Notificaciones no tumba el POS | `criterio7` |
| **DT-07** | Degradación: nunca bloquea la venta | `criterio7`, `criterio8` |
| **A-02** | El POS consume el contrato, no escribe tablas ajenas | `criterio9` |

---

## 6. Contratos consumidos

**Contrato #26 — `crm.beneficios_para_ticket`** (`POST /crm/benefits/for-ticket`)
Consumido por `CustomerIdentificationPanel` (F8.4) al identificar por teléfono.

**Contrato #27 — `notificaciones.encolar_ticket`** (`POST /notifications/enqueue-ticket`)
Consumido por `TicketDeliveryPanel` (F8.5) al enviar por WhatsApp/Email.

El POS es **consumidor** de ambos; el proveedor es el módulo dueño de la tabla. El POS nunca lee
`customers` ni `notification_outbox`.

---

## 7. Lo que esta sub-fase NO hace

1. **No define la política de lealtad.** El POS solo muestra los beneficios que el CRM devuelve;
   nunca decide cuántos puntos otorgar (criterio 9 del plan de Fase 8).
2. **No persiste puntos.** El ledger de lealtad es del CRM (Regla de Oro #10).
3. **No envía notificaciones directamente.** Solo encola por el Outbox (Regla de Oro #7).

---

## 8. Cierre

Con F8.6, la Fase 8 (lado POS) queda **funcionalmente completa**: el POS identifica clientes por
teléfono (contrato #26), muestra sus beneficios, cobra, y ofrece el paso de entrega por
Imprimir/WhatsApp/Email (contrato #27) — todo con degradación segura si el CRM o Notificaciones
están caídos. La frontera A-02 se mantiene intacta.

**Pendiente:** F8.7 — cierre formal (CI completo + §7 del Plan Maestro + commit + push).
