# FICHA — FIX_PIZARRON_PARIDAD_POSTIT

**Fecha:** 8 de octubre de 2026
**Módulo:** POS — Pizarrón de cuentas abiertas
**Tipo:** Corrección de paridad de presentación (post-it)
**Commit:** `1ea57f0`
**Estado:** CERRADA

---

## 1. El síntoma (lo que reportó el usuario)

> "En el viejo POS el post-it que es de un pedido tiene información distinta de
> un post-it de una cuenta normal. Me gustaría conservar la lógica que tiene la
> información del post-it del viejo POS."

El pizarrón del POS nuevo **ya funcionaba** (el post-it aparecía), pero el
**contenido del post-it de un PEDIDO** no coincidía con el del viejo POS.

---

## 2. La fuente de verdad (el viejo POS)

`apps/pos/OpenAccountsCorkboard.jsx` (viejo POS), bloque del post-it:

```jsx
{acc.orderType === 'PEDIDO' ? (
    <div className="mb-4">
        <span className="...">📦 PEDIDO TENTATIVO</span>
        <h4 className="...">{acc.clientName}</h4>
        <p className="...">
            {acc.deliveryType === 'DOMICILIO' ? '🚗 DOMICILIO' : '🏪 PICK UP'}
        </p>
    </div>
) : (
    <h4 className="...">CLIENTE LOCAL</h4>
)}
```

**Reglas del viejo POS para el post-it de PEDIDO:**

| Elemento | Valor |
|---|---|
| Badge | `📦 PEDIDO TENTATIVO` (texto fijo) |
| Cliente | `acc.clientName` |
| Entrega | `🚗 DOMICILIO` si `deliveryType === 'DOMICILIO'`, si no `🏪 PICK UP` |
| Teléfono | **NO se muestra** |

**Reglas para el post-it de CUENTA NORMAL:** solo `CLIENTE LOCAL`.

---

## 3. La brecha (el nuevo POS antes del fix)

`apps/pos/src/components/OpenAccountsCorkboard.jsx` (nuevo POS), bloque del post-it:

```jsx
{cuenta.order_type === 'PEDIDO' ? (
    <div className="mb-2 lg:mb-4">
        <span className="...">
            📦 PEDIDO
            {cuenta.delivery_type ? ` · ${cuenta.delivery_type}` : ''}
        </span>
        {cuenta.customer_name && (<h4 className="...">{cuenta.customer_name}</h4>)}
        {cuenta.customer_phone && (
            <p className="...">📞 {cuenta.customer_phone}</p>
        )}
    </div>
) : (
    <h4 className="...">CLIENTE LOCAL</h4>
)}
```

**Tres diferencias respecto al viejo POS:**

| # | Elemento | Viejo POS | Nuevo POS (antes) | Acción |
|---|---|---|---|---|
| 1 | Badge | `📦 PEDIDO TENTATIVO` | `📦 PEDIDO · DOMICILIO` (crudo) | **Corregir** al texto fijo |
| 2 | Entrega | Línea propia `🚗 DOMICILIO` / `🏪 PICK UP` | *(no existía)* | **Agregar** con emoji mapeado |
| 3 | Teléfono | *(no se muestra)* | `📞 5512345678` | **Quitar** |

---

## 4. Lo construido

### 4.1 El helper `etiquetaEntrega`

Se agregó una función pura que restaura el mapeo exacto del viejo POS:

```jsx
function etiquetaEntrega(deliveryType) {
  if (!deliveryType) return null;
  const valor = String(deliveryType).toUpperCase();
  if (valor === 'DOMICILIO' || valor === 'DELIVERY') return '🚗 DOMICILIO';
  if (valor === 'PICKUP' || valor === 'PICK UP' || valor === 'RECOLECCION') {
    return '🏪 PICK UP';
  }
  return String(deliveryType);
}
```

**Por qué tolerante:** el backend puede guardar `PICKUP` (default del modelo
`orders.py`) o `PICK UP` (texto humano). El helper normaliza ambos al mismo
emoji, y ante un valor desconocido cae al valor crudo (nunca rompe).

### 4.2 El bloque del post-it (nuevo)

```jsx
{cuenta.order_type === 'PEDIDO' ? (
    <div className="mb-2 lg:mb-4">
        <span className="...">📦 PEDIDO TENTATIVO</span>
        {cuenta.customer_name && (<h4 className="...">{cuenta.customer_name}</h4>)}
        {etiquetaEntrega(cuenta.delivery_type) && (
            <p className="...">{etiquetaEntrega(cuenta.delivery_type)}</p>
        )}
    </div>
) : (
    <h4 className="...">CLIENTE LOCAL</h4>
)}
```

### 4.3 El test F12.6

`OpenAccountsCorkboard.f12_6.test.jsx` — criterio 5 reescrito:

- Afirma el badge exacto `PEDIDO TENTATIVO`.
- Afirma la línea `🚗 DOMICILIO`.
- **Afirma que el teléfono NO aparece** (`queryByText(/5512345678/)` → `null`).
- Nuevo caso: `delivery_type: 'PICKUP'` mapea a `🏪 PICK UP`.

---

## 5. Lo que NO se tocó (y por qué)

- **El backend / contrato 23:** los campos `customer_phone` y `delivery_type`
  siguen viajando en la proyección. El teléfono se sigue necesitando para
  **recuperar** un pedido (F12.10b restaura el contexto). Solo se dejó de
  **pintar** en el post-it, para replicar el viejo POS.
- **La estética:** corcho, pin rojo, rotación determinista, color por terminal
  y layout responsive se conservan (ya eran paridad desde F12.6).
- **`CLIENTE LOCAL`:** ya coincidía con el viejo POS.

---

## 6. Verificación

| Compuerta | Resultado |
|---|---|
| Suite completa (`npm run test -- --run`) | **773/773** en 67 archivos |
| Guardianes (`node scripts/guards.mjs`) | **8/8** en verde (215 archivos) |

---

## 7. Archivos tocados

| Archivo | Cambio |
|---|---|
| `apps/pos/src/components/OpenAccountsCorkboard.jsx` | Helper `etiquetaEntrega` + bloque del post-it |
| `apps/pos/src/components/OpenAccountsCorkboard.f12_6.test.jsx` | Criterio 5 reescrito + caso PICKUP |

---

## 8. Lección

La paridad de presentación no se agota en "mostrar los mismos campos": también
importa **cómo se etiquetan** (badge fijo vs. valor crudo), **dónde se colocan**
(línea propia vs. concatenado) y **qué se omite** (el viejo no mostraba el
teléfono). Replicar "exactamente" incluye las ausencias.
