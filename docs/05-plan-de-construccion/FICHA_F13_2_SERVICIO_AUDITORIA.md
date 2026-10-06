# FICHA F13.2a — Servicio de Auditoría

> **Fase:** 13 — Auditoría y Control
> **Sub-fase:** 13.2a — Capa de servicio (frontend)
> **Estado:** ✅ CERRADA — puerta en verde
> **Fecha:** 2026-10-06
> **Contrato:** 5 (`pos.eventos_auditables`)
> **Predecesora:** F13.1 (commit `7db09e8`)

---

## 1. Qué se construyó

La capa de servicio de auditoría: el puente entre el endpoint HTTP (F13.1) y el
consumidor que consultará los eventos auditables. Se construyeron **dos piezas**:

| Pieza | Archivo | Rol |
|-------|---------|-----|
| Llamada HTTP | [`client.js`](../../apps/pos/src/api/client.js:355) | `listarEventosAuditables(desde, hasta)` — arma el query string y delega en `peticion()` |
| Servicio | [`auditService.js`](../../apps/pos/src/services/auditService.js:1) | Envuelve la llamada en el contrato `{outcome, reason, data}` |

### 1.1 La llamada HTTP

```js
export function listarEventosAuditables(desde, hasta) {
  const qs = new URLSearchParams({ desde, hasta });
  return peticion(`/pos/auditable-events?${qs.toString()}`);
}
```

Se agregó también al `export default` del cliente, para que el servicio pueda
mockear el módulo completo en las pruebas.

### 1.2 El servicio

```js
export function listarEventosAuditables(desde, hasta) {
  const d = aInstanteTexto(desde);
  const h = aInstanteTexto(hasta);
  if (!d || !h) {
    // Guarda local: no se llama al cliente con un rango incompleto (evita un 422 inútil).
    return Promise.resolve(fallo('rango_invalido', null));
  }
  return aOutcome(
    () => withRetries(() => cliente.listarEventosAuditables(d, h)),
    motivo
  );
}
```

---

## 2. Decisión de diseño

**Se siguió el patrón de [`openAccountsService.js`](../../apps/pos/src/services/openAccountsService.js:1) al pie de la letra.**
No se inventó una forma nueva de envolver llamadas HTTP. Las razones:

1. **Consistencia (E-16):** un solo patrón de servicio en todo el POS. Quien lea
   `openAccountsService.js` entiende `auditService.js` sin aprender nada nuevo.
2. **El contrato `{outcome, reason, data}` es la Regla 1 de la batalla:** ningún
   servicio lanza excepciones hacia arriba. El consumidor decide qué hacer con el fallo.
3. **`withRetries` centralizado (Regla 3):** 3 intentos con backoff 1s/2s/3s. La
   lectura de eventos es idempotente, así que reintentar es seguro.

### 2.1 El mapeo de motivos (`motivo`)

| Condición | `reason` |
|-----------|----------|
| `ApiError` con `codigo === 0` | `'sin_conexion'` |
| `ApiError` con `codigo === 400` | `'rango_invalido'` |
| `ApiError` con `codigo === 422` | `'datos_invalidos'` |
| Otro `ApiError` | `err.message` o `error_<codigo>` |
| Error no-HTTP | `err.message` o `'error_desconocido'` |

### 2.2 La guarda local del rango incompleto

El servicio **no llama al cliente** si `desde` o `hasta` vienen vacíos, no son
string/`Date`, o son un `Date` inválido. Devuelve `fallo('rango_invalido', null)`
de inmediato. Esto evita un viaje de red inútil y un 422 garantizado (el contrato 5
exige AMBOS parámetros). Es la contraparte frontend del rechazo que el backend ya
hace (F13.1, `test_rn77_consulta_por_terminal_y_rango`).

### 2.3 La normalización de instantes (`aInstanteTexto`)

El contrato 5 declara `desde`/`hasta` como `datetime` (ISO-8601, UTC). El servicio
acepta un `Date` o un string y lo normaliza a string ISO-8601 antes de cruzar la
frontera HTTP. Un `Date` inválido (`NaN`) se trata como vacío → guarda local.

---

## 3. La puerta de F13.2a

**Archivo:** [`auditService.f13_2.test.jsx`](../../apps/pos/src/services/auditService.f13_2.test.jsx:1)
**Resultado:** ✅ **17/17 en verde** (18.1s)

