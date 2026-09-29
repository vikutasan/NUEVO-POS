# FICHA DE EVIDENCIA — FASE 4.3 (Pantalla de caja)

> **Sub-fase:** 4.3 — Pantalla (`GestorDeCaja.jsx`)
> **Plan de referencia:** [`PLAN_DE_ABORDAJE_FASE_4_POR_PARTES.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_4_POR_PARTES.md) §7
> **Fecha:** 2026-09-29
> **Resultado:** ✅ PUERTA EN VERDE

---

## 1. Qué se construyó

| Archivo | Qué resuelve |
|---|---|
| [`apps/pos/src/GestorDeCaja.jsx`](../../apps/pos/src/GestorDeCaja.jsx:1) | Pantalla completa de caja: abrir turno, movimientos, resumen, arqueo y cierre |
| [`apps/pos/src/GestorDeCaja.f4_3.test.jsx`](../../apps/pos/src/GestorDeCaja.f4_3.test.jsx:1) | Test de componente (9 escenarios) |

La pantalla cubre el flujo **E.5 (corte de caja)** del registro de la superficie
(interfaz 9) con **tres estados mutuamente excluyentes**:

1. **SIN TURNO** → formulario de apertura (fondo inicial).
2. **ABIERTO** → resumen en vivo (esperado vs contado), lista de movimientos,
   alta de movimiento (entrada/salida) y botón de cierre.
3. **CIERRE** → captura de conteos físicos (efectivo, crédito, débito) y
   muestra la **diferencia** (descuadre) al confirmar.

---

## 2. Decisiones de diseño

### 2.1 Inyección de dependencias (no `vi.mock`)

El componente acepta la prop `servicio` (por defecto `cashService`). El test le
pasa un doble controlado y verifica **qué método se llamó y con qué argumentos**.
Es el mismo patrón de la casa que [`useCart({ api })`](../../apps/pos/src/hooks/useCart.js:43):
la dependencia se sustituye, no se parchea el módulo. Ventaja: el test no conoce
la forma del `fetch`, solo el contrato del servicio.

### 2.2 Contrato `{outcome, reason}` sin `try/catch`

La pantalla **nunca** usa `try/catch`. Decide con `esOk(resultado)` y muestra
`resultado.reason` en el banner rojo. Esto respeta la cicatriz v7.0.3 (cuentas
perdidas por promesas rechazadas sin capturar).

### 2.3 Banner de error PERSISTENTE

El banner usa `role="alert"` y **no se auto-oculta** (prohibición #2 / Regla 19).
El test lo comprueba: tras un fallo, el banner sigue visible 20 ms después.

### 2.4 Sin timers ni auto-guardado

No hay `setInterval` ni guardado automático (prohibición #1). El único `useEffect`
de montaje consulta el turno activo **una sola vez** y usa una bandera `vigente`
para no escribir estado tras el desmontaje.

### 2.5 Responsividad (R-01)

Contenedor raíz fluido `w-full max-w-[1100px] mx-auto`:
- **MOSTRADOR**: 2 columnas (`lg:grid-cols-2`).
- **COMPACTO / MÓVIL**: 1 columna.
- Controles táctiles con `min-h-tactil` (R-04).

---

## 3. Reglas de negocio aplicadas

| Regla | Dónde | Cómo |
|---|---|---|
| **RN-49** | `abrirTurno` | Un solo turno OPEN por terminal (el 409 se traduce a `ya_hay_turno_abierto`) |
| **RN-50** | `abrirTurno` | El fondo inicial viaja como `monto_inicial` |
| **RN-51** | `registrarMovimiento` | Entrada o salida con monto y motivo |
| **RN-53** | `obtenerResumen` | El "esperado en caja" viene del backend, no se recalcula en el cliente |
| **RN-54** | `cerrarTurno` | El cierre registra los 3 conteos físicos |
| **RN-55** | `cerrarTurno` | Un turno cerrado es inmutable (el backend lo garantiza) |

**Principio respetado:** el cliente **no** calcula el esperado ni la diferencia
contable; los muestra tal como los devuelve el backend. El descuadre "en vivo"
de la pantalla es solo una previsualización del conteo capturado menos el
esperado del servidor.

---

## 4. Puerta 4.3 — Evidencia

```text
Comando : npx vitest run src/GestorDeCaja.f4_3.test.jsx   (cwd: apps/pos)
Resultado: 9 passed (9)
```

```text
Comando : npm run test   (cwd: NUEVO-POS)
Resultado:
  Tests de Node      : 3/3 archivo(s) en verde
  Tests de componentes: PASA
  Tests de API       : PASA
  ✅ RESULTADO: TODOS LOS TESTS EN VERDE.
```

```text
Comando : node scripts/guards.mjs   (cwd: NUEVO-POS)
Resultado: 7/7 en verde — 95 archivos escaneados
  [OK] E-05, A-04, E-15 (logs), E-15 (TODOs), R-01, E-09, E-10
```

---

## 5. Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | Los 3 estados se renderizan (sin turno / abierto / cierre) | ✅ |
| 2 | Abrir turno llama al servicio con terminal, usuario y fondo | ✅ |
| 3 | Registrar movimiento llama al servicio con el turno y el tipo elegido | ✅ |
| 4 | Cerrar turno captura los 3 conteos y muestra la diferencia final | ✅ |
| 5 | El banner de error es persistente (`role="alert"`, no se auto-oculta) | ✅ |
| 6 | Un fallo de conexión al consultar el turno muestra el banner | ✅ |
| 7 | `onCerrar` se invoca desde "Volver al POS" | ✅ |
| 8 | Contenedor raíz fluido (R-01) y controles táctiles (R-04) | ✅ |
| 9 | Sin `try/catch`, sin timers, sin auto-guardado | ✅ |

---

## 6. Hallazgos

### 6.1 `@testing-library/user-event` no está instalado

El primer intento del test importaba `@testing-library/user-event`, que **no**
está en `devDependencies`. Se reescribió con `fireEvent` de
`@testing-library/react`, que sí está y es el estilo de
[`components.f3_4.test.jsx`](../../apps/pos/src/components/components.f3_4.test.jsx:24).
**No se añadió ninguna dependencia.**

### 6.2 El formateo de moneda rompe aserciones ingenuas

El componente formatea con `toLocaleString('es-MX', { style: 'currency' })`, así
que `-10` se ve como `-$10.00`. La aserción inicial `toContain('-10')` falló; se
corrigió a comprobar `'10.00'` y el signo `'-'`. **El componente era correcto; la
aserción estaba mal.**

### 6.3 El nombre del test sigue la convención de la casa

El plan §7.3.1 nombra `GestorDeCaja.test.jsx`, pero la convención establecida en
esta fase es el sufijo de sub-fase (`cashService.f4_2.test.jsx`,
`RetailVisionPOS.f3_cierre.test.jsx`). Se usó `GestorDeCaja.f4_3.test.jsx`. El
patrón `include: ['src/**/*.test.{jsx,tsx}']` de Vitest lo recoge igual.

---

## 7. Deuda registrada

| ID | Deuda | Cuándo se paga |
|---|---|---|
| **D-17** | Las operaciones de caja no usan `withRetries` (mutaciones con efecto contable; reintentar a ciegas un cierre podría duplicar conteos) | Se decide con el dueño antes de Fase 6 |
| **D-18** | La pantalla no está montada en `RetailVisionPOS` (el botón CAJA que la abre es de Fase 5, pizarrón de cuentas) | Fase 5 |
| **D-19** | El reporte diario (contrato 14) no tiene pantalla; su consumidor es "POS / Estadísticas" | Otra rebanada |

---

## 8. Archivos tocados

```
apps/pos/src/GestorDeCaja.jsx            (nuevo, 467 líneas)
apps/pos/src/GestorDeCaja.f4_3.test.jsx  (nuevo, 9 tests)
docs/05-plan-de-construccion/FICHA_F4_3_GESTOR_CAJA.md (este archivo)
```

---

## 9. Siguiente sub-fase

**F4.4 — Plantilla de corte (`CorteTicketTemplate.jsx`)**: solo renderiza el
corte (no imprime). La impresión física real es Fase 6. Sigue el patrón de
[`SalesReceipt.jsx`](../../apps/pos/src/components/SalesReceipt.jsx:34).
