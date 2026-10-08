# FICHA — FIX: el post-it no aparecía en el pizarrón al enviar una cuenta

> **Tipo:** Corrección (bug de UX / estado obsoleto)
> **Componente:** POS — Pizarrón de cuentas abiertas (F5.3) + acción "ENVIAR CUENTA" (F12.9)
> **Estado:** ✅ Cerrada
> **Fecha:** 8 de octubre de 2026
> **Commit:** `31a1435`
> **Plan rector:** Fase 5 (cuentas abiertas) · Fase 12 (endurecimiento del POS)

---

## 1. Síntoma

El operador hizo un **pedido tentativo** (agregó productos al carrito) y pulsó
**ENVIAR CUENTA**. El botón ya respondía (el fix previo `e20ffbc` había
desbloqueado el envío), el banner de éxito aparecía ("Cuenta enviada al
pizarrón")… **pero el post-it NUEVO no aparecía en el pizarrón**.

El caso crítico: **el pizarrón ya estaba abierto** cuando se envió la cuenta.
La cuenta SÍ existía en el servidor, pero la lista visible del pizarrón no la
mostraba.

---

## 2. Diagnóstico

### 2.1 El backend estaba correcto

Se verificó directamente en PostgreSQL (contenedor `nuevo_pos_db`, usuario
`pos`):

```sql
SELECT account_num, status, terminal_id, total, version, order_type, created_at
FROM tickets ORDER BY created_at DESC LIMIT 10;
```

```
 account_num | status | terminal_id | total | version |  order_type   |          created_at
-------------+--------+-------------+-------+---------+---------------+-------------------------------
 V0002       | OPEN   | TERM-01     | 33.50 |       4 | VENTA_DIRECTA | 2026-10-08 03:20:22.212918+00
 V0001       | PAID   | TERM-01     | 33.50 |       5 | VENTA_DIRECTA | 2026-10-08 03:01:27.215653+00
```

La cuenta `V0002` estaba **`OPEN`** en **`TERM-01`** — exactamente lo que el
pizarrón debe listar. También se confirmó por HTTP:

```
GET http://localhost:5101/pos/open-accounts            → devuelve V0002
GET http://localhost:5101/pos/open-accounts?terminal_id=TERM-01 → devuelve V0002
```

**Conclusión:** el dato viaja bien; el problema es **de refresco en el
frontend**.

### 2.2 La cadena del estado obsoleto

1. **`enviarCuentaAlPizarron`** ([`RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx))
   terminaba con un **incremento LOCAL** del contador del badge:

   ```jsx
   setCuentasAbiertas((n) => n + 1);   // ← solo el badge, NO la lista
   ```

   No volvía a consultar al servidor ni avisaba al pizarrón.

2. **`useOpenAccounts`** ([`useOpenAccounts.js`](../../apps/pos/src/hooks/useOpenAccounts.js))
   descarga la lista **SOLO al montarse**:

   ```jsx
   useEffect(() => {
     refrescar();
   }, [terminalId, todasLasTerminales, refrescar]);
   ```

   **No hay polling.** Si el pizarrón ya estaba montado (abierto), su lista
   nunca se volvía a pedir.

3. **`OpenAccountsCorkboard`** ([`OpenAccountsCorkboard.jsx`](../../apps/pos/src/components/OpenAccountsCorkboard.jsx))
   renderiza los post-its desde `cuentas` (lo que devolvió el hook). Sin
   re-fetch, `cuentas` seguía siendo la lista vieja.

**Resultado:** el post-it nuevo existía en el servidor pero no en la pantalla.
El usuario tenía que **cerrar y reabrir** el pizarrón para verlo (al reabrir, el
componente se remonta y vuelve a descargar).

---

## 3. Corrección aplicada

Se introdujo una **señal de refresco** (`refrescarSenal`) que el padre
incrementa al enviar la cuenta y que el pizarrón usa como dependencia para
volver a descargar la lista — **sin cerrar ni reabrir**.

### 3.1 `RetailVisionPOS.jsx`

- Nuevo estado:

  ```jsx
  const [refrescarSenal, setRefrescarSenal] = useState(0);
  ```

- `enviarCuentaAlPizarron` ahora **relee el conteo real** y **dispara la señal**:

  ```jsx
  await refrescarConteoCuentas();      // conteo REAL desde el servidor
  setRefrescarSenal((n) => n + 1);     // avisa al pizarrón abierto
  setBanner({ tipo: 'ok', mensaje: 'Cuenta enviada al pizarrón' });
  ```

  (se eliminó el `setCuentasAbiertas((n) => n + 1)` local, que además podía
  desincronizar el badge).

- Se pasa la señal al pizarrón:

  ```jsx
  <OpenAccountsCorkboard
    terminalId={terminalEfectiva}
    cajaHabilitada={Boolean(turnoCaja)}
    refrescarSenal={refrescarSenal}
    onRecuperar={recuperarCuentaAlCarrito}
    onCerrar={...}
  />
  ```

### 3.2 `OpenAccountsCorkboard.jsx`

- Nueva prop `refrescarSenal = 0`, reenviada al hook:

  ```jsx
  const { cuentas, cargando, error, refrescar, recuperarCuenta } = useOpenAccounts({
    terminalId,
    todasLasTerminales: cajaHabilitada,
    servicioCuentas,
    clienteApi,
    refrescarSenal,
  });
  ```

### 3.3 `useOpenAccounts.js`

- Nueva opción `refrescarSenal = 0` y dependencia en el `useEffect` de carga:

  ```jsx
  useEffect(() => {
    refrescar();
  }, [terminalId, todasLasTerminales, refrescar, refrescarSenal]);
  ```

### Archivos tocados

| Archivo | Cambio |
|---|---|
| [`apps/pos/src/RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx) | Estado `refrescarSenal`; `enviarCuentaAlPizarron` refresca conteo real + dispara señal; prop al pizarrón |
| [`apps/pos/src/components/OpenAccountsCorkboard.jsx`](../../apps/pos/src/components/OpenAccountsCorkboard.jsx) | Prop `refrescarSenal` reenviada al hook |
| [`apps/pos/src/hooks/useOpenAccounts.js`](../../apps/pos/src/hooks/useOpenAccounts.js) | Opción `refrescarSenal` como dependencia del `useEffect` |

---

## 4. Decisión de diseño

- **No se añadió polling.** El pizarrón no necesita sondear el servidor cada N
  segundos: basta con refrescar **cuando ocurre el evento que cambia la lista**
  (enviar una cuenta). Esto evita tráfico innecesario y respeta el patrón
  "evento → refresco" del resto del POS.
- **Se mantiene la fuente de verdad en el servidor.** El conteo del badge ya no
  se "adivina" con `n + 1`; se relee con `refrescarConteoCuentas()` (contrato
  23). El pizarrón sigue siendo la fuente de verdad de la lista.
- **La señal es un contador, no un booleano.** Un contador garantiza que cada
  envío produzca un valor nuevo (un booleano `true` repetido no dispararía el
  `useEffect`).

---

## 5. Verificación (REGLA DURA 2)

- **Suite frontend:** `npm run test -- --run` → **67 archivos, 772/772 pruebas
  en verde**.
- **Guardianes:** `node scripts/guards.mjs` → **8/8 en verde** (215 archivos
  escaneados).
- **Backend:** confirmado por `psql` (`V0002 OPEN` en `TERM-01`) y por `curl`
  (`GET /pos/open-accounts` devuelve la cuenta).

---

## 6. Lección

Un contador de UI que se incrementa **localmente** (`n + 1`) es una **mentira
optimista**: refleja lo que *creemos* que pasó, no lo que el servidor tiene. Si
además la lista que el usuario ve se descarga **solo al montar**, cualquier
cambio posterior queda invisible hasta un remontaje. La regla que se refuerza:
**cuando una acción cambia el conjunto de datos de una vista ya montada, hay que
disparar explícitamente su re-fetch** — no basta con tocar un contador de
adorno.

---

## 7. Trazabilidad

- Fix previo relacionado: [`FICHA_FIX_PIZARRON_SIN_RED_HEALTH_RELATIVO.md`](./FICHA_FIX_PIZARRON_SIN_RED_HEALTH_RELATIVO.md)
  (commit `e20ffbc`) — desbloqueó el botón ENVIAR CUENTA.
- Este fix: commit `31a1435`.
- Contratos involucrados: **#21** (leer ticket fresco), **#23** (listar cuentas
  abiertas).
- Reglas: **RN-31** (la cuenta enviada queda OPEN en el pizarrón), **DT-02**
  (dinero como string, no se suma en el frontend).

---

## 8. Cierre

El pizarrón ahora refleja **inmediatamente** una cuenta recién enviada, incluso
si ya estaba abierto. El badge del header muestra el **conteo real** del
servidor. Sin polling, sin cierres/reaperturas manuales.
