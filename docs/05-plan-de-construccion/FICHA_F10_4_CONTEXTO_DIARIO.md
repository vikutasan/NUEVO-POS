# 📝 FICHA F10.4 — CONTEXTO DIARIO POST-CORTE (brecha B-02)

**Fase:** 10.4 (Contexto diario post-corte)
**Fecha:** 30 Sep 2026
**Estado:** ✅ CERRADA
**Origen:** Hallazgo del dueño al **poner a prueba la auditoría F10** —
*"en el viejo pos se había establecido que al momento de sacar el corte de caja apareciera
un modal que preguntara cómo había estado el día, si lluvioso, si caluroso, etc. y dejaba
poner alguna nota. Esto alimentaba al módulo de estadísticas para toma de decisiones de
producción."*

---

## 1. POR QUÉ EXISTIÓ ESTA SUB-FASE

La auditoría F10 (F10.0–F10.3) revisó los **COMPONENTES** del viejo POS, pero **no las
INTEGRACIONES POS→ERP**. El "Contexto diario" no es un componente del POS: es una
**escritura del POS hacia la tabla de otro módulo** (Estadísticas).

Es la **CUARTA instancia** de la misma clase de falla:

| # | Instancia | Fase | Naturaleza |
|---|-----------|------|------------|
| 1 | `GestorDeCaja` huérfano | F4.5 | Componente sin punto de entrada |
| 2 | `payment_details` no expuesto | F9.1.4a | Dato persistido pero no expuesto |
| 3 | "Copiar URL" ausente | F10 / B-01 | Botón sin lógica ni UI |
| 4 | **"Contexto diario" ausente** | **F10.4 / B-02** | **Integración POS→ERP no portada** |

**La lección nueva (§10.6.3):** *"el inventario de componentes no ve las integraciones."*

---

## 2. EL HECHO ARQUITECTÓNICO DECISIVO

> **El módulo Estadísticas YA EXISTE.** No hay que inventarlo.

El Plan Maestro §8.1 asumía que los módulos del ERP "aún no existen". El dueño corrigió
(30 Sep 2026): **existen y funcionan, pero con arquitectura parchada** (ver **§8.2**).
El trabajo del dueño es **rehacer cada módulo e integrarlos uno a uno**.

**Consecuencia:** el POS nuevo **se acopla por contrato** al endpoint que Estadísticas
**ya expone** (`PUT /analytics/context`). No se inventa nada.

**La frontera A-02 se respeta así:**
- El POS **NO crea** la tabla `daily_contexts` (pertenece a Estadísticas).
- El POS **escribe vía el contrato** que Estadísticas expone.
- El POS es **cliente** de ese contrato; Estadísticas es **dueño** de la tabla.

---

## 3. ALCANCE (decisión del dueño — Opción 4b)

**F10.4 cierra SOLO la brecha del POS.** Incluye:

1. El **modal post-corte** (`DailyContextModal`) — la UX heredada del viejo POS.
2. El **servicio** que llama al contrato existente de Estadísticas (`PUT /analytics/context`).
3. La **integración** en `GestorDeCaja.jsx` (se abre al cerrar el turno).
4. El **contrato declarado** en el registro del nuevo POS (POS → Estadísticas).
5. **Test + CI verde + ficha.**

**F10.4 NO incluye** (queda para **F11**):
- Profesionalizar/acoplar el módulo Estadísticas al nuevo ERP.
- Mover `apps/analytics/` y `apps/api/modules/analytics/` al NUEVO-POS.
- Cualquier cambio en la tabla `daily_contexts`.

---

## 4. LO QUE SE CONSTRUYÓ (evidencia)

### 4.1 El contrato `pos.contexto_diario` (F10.4.1)

**Archivo:** [`../NUEVO-POS/apps/api/contracts/registry.py`](../NUEVO-POS/apps/api/contracts/registry.py)

