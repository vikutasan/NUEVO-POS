# FICHA DE EVIDENCIA — FASE 8.3: Hook `useCustomerIdentification`

**Sub-fase:** F8.3 — `useCustomerIdentification.js`
**Fecha:** 30 de septiembre de 2026
**Estado:** ✅ CERRADA
**Commit de esta sub-fase:** _(pendiente — se registra tras el commit)_

---

## 1. Objetivo de la sub-fase

Construir el hook que gestiona el estado de la identificación del cliente al
cobrar: el teléfono tecleado, el cliente identificado, sus beneficios (contrato
26), el estado de carga y el error. Expone una acción `identificar(telefono,
items)` y una acción `limpiar()`.

Es la pieza intermedia entre el servicio (F8.1) y el panel (F8.4), siguiendo el
principio "de adentro hacia afuera".

---

## 2. Archivos creados

| Archivo | Operación | Descripción |
|---|---|---|
| [`apps/pos/src/hooks/useCustomerIdentification.js`](../../apps/pos/src/hooks/useCustomerIdentification.js) | CREADO | El hook de identificación del cliente |
| [`apps/pos/src/hooks/useCustomerIdentification.f8_3.test.jsx`](../../apps/pos/src/hooks/useCustomerIdentification.f8_3.test.jsx) | CREADO | La puerta de la sub-fase (15 tests, 6 criterios) |

---

## 3. La superficie del hook

```javascript
const {
  cliente,        // { customer_id, nombre, nivel } | null
  beneficios,     // el objeto completo del contrato 26 | null
  cargando,       // boolean
  error,          // string | null
  identificar,    // (telefono, items?) => Promise<{outcome, reason, data}>
  limpiar,        // () => void
} = useCustomerIdentification({ servicioBeneficios });
```

**Inyectable:** `servicioBeneficios` permite sustituir el servicio real en tests
(patrón idéntico a [`useOpenAccounts.js`](../../apps/pos/src/hooks/useOpenAccounts.js:52)).

---

## 4. Decisiones de diseño

1. **No dispara fetch al montar.** La identificación es una acción explícita del
   cajero (teclear el teléfono y pulsar buscar). Por eso no hay `useEffect` de
   carga inicial y no hay riesgo de bucle (H1).

2. **`customer_id: null` NO es error.** El contrato 26 garantiza que un cliente
   inexistente es 200 con cero beneficios. El hook lo distingue de un fallo:
   deja `cliente = null`, `beneficios = null`, `error = null`.

3. **Degradación DT-07.** Un fallo del CRM (503 → `crm_no_disponible`) deja
   `error` poblado pero NO bloquea: el cajero sigue cobrando a precio de lista
   (RN-87).

4. **PROHIBICIÓN #3.** Los callbacks leen de `useRef`, nunca del estado cerrado
   por el closure. Una llamada disparada justo antes de un cambio de servicio no
   escribe con la referencia vieja.

5. **Guarda local.** Sin teléfono (vacío, espacios, no-string) NO se llama al
   servicio: se devuelve `telefono_requerido` como outcome inspeccionable.

6. **Devuelve el outcome.** `identificar` devuelve el mismo `{outcome, reason,
   data}` del servicio para que el panel (F8.4) decida sin try/catch.

---

## 5. La puerta — 6 criterios, 15 tests

| Criterio | Qué verifica | Tests |
|---|---|---|
| **1. Superficie** | Expone `cliente`, `beneficios`, `cargando`, `error`, `identificar`, `limpiar`; arranca en estado inicial | 2 |
| **2. Identificar OK** | Llama al servicio con el teléfono (recortado) y los items; puebla cliente + beneficios; `customer_id: null` no es error | 4 |
| **3. Degradación DT-07** | Un fallo del CRM deja `error` poblado, cliente nulo, y devuelve el outcome | 2 |
| **4. Limpiar** | `limpiar()` vuelve al estado inicial y borra un error previo | 2 |
| **5. Teléfono vacío** | Vacío, espacios y no-string NO llaman al servicio; devuelve `telefono_requerido` | 3 |
| **6. Inyectable** | Usa el servicio inyectado; sin inyectar usa el real sin lanzar | 2 |

**Resultado de la ejecución:**

```
✓ src/hooks/useCustomerIdentification.f8_3.test.jsx (15 tests) 56ms
  Test Files  1 passed (1)
       Tests  15 passed (15)
```

---

## 6. Trazabilidad — reglas de negocio cubiertas

| Regla | Enunciado | Dónde se cubre |
|---|---|---|
| **RN-82** | El cliente es opcional y no bloquea la venta | `identificar` nunca lanza; el POS sigue sin cliente |
| **RN-87** | Un fallo del CRM no tumba el POS | Criterio 3: `error` poblado, POS operable |
| **RN-91** | El beneficio pertenece al cliente | El hook solo puebla `beneficios` si `customer_id` existe |
| **DT-07** | La ausencia de configuración degrada, no bloquea | Criterio 3 |

---

## 7. Estado de la puerta

- [x] `useCustomerIdentification.js` creado con `identificar` y `limpiar`
- [x] Gate `useCustomerIdentification.f8_3.test.jsx` escrito (6 criterios)
- [x] Gate verde: **15 tests passed**
- [ ] Commit + push
- [ ] Hash real registrado en esta ficha

---

## 8. Referencias

- [`PLAN_DE_ABORDAJE_FASE_8_POR_PARTES.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_8_POR_PARTES.md) §3.4
- [`FICHA_F8_1_SERVICIO_BENEFICIOS.md`](FICHA_F8_1_SERVICIO_BENEFICIOS.md) — el servicio que consume
- [`useOpenAccounts.js`](../../apps/pos/src/hooks/useOpenAccounts.js:52) — el patrón hermano (F5.2)
