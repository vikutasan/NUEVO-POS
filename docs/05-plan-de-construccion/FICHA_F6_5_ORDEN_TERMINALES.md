# FICHA DE CIERRE — FASE 6.5 (Selector de Orden de Terminales)

> **Fase:** 6.5 — Micro-fase de extensión del Gestor de Terminales
> **Plan de abordaje:** `PLAN_DE_ABORDAJE_FASE_6_5_ORDEN_TERMINALES.md` (v1.0, 7,292 bytes)
> **Sub-fases:** F6.5.0, F6.5.1, F6.5.2
> **Estado:** CERRADA — gates en verde, suite completa en verde, guards 7/7
> **Fecha de cierre:** 2026-09-29
> **Opción aprobada:** A (inversión visual; los IDs NO cambian)

---

## 1. Origen y alcance

El dueño detectó una capacidad que faltaba en el Gestor de Terminales: **poder
definir si la numeración de las terminales se despliega de izquierda a derecha o
de derecha a izquierda**, mediante un selector visible.

Se evaluaron dos opciones:

| Opción | Descripción | Riesgo | Veredicto |
|---|---|---|---|
| **A** | Invertir el **orden visual** del despliegue. Los IDs (`T1`…`T6`) **no cambian**. | BAJO | **APROBADA** |
| **B** | **Renumerar** las terminales (T1 pasa a ser T6, etc.). | ALTO | **RECHAZADA** — viola **RN-12** (`rn12_terminal_id_inmutable`) |

**RN-12** es una regla dura: el `terminal_id` es **inmutable** una vez asignado.
Renumerar rompería la trazabilidad de tickets, sesiones de caja y locks ya
existentes. La Opción A respeta la regla porque **solo cambia el orden en que se
pintan las tarjetas**, nunca su identidad.

---

## 2. Diagnóstico del código real (antes de tocar nada)

| Hallazgo | Evidencia | Consecuencia de diseño |
|---|---|---|
| El orden de las terminales **ya ES** el orden del array `terminals` | `useTerminals.js` → `terminals.map(...)` en ambos grids | No hace falta un campo `orden` por terminal; basta con invertir el array al desplegar |
| **No existe** endpoint backend de configuración de terminales | Búsqueda en `*.py` de `terminals` → 0 resultados | La preferencia se persiste en `localStorage` (deuda técnica documentada) |
| El array canónico **nunca debe mutarse** | `addTerminal('end')` añade al final del array canónico | La inversión se hace sobre una **copia** (`[...terminals].reverse()`) |

---

## 3. Diseño implementado (Opción A)

### 3.1 Modelo de estado

```js
const [ordenTerminales, setOrdenTerminales] = useState(leerOrdenGuardado); // 'izq-der' | 'der-izq'

const terminalesDesplegadas = useMemo(
  () => (ordenTerminales === ORDEN_DER_IZQ ? [...terminals].reverse() : terminals),
  [terminals, ordenTerminales]
);

const invertirOrden = useCallback(() => {
  setOrdenTerminales(prev => (prev === ORDEN_IZQ_DER ? ORDEN_DER_IZQ : ORDEN_IZQ_DER));
}, []);
```

**Regla dura respetada:** `terminals` (el array canónico) **jamás se muta**. La
inversión vive en `terminalesDesplegadas`, un valor derivado.

### 3.2 Persistencia

- Clave: `pos.ordenTerminales` en `localStorage`.
- Valores válidos: `'izq-der'` (por defecto) y `'der-izq'`.
- `leerOrdenGuardado()` es **defensiva**: si el valor falta, es inválido o el
  acceso a `localStorage` lanza (modo privado, cuota), devuelve `'izq-der'`.
- Un `useEffect` escribe la preferencia cada vez que cambia.

> **Deuda técnica declarada:** al no existir endpoint backend, la preferencia es
> **por navegador/equipo**, no por terminal ni por usuario. Si en el futuro se
> quiere sincronizar entre equipos, habrá que añadir un endpoint de configuración.

### 3.3 Interfaz

El selector vive **solo en el modo Gestor de Terminales** (no en la pantalla de
selección normal), para no estorbar al cajero. Son dos botones tipo píldora:

- `data-testid="orden-izq-der"` → ➡️ Izquierda a derecha
- `data-testid="orden-der-izq"` → ⬅️ Derecha a izquierda

El botón activo se resalta con el acento canónico (`#ea580c`). Ambos grids
(gestor y selección) usan `terminalesDesplegadas.map(...)`.

---

## 4. Sub-fases ejecutadas