```python
Contrato(
    numero=28,
    nombre="pos.contexto_diario",
    consumidor="Estadísticas",
    proveedor="POS",
    operacion="PUT /analytics/context?target_date={fecha}",
    entrada={
        "target_date": "Date (hora local)",
        "is_atypical": "Boolean",
        "weather_condition": "String NULL",
        "notes": "String NULL",
    },
    salida={"contexto": "DailyContextRead"},
    garantias=(
        "El POS ESCRIBE el contexto del día; Estadísticas es dueño de la tabla.",
        "Usa la fecha LOCAL (America/Mexico_City), no UTC.",
        "Si el endpoint no responde, el POS NO bloquea al cajero (degradación elegante).",
    ),
    errores=("400 si el formato de fecha es inválido.",),
    estado_hoy="Deuda",  # el endpoint vive en el ERP viejo; se acopla en F11
),
```

**Test del registro:** [`../NUEVO-POS/apps/api/tests/test_f2_frontera.py`](../NUEVO-POS/apps/api/tests/test_f2_frontera.py)
— `test_criterio2_hay_exactamente_28_contratos` (actualizado de 27 → 28). **9/9 verde.**

### 4.2 El servicio (`dailyContextService.js`) (F10.4.2)

**Archivo:** [`../NUEVO-POS/apps/pos/src/services/dailyContextService.js`](../NUEVO-POS/apps/pos/src/services/dailyContextService.js)

- `CLIMAS` — los 6 climas heredados: `SOLEADO ☀️`, `NUBLADO 🌤️`, `LLUVIA 🌧️`,
  `TORMENTA ⛈️`, `MUCHO_CALOR 🥵`, `FRIO ❄️`.
- `fechaLocalDeNegocio(ahora)` — fecha LOCAL con
  `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' })` (no UTC).
- `normalizarContexto(borrador, fecha)` — arma el payload canónico.
- `enviarContextoDiario(borrador, fecha)` → `{outcome, reason, data}`. **Nunca lanza.**
- **Degradación elegante:** si falla, devuelve `{outcome: 'error', reason: ...}` y el
  modal se cierra igual (no bloquea al cajero — misma regla que el viejo POS).

### 4.3 El modal (`DailyContextModal.jsx`) (F10.4.2)

**Archivo:** [`../NUEVO-POS/apps/pos/src/components/DailyContextModal.jsx`](../NUEVO-POS/apps/pos/src/components/DailyContextModal.jsx)

- Props: `{ fecha, servicio = contexto, onCerrar }`.
- UI heredada del viejo POS:
  - Título "📝 ¿Cómo estuvo el día?".
  - 6 botones de clima con emoji.
  - Toggle "⚠️ Día atípico".
  - Campo de notas (texto libre).
  - Botones "✓ Guardar" y "Omitir →".
- **Contrato de cierre:** `onCerrar(registrado?: boolean)` — el padre usa el flag para
  mostrar la confirmación. Se implementó con un helper `cerrar(registrado = false)`.
- **No bloqueante:** "Omitir" cierra sin guardar.

### 4.4 La integración en `GestorDeCaja.jsx` (F10.4.3)

**Archivo:** [`../NUEVO-POS/apps/pos/src/GestorDeCaja.jsx`](../NUEVO-POS/apps/pos/src/GestorDeCaja.jsx)

- Nuevo prop `servicioContexto = contexto` (inyectable para test).
- Nuevos estados: `mostrarContexto`, `contextoRegistrado`.
- En `alCerrarTurno`, tras `setDiferencia(r.data)`: `setMostrarContexto(true)`.
- Callback `alCerrarContexto(registrado = false)`.
- En el bloque `diferencia`: si `contextoRegistrado` → "✅ Contexto del día registrado"
  (`data-testid="contexto-registrado"`); si no → botón "Registrar contexto del día"
  (permite reabrirlo).
- Render del modal al final: `{mostrarContexto ? <DailyContextModal ... /> : null}`.

**Test de integración:** [`../NUEVO-POS/apps/pos/src/GestorDeCaja.f10_4.test.jsx`](../NUEVO-POS/apps/pos/src/GestorDeCaja.f10_4.test.jsx)
— **7/7 verde.**

