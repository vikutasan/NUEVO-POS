# FICHA F5.3 — Pizarrón de Cuentas Abiertas (interfaz 13)

> **Sub-fase:** 5.3 — `OpenAccountsCorkboard.jsx`
> **Fase:** 5 — Pizarrón de Cuentas Abiertas
> **Estado:** ✅ CERRADA — gate 8/8 en verde, suite completa en verde, guards 7/7 en verde
> **Fecha:** 2026-09-29
> **Plan rector:** `PLAN_DE_ABORDAJE_FASE_5_POR_PARTES.md` §7

---

## 1. Qué se construyó

El **pizarrón visual** de cuentas abiertas: la superficie (interfaz 13 del registro
de la superficie) que muestra las cuentas OPEN de la terminal como tarjetas en un
corcho, y permite **recuperar** una cuenta para retomarla.

Es el último eslabón de la cadena vertical de la Fase 5:

```
Endpoint (F5.0)  →  Servicio (F5.1)  →  Hook (F5.2)  →  Componente (F5.3)
GET /pos/open-accounts   openAccountsService.js   useOpenAccounts.js   OpenAccountsCorkboard.jsx
```

### Archivos

| Archivo | Rol | Líneas |
|---|---|---|
| `apps/pos/src/components/OpenAccountsCorkboard.jsx` | El componente (interfaz 13) | 193 |
| `apps/pos/src/components/OpenAccountsCorkboard.f5_3.test.jsx` | La puerta de F5.3 (8 criterios) | 246 |

---

## 2. Decisión de diseño

### 2.1 El componente NO habla con la red

`OpenAccountsCorkboard` **no importa** `client.js` ni `openAccountsService.js`
directamente. Consume el hook `useOpenAccounts`, que ya entrega
`{ cuentas, cargando, error, refrescar, recuperarCuenta }`.

Esto respeta el principio de la cadena vertical: cada capa solo conoce a la
inmediata inferior. El componente no sabe si los datos vienen de HTTP, de un
mock o de una caché.

### 2.2 Inyección para las pruebas

El componente acepta dos props de inyección:

- `servicioCuentas` → se pasa al hook (doble del servicio).
- `clienteApi` → se pasa al hook (doble del cliente, para `recuperarCuenta`).

En producción ambas son `undefined` y el hook usa los módulos reales. En las
pruebas se inyectan dobles, de modo que **la puerta nunca toca la red**.

### 2.3 La versión fresca la trae `recuperarCuenta` (lección v6.0)

El botón "Recuperar" **no** usa la `version` que vino en la proyección ligera
del pizarrón. Llama a `recuperarCuenta(id)`, que internamente usa el contrato 21
(`GET /pos/tickets/{id}`) para traer la versión **fresca** antes de retomar la
cuenta. Esto evita el bug de la versión obsoleta (RN-25/RN-26) que costó $453
en la v6.0 del POS viejo.

### 2.4 Banner de error persistente (Regla 19 / prohibición #2)

Hay **dos** banners de error, ambos persistentes (no se auto-ocultan):

1. El error de **lectura** del pizarrón (`error` del hook).
2. El error de **recuperación** de una cuenta concreta (`errorRecuperar` local).

Ninguno usa `setTimeout` para desaparecer. El usuario los ve hasta que la
operación se resuelve o cierra el pizarrón.

### 2.5 Sin timers ni auto-guardado (prohibición #1)

La recarga es **a demanda**: el botón "Actualizar" llama a `refrescar`. No hay
`setInterval` ni polling. El pizarrón no se auto-refresca.

### 2.6 Contenedor raíz fluido (R-01)

El contenedor raíz usa `w-full max-w-[1000px] mx-auto` — exactamente el
contenedor declarado en el registro de la superficie para la interfaz 13. No hay
ancho fijo en píxeles sin `max-`.

### 2.7 Los 3 modos (R-03)

El grid de tarjetas cambia según el modo:

| Modo | Grid |
|---|---|
| `MOSTRADOR` | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` |
| `COMPACTO` | `grid-cols-1 sm:grid-cols-2` |
| `MOVIL` | `grid-cols-1` |

### 2.8 Táctil ≥ 44px (R-04)

Cada tarjeta (`<li>`) y cada botón llevan `min-h-tactil` (≥ 44px), para uso con
dedo en pantalla táctil.

### 2.9 Paleta canónica

`bg-fondo-profundo` (raíz), `bg-fondo-panel` (tarjetas), `text-crema-ticket`
(texto), `bg-acento` / `text-acento` (el verde lima `#c1d72e`), `bg-peligro`
(errores), `rounded-canon35` / `rounded-canon50` (radios canónicos).

