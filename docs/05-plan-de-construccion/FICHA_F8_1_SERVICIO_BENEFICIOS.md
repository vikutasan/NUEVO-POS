# FICHA DE EVIDENCIA — FASE 8.1: Servicio de beneficios del cliente

**Sub-fase:** F8.1 — `benefitsService.js` (contrato 26)
**Fecha:** 30 Sep 2026
**Plan que ejecuta:** `PLAN_DE_ABORDAJE_FASE_8_POR_PARTES.md` v2.0 §3.2
**Precedente:** F8.0 (contratos #26/#27 + reglas RN-82..RN-93) — commit `e594de0`
**Commit de esta sub-fase:** `b894f1d`

---

## 1. Qué se construyó

| Archivo | Tipo | Qué es |
|---|---|---|
| [`apps/pos/src/services/benefitsService.js`](../../apps/pos/src/services/benefitsService.js:1) | Producción | El servicio que consume el contrato #26 |
| [`apps/pos/src/api/client.js`](../../apps/pos/src/api/client.js:301) | Producción | Se añadió `getBeneficiosParaTicket()` (POST `/crm/benefits/for-ticket`) |
| [`apps/pos/src/services/benefitsService.f8_1.test.jsx`](../../apps/pos/src/services/benefitsService.f8_1.test.jsx:1) | Test (gate) | 16 tests, 5 criterios |

---

## 2. El contrato que consume (26)

```
CONTRATO 26 — clientes.beneficios_para_ticket
  Consumidor:   POS
  Proveedor:    Clientes (CRM)
  Operación:    POST /crm/benefits/for-ticket
  Entrada:      { telefono: String,
                  items: [{ product_id: String, qty: Integer, unit_price: String }] }
  Salida:       { customer_id, nombre, nivel, descuentos, puntos_a_ganar,
                  puntos_disponibles, puede_canjear }
  Estado hoy:   DECLARADO (F8.0). Proveedor: NO EXISTE todavía.
```

> **Nota de frontera (A-02):** el POS consume el contrato, NUNCA lee la tabla
> `customers` ni `loyalty_ledger`. El servicio no conoce ninguna tabla.

---

## 3. Los 5 criterios de la puerta

| # | Criterio | Cómo se verifica | Resultado |
|---|---|---|---|
| 1 | La operación existe y llama al endpoint correcto con el teléfono | `obtenerBeneficios` es función; pasa `{telefono, items}`; recorta espacios | ✅ |
| 2 | Éxito → `{ outcome:'ok', reason:null, data }` | Beneficios del CRM; cliente inexistente = 200 con `customer_id:null` | ✅ |
| 3 | Fallo → `{ outcome:'error', reason }`, NUNCA lanza | 404→`telefono_invalido`, 503→`crm_no_disponible`, red→`sin_conexion`, 422→`datos_invalidos` | ✅ |
| 4 | Reintentos: usa `withRetries` (3 intentos) | Falla 2 veces, acierta la 3ª → ok; agota 3 → error | ✅ |
| 5 | Teléfono vacío → guarda local, NO llama al cliente | `''`, `'   '`, `undefined`, `null` → `telefono_requerido` | ✅ |

---

## 4. La degradación elegante (DT-07)

La regla dura de toda la Fase 8: **la ausencia del CRM nunca bloquea la venta.**

| Escenario | `reason` | Qué hace el POS |
|---|---|---|
| El CRM responde 503 | `crm_no_disponible` | Cobra a precio de lista |
| La red falla | `sin_conexion` | Cobra a precio de lista |
| El teléfono no es normalizable | `telefono_invalido` | Cobra a precio de lista |
| El cliente no existe | _(no es error)_ | 200 con cero beneficios; cobra normal |

El servicio **NUNCA lanza**. Un `throw` aquí obligaría a cada llamador a envolver
en try/catch y podría tumbar el cobro por un módulo ajeno. En su lugar, devuelve
un valor inspeccionable que el hook (F8.3) discrimina con `esOk()`.

---

## 5. Evidencia de la puerta

```
$ npx vitest run src/services/benefitsService.f8_1.test.jsx

 ✓ src/services/benefitsService.f8_1.test.jsx (16 tests) 21159ms

 Test Files  1 passed (1)
      Tests  16 passed (16)
```

---

## 6. Trazabilidad

| Origen | Sub-fase | Test |
|---|---|---|
| Contrato #26 | F8.0 + **F8.1** | `test_f2_frontera` (27) + `benefitsService.f8_1` |
| DT-02 (dinero String) | **F8.1** | `benefitsService.f8_1` (los precios viajan como String) |
| DT-07 (degradación) | **F8.1** + F8.2 + F8.6 | Los 3 gates |
| A-02 (frontera) | F8.6 | Guard E-15 |

---

## 7. Qué NO se hizo (y por qué)

1. **No se construyó el CRM.** Ni sus tablas, ni su lógica de lealtad. Es de otro módulo (§1.2 del plan).
2. **No se coerciona el dinero aquí.** El `Number()` vive en la frontera que arma el carrito (igual que `ProductCard.jsx`), no en el servicio.
3. **No se cableó a la UI.** Eso es F8.3 (hook) y F8.4 (componente).

---

## 8. Estado

- **F8.1: COMPLETA.** Gate verde (16 tests).
- **Siguiente:** F8.2 — `notificationsService.js` (contrato #27), clon del mismo patrón.
