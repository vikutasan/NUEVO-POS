# FICHA F13.0 — Log de auditoría (`pos_audit_log`)

> **Fase:** F13 (Auditoría y Control) — sub-fase **F13.0**.
> **Tipo:** IMPLEMENTACIÓN (crea el hueco real que la Fase 13 necesitaba).
> **Regla que la gobierna:** §10.6.2 — *"la COMPLETITUD del conjunto también es
> una compuerta"*. El inventario de F13 listaba como "pendiente" algo que en
> realidad **no existía**: las reglas RN-75/76/77 estaban declaradas pero
> operaban sobre una lista en memoria. No había tabla, no había endpoint, no
> había test (deuda **D-11.1**).
> **Cicatriz que la origina:** la Fase 10 declaró "auditoría" como cubierta
> porque existían `movimientos_inventario` (ledger) y `warehouse_events`
> (outbox). Ambos cubren el **INVENTARIO**, no la **AUDITORÍA DE ESCRITURAS
> DEL POS**. La autonomía (puedo seguir operando) ya estaba; la
> **observabilidad** (puedo probar qué pasó) no.

---

## 1. El hueco real (por qué existe esta sub-fase)

| Lo que la Fase 13 necesitaba | ¿Existía antes de F13.0? |
|---|---|
| Reglas RN-75/76/77 declaradas | **SÍ** — en [`rules/registry.py`](../../apps/api/rules/registry.py:637), pero sobre `list[dict]` en memoria |
| Tabla donde persistir el log | **NO** — no había `pos_audit_log` |
| Guardián que registre en la misma transacción | **NO** — el patrón del outbox (RN-63) no se había aplicado a la auditoría |
| Test de puerta contra PostgreSQL | **NO** — los `test_rn75/76/77` de F3 solo probaban la función pura |

**Diagnóstico:** la auditoría era una **intención**, no un hecho. Esta sub-fase
la convierte en un hecho verificable.

---

## 2. Qué se construyó (3 artefactos + 1 puerta)

### 2.1 El modelo — [`models/audit.py`](../../apps/api/models/audit.py:35)

`PosAuditLog` (`__tablename__ = "pos_audit_log"`), append-only por diseño:

| Columna | Tipo | Regla |
|---|---|---|
| `id` | UUID PK | C-01 (identidad global, nunca entero) |
| `endpoint` | String | RN-76 (la ruta de la escritura) |
| `payload` | JSONB | RN-76 (el cuerpo, sin datos sensibles) |
| `codigo` | Integer | RN-76 (el código de respuesta HTTP) |
| `terminal_id` | String, indexado | RN-77 (filtro por terminal) |
| `usuario_id` | String, nullable | quién la hizo (nullable: hay escrituras de sistema) |
| `extras` | JSONB | RN-76 (metadatos: ticket_id, folio, motivo…) |
| `timestamp` | DateTime(timezone=True), indexado | C-02 / RN-78 (UTC con tzinfo) |

### 2.2 La migración — [`migrations/versions/0004_pos_audit_log.py`](../../apps/api/migrations/versions/0004_pos_audit_log.py:39)

- `revision = "0004_pos_audit_log"`, `down_revision = "0003_ticket_traceability"`.
- Crea la tabla + **3 índices**: `terminal_id`, `timestamp` y el compuesto
  `(terminal_id, timestamp)` — la consulta de RN-77 ("los eventos de esta
  terminal entre estas fechas") es la más frecuente del módulo de Auditoría.
- `downgrade()` reversible.

### 2.3 El guardián — [`guards/audit.py`](../../apps/api/guards/audit.py:33)

Aplica a la auditoría el **mismo principio del outbox** (RN-63 / A-04): el
asiento vive en la MISMA transacción que la escritura que audita.

- `AsientoAuditoria` — dataclass **frozen** (inmutable). `construir()` valida
  RN-76 (contenido) y RN-78 (UTC) antes de existir.
- `SinTerminalEnAuditoria(ReglaViolada)` — RN-77: sin terminal no hay asiento
  consultable.
- `LogDeAuditoria` — context manager. Al salir **sin** excepción, confirma los
  asientos; si el bloque lanza, hace **rollback** (descarta los asientos) y
  **NO silencia** la excepción (E-05).

### 2.4 La puerta — [`tests/test_f13_auditoria.py`](../../apps/api/tests/test_f13_auditoria.py:1)

9 tests contra PostgreSQL real:

| Test | Qué prueba |
|---|---|
| `test_tabla_pos_audit_log_existe` | la tabla existe con sus 8 columnas |
| `test_migracion_encadenada_a_0003` | la cadena de Alembic no se rompe |
| `test_rn75_la_escritura_se_persiste` | RN-75 contra la BD real |
| `test_rn76_el_registro_tiene_contenido` | RN-76 (endpoint, payload, código, extras) |
| `test_rn77_consulta_por_terminal_y_rango` | RN-77 (filtro por terminal + rango) |
| `test_rn78_el_timestamp_es_utc` | RN-78 (naive se rechaza; con tz se normaliza) |
| `test_guardian_registra_en_la_transaccion` | el guardián escribe el asiento |
| `test_guardian_hace_rollback_si_falla` | no se audita una escritura que no ocurrió |
| `test_guardian_exige_terminal` | RN-77: sin terminal no hay asiento |

---

## 3. La frontera (A-02 / O-23)

El contrato 5 (`pos.eventos_auditables`) leerá de **`pos_audit_log`**, nunca de
`tickets`. La tabla de auditoría es del módulo POS; el consumidor (Auditoría)
pregunta por la **operación** (`GET /pos/auditable-events`), no por la tabla.
Eso se cierra en **F13.1**.

---

## 4. Evidencia de la puerta

```
docker exec nuevo_pos_api alembic upgrade head
  → Running upgrade 0003_ticket_traceability -> 0004_pos_audit_log

docker exec nuevo_pos_api python -m pytest tests/test_f13_auditoria.py -q
  → 9 passed in 1.36s

docker exec nuevo_pos_api python -m pytest -q
  → 299 passed in 10.90s        (290 previos + 9 nuevos)

node scripts/guards.mjs
  → PUERTA F0 / F4-A-04 / F5-R-01 EN VERDE (7/7)

npm test (apps/pos)
  → 691 passed (63 files)       (sin regresión)
```

---

## 5. Qué NO entra en F13.0 (queda para F13.1 / F13.2)

- **F13.1** — esquema `EventoAuditableSalida` + endpoint
  `GET /pos/auditable-events` + contrato 5 a `"Implementado"`.
- **F13.2** (opcional, decisión del dueño) — `auditService.js` + panel de
  consulta en la superficie.

F13.0 cierra **el cimiento**: la tabla, el guardián y la puerta. Sin esto,
F13.1 no tendría de dónde leer.

---

## 6. Autocrítica

- **La deuda D-11.1 era real y estaba oculta.** El inventario de F13 la
  presentaba como "reglas declaradas", lo que sugería avance. La lección de
  §10.6.2 se repite: *declarar una regla no es implementarla*.
- **El guardián no está cableado a los endpoints todavía.** F13.0 construye la
  puerta (`LogDeAuditoria`) pero ningún router la usa aún. Eso es **correcto**:
  primero el cimiento, luego el cableado (F13.1). Cablearlo antes de tener el
  endpoint de consulta sería construir la mitad de un puente.
- **El índice compuesto se declara como comentario en el modelo** y como índice
  real en la migración. Es una divergencia cosmética conocida: Alembic es la
  fuente de verdad del esquema; el modelo documenta la intención.
