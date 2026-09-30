# FICHA F7.7 — Router de terminales (cierre del hueco de la Fase 1)

> **Fase:** 7.7 (corrección de un hueco estructural detectado en la verificación visual de F7.7)
> **Estado:** ✅ CERRADA
> **Fecha:** 2026-09-30
> **Commit:** `2f07577`
> **Tipo:** Corrección de defecto bloqueante (no una funcionalidad nueva)

---

## 1. El hallazgo

Durante la verificación visual de la Fase 7 (F7.7), el usuario reportó:

> *"se ve bien pero no me deja entrar a ninguna terminal"*

La UI del **Selector de Terminales** (Fase 1) se renderizaba correctamente — las 6
tarjetas, los iconos, el botón de gestión — pero **ninguna terminal abría**. Al
pulsar una tarjeta, el POS no entraba.

### Diagnóstico

El frontend llamaba a `/pos/terminals/*` y recibía **404** en cada llamada:

| Llamada del frontend | Resultado antes |
|---|---|
| `GET /pos/terminals/config` | 404 |
| `GET /pos/terminals/status` | 404 |
| `POST /pos/terminals/lock` | 404 |
| `POST /pos/terminals/unlock` | 404 |

**Causa raíz:** la Fase 1 se construyó **solo en el frontend**. Existían:

- el modelo `TerminalLock` (tabla `terminal_locks`, Fase 1),
- las reglas `RN-03`..`RN-07` (Fase 3),
- el hook `useTerminals` y el servicio `terminalService.js`,
- el componente `TerminalSelector.jsx`,

…pero **nunca se escribió la puerta HTTP** que los materializa. El router
`routers/terminals.py` no existía y `main.py` no lo registraba. Es un hueco
estructural: la Fase 1 se declaró cerrada con su gate de datos (17 tablas) pero
sin su gate de API.

---

## 2. La corrección

Se escribió el router completo [`routers/terminals.py`](../../apps/api/routers/terminals.py)
(354 líneas) y se registró en [`main.py`](../../apps/api/main.py).

### 2.1 Dos contratos que conviven

El router materializa **dos contratos** del frontend, escritos en momentos
distintos, que deben coexistir:

**Fase 1 — `terminalService.js` (el selector / landing):**

| Método | Ruta | Cuerpo |
|---|---|---|
| `GET` | `/pos/terminals/status` | — |
| `GET` | `/pos/terminals/config` | — |
| `POST` | `/pos/terminals/config` | `{terminals: [{id, name, icon}]}` |
| `POST` | `/pos/terminals/lock` | `{terminal_id, user_id}` |
| `POST` | `/pos/terminals/unlock` | `{terminal_id, user_id}` |

**Fase 3.4 — `client.js` (heartbeat OMEGA, dentro del POS):**

| Método | Ruta | Cuerpo |
|---|---|---|
| `POST` | `/pos/terminals/{id}/lock` | `{usuario_id}` |
| `POST` | `/pos/terminals/{id}/unlock` | `{usuario_id}` |
| `POST` | `/pos/terminals/{id}/heartbeat` | `{usuario_id}` |

Los endpoints de Fase 3.4 **delegan** en los de Fase 1 (adaptan el cuerpo), de
modo que la lógica del candado vive en un solo lugar.

### 2.2 Reglas aplicadas

| Regla | Comportamiento | Respuesta |
|---|---|---|
| **RN-03** | El candado es exclusivo: solo un ocupante a la vez. | `409` si está ocupada por otro |
| **RN-04** | El candado vence por TTL (15 min); al vencer se considera libre. | La terminal vuelve a estar disponible |
| **RN-05** | Solo el dueño libera su candado. | `403` si no lo es |
| **RN-06** | Un administrador puede forzar el desbloqueo. | `200` |
| **RN-07** | El heartbeat renueva el TTL del dueño. | `200`; `409` si no es dueño |

### 2.3 Decisiones documentadas (no descuidos)

- **`_a_uuid()`** — El frontend usa ids numéricos o de texto; `TerminalLock.occupier_id`
  es `UUID` (regla C-01). Un id no-UUID se mapea a un UUID **determinista**
  (`uuid5(NAMESPACE_URL, "pos-usuario:{valor}")`): el mismo usuario produce
  siempre el mismo UUID, sin romper la frontera.
- **`_es_admin()`** — El POS nuevo aún no tiene tabla de empleados (vive en el
  ERP). Hasta que exista el contrato de identidad, el rol se resuelve por
  convención explícita: los ids que empiezan con `admin` son administradores.
- **Configuración en archivo JSON** — La lista de terminales (ids + iconos) es
  una **preferencia de despliegue**, no una entidad de negocio. Se persiste en
  `terminal_config.json` junto al API, igual que el POS viejo
  (`terminal_status.json`).