| Sub-fase | Qué construyó | Archivos | Gate | Commit |
|---|---|---|---|---|
| **F6.5.0** | Lógica de orden en el hook: `ordenTerminales`, `terminalesDesplegadas`, `invertirOrden`, `leerOrdenGuardado`, constantes y persistencia | `apps/pos/src/hooks/useTerminals.js` + `useTerminals.f6_5.test.jsx` | **8 tests** | (este commit) |
| **F6.5.1** | Selector visual en el Gestor + aplicación de `terminalesDesplegadas` a ambos grids | `apps/pos/src/components/TerminalSelector.jsx` + `TerminalSelector.f6_5.test.jsx` | **3 tests** | (este commit) |
| **F6.5.2** | Ficha de cierre (este documento) + gate global | `docs/05-plan-de-construccion/FICHA_F6_5_ORDEN_TERMINALES.md` | — | (este commit) |

**Total de tests nuevos:** 8 + 3 = **11 tests**.
**Suite completa del POS al cierre:** **195 tests en 16 archivos, todos en verde.**

---

## 5. Criterios de la puerta (gate)

### 5.1 Gate del hook — `useTerminals.f6_5.test.jsx` (8/8 verde)

| # | Criterio | Qué verifica |
|---|---|---|
| 1 | Orden inicial `'izq-der'` con `localStorage` vacío | El valor por defecto es izquierda→derecha |
| 2 | `terminalesDesplegadas === terminals` con `'izq-der'` | Sin inversión, el despliegue es el canónico |
| 3 | Orden inverso con `'der-izq'` | El despliegue es el reverso del canónico |
| 4 | `invertirOrden()` alterna | Cada llamada conmuta entre los dos valores |
| 5 | **`terminals` NO se muta** | El array canónico queda intacto tras invertir |
| 6 | Persistencia en `localStorage` | La preferencia se escribe con la clave correcta |
| 7 | Valor inválido → `'izq-der'` | `leerOrdenGuardado()` es defensiva |
| 8 | `addTerminal('end')` añade al final **canónico** | La inversión no altera la semántica de inserción |

### 5.2 Gate del componente — `TerminalSelector.f6_5.test.jsx` (3/3 verde)

| # | Criterio | Qué verifica |
|---|---|---|
| 1 | Selector **solo** en modo Gestor | El cajero no ve los botones; el admin sí, tras abrir el gestor |
| 2 | Clic en "Derecha a izquierda" invierte el orden visual | `T1,T2,T3` → `T3,T2,T1` |
| 3 | El **conjunto** de IDs no cambia tras invertir | La inversión es visual, no de identidad |

### 5.3 Gate global

- `npm run test` → **195 tests en verde**.
- `node scripts/guards.mjs` → **7/7 guards en verde**.

---

## 6. Riesgos evaluados y su mitigación

| # | Riesgo | Mitigación implementada |
|---|---|---|
| R-1 | Mutar el array canónico al invertir | Se invierte sobre una **copia** (`[...terminals].reverse()`); el gate #5 lo verifica |
| R-2 | Romper la trazabilidad de IDs | Opción A: los IDs **nunca** cambian; el gate #3 lo verifica |
| R-3 | `localStorage` no disponible (modo privado) | `leerOrdenGuardado()` y el `useEffect` de escritura están envueltos en `try/catch` |
| R-4 | El selector estorba al cajero | El selector vive **solo** en el modo Gestor; el gate #1 lo verifica |
| R-5 | Valor corrupto en `localStorage` | Cualquier valor distinto de `'der-izq'` cae a `'izq-der'`; el gate #7 lo verifica |

---

## 7. No-alcance explícito (lo que esta micro-fase NO hace)

- **NO** renumera terminales (Opción B, rechazada por RN-12).
- **NO** añade endpoint backend de configuración (deuda técnica declarada).
- **NO** cambia la identidad, el lock ni la sesión de ninguna terminal.
- **NO** afecta a la impresión térmica ni a la carta PDF (Fase 6 intacta).
- **NO** introduce dependencias nuevas.

---

## 8. Criterios de aprobación (cumplidos)

- [x] El orden por defecto es izquierda→derecha (comportamiento previo intacto).
- [x] El dueño puede invertir el orden con un clic, desde el Gestor.
- [x] La preferencia sobrevive a un recargado de página (`localStorage`).
- [x] Los IDs de las terminales **no cambian** (RN-12 respetada).
- [x] El array canónico **no se muta**.
- [x] Gate del hook 8/8, gate del componente 3/3, suite completa 195/195, guards 7/7.
- [x] Ficha de cierre escrita y commiteada.

---

## 9. Conclusión

La micro-fase F6.5 añade la capacidad pedida **sin tocar la identidad de las
terminales** y **sin violar ninguna regla dura**. Se ejecutó "de adentro hacia
afuera": primero la lógica pura del hook (con su gate de 8 criterios), luego la
interfaz (con su gate de 3 criterios), y finalmente el cierre documental. El
principio rector se mantiene: **la inversión es visual; la identidad es inmutable.**
