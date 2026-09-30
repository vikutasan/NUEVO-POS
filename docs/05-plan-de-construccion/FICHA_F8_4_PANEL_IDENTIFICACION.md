# FICHA DE EVIDENCIA — F8.4 Panel de identificación del cliente

> **Sub-fase:** F8.4 — Componente `CustomerIdentificationPanel.jsx`
> **Fase:** 8 — Integración con CRM y Notificaciones (lado POS)
> **Plan:** [`PLAN_DE_ABORDAJE_FASE_8_POR_PARTES.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_8_POR_PARTES.md) §3.5
> **Commit de esta sub-fase:** _(pendiente de registrar)_
> **Estado:** ✅ CERRADA — gate verde (18 tests)

---

## 1. Qué se construyó

Un panel modal que permite al cajero **identificar al cliente por teléfono** y ver
los beneficios que el CRM devuelve (contrato 26), sin que el POS calcule nada.

| Archivo | Rol |
|---|---|
| [`apps/pos/src/components/CustomerIdentificationPanel.jsx`](../../apps/pos/src/components/CustomerIdentificationPanel.jsx) | El componente (UI) |
| [`apps/pos/src/components/CustomerIdentificationPanel.f8_4.test.jsx`](../../apps/pos/src/components/CustomerIdentificationPanel.f8_4.test.jsx) | La puerta (18 tests, 7 criterios) |

El componente **consume** el hook [`useCustomerIdentification.js`](../../apps/pos/src/hooks/useCustomerIdentification.js)
(F8.3), que a su vez consume el servicio [`benefitsService.js`](../../apps/pos/src/services/benefitsService.js)
(F8.1), que llama al contrato #26. El panel **no** toca la red directamente.

---

## 2. Los 7 criterios y su verificación

| # | Criterio | Test | Resultado |
|---|---|---|---|
| 1 | Superficie: diálogo con `aria-label="Identificación del cliente"`, `#input-telefono-cliente`, `#btn-buscar-cliente` | 3 tests | ✅ |
| 2 | Buscar identifica: llama al servicio con teléfono + items, muestra nombre/nivel/puntos, notifica al padre | 4 tests | ✅ |
| 3 | El POS solo muestra, no calcula (RN-83): muestra el descuento tal cual; avisa si no hay | 2 tests | ✅ |
| 4 | Cliente nuevo no bloquea (RN-82): avisa y NO identifica a nadie | 2 tests | ✅ |
| 5 | Degradación DT-07 (RN-87): aviso visible, recuerda precio de lista, permite cerrar | 3 tests | ✅ |
| 6 | Cerrar: el botón "Cerrar" y el botón "Listo" invocan `onCerrar` | 2 tests | ✅ |
| 7 | Inyectable: usa el servicio inyectado; no llama con teléfono vacío | 2 tests | ✅ |

**Total: 18 tests, 18 verdes.**

---

## 3. El defecto que la puerta cazó (PROHIBICIÓN #3)

La primera corrida del gate dio **16 verdes y 2 rojos**. Los dos rojos no eran un
problema del test: eran un **bug real del componente**.

`manejarBuscar` hacía:

```javascript
const r = await identificar(telefono, items);
if (r && r.outcome === 'ok') {
  onIdentificado?.(cliente, beneficios);   // ← lee estado CERRADO por el closure
}
```

Tras el `await`, `cliente` y `beneficios` seguían siendo los del **render anterior**
(ambos `null`), porque el closure capturó esos valores antes de que el `setState`
del hook se aplicara. Resultado: `onIdentificado(null, null)` siempre.

Esto es exactamente la **PROHIBICIÓN #3** del Plan Maestro (§5): *"nada de leer
estado en callbacks asíncronos"*. La corrección deriva los valores del `data` que
devuelve `identificar`, no del estado:

```javascript
const r = await identificar(telefono, items);
if (r && r.outcome === 'ok' && r.data && r.data.customer_id) {
  const clienteIdentificado = {
    customer_id: r.data.customer_id,
    nombre: r.data.nombre ?? null,
    nivel: r.data.nivel ?? null,
  };
  onIdentificado?.(clienteIdentificado, r.data);
}
```

> **Lección (REGLA DURA 2 — "verificar, no asumir"):** el gate no es un trámite.
> Aquí evitó que un bug de closure llegara a producción, donde el CRM habría
> recibido siempre `null` y los beneficios nunca se habrían aplicado.

---

## 4. Decisiones de diseño

1. **UX heredada (§6.8):** se hereda la *integración* del viejo POS (botón en el
   header → panel → teclear teléfono → ver beneficios); se reescribe la
   *implementación* con los tokens del POS nuevo.
2. **El POS no calcula descuentos (RN-83):** el panel muestra `beneficios.descuentos`
   tal cual los devuelve el CRM. No hay aritmética de lealtad en el POS.
3. **Degradación DT-07 (RN-87):** si el CRM falla, el panel muestra un aviso que
   recuerda que se puede cobrar a precio de lista, y **nunca** bloquea el cierre.
4. **Cliente opcional (RN-82):** si el teléfono no corresponde a ningún cliente, se
   avisa y se sigue; no se identifica a nadie y no se bloquea la venta.
5. **Inyectable:** `servicioBeneficios` es una prop opcional; en producción se omite
   y el hook usa el servicio real. En tests se inyecta un doble.

---

## 5. Frontera (A-02)

El panel **no** importa `Order`, **no** escribe `customers` ni `notification_outbox`,
y **no** define la política de lealtad. Solo consume el contrato #26 a través del
servicio. La frontera se verifica en el guard E-15 (F8.6).

---

## 6. Comando de verificación

```bash
cd ../NUEVO-POS/apps/pos
npx vitest run src/components/CustomerIdentificationPanel.f8_4.test.jsx
```

Salida esperada: `Test Files 1 passed (1)` / `Tests 18 passed (18)`.

---

## 7. Trazabilidad

| Origen | Sub-fase | Test |
|---|---|---|
| RN-82 (cliente opcional) | F8.4 | `CustomerIdentificationPanel.f8_4` (criterio 4) |
| RN-83 (no recalcula) | F8.4 | `CustomerIdentificationPanel.f8_4` (criterio 3) |
| RN-87 (CRM caído no tumba) | F8.4 | `CustomerIdentificationPanel.f8_4` (criterio 5) |
| RN-91 (beneficio del cliente) | F8.4 | `CustomerIdentificationPanel.f8_4` (criterio 2) |
| DT-07 (degradación) | F8.4 | `CustomerIdentificationPanel.f8_4` (criterio 5) |
| §6.8 (UX heredada) | F8.4 | `CustomerIdentificationPanel.f8_4` (criterio 1) |
| PROHIBICIÓN #3 | F8.4 | `CustomerIdentificationPanel.f8_4` (criterio 2, bug cazado) |
