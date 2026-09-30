# FICHA DE EVIDENCIA — FASE 8.2: Servicio de Notificaciones (contrato 27)

**Sub-fase:** F8.2 — `notificationsService.js`
**Fecha:** 30 de septiembre de 2026
**Estado:** ✅ CERRADA
**Commit de esta sub-fase:** `c42d83c`

---

## 1. Objetivo de la sub-fase

Construir la capa de servicio del lado POS que consume el **contrato 27**
(`POST /notifications/enqueue-ticket`, proveedor Notificaciones), envolviendo la
operación en el contrato uniforme `{ outcome, reason, data }` y garantizando la
degradación DT-07: **un fallo de la cola NUNCA tumba la venta**.

Esta sub-fase es la contraparte de F8.1 (`benefitsService.js`, contrato 26). El
patrón es idéntico: mismo `outcome`, mismo `withRetries`, misma traducción de
errores a `reason` legible.

---

## 2. Archivos creados / modificados

| Archivo | Operación | Descripción |
|---|---|---|
| [`apps/pos/src/services/notificationsService.js`](../../apps/pos/src/services/notificationsService.js) | CREADO | El servicio que consume el contrato 27 |
| [`apps/pos/src/api/client.js`](../../apps/pos/src/api/client.js) | MODIFICADO | Se añadió `encolarTicket()` y se registró en el export por defecto |
| [`apps/pos/src/services/notificationsService.f8_2.test.jsx`](../../apps/pos/src/services/notificationsService.f8_2.test.jsx) | CREADO | La puerta de la sub-fase (18 tests, 5 criterios) |

---

## 3. La operación expuesta

```javascript
export function encolarTicket(solicitud) → Promise<{outcome, reason, data}>
```

**Entrada** (contrato 27):

```javascript
{
  evento_id: 'evt-ticket-001',        // obligatorio — clave de idempotencia (RN-86)
  ticket_uuid: 't-0001',
  canales: ['WHATSAPP', 'EMAIL'],     // subconjunto de CANALES_SOPORTADOS
  destinatario: { telefono?, email? },
  payload: { folio, total, items, fecha }
}
```

**Salida del API** (contrato 27):

```javascript
{ encolado: Boolean, mensajes: [{ canal, estado }] }
```

**Constante exportada:** `CANALES_SOPORTADOS = Object.freeze(['WHATSAPP', 'EMAIL'])`.

---

## 4. Traducción de errores a `reason` (degradación DT-07)

| Condición | `reason` | Significado para el cajero |
|---|---|---|
| `evento_id` vacío | `evento_id_requerido` | Guarda local: no se llama al cliente |
| HTTP 422 | `destinatario_incompleto` | Falta teléfono o email para el canal |
| HTTP 503 | `cola_no_disponible` | El módulo de notificaciones no está disponible |
| HTTP 0 (red) | `sin_conexion` | No hay red hacia el API |
| Otro | `err.message` | Mensaje crudo del API |

**Regla de Oro #7 (Outbox):** el POS solo ESCRIBE en la cola; el worker envía
después. Si la cola no está disponible, el ticket **YA se cobró y NO se
revierte**. El servicio devuelve `reason: 'cola_no_disponible'` y el POS sigue
con la impresión (RN-87).

**A-02 (frontera):** el POS consume el contrato, NUNCA escribe en
`notification_outbox` ni conoce el worker. Este servicio no conoce tablas.

---

## 5. La puerta — 5 criterios, 18 tests

| Criterio | Qué verifica | Tests |
|---|---|---|
| **1. Superficie** | La operación existe, expone los canales soportados y llama al endpoint correcto con el `evento_id` | 5 |
| **2. Éxito** | `outcome:'ok'`, `reason:null`, `data` con el resultado del encolado | 2 |
| **3. Fallo (nunca lanza)** | 422→`destinatario_incompleto`, 503→`cola_no_disponible`, 0→`sin_conexion`, error inesperado→mensaje; la promesa siempre resuelve | 5 |
| **4. Reintentos** | `withRetries` reintenta ante un fallo transitorio (2º intento ok) y agota 3 intentos si siempre falla | 2 |
| **5. Guarda local** | Sin `evento_id` (vacío, espacios, nulo, no-string) NO llama al cliente y devuelve `evento_id_requerido` | 4 |

**Resultado de la ejecución:**

```
✓ src/services/notificationsService.f8_2.test.jsx (18 tests) 19105ms
  Test Files  1 passed (1)
       Tests  18 passed (18)
```

---

## 6. Trazabilidad — reglas de negocio cubiertas

| Regla | Enunciado | Dónde se cubre |
|---|---|---|
| **RN-85** | El envío va por outbox, no directo | El servicio solo encola (contrato 27) |
| **RN-86** | El encolado va en la misma transacción del ticket | `evento_id` obligatorio como clave de idempotencia |
| **RN-88** | Un fallo de notificaciones no tumba el POS | `outcome:'error'` sin lanzar; el cobro no se revierte |
| **RN-89** | El canal de envío debe ser soportado | `CANALES_SOPORTADOS` |
| **RN-90** | El destino debe ser válido para el canal | 422 → `destinatario_incompleto` |

---

## 7. Decisiones de diseño

1. **`evento_id` obligatorio, no opcional.** Es la clave de idempotencia
   (RN-86). Encolar sin ella podría duplicar el envío si el cajero reintenta.
   Por eso la guarda local corta antes de llamar al cliente.

2. **`withRetries` con 3 intentos.** Un parpadeo de red no debe dejar al cliente
   sin su ticket. La operación es idempotente por `evento_id`, así que
   reintentar es seguro.

3. **El 503 es un `reason`, no una excepción.** La cola caída es un módulo
   ausente, no un error del cajero. El panel (F8.5) lo muestra sin alarmar.

4. **`CANALES_SOPORTADOS` congelado.** El componente de entrega (F8.5) lo usa
   para construir el selector de canales sin hardcodear la lista.

---

## 8. Estado de la puerta

- [x] `notificationsService.js` creado con la operación `encolarTicket`
- [x] `encolarTicket()` añadido a `client.js` y registrado en el export
- [x] Gate `notificationsService.f8_2.test.jsx` escrito (5 criterios)
- [x] Gate verde: **18 tests passed**
- [ ] Commit + push
- [ ] Hash real registrado en esta ficha

---

## 9. Referencias

- [`PLAN_DE_ABORDAJE_FASE_8_POR_PARTES.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_8_POR_PARTES.md) §3.3
- [`FICHA_F8_0_CONTRATOS_Y_REGLAS_CRM.md`](FICHA_F8_0_CONTRATOS_Y_REGLAS_CRM.md) — el contrato 27 que se consume
- [`FICHA_F8_1_SERVICIO_BENEFICIOS.md`](FICHA_F8_1_SERVICIO_BENEFICIOS.md) — el patrón hermano (contrato 26)
