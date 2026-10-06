# FICHA F13.1 — Contrato 5 (`pos.eventos_auditables`)

> **Fase:** F13 (Auditoría y Control) — sub-fase **F13.1**.
> **Tipo:** IMPLEMENTACIÓN (cierra el contrato 5, que estaba declarado como
> "Cicatriz" y no tenía endpoint).
> **Regla que la gobierna:** A-02 / O-23 — *"el consumidor pide por OPERACIÓN,
> nunca lee la tabla del proveedor"*. El módulo de Auditoría no puede leer
> `pos_audit_log` ni `tickets`; pide un RESUMEN por contrato.
> **Cicatriz que la origina:** la F13.0 creó la tabla `pos_audit_log` y el
> guardián que la escribe, pero **nadie podía leerla por contrato**. El contrato
> 5 existía en el registro desde la Fase 2 con `estado_hoy="Cicatriz"`: una
> promesa sin puerta.

---

## 1. El hueco real (por qué existe esta sub-fase)

| Lo que la Fase 13 necesitaba | ¿Existía antes de F13.1? |
|---|---|
| Tabla `pos_audit_log` | **SÍ** — creada en F13.0 |
| Guardián que escribe el asiento | **SÍ** — `guards/audit.py` (F13.0) |
| Contrato 5 declarado | **SÍ** — en [`contracts/registry.py`](../../apps/api/contracts/registry.py:205), pero `estado_hoy="Cicatriz"` |
| Endpoint `GET /pos/auditable-events` | **NO** — el contrato prometía una operación que no existía |
| Esquema de salida (proyección) | **NO** — no había `EventoAuditableSalida` |

**Diagnóstico:** la F13.0 hizo que la auditoría **se escribiera**; la F13.1 hace
que **se pueda leer por contrato**. Sin esta sub-fase, el log era un pozo ciego:
datos que entran y nadie puede consultar sin violar la frontera.

---

## 2. Qué se construyó (2 artefactos + 1 cambio de estado + 1 puerta)

### 2.1 Los esquemas — [`schemas.py`](../../apps/api/schemas.py:570)

Dos modelos Pydantic que son **PROYECCIONES**, no filas (O-23):

- `EventoAuditableSalida` — expone **solo 5 campos**: `tipo`, `ticket_id`,
  `usuario_id`, `timestamp`, `detalle`. **NO** expone `id` (clave interna),
  `payload` crudo ni `extras` (internos del POS).
- `EventosAuditablesSalida` — el sobre `{eventos: [...]}`.

### 2.2 El endpoint — [`routers/pos.py`](../../apps/api/routers/pos.py:775)

`GET /pos/auditable-events?desde=&hasta=` (contrato 5):

- **Solo lectura.** Filtra `pos_audit_log` por rango de fechas (RN-77).
- Normaliza los timestamps a UTC antes de comparar (RN-78).
- Ordena por `timestamp` ascendente (la línea de tiempo natural).
- Responde **400** si `desde > hasta` (error declarado en el contrato).
- El helper `_evento_auditable()` arma el resumen: `tipo` = el `endpoint`
  auditado, `detalle` = `{codigo, payload, extras}`.

### 2.3 El cambio de estado — [`contracts/registry.py`](../../apps/api/contracts/registry.py:218)

`estado_hoy` del contrato 5: `"Cicatriz"` → **`"Implementado"`**. La promesa
ahora tiene puerta.

### 2.4 La puerta — [`tests/test_f13_1_auditoria.py`](../../apps/api/tests/test_f13_1_auditoria.py:1)

6 tests contra PostgreSQL real (respuesta HTTP, no intención):

| Test | Qué prueba |
|---|---|
| `test_contrato_5_declarado_implementado` | el contrato 5 ya no es "Cicatriz" |
| `test_endpoint_devuelve_resumen` | el endpoint responde los eventos del rango |
| `test_endpoint_filtra_por_rango` | RN-77: solo el rango pedido |
| `test_endpoint_rango_invalido_400` | `desde > hasta` → 400 |
| `test_endpoint_no_expone_tabla_tickets` | O-23: no expone `id` ni `payload` crudo |
| `test_endpoint_ordena_por_timestamp` | los eventos llegan en orden |

---

## 3. La frontera (A-02 / O-23) — por qué es un RESUMEN

El contrato 5 tiene una garantía explícita: *"El POS expone un RESUMEN de
eventos, nunca su tabla `tickets`."* La F13.1 la respeta en tres frentes:

1. **No lee `tickets`.** Lee `pos_audit_log`, que es del propio POS.
2. **No expone la fila cruda.** `EventoAuditableSalida` es una proyección de 5
   campos; el `id` interno y el `payload` crudo quedan fuera.
3. **No expone `SELECT *`.** El test `test_endpoint_no_expone_tabla_tickets`
   verifica que `id` y `payload` NO aparecen en la respuesta.

---

## 4. Evidencia

```
docker exec nuevo_pos_api python -m pytest tests/test_f13_1_auditoria.py -q
→ 6 passed in 2.24s

docker exec nuevo_pos_api python -m pytest -q
→ 305 passed in 10.75s   (299 previos + 6 nuevos)

node scripts/guards.mjs
→ PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE (7/7)
```

---

## 5. Qué NO está en F13.1

- **No hay superficie (UI).** El endpoint es para el módulo de Auditoría; el POS
  no lo consume. La superficie de consulta es F13.2 (opcional, decisión del
  dueño).
- **No se audita automáticamente cada escritura.** El guardián `LogDeAuditoria`
  (F13.0) existe y está probado, pero cablearlo a cada handler del POS es una
  decisión de alcance posterior: hoy el contrato 5 **lee** lo que se escriba.
- **No hay paginación.** El contrato 5 no la declara; si el volumen crece, se
  añade como una nueva versión del contrato (P-03: el contrato es estable, la
  tabla es libre).

---

## 6. Autocrítica

- **El `tipo` se deriva del `endpoint`.** Es una decisión pragmática: el
  contrato 5 declara `tipo` como un campo, pero la tabla no tiene una columna
  `tipo` separada. Se usa el `endpoint` auditado como tipo. Si Auditoría necesita
  tipos semánticos ("ticket_creado", "ticket_cobrado"), eso es un cambio de
  contrato, no un parche silencioso.
- **El `detalle` anida `payload` y `extras`.** El contrato declara `detalle`
  como un objeto libre; se aprovecha para no perder información sin exponerla en
  primer nivel. Es una proyección, no una fuga: el consumidor recibe un resumen
  estructurado, no la fila.
- **La F13.1 cierra el contrato, no la Fase 13.** La Fase 13 completa (auditar
  cada escritura del POS de forma automática) es más grande; esta sub-fase cierra
  el hueco de LECTURA que la F13.0 dejó abierto.
