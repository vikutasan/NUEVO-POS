# FICHA F7.7e — HALLAZGO 5: el precio llega como STRING desde la API

> **Fase:** 7.7e (micro-fase de corrección, posterior al cierre de Fase 7)
> **Tipo:** Corrección de bug en vivo (no detectado por el gate)
> **Estado:** ✅ CERRADA
> **Fecha:** 2026-09-30
> **Repositorio:** `NUEVO-POS`

---

## 1. El síntoma (lo que veía el operador)

Al entrar a **cualquier** terminal desde el selector, la pantalla POS quedaba
**en blanco**: solo se veía el color **madera cálida** del `body`. No había
cabecera, ni categorías, ni productos, ni carrito. La aplicación parecía
"muerta" pero el servidor de desarrollo respondía con normalidad.

Este síntoma es idéntico al de F7.7d (HALLAZGO 4), lo que hizo pensar al
principio que la corrección anterior no había surtido efecto. **No era así:**
era un bug **distinto**, más profundo, que solo se manifestaba con **datos
reales** de la API.

---

## 2. La evidencia (consola del navegador)

```
Uncaught TypeError: (producto.price || 0).toFixed is not a function
    at ProductCard (ProductCard.jsx:51:37)

The above error occurred in the <ProductCard> component:
    at ProductCard (http://localhost:5100/src/components/ProductCard.jsx:18:39)
    at div
    at ProductGrid (http://localhost:5100/src/components/ProductGrid.jsx:19:39)
    ...
    at RetailVisionPOS (http://localhost:5100/src/RetailVisionPOS.jsx:40:3)
    ...

Consider adding an error boundary to your tree to customize error handling behavior.
```

---

## 3. La causa raíz (HALLAZGO 5)

### 3.1 La API serializa `Decimal` como STRING

`GET /catalog/products-for-sale` devuelve el precio como **cadena de texto**,
no como número:

```json
{ "name": "Agua 600ml", "price": "12.00" }
```

Esto es **comportamiento estándar de Pydantic v2**: un `Decimal` se serializa
a JSON como string para **preservar la precisión decimal** (evitar el error de
coma flotante). Es correcto y **no se debe cambiar** en el backend.

### 3.2 El código asumía un número

[`ProductCard.jsx`](../../apps/pos/src/components/ProductCard.jsx) hacía:

```jsx
${(producto.price || 0).toFixed(2)}
```

El `|| 0` **parecía** una defensa, pero **no protegía nada**:

- Un string **no vacío** (`"12.00"`) es **truthy** en JavaScript.
- Por tanto `"12.00" || 0` evalúa a `"12.00"` (el string).
- `.toFixed` **solo existe en `Number`**, no en `String`.
- → `TypeError: (producto.price || 0).toFixed is not a function`.

### 3.3 Por qué la pantalla quedaba completamente en blanco

React, al encontrar un error durante el render, **desmonta el árbol completo**
si no hay un *error boundary*. Como la aplicación no tiene uno, el fallo de un
solo `ProductCard` tumbó **toda** la interfaz. Lo único que quedó fue el fondo
`--madera` definido en el `body` de [`index.css`](../../apps/pos/src/index.css).

---

## 4. Por qué el gate anterior NO lo detectó

Los fixtures de los gates existentes usaban precios **numéricos**:

```js
const PRODUCTO_A = { name: 'Bolillo', price: 12.5 }; // ← número
```

Un número **sí** tiene `.toFixed`, así que el bug **nunca** se reproducía en
las pruebas. Solo aparecía con los datos **reales** de la API, donde el precio
viaja como string. **Este es el hueco que la presente ficha cierra.**

---

## 5. La corrección

### 5.1 Un helper que coercionar SIEMPRE con `Number()`

En [`ProductCard.jsx`](../../apps/pos/src/components/ProductCard.jsx) se añadió:

```js
function formatearPrecio(valor) {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return '$0.00';
  return `$${numero.toFixed(2)}`;
}
```

Y se reemplazó la interpolación por:

```jsx
{formatearPrecio(producto.price)}
```

Este patrón **coincide** con el helper `formatearMoneda` que ya usaban
[`SalesReceipt.jsx`](../../apps/pos/src/components/SalesReceipt.jsx),
[`POSOverlays.jsx`](../../apps/pos/src/components/POSOverlays.jsx),
[`TicketTemplate.jsx`](../../apps/pos/src/utils/TicketTemplate.jsx) y
[`CorteTicketTemplate.jsx`](../../apps/pos/src/utils/CorteTicketTemplate.jsx):
todos coercionan con `Number()` antes de formatear.

### 5.2 Auditoría de los demás `.toFixed()`

Se buscó `.toFixed(` en todos los `*.jsx` del POS. Resultado:

| Archivo | Estado |
|---|---|
| `ProductCard.jsx:51` | ❌ **BUG** — sin coerción (corregido aquí) |
| `VoiceCartPanel.jsx:230` | ✅ Seguro — usa `Number()` |
| `SalesReceipt.jsx` | ✅ Seguro — usa `formatearMoneda` |
| `POSOverlays.jsx` | ✅ Seguro — usa `formatearMoneda` |
| `TicketTemplate.jsx` | ✅ Seguro — usa `formatearMoneda` |
| `CorteTicketTemplate.jsx` | ✅ Seguro — usa `formatearMoneda` |