| # | Test | Qué verifica |
|---|------|--------------|
| 1 | El modal NO aparece antes de cerrar | No se abre solo |
| 2 | El modal se abre tras cerrar con éxito | La integración existe |
| 3 | El modal NO se abre si el cierre falla | No se abre en error |
| 4 | "Omitir" cierra sin confirmación | No bloquea |
| 5 | "Guardar" muestra la confirmación | El flag `registrado` viaja |
| 6 | Si el envío falla, el corte queda cerrado | Degradación elegante |
| 7 | "Registrar contexto del día" reabre el modal | Reintento disponible |

---

## 5. COMPUERTA COMPLETA

`npm run ci` desde `../NUEVO-POS`:

```
Lint OK: 263 archivo(s), 0 errores.
Tests de Node      : 3/3 archivo(s) en verde
Tests de componentes: PASA (incluye GestorDeCaja.f10_4.test.jsx 7/7)
Tests de API       : PASA (incluye test_f2_frontera.py 9/9)
✅ RESULTADO: TODOS LOS TESTS EN VERDE.
Las 7 compuertas de CI: OK
```

---

## 6. LECCIÓN CODIFICADA (§10.6.3)

> *"el componente existe y pasa su test" ≠ "el usuario puede llegar a él"* (F4.5)
> *"el componente existe y pasa su test" ≠ "el conjunto está completo"* (F10)
>
> **F10.4 la extiende:**
> *"el inventario de componentes no ve las integraciones."*

Un POS puede tener **todos sus componentes** y aun así faltarle un **puente entre
módulos**. La auditoría de paridad debe inventariar no solo los componentes, sino
también **los flujos de datos entre módulos** (escrituras del POS hacia el ERP).

---

## 7. DEUDA TRAZABLE (lo que esta sub-fase deja explícito)

- **Deuda de acople:** el endpoint `PUT /analytics/context` vive en el ERP viejo. El POS
  nuevo lo declara por contrato (`estado_hoy="Deuda"`); **F11** lo acopla cuando se
  profesionalice Estadísticas.
- **Deuda de módulo:** "profesionalizar y acoplar Estadísticas al nuevo ERP" es **F11**,
  con su propio plan, su auditoría de paridad y su ficha.

> **Regla que se respeta:** *"El ERP viejo es el ORÁCULO, no el MODELO."* Se hereda el
> **comportamiento** (el modal, el contrato), no la **arquitectura parchada**.

---

## 8. TRAZABILIDAD

| Documento | Relación |
|-----------|----------|
| `PLAN_DE_ABORDAJE_F10_4_CONTEXTO_DIARIO.md` | El plan de esta sub-fase |
| `PLAN_DE_ABORDAJE_F10_5_PARIDAD_DE_DATOS_DE_CAJA.md` | La sub-fase hermana (brechas #1 y #2) |
| `FICHA_F10_PARIDAD.md` | B-02 pasa de OMITIDA a PORTADA (con deuda de acople) |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §6.8 | UX heredada — la integración se hereda |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §8.2 | El ERP viejo existe pero es parchado |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §10.6.3 | La lección — el inventario no ve las integraciones |
| Viejo POS: `apps/pos/components/GestorDeCaja.jsx` | El oráculo (modal + `handleSaveDailyContext`) |
| Viejo ERP: `apps/api/modules/analytics/router.py` | El endpoint `PUT /analytics/context` |

### 8.1 Commits

| Repo | Commit | Contenido |
|------|--------|-----------|
| `NUEVO-POS` | `a202f56` | Contrato 28 + servicio + modal + integración + test 7/7 + esta ficha |
| `PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS` | `8ecea3b` | `PLAN_DE_ABORDAJE_F10_4_CONTEXTO_DIARIO.md` + `PLAN_DE_ABORDAJE_F10_5_PARIDAD_DE_DATOS_DE_CAJA.md` + Plan Maestro §10.6.3 |