| Criterio | Qué prueba | Tests |
|----------|-----------|-------|
| **Superficie** | El servicio expone `listarEventosAuditables`; pasa `desde`/`hasta`; acepta `Date` | 3 |
| **Éxito** | Devuelve `{outcome:'ok', reason:null, data:{eventos:[...]}}`; conserva los 5 campos (O-23) | 3 |
| **Fallo** | Mapea `sin_conexion`, `rango_invalido`, `datos_invalidos`, genérico | 4 |
| **Reintentos** | `withRetries` reintenta 3 veces y se recupera | 2 |
| **Guarda local** | Rango vacío/no-string/`Date` inválido → no llama al cliente | 5 |

### 3.1 Nota de nomenclatura

El test se construyó como **`auditService.f13_2.test.jsx`** porque
[`vitest.config.js`](../../apps/pos/vitest.config.js:21) solo incluye
`src/**/*.test.{jsx,tsx}`. Se siguió el precedente de
[`openAccountsService.f5_1.test.jsx`](../../apps/pos/src/services/openAccountsService.f5_1.test.jsx:1).

---

## 4. Por qué F13.2b (el panel) NO procede

Esta sub-fase cierra el círculo de F13. El **panel** de consulta de auditoría
**NO vive en el POS**: pertenece al módulo de **Auditoría y Control** del ERP.

- El contrato 5 declara como consumidor a **Auditoría**, no al POS
  ([`contracts/registry.py:218`](../../apps/api/contracts/registry.py:218)).
- El `pos_audit_log` (F13.0) vive en la base del POS porque el POS **escribe** la
  evidencia (P-01: el dueño escribe su tabla).
- El módulo de Auditoría **lee** esa evidencia por contrato (P-02: el consumidor
  pregunta por operación).
- Por lo tanto: **F13.2a (el `auditService.js`) sí procede** — es la capa de
  servicio reutilizable. **F13.2b (el panel dentro del POS) NO procede.**

> **Regla:** el POS **produce** la evidencia; Auditoría la **consume**. No confundir
> "el log vive en el POS" con "el panel vive en el POS".

Ver [`PLAN_DE_REORGANIZACION_DE_MODULOS_DE_OBSERVABILIDAD.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_REORGANIZACION_DE_MODULOS_DE_OBSERVABILIDAD.md:1) §4.2.

---

## 5. Verificación de no-regresión

| Verificación | Comando | Resultado |
|--------------|---------|-----------|
| Puerta F13.2a | `npx vitest run src/services/auditService.f13_2.test.jsx` | ✅ 17/17 |
| Suite frontend | `npm run test` (en `apps/pos`) | ✅ 64 archivos · 708 tests |
| Suite backend | `docker exec nuevo_pos_api python -m pytest -q` | ✅ 305 passed |
| Guardias de CI | `node scripts/guards.mjs` | ✅ 7/7 · 211 archivos |

Ninguna prueba previa se rompió. El servicio es aditivo: no modifica
`openAccountsService.js`, `cashService.js` ni ningún otro consumidor.

---

## 6. Trazabilidad

| Regla | Enunciado | Dónde se cumple |
|-------|-----------|-----------------|
| **RN-77** | La auditoría se consulta por rango de fechas | `listarEventosAuditables(desde, hasta)` |
| **RN-78** | Los timestamps se normalizan a UTC | `aInstanteTexto` → ISO-8601 UTC |
| **O-23** | El consumidor recibe una PROYECCIÓN, no la tabla | El servicio NO transforma la forma; conserva los 5 campos |
| **P-02** | El consumidor pregunta por operación | `GET /pos/auditable-events` (contrato 5) |
| **Regla 1** | Contrato `{outcome, reason, data}` | `aOutcome` + `motivo` |
| **Regla 3** | `withRetries` centralizado | 3 intentos, backoff 1s/2s/3s |

---

## 7. Cierre de F13

Con F13.2a en verde, **F13 (Auditoría y Control) queda cerrada**:

| Sub-fase | Estado | Commit |
|----------|--------|--------|
| F13.0 — Log de auditoría + guardián + RN-75/76/77 | ✅ | `b3eccd1` |
| F13.1 — Contrato 5 + `GET /pos/auditable-events` + 6 tests | ✅ | `7db09e8` |
| F13.2a — Servicio de auditoría (esta ficha) | ✅ | (este commit) |
| F13.2b — Panel en el POS | ❌ NO procede | El panel pertenece al módulo de Auditoría y Control |