- **Candado persistente (cicatriz OMEGA)** — El candado vive en la tabla
  `terminal_locks`, **no** en un diccionario en RAM. Un reinicio del API no deja
  terminales fantasma; el TTL las libera solas si la pestaña murió sin despedirse.

---

## 3. La puerta (gate)

[`tests/test_f7_7_terminales.py`](../../apps/api/tests/test_f7_7_terminales.py) — **19 tests**, 9 criterios:

| Criterio | Qué verifica | Tests |
|---|---|---|
| 1 | El router existe y responde 200 (antes: 404) | 2 |
| 2 | El status proyecta el mapa de ocupación (`occupier_id`, `locked_at`) | 2 |
| 3 | RN-03: exclusivo (409 si ocupada; 200 si libre) | 2 |
| 4 | RN-04: el candado vencido se reporta libre y lo toma otro | 2 |
| 5 | RN-05/RN-06: solo el dueño libera (403); el admin fuerza | 3 |
| 6 | RN-07: el heartbeat renueva; ajeno o sin candado → 409 | 3 |
| 7 | El contrato de Fase 3.4 (por id) convive con el de Fase 1 | 2 |
| 8 | La configuración se guarda y se relee | 1 |
| 9 | Entradas inválidas → 422 (no fallan en silencio) | 2 |

**Resultado:** `19 passed`.

---

## 4. Evidencia

### 4.1 Suite completa de la API

```
244 passed in 6.29s
```

### 4.2 CI del frontend

```
Lint OK: 0 errores.
Tests de Node      : 3/3 archivo(s) en verde
Tests de componentes: PASA
Tests de API       : PASA
✅ RESULTADO: TODOS LOS TESTS EN VERDE.
PUERTA F0 EN VERDE: los greps de estándares están activos y limpios.
PUERTA F4/A-04 EN VERDE: 0 silencios en la ruta crítica (guards/).
PUERTA F5/R-01 EN VERDE: 0 anchos fijos en la superficie (apps/pos/).
```

### 4.3 Verificación contra la API viva (el flujo real del navegador)

```
config=200
status=200
lock=200
unlock=200
```

Las cuatro llamadas que hace el navegador al entrar a una terminal responden
**200**. El bloqueante está resuelto.

---

## 5. Defecto colateral corregido (flake horario de F4.1)

Al correr la suite completa apareció **1 fallo** en
`test_f4_1_caja_api.py::test_reporte_diario_usa_dia_local`, **no relacionado**
con el router de terminales.

**Causa:** el test sembraba el ticket con el `now()` de la BD (UTC) y luego
consultaba el reporte por el **día local** (UTC-6). Entre las 00:00 y las 06:00
UTC (18:00–00:00 local) el día UTC ya cambió y el local no, así que el ticket
caía fuera de la ventana consultada. El test solo pasaba de 06:00 a 24:00 UTC.

**Corrección:** el test ahora fija `created_at` al **mediodía local** del día
local actual (expresado en UTC) y consulta ese mismo día local. Es determinista
a cualquier hora. El endpoint era correcto (RN-59/RN-80); el defecto estaba en
el test.

---

## 6. Alcance de la verificación

> [!IMPORTANT]
> La puerta verifica el **contrato HTTP** (que los endpoints existan, respondan
> con los códigos correctos y apliquen RN-03..RN-07). La verificación en el
> navegador confirma que las cuatro llamadas del selector responden 200.
>
> Lo que **no** cubre esta ficha: la experiencia completa de entrar, operar y
> salir de una terminal con datos reales de negocio (productos, caja, tickets).
> Eso corresponde a la verificación funcional de la Fase 8 en adelante.

---

## 7. Archivos tocados

| Archivo | Cambio |
|---|---|
| `apps/api/routers/terminals.py` | **Nuevo** — el router (354 líneas) |
| `apps/api/main.py` | Registra `terminals.router` |
| `apps/api/tests/test_f7_7_terminales.py` | **Nuevo** — la puerta (19 tests) |
| `apps/api/tests/test_f4_1_caja_api.py` | Fix del flake horario (determinismo) |
| `apps/api/terminal_config.json` | **Nuevo** — configuración de despliegue (runtime) |

---

## 8. Lección aprendida

**Una fase no está cerrada hasta que su contrato HTTP existe y responde.**

La Fase 1 se declaró cerrada con su gate de **datos** (17 tablas, incluida
`terminal_locks`) pero sin su gate de **API**. El modelo, las reglas y el
frontend estaban; faltaba la puerta. El hueco no se detectó hasta la
verificación visual de la Fase 7 — siete fases después.

Esto refuerza el principio **"de adentro hacia afuera"**: cada pieza se
construye con su gate **y** se cablea end-to-end antes de declararla cerrada.
El gate de datos no sustituye al gate de API.
