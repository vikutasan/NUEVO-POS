# FICHA F8.0 — Prerrequisito de la Fase 8: contratos 26/27 + reglas RN-82..RN-93

> **Fase:** 8 (CRM y Notificaciones — lado POS) — Sub-fase **8.0**
> **Estado:** ✅ CERRADA — puerta en verde
> **Fecha:** 2026-09-30
> **Commit:** `e594de0` — F8.0: contratos 26/27 (CRM + Notificaciones) y reglas RN-82..RN-93 (C.16)
> **Plan de abordaje:** [`PLAN_DE_ABORDAJE_FASE_8_POR_PARTES.md`](../../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_ABORDAJE_FASE_8_POR_PARTES.md) §3 (F8.0)
> **Regla que gobierna esta sub-fase:** REGLA DURA 2 — "Verificar, no asumir"

---

## 1. Por qué existe esta sub-fase

El Plan Maestro §7 (Fase 8) promete la **integración del POS con el CRM y con
Notificaciones**: identificar al cliente al cobrar, mostrar/aplicar sus
beneficios (puntos, promociones) y encolar el envío del ticket por WhatsApp o
Email.

La **autocrítica del plan de Fase 8 (defectos D-3 y D-5)** detectó, con
evidencia, que la frontera **NO existía**:

- `contracts/registry.py` declaraba **25 contratos** (1–25). Ninguno exponía los
  beneficios de un cliente ni el encolado de un ticket.
- `rules/registry.py` declaraba **81 reglas** (RN-01 a RN-81). Ninguna cubría el
  comportamiento del CRM ni de Notificaciones.
- El frontend, por lo tanto, **no tenía forma legítima** de preguntar "¿qué
  beneficios tiene este cliente?" ni de encolar un envío sin leer tablas ajenas
  — lo que **viola A-02** (frontera por contratos: prohibido leer tablas ajenas).

Sin este prerrequisito, las sub-fases 8.1–8.7 (servicio, hook, componentes,
cableado) no tendrían a qué llamar. **F8.0 construye la frontera primero**
(principio "de adentro hacia afuera").

---

## 2. Qué se construyó (6 archivos tocados)

### 2.1 `apps/api/contracts/registry.py` — los contratos 26 y 27

Se añadieron dos contratos al final de la tupla `CONTRATOS`, más la matriz del
docstring y una **NOTA DE FRONTERA — CRM Y NOTIFICACIONES (FASE 8.0)**.

```python
Contrato(
    numero=26,
    nombre="clientes.beneficios_para_ticket",
    consumidor="POS",
    proveedor="CRM",
    operacion="POST /crm/benefits/for-ticket",
    entrada={
        "cliente_id": "String | None",
        "telefono": "String | None",
        "total": "String",
        "lineas": "List[Dict]",
    },
    salida={
        "beneficios": "List[Dict]",
        "puntos_disponibles": "Integer",
        "puntos_a_ganar": "Integer",
    },
    garantias=(
        "Devuelve los beneficios aplicables al ticket (puntos, promociones).",
        "El CRM es el dueño del cálculo; el POS solo muestra y aplica.",
        "Si el cliente no está identificado, devuelve lista vacía (200), no error.",
    ),
    errores=(
        "400 si `total` no es un String decimal válido.",
        "503 `CRM_NO_DISPONIBLE` si el CRM no responde; el POS degrada a sin beneficios.",
    ),
    estado_hoy="FASE 8.0",
),
Contrato(
    numero=27,
    nombre="notificaciones.encolar_ticket",
    consumidor="POS",
    proveedor="Notificaciones",
    operacion="POST /notifications/enqueue-ticket",
    entrada={
        "ticket_id": "String",
        "canal": "String = 'whatsapp'",
        "destino": "String",
        "payload": "Dict",
    },
    salida={
        "encolado": "Boolean",
        "envio_id": "String",
    },
    garantias=(
        "ENCOLA el envío del ticket (patrón Outbox, Regla de Oro #7).",
        "El POS encola dentro de la transacción del ticket; el worker envía después.",
        "El POS NUNCA envía directamente: solo encola.",
    ),
    errores=(
        "400 si `destino` está vacío o `canal` no es soportado.",
        "503 `NOTIFICACIONES_NO_DISPONIBLE` si la cola no responde; el POS no bloquea la venta.",
    ),
    estado_hoy="FASE 8.0",
),
```

