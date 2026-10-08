# FICHA — FIX: el pizarrón no se auto-refrescaba (post-it ausente)

> **Tipo:** Corrección (bug de UX / estado obsoleto en pantalla separada)
> **Componente:** POS — Pizarrón de cuentas abiertas (F5.3) · hook `useOpenAccounts` (F5.2)
> **Estado:** ✅ Cerrada
> **Fecha:** 8 de octubre de 2026
> **Commit:** `b435fd1`
> **Plan rector:** Fase 5 (cuentas abiertas) · Fase 12 (endurecimiento del POS)

---

## 1. Síntoma

Tras el fix `31a1435` (que refrescaba el pizarrón al enviar una cuenta), el
operador reportó: **"aun no se soluciona"**.

El flujo exacto reportado:

> "Envío la cuenta y **LUEGO** abro el pizarrón con el botón 'Pizarrón' del
> header — y sale vacío."

Es decir: la cuenta SÍ se creaba en el servidor, pero al abrir el pizarrón la
lista aparecía **vacía**.

---

## 2. Diagnóstico

### 2.1 El backend seguía correcto

Se verificó en PostgreSQL (contenedor `nuevo_pos_db`, usuario `pos`):

```sql
SELECT account_num, status, terminal_id, total, version, order_type, order_status, created_at
FROM tickets ORDER BY created_at DESC LIMIT 8;
```

```
 account_num | status | terminal_id | total  | version |  order_type   |         order_status          |          created_at
-------------+--------+-------------+--------+---------+---------------+-------------------------------+-------------------------------
 V0003       | OPEN   | TERM-01     | 145.00 |      16 | VENTA_DIRECTA | PROGRAMADO PARA SER PREPARADO | 2026-10-08 04:14:11.548237+00
 V0002       | PAID   | TERM-01     |  33.50 |       5 | VENTA_DIRECTA | PROGRAMADO PARA SER PREPARADO | 2026-10-08 03:20:22.212918+00
 V0001       | PAID   | TERM-01     |  33.50 |       5 | VENTA_DIRECTA | PROGRAMADO PARA SER PREPARADO | 2026-10-08 03:01:27.215653+00
```

La cuenta `V0003` estaba **`OPEN`** en **`TERM-01`** con 6 ítems y total 145.00.
También se confirmó por HTTP:

```
GET http://localhost:5101/pos/open-accounts                     → devuelve V0003
GET http://localhost:5101/pos/open-accounts?terminal_id=TERM-01 → devuelve V0003
```

**Conclusión:** el dato viaja bien; el problema es **de refresco en el
frontend**.

### 2.2 La cadena del frontend también estaba correcta

Se auditó la cadena completa `servicio → hook → componente`:

- **`openAccountsService.listarCuentasAbiertas`** devuelve
  `{ outcome:'ok', reason:null, data:{ cuentas:[…] } }`.
- **`useOpenAccounts`** discrimina con `esOk(r)` y hace
  `setCuentas(r.data?.cuentas ?? [])`.
- **`OpenAccountsCorkboard`** pinta un post-it por cada elemento de `cuentas`.

Todo correcto. El `useEffect` de carga dependía de
`[terminalId, todasLasTerminales, refrescar, refrescarSenal]` — es decir, el
pizarrón **solo descargaba la lista al montarse** (y con la señal externa del
fix `31a1435`).

### 2.3 La causa raíz: un corcho que no se refresca solo

El pizarrón es, por diseño, un **tablero de control**. En el flujo real puede
ser:

1. La **misma pantalla** (se abre el overlay tras enviar), o
2. Una **pantalla separada** (otro monitor/ventana que debe reflejar el estado
   del servidor por sí sola).

En ambos casos, un corcho que **solo** descarga al montarse es frágil:

- Si la señal externa (`refrescarSenal`) se pierde por un re-render, el post-it
  no aparece hasta cerrar y reabrir.
- Si el pizarrón vive en otra pantalla, **nunca** recibe la señal del padre y
  jamás se actualiza.

El fix `31a1435` resolvía el caso "pizarrón abierto en la misma pantalla", pero
no el caso "pantalla separada" ni el caso "señal perdida".

---

## 3. Corrección

Se agregó un **auto-refresco por sondeo** en `useOpenAccounts`
([`useOpenAccounts.js`](../../apps/pos/src/hooks/useOpenAccounts.js)): mientras
el corcho está montado, vuelve a descargar la lista cada **5 segundos**.

```jsx
/**
 * FIX_PIZARRON_POLLING (8 Oct 2026) — Cadencia del auto-refresco del pizarrón.
 * El corcho vuelve a descargar la lista cada 5 s mientras está montado, de modo
 * que un post-it nuevo aparece solo (misma pantalla o pantalla separada) sin
 * depender de que la señal externa llegue. Es una lectura ligera (contrato 23).
 */
export const INTERVALO_POLLING_MS = 5000;
```

```jsx
// FIX_PIZARRON_POLLING (8 Oct 2026) — Auto-refresco del pizarrón.
useEffect(() => {
  const temporizador = setInterval(() => {
    refrescar();
  }, INTERVALO_POLLING_MS);
  return () => clearInterval(temporizador);
}, [refrescar]);
```

### Por qué es seguro

- **Lectura ligera:** el contrato 23 devuelve una proyección escalar (nada de
  `SELECT *`), así que sondear cada 5 s no castiga al servidor.
- **Se detiene solo:** el `clearInterval` del cleanup detiene el sondeo al
  desmontar el pizarrón (al cerrarlo).
- **No pisa la carga inicial:** el primer `refrescar()` ya corrió en el efecto
  de montaje; el intervalo solo repite.
- **`refrescar` es estable:** está envuelto en `useCallback` con deps `[]` y lee
  de refs (Prohibición #3), así que el efecto no se re-suscribe en cada render.

---

## 4. Verificación

- **Suite completa:** `npm run test -- --run` → **67 archivos, 772 tests
  pasando** (0 fallos).
- **Guardianes:** `node scripts/guards.mjs` → **8/8 en verde** (215 archivos
  escaneados).
- **Backend:** `curl` a `/pos/open-accounts` (con y sin `terminal_id`) devuelve
  la cuenta `OPEN` correctamente.

---

## 5. Lección

> **Un tablero de control debe reflejar el estado del servidor por sí solo.**

Un pizarrón que depende de que "alguien le avise" (una señal del padre) es
frágil: falla en cuanto vive en otra pantalla o en cuanto la señal se pierde.
El sondeo periódico convierte el corcho en una **vista auto-sanadora**: tarde o
temprano (≤ 5 s) muestra la verdad del servidor, sin importar quién la cambió ni
desde dónde.

Esta es la **2ª corrección** del mismo síntoma ("el post-it no aparece"):

| Fix | Commit | Alcance |
|-----|--------|---------|
| Refresco al enviar (señal externa) | `31a1435` | Pizarrón abierto en la MISMA pantalla |
| **Auto-refresco por sondeo** | **`b435fd1`** | **Cualquier pantalla + señal perdida** |

---

## 6. Archivos tocados

| Archivo | Cambio |
|---------|--------|
| [`apps/pos/src/hooks/useOpenAccounts.js`](../../apps/pos/src/hooks/useOpenAccounts.js) | Constante `INTERVALO_POLLING_MS` + `useEffect` con `setInterval` |
