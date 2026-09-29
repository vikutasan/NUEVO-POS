# FICHA F5.1 — Servicio de Cuentas Abiertas

> **Fase:** 5 — Pizarrón de Cuentas Abiertas
> **Sub-fase:** 5.1 — Capa de servicio (frontend)
> **Estado:** ✅ CERRADA — puerta en verde
> **Fecha:** 2026-09-29
> **Contrato:** 23 (`pos.cuentas_abiertas`)
> **Predecesora:** F5.0 (commit `c1ebbb1`)

---

## 1. Qué se construyó

La capa de servicio del pizarrón: el puente entre el endpoint HTTP (F5.0) y el
hook que consumirá la pantalla (F5.2). Se construyeron **dos piezas**:

| Pieza | Archivo | Rol |
|-------|---------|-----|
| Llamada HTTP | [`client.js`](../../apps/pos/src/api/client.js:281) | `listarCuentasAbiertas(terminalId)` — arma el query string y delega en `peticion()` |
| Servicio | [`openAccountsService.js`](../../apps/pos/src/services/openAccountsService.js:1) | Envuelve la llamada en el contrato `{outcome, reason, data}` |

### 1.1 La llamada HTTP

```js
export function listarCuentasAbiertas(terminalId) {
  const qs = new URLSearchParams({ terminal_id: terminalId });
  return peticion(`/pos/open-accounts?${qs.toString()}`);
}
```

Se agregó también al `export default` del cliente, para que el servicio pueda
mockear el módulo completo en las pruebas.

### 1.2 El servicio

```js
export function listarCuentasAbiertas(terminalId) {
  const id = typeof terminalId === 'string' ? terminalId.trim() : '';
  if (!id) {
    // Guarda local: no se llama al cliente con un id vacío (evita un 422 inútil).
    return Promise.resolve(fallo('terminal_invalida', null));
  }
  return aOutcome(
    () => withRetries(() => cliente.listarCuentasAbiertas(id)),
    motivo
  );
}
```

---

## 2. Decisión de diseño

**Se siguió el patrón de [`cashService.js`](../../apps/pos/src/services/cashService.js:1) al pie de la letra.**
No se inventó una forma nueva de envolver llamadas HTTP. Las razones:

1. **Consistencia (E-16):** un solo patrón de servicio en todo el POS. Quien lea
   `cashService.js` entiende `openAccountsService.js` sin aprender nada nuevo.
2. **El contrato `{outcome, reason, data}` es la Regla 1 de la batalla:** ningún
   servicio lanza excepciones hacia arriba. El hook decide qué hacer con el fallo.
3. **`withRetries` centralizado (Regla 3):** 3 intentos con backoff 1s/2s/3s. La
   lectura de cuentas es idempotente, así que reintentar es seguro.

### 2.1 El mapeo de motivos (`motivo`)

| Condición | `reason` |
|-----------|----------|
| `ApiError` con `codigo === 0` | `'sin_conexion'` |
| `ApiError` con `codigo === 400` | `'terminal_invalida'` |
| `ApiError` con `codigo === 422` | `'datos_invalidos'` |
| Otro `ApiError` | `err.message` o `error_<codigo>` |
| Error no-HTTP | `err.message` o `'error_desconocido'` |

### 2.2 La guarda local del `terminalId` vacío

El servicio **no llama al cliente** si el `terminalId` viene vacío o no es string.
Devuelve `fallo('terminal_invalida', null)` de inmediato. Esto evita un viaje de
red inútil y un 422 garantizado. Es la contraparte frontend del rechazo que el
backend ya hace (F5.0, `test_terminal_id_vacio_es_rechazado`).

---

## 3. La puerta de F5.1

**Archivo:** [`openAccountsService.f5_1.test.jsx`](../../apps/pos/src/services/openAccountsService.f5_1.test.jsx:1)
**Resultado:** ✅ **14/14 en verde** (18.1s)

| Criterio | Qué prueba | Tests |
|----------|-----------|-------|
| **Superficie** | El servicio expone `listarCuentasAbiertas` (named + default) | 2 |
| **Éxito** | Devuelve `{outcome:'ok', reason:null, data:{cuentas:[...]}}` | 3 |
| **Fallo** | Mapea `sin_conexion`, `terminal_invalida`, `datos_invalidos`, genérico | 4 |
| **Reintentos** | `withRetries` reintenta 3 veces y se recupera | 2 |
| **Guarda local** | `terminalId` vacío/`null`/no-string → no llama al cliente | 3 |

### 3.1 Nota de nomenclatura

El plan (§5.1.1) nombraba el test `openAccountsService.test.js`. Se construyó
como **`openAccountsService.f5_1.test.jsx`** porque
[`vitest.config.js`](../../apps/pos/vitest.config.js:21) solo incluye
`src/**/*.test.{jsx,tsx}`. Un `.test.js` no lo correría Vitest. Se siguió el
precedente de [`cashService.f4_2.test.jsx`](../../apps/pos/src/services/cashService.f4_2.test.jsx:1).

---

## 4. Verificación de no-regresión

| Verificación | Comando | Resultado |
|--------------|---------|-----------|
| Puerta F5.1 | `npx vitest run src/services/openAccountsService.f5_1.test.jsx` | ✅ 14/14 |
| Suite completa | `npm run test` | ✅ Node 3/3 · Vitest PASA · pytest PASA |
| Guardias de CI | `node scripts/guards.mjs` | ✅ 7/7 · 100 archivos |

Ninguna prueba previa se rompió. El servicio es aditivo: no modifica
`cashService.js`, `useCart.js` ni ningún otro consumidor.

---

## 5. Trazabilidad

| Regla / Contrato | Dónde se honra |
|------------------|----------------|
| **Contrato 23** (`pos.cuentas_abiertas`) | `client.js` → `GET /pos/open-accounts` |
| **Regla 1** (contrato `{outcome, reason}`) | `aOutcome` + `motivo` en el servicio |
| **Regla 3** (reintentos centralizados) | `withRetries` con 3 intentos |
| **Regla 15** (respuesta ligera) | El servicio no transforma: pasa la proyección de 5 campos tal cual |
| **RN-31** (draft pertenece a su terminal) | El `terminal_id` viaja explícito en el query string |
| **E-16** (funciones atómicas) | `listarCuentasAbiertas` tiene 8 líneas, 1 nivel de anidación |

---

## 6. Qué NO entra en F5.1

- **El hook `useOpenAccounts.js`** → F5.2 (lista, refresca, recupera versión fresca).
- **La pantalla `OpenAccountsCorkboard.jsx`** → F5.3 (pizarrón visual, 3 modos).
- **La paginación** → diferida (el pizarrón muestra las cuentas de UNA terminal,
  que en la práctica son pocas; se documentó como deuda consciente en F5.0).
- **La suscripción en tiempo real** → no existe; el refresco será por polling en F5.2.

---

## 7. Veredicto

**F5.1 está cerrada.** La capa de servicio del pizarrón existe, respeta el
contrato `{outcome, reason, data}`, reintenta ante fallos transitorios, y está
blindada por 14 pruebas. La puerta está en verde y no hay regresión.

El siguiente paso natural es **F5.2**: el hook `useOpenAccounts.js`, que
consumirá este servicio para mantener la lista de cuentas abiertas viva en la
pantalla.