**Puntos de diseño verificados contra el código real (REGLA DURA 2):**

- El campo `total` viaja como **String** en el cable (DT-02: el dinero viaja
  como String; el POS coercionará con `Number()` en la frontera).
- El contrato 27 declara el patrón **Outbox** (Regla de Oro #7): el POS encola
  dentro de la transacción del ticket; el worker envía después.
- Ambos declaran el **503 de degradación** (DT-07): un fallo del CRM o de
  Notificaciones NUNCA bloquea una venta.

### 2.2 `apps/api/rules/registry.py` — las 12 reglas RN-82..RN-93

Se añadió la categoría **C.16 — CRM y Notificaciones**, con **7 reglas
IMPLEMENTADAS** y **5 DECLARADAS** (defecto D-4 del plan: declarar ≠ implementar).

**Implementadas (7):**

| Regla | Enunciado | Implementación |
|-------|-----------|----------------|
| RN-82 | La identificación del cliente es opcional; nunca bloquea la venta. | `rn82_cliente_opcional_no_bloquea` |
| RN-83 | Los beneficios nunca dejan el total por debajo de cero. | `rn83_beneficios_no_modifican_total_negativo` |
| RN-84 | Los puntos nunca se actualizan; se anexan al ledger (Regla de Oro #10). | `rn84_puntos_no_se_actualizan_se_anexan` |
| RN-85 | El POS nunca envía el ticket directamente; lo encola (Outbox). | `rn85_envio_por_outbox_no_directo` |
| RN-86 | El encolado ocurre dentro de la transacción del ticket. | `rn86_encolar_en_la_misma_transaccion` |
| RN-87 | Un fallo del CRM degrada a sin beneficios; nunca bloquea la venta (DT-07). | `rn87_fallo_de_crm_no_tumba_el_pos` |
| RN-88 | Un fallo de Notificaciones degrada a sin envío; nunca bloquea la venta (DT-07). | `rn88_fallo_de_notificaciones_no_tumba_el_pos` |

**Declaradas (5)** — su `verificar` es un guard explícito que documenta la regla
y falla ruidosamente (`NotImplementedError`) si alguien la invoca antes de que su
sub-fase la implemente:

| Regla | Enunciado | Se implementa en |
|-------|-----------|------------------|
| RN-89 | El canal de envío debe ser whatsapp o email. | F8.4 (Notificaciones) |
| RN-90 | El destino debe ser un teléfono o email válido según el canal. | F8.4 (Notificaciones) |
| RN-91 | Un beneficio solo se aplica al cliente que lo posee. | F8.2 (CRM) |
| RN-92 | Una promoción solo aplica si está vigente a la fecha. | F8.2 (CRM) |
| RN-93 | Cada beneficio aplicado se registra en la auditoría (DT-05). | F8.2 (CRM) |

### 2.3 `apps/api/rules/__init__.py` — docstring y categoría C.16

El docstring pasó de "Las 81 reglas … 15 categorías" a "Las 93 reglas … 16
categorías", con la fila nueva:

```
  C.16 CRM y Notificaciones                RN-82 – RN-93   (12)
                                           TOTAL           93
```

### 2.4 `apps/api/contracts/__init__.py` — docstring

El docstring pasó de "Los 25 contratos" a "Los 27 contratos … + FASE 8.0 (CRM)".

### 2.5 `apps/api/consolidacion/registry.py` — criterio S2

El criterio de aceptación S2 pasó de "Las 81 reglas se cumplen" a "Las 93 reglas
se cumplen".

### 2.6 Los 3 archivos de test — las aserciones de conteo

| Archivo | Antes | Después |
|---------|-------|---------|
| `tests/test_f2_frontera.py` | `LOS_25_CONTRATOS`, `== 25` (×2) | `LOS_27_CONTRATOS`, `== 27` (×2) |
| `tests/test_f7_contratos_ia.py` | `== 25` (×2) | `>= 25` (×2) — la F7.0 garantiza su piso, no el techo |
| `tests/test_f3_comportamiento.py` | matriz `== 81`, rango `1..82`, `== 81`, 15 categorías | matriz `== 93`, rango `1..94`, `== 93`, 16 categorías |

**Nota sobre `test_f7_contratos_ia.py`:** la aserción se relajó a `>= 25` en
lugar de subirla a `== 27`, porque ese test pertenece a la puerta de la F7.0 y
su intención es "la F7.0 introdujo al menos 25 contratos". Subirlo a `== 27`
acoplaría la puerta de la F7.0 al crecimiento de la F8.0 (defecto D-3 del plan:
las aserciones de conteo viven en varios archivos y deben reflejar la intención
de su propia puerta).

---

## 3. La puerta de F8.0 (evidencia)

### 3.1 Gate focalizado (los 3 archivos afectados)

```
docker compose run --rm api sh -c "pip install --quiet --no-cache-dir -r requirements.txt \
  && python -m pytest -q tests/test_f2_frontera.py tests/test_f3_comportamiento.py tests/test_f7_contratos_ia.py"
```

**Resultado:** `113 passed in 1.28s`

### 3.2 Suite completa de la API

```
docker compose run --rm api sh -c "pip install --quiet --no-cache-dir -r requirements.txt \
  && python -m pytest -q"
```

**Resultado:** `249 passed in 7.29s` — **0 regresiones**.

### 3.3 CI completo (`npm run ci`)

```
> npm run lint && npm run test && npm run guards
```

- **Lint:** 233 archivos en la obra, **0 errores**.
- **Tests de Node:** 3/3 archivos en verde.
- **Tests de componentes (Vitest):** PASA.
- **Tests de la API (pytest en Docker):** PASA.
- **Guardianes (7):** todos `[OK]` — E-05, A-04, E-15 (×2), R-01, E-09, E-10.

**Resultado:** `✅ RESULTADO: TODOS LOS TESTS EN VERDE.`

---

## 4. Qué NO hace esta sub-fase

- **No implementa** el servicio, el hook ni los componentes del CRM (F8.1–F8.3).
- **No implementa** el servicio, el hook ni el componente de Notificaciones
  (F8.4–F8.6).
- **No cablea** nada en `RetailVisionPOS` (F8.7).
- **No implementa** las 5 reglas declaradas (RN-89..RN-93): solo las declara
  para que la matriz `regla → test` exista desde F8.0.

---

## 5. Trazabilidad regla → sub-fase → test

| Regla | Sub-fase que la implementa | Test |
|-------|---------------------------|------|
| RN-82 | F8.1 (servicio CRM) | `test_rn82` |
| RN-83 | F8.1 (servicio CRM) | `test_rn83` |
| RN-84 | F8.1 (servicio CRM) | `test_rn84` |
| RN-85 | F8.4 (servicio Notificaciones) | `test_rn85` |
| RN-86 | F8.4 (servicio Notificaciones) | `test_rn86` |
| RN-87 | F8.1 (servicio CRM) | `test_rn87` |
| RN-88 | F8.4 (servicio Notificaciones) | `test_rn88` |
| RN-89 | F8.4 (Notificaciones) | `test_rn89` |
| RN-90 | F8.4 (Notificaciones) | `test_rn90` |
| RN-91 | F8.2 (CRM) | `test_rn91` |
| RN-92 | F8.2 (CRM) | `test_rn92` |
| RN-93 | F8.2 (CRM) | `test_rn93` |

---

## 6. Lección de la REGLA DURA 2 aplicada a esta sub-fase

Antes de tocar un solo archivo, se **verificó contra el código real** (no contra
el plan ni contra la memoria):

1. El número exacto de contratos (25) y su último número (25).
2. El número exacto de reglas (81) y su último número (81).
3. La estructura exacta del `dataclass Contrato` y del `dataclass Regla`.
4. Los puntos de inserción exactos (línea 657 para los contratos, línea 767 para
   las reglas).
5. **Todas** las aserciones de conteo, no solo las que el plan listaba: se
   encontraron **2 referencias stale adicionales** (`contracts/__init__.py` y
   `consolidacion/registry.py`) que el plan v2.0 no había listado.

Esa última verificación es exactamente el valor de la REGLA DURA 2: el plan
listaba 5 aserciones; el código tenía 7 referencias. Asumir el plan habría
dejado 2 referencias obsoletas en el árbol.

---

## 7. Commit

- **Commit de la sub-fase:** `e594de0` — F8.0: contratos 26/27 (CRM + Notificaciones)
  y reglas RN-82..RN-93 (C.16).
- **Push:** `888519e..e594de0  main -> main` (repo `NUEVO-POS`).
- **Archivos:** 9 cambiados, 506 inserciones(+), 41 eliminaciones(−).
- **Estado:** ✅ CERRADA — puerta en verde.
