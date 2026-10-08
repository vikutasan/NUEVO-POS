# FICHA F12.22 — Encolado del ticket (contrato 27)

**Estado:** COMPLETA
**Fecha:** 2026-10-08
**Contrato:** 27 `notificaciones.encolar_ticket` → `POST /notifications/enqueue-ticket`
**Reglas:** RN-85, RN-86, RN-87, RN-88, RN-89, RN-90 (Regla de Oro #7 — Outbox)

---

## 1. El hueco que cierra

El contrato 27 estaba **DECLARADO** en [`contracts/registry.py`](../apps/api/contracts/registry.py:745)
desde la FASE 8.0, pero **NUNCA se implementó**:

- No había router `notifications.py`.
- No había endpoint `POST /notifications/enqueue-ticket`.
- No había modelo `NotificationOutbox`.
- No había servicio de encolado.

El [`TicketDeliveryPanel`](../apps/pos/src/components/TicketDeliveryPanel.jsx:157) del POS
llamaba a `POST /notifications/enqueue-ticket` y recibía **404**. Resultado: los botones
de **WhatsApp** y **email** SIEMPRE fallaban. El usuario lo reportó como
*"de nuevo no puedo meter whatsapp ni e mail"*.

La F12.22 cierra ese hueco implementando el contrato completo.

---

## 2. Por qué una tabla Outbox y no una llamada HTTP directa

El POS **NUNCA** envía el ticket directamente. Escribe una fila en `notification_outbox`
**DENTRO** de la transacción del ticket; un worker externo (módulo Notificaciones) la lee
después y hace el envío real.

| Regla | Qué garantiza |
|-------|---------------|
| **RN-85** | El POS solo ENCOLA. Si el proveedor de WhatsApp está caído, la venta NO se bloquea ni se revierte. |
| **RN-86** | El encolado ocurre en la MISMA transacción del ticket. O se guarda el ticket y su envío pendiente, o no se guarda nada. Idempotente por `evento_id`. |
| **RN-87** | Si la cola falla, el ticket impreso sigue siendo válido. |
| **RN-88** (DT-07) | Un fallo de Notificaciones NO tumba el POS. |
| **RN-89** | El canal debe ser `WHATSAPP` o `EMAIL`. |
| **RN-90** | El destino debe corresponder al canal (teléfono o email). |

---

## 3. Piezas implementadas

### 3.1 Modelo — [`models/notifications.py`](../apps/api/models/notifications.py:35)

Tabla `notification_outbox`:

| Columna | Tipo | Nota |
|---------|------|------|
| `id` | UUID (PK) | C-01 |
| `evento_id` | String UNIQUE | RN-86 — clave de idempotencia |
| `ticket_uuid` | UUID NULL | El ticket cuyo comprobante se envía |
| `canal` | String | RN-89 — `WHATSAPP` \| `EMAIL` |
| `destino` | String | RN-90 — teléfono o correo |
| `payload` | JSONB | El comprobante (folio, total, items, fecha) |
| `estado` | String | `PENDIENTE` \| `ENVIADO` \| `FALLIDO` |
| `error` | Text NULL | Motivo del último fallo |
| `creado_en` | DateTime(tz) | C-02 — UTC (RN-78) |
| `enviado_en` | DateTime(tz) NULL | Cuándo lo envió el worker |

### 3.2 Migración — [`0005_notification_outbox.py`](../apps/api/migrations/versions/0005_notification_outbox.py:41)

Crea la tabla, la restricción UNIQUE de `evento_id` (RN-86) y un índice sobre `estado`
(el worker consulta "qué está pendiente").

### 3.3 Servicio — [`services/notifications_service.py`](../apps/api/services/notifications_service.py:83)

`encolar_ticket(db, *, evento_id, ticket_uuid, canales, destinatario, payload)`:

- Normaliza y valida cada canal (RN-89).
- Valida el destino según el canal (RN-90).
- Idempotente por `evento_id:canal` (RN-86): si ya existe, devuelve la fila existente.
- **NO** hace commit: el router decide la transacción (permite ir en la misma del ticket).

### 3.4 Router — [`routers/notifications.py`](../apps/api/routers/notifications.py:43)

`POST /notifications/enqueue-ticket` → `EncolarTicketSalida`.

### 3.5 Esquemas — [`schemas.py`](../apps/api/schemas.py:708)

- `EncolarTicketEntrada`: `{evento_id, ticket_uuid, canales[], destinatario, payload}`.
- `MensajeEncoladoSalida`: `{canal, estado, envio_id}`.
- `EncolarTicketSalida`: `{encolado, mensajes[]}`.

**Nota de alineación:** el contrato declarado originalmente describía una operación de
UN canal (`{ticket_id, canal, destino, payload}`). El POS encola VARIOS canales de una
vez, así que la entrada real se alineó con lo que el POS envía. El contrato en
`registry.py` se actualizó para reflejarlo.

### 3.6 Registro — [`main.py`](../apps/api/main.py:78)

`app.include_router(notifications.router)`.

---

## 4. Evidencia

### 4.1 Tests backend — [`test_f12_22_encolar_ticket.py`](../apps/api/tests/test_f12_22_encolar_ticket.py:1)

9 tests contra PostgreSQL real:

| Test | Criterio |
|------|----------|
| `test_contrato_27_declarado` | Frontera A-02 |
| `test_encolar_ticket_whatsapp_crea_fila` | Outbox, RN-85 |
| `test_encolar_ticket_email_crea_fila` | Canal EMAIL |
| `test_encolar_ticket_idempotente` | RN-86 — no duplica |
| `test_encolar_ticket_canal_invalido_400` | RN-89 |
| `test_encolar_ticket_destino_vacio_400` | RN-90 |
| `test_encolar_ticket_email_invalido_400` | RN-90 |
| `test_encolar_ticket_sin_canales_400` | RN-89 |
| `test_encolar_ticket_dos_canales` | Una fila por canal |

### 4.2 Tests frontend — [`notificationsService.f8_2.test.jsx`](../apps/pos/src/services/notificationsService.f8_2.test.jsx:1)

18 tests del servicio (superficie, degradación DT-07, reintentos, guarda local).

### 4.3 Suites completas

- **Backend:** `339 passed in 13.89s`.
- **Frontend:** `780 passed (68 files)`.

### 4.4 Verificación en vivo (E2E)

`POST /notifications/enqueue-ticket` con dos canales:

```json
{
  "encolado": true,
  "mensajes": [
    { "canal": "WHATSAPP", "estado": "PENDIENTE", "envio_id": "d379716b-..." },
    { "canal": "EMAIL",    "estado": "PENDIENTE", "envio_id": "0c2f1ddd-..." }
  ]
}
```

---

## 5. Lección: la migración no se aplica sola

La primera corrida de la suite falló con 8 errores
`relation "notification_outbox" does not exist`. La migración `0005` existía en disco
pero **no estaba aplicada** a la base de datos en ejecución (seguía en `0004`).

**Fix:** `docker compose exec api alembic upgrade head`.

Esto refuerza el mismo patrón que [`FICHA_FIX_API_SIN_RELOAD.md`](./FICHA_FIX_API_SIN_RELOAD.md):
el contenedor en ejecución no refleja automáticamente los cambios del código/migraciones.
Tras añadir una migración, **siempre** hay que aplicarla antes de correr los tests.

---

## 6. Archivos tocados

| Archivo | Cambio |
|---------|--------|
| `apps/api/models/notifications.py` | NUEVO — modelo `NotificationOutbox` |
| `apps/api/models/__init__.py` | Import + `__all__` |
| `apps/api/migrations/versions/0005_notification_outbox.py` | NUEVO — migración |
| `apps/api/services/notifications_service.py` | NUEVO — servicio de encolado |
| `apps/api/routers/notifications.py` | NUEVO — router |
| `apps/api/schemas.py` | 3 esquemas del contrato 27 |
| `apps/api/main.py` | Registro del router |
| `apps/api/contracts/registry.py` | Firma alineada + `estado_hoy="FASE 12.22"` |
| `apps/api/tests/test_f12_22_encolar_ticket.py` | NUEVO — 9 tests |