`ProductCard.jsx` era el **único** punto inseguro.

---

## 6. La puerta de regresión

Se creó [`ProductCard.f7_7e.test.jsx`](../../apps/pos/src/components/ProductCard.f7_7e.test.jsx)
con **8 pruebas** repartidas en **5 criterios**. La diferencia clave: **todos
los fixtures usan precios STRING**, tal como los devuelve la API.

| Criterio | Qué verifica |
|---|---|
| 1 | `ProductCard` renderiza un precio STRING sin lanzar |
| 2 | Formatea el string con 2 decimales y el símbolo `$` |
| 3 | Tolera un precio ausente / no numérico (cae a `$0.00`) |
| 4 | `ProductGrid` renderiza una lista con precios STRING sin lanzar |
| 5 | `RetailVisionPOS` monta con un catálogo de precios STRING (el caso que rompía en vivo) y muestra los productos |

El **criterio 5** es el más importante: reproduce el escenario **exacto** del
bug en vivo (la pantalla completa con datos de la API real).

---

## 7. Verificación

### 7.1 Gate específico

```
npx vitest run src/components/ProductCard.f7_7e.test.jsx
→ 8/8 tests passed
```

### 7.2 Suite completa de frontend

```
npm run test  (apps/pos)
→ 28 archivos, 338 tests passed
```

(Subió de 330 a 338: los 8 tests nuevos. **Cero regresiones.**)

### 7.3 CI completo (raíz del repo)

```
npm run ci
→ lint: 0 errores (218 archivos)
→ Node: 3/3 archivos en verde
→ Vitest: todos los tests de componentes pasaron
→ pytest: todos los tests de la API pasaron
→ guards: 7/7 en verde (E-05, A-04, E-15 ×2, R-01, E-09, E-10)
```

### 7.4 Verificación en vivo contra la API real

```
GET http://localhost:5101/catalog/products-for-sale?channel=PANADERIA
→ primer producto: {"name":"Agua 600ml","price":"12.00","tipo":"string"}
→ Number(price).toFixed(2) => 12.00
```

La API **sigue** devolviendo el precio como string (correcto), y el nuevo
helper lo formatea sin lanzar.

---

## 8. Lecciones aprendidas

1. **Un `|| 0` no protege contra un string.** La defensa correcta es
   **coercionar explícitamente** con `Number()` y validar con `Number.isNaN`.
2. **Los fixtures deben parecerse a la API real.** Usar precios numéricos en
   los tests ocultó un bug que solo aparecía con datos reales. La regla queda:
   *los fixtures de dinero viajan como STRING, igual que en producción.*
3. **Sin error boundary, un solo componente tumba toda la app.** El síntoma
   (pantalla en blanco) no apuntaba al culpable (`ProductCard`). Un error
   boundary a nivel de `App` habría mostrado el error en pantalla y ahorrado
   horas de diagnóstico. **Queda anotado como mejora futura.**
4. **Pydantic serializa `Decimal` como string por diseño.** No es un bug del
   backend; es una garantía de precisión. El frontend debe adaptarse.

---

## 9. Alcance de la verificación

Esta ficha documenta una corrección **puntual** de un bug en vivo. La
verificación cubre:

- El gate de regresión específico (8 tests).
- La suite completa de frontend (338 tests).
- El CI completo (lint + Node + Vitest + pytest + guards).
- La comprobación contra la API real (el precio sigue siendo string).

**No** cubre una revisión exhaustiva de todos los puntos donde el frontend
consume dinero de la API; la auditoría de `.toFixed()` (§5.2) fue el alcance
razonable para esta micro-fase.

---

## 10. Archivos tocados

| Archivo | Cambio |
|---|---|
| `apps/pos/src/components/ProductCard.jsx` | Helper `formatearPrecio` + uso en el render |
| `apps/pos/src/components/ProductCard.f7_7e.test.jsx` | **Nuevo** — gate de regresión (8 tests) |
| `docs/05-plan-de-construccion/FICHA_F7_7e_PRECIO_STRING.md` | **Nuevo** — esta ficha |

---

## 11. Commit

```
F7.7e — HALLAZGO 5: el precio llega como STRING desde la API

ProductCard.jsx llamaba (producto.price || 0).toFixed(2). La API serializa
Decimal como STRING ("12.00"), y un string no vacío es truthy, así que el
|| 0 no protegía nada: .toFixed no existe en String → TypeError → React
desmontaba el árbol completo (sin error boundary) → pantalla en blanco.

- ProductCard.jsx: helper formatearPrecio() que coercionar con Number()
  y cae a $0.00 si no es numérico (mismo patrón que formatearMoneda).
- ProductCard.f7_7e.test.jsx: gate de regresión con precios STRING
  (8 tests, 5 criterios), incluido el montaje completo de RetailVisionPOS.
- Ficha F7.7e con el diagnóstico y la evidencia.

CI: lint 0 errores · Node 3/3 · Vitest 338 tests · pytest verde · guards 7/7.
```

**Hash:** _(se registra en el commit de cierre)_