---

## 3. La puerta de F5.3 (8 criterios)

`apps/pos/src/components/OpenAccountsCorkboard.f5_3.test.jsx` — **8/8 en verde**.

| # | Criterio | Qué verifica |
|---|---|---|
| 1 | Una tarjeta por cuenta | 3 cuentas → 3 tarjetas + 3 botones "Recuperar" |
| 2 | Folio y total formateado | `folio-{id}` = `T-0042`; `total-{id}` contiene `150.00` |
| 3 | Recuperar con el id correcto | Clic en la 2ª tarjeta → `leerTicket('id-2')` + `onRecuperar({id, version})` |
| 4 | Estado vacío | Lista vacía → "No hay cuentas abiertas." |
| 5 | Estado de carga | Servicio que nunca resuelve → "Cargando cuentas…" |
| 6 | Estado de error | `reason: sin_conexion` → `role="alert"` con "No hay conexión" |
| 7 | Contenedor raíz fluido (R-01) | Raíz con `w-full` + `max-w-[1000px]`, sin ancho fijo en px |
| 8 | Táctil (R-04) | Cada `<li>` lleva `min-h-tactil` |

### Nota de implementación: el `act(...)` warning

El criterio 7 medía el DOM **sincrónicamente**, mientras la lectura asíncrona
del hook resolvía después de la aserción. Eso disparaba 3 warnings
`An update to OpenAccountsCorkboard inside a test was not wrapped in act(...)`.

**Corrección:** el test ahora espera a que la lectura se asiente antes de medir:

```js
await waitFor(() => {
  expect(screen.getByText('No hay cuentas abiertas.')).toBeTruthy();
});
const raiz = container.firstChild;
```

Resultado: 8/8 en verde, **sin warnings**.

### Nota de implementación: el guard R-01

El comentario original del test contenía el literal de un ancho fijo en píxeles
como ejemplo, y el guard R-01 (que escanea `apps/pos/` buscando anchos fijos) lo
marcó como violación. Se reescribió el comentario sin el literal:

```js
// No debe haber un ancho fijo en píxeles sin un `max-` que lo acote.
```

Resultado: guards 7/7 en verde, 104 archivos escaneados.

---

## 4. Verificación de no-regresión

| Puerta | Comando | Resultado |
|---|---|---|
| Gate F5.3 | `npx vitest run src/components/OpenAccountsCorkboard.f5_3.test.jsx` | ✅ 8/8 |
| Suite completa | `npm run test` | ✅ Node 3/3, Vitest PASA, pytest PASA |
| Guards | `node scripts/guards.mjs` | ✅ 7/7 (104 archivos) |

---

## 5. Trazabilidad

| Artefacto | Referencia |
|---|---|
| Contrato 23 | `pos.cuentas_abiertas` (F5.0) |
| Contrato 21 | `pos.leer_ticket` (usado por `recuperarCuenta`) |
| Interfaz 13 | `superficie/registry.py` — `OpenAccountsCorkboard`, Modal, 3 modos |
| Flujo E.4 | Recuperación de cuenta |
| Reglas | RN-25/RN-26 (versión), RN-31 (draft de su terminal) |
| Prohibiciones | #1 (sin timers), #2 (banner persistente) |
| Reglas de batalla | R-01 (fluido), R-03 (3 modos), R-04 (táctil), Regla 19 (banner) |
| Lección v6.0 | Versión fresca vía contrato 21 antes de retomar |

---

## 6. Qué NO entra en F5.3

- **No** integra el pizarrón en `RetailVisionPOS` (es una superficie Modal
  independiente; su montaje en el flujo del POS es trabajo de integración
  posterior).
- **No** imprime ni exporta el pizarrón.
- **No** pagina la lista (deuda declarada en F5.0: el endpoint devuelve todas
  las cuentas OPEN de la terminal).
- **No** permite cerrar/cancelar una cuenta desde el pizarrón (solo recuperar).

---

## 7. Veredicto

La sub-fase 5.3 está **cerrada**. El pizarrón de cuentas abiertas existe, es
visual, respeta los 3 modos, la paleta canónica, el táctil ≥ 44px y el
contenedor fluido. Consume el hook de F5.2, que a su vez consume el servicio de
F5.1, que a su vez consume el endpoint de F5.0. La cadena vertical de la Fase 5
está completa de punta a punta.

Con esto, las **4 sub-fases de la Fase 5** (5.0, 5.1, 5.2, 5.3) están
construidas y verificadas. Falta únicamente la **ficha de cierre de la Fase 5**.
