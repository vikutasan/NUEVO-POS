# FICHA — FIX BUG-01: La sesión de terminal se abre al seleccionar la terminal

**Estado:** COMPLETADA
**Fecha:** 2026-10-09
**Tipo:** Corrección de bug en vivo (paridad funcional con el viejo POS)
**Regla de negocio implicada:** RN-24 (`rn24_sesion_activa`)
**Contratos implicados:** ninguno nuevo (el endpoint `POST /pos/sessions` es una
operación interna del POS, no cruza la frontera de módulos A-02)

---

## 1. Síntoma reportado en vivo

El operador tenía una sesión en la terminal **T6**, creó dos cuentas (un pedido y
una venta normal) y luego **cambió a la terminal 4** para probar la distinción de
color de los post-its por terminal. Al intentar **enviar una cuenta al pizarrón**
desde la terminal 4, apareció el modal:

```
⚠️ No se pudo completar
La sesión de la terminal no está activa
[Cerrar]
```

---

## 2. Diagnóstico (comparado con el viejo POS)

### 2.1 El viejo POS maneja DOS conceptos separados

| Concepto | Qué es | Cómo se crea |
|---|---|---|
| **Candado** (`TerminalLock`) | Exclusividad de uso de la terminal | `POST /pos/terminals/{id}/lock` al tocar la tarjeta |
| **Sesión** (`TerminalSession`) | La "caja lógica" de la terminal; los tickets se ligan a ella | `POST /pos/sessions` |

En el viejo POS, `TerminalSelector.jsx` toma el candado y, acto seguido, el flujo
abre la sesión de terminal. El backend del viejo POS **exige** una sesión activa
para operar: `reserve_ticket` (`apps/api/modules/pos/service.py:613-647`) lanza
`400 "No active session for terminal"` si no la hay.

### 2.2 El nuevo POS tenía el candado pero NO la sesión

- `useTerminals.selectTerminal` (`apps/pos/src/hooks/useTerminals.js:158`) **solo**
  llamaba a `lockTerminal`. **Nunca** creaba la `TerminalSession`.
- El nuevo POS **no tenía** ningún endpoint `POST /pos/sessions`. Solo tenía
  `GET /pos/session-active` (lectura).
- `_sesion_activa_o_404` (`apps/api/routers/pos.py:108`) aplica RN-24: sin sesión
  activa, cualquier ticket falla con 400.

**Conclusión:** la terminal 4 nunca tuvo sesión (solo la T6 la tenía, creada por
la semilla). Al enviar la cuenta, `crear_ticket` → `_sesion_activa_o_404` →
RN-24 → 400. **No era un bug del pizarrón ni del color de los post-its: era la
ausencia del paso "abrir sesión de terminal" que el viejo POS sí tiene.**

### 2.3 Verificación de que la importación es deseable

- **No contradice la documentación del viejo POS:** el viejo POS documenta
  `POST /pos/sessions` como el paso de apertura de sesión.
- **No reintroduce bugs viejos:** el viejo POS crea una sesión **nueva** cada vez
  (no idempotente). El nuevo endpoint es **idempotente**, lo que evita duplicar
  sesiones activas (RN-01: una sola sesión activa por terminal) — una mejora, no
  una regresión.
- **Acorde con la nueva arquitectura:** el endpoint vive en el router del POS, usa
  el modelo `TerminalSession` existente y respeta RN-24/RN-01. No cruza la
  frontera de contratos (A-02).

---

## 3. Corrección (Opción A — aprobada por el usuario)

Auto-abrir la sesión de terminal al seleccionar la terminal (paridad con el viejo
POS), con un endpoint **idempotente**.

### 3.1 Backend — `POST /pos/sessions`

`apps/api/routers/pos.py`:

```python
@router.post("/sessions", response_model=SesionActiva, status_code=201)
async def abrir_sesion(entrada: SesionTerminalEntrada, db=Depends(get_db)):
    terminal_id = entrada.terminal_id.strip()
    if not terminal_id:
        raise ReglaViolada("RN-24", "El terminal_id es obligatorio", 400)
    # Idempotencia: si ya hay una activa, se devuelve sin crear otra.
    existente = (await db.execute(
        select(TerminalSession).where(
            TerminalSession.terminal_id == terminal_id,
            TerminalSession.is_active.is_(True),
        )
    )).scalars().first()
    if existente is not None:
        return existente
    sesion = TerminalSession(terminal_id=terminal_id, is_active=True)
    db.add(sesion)
    await db.commit()
    await db.refresh(sesion)
    return sesion
```

- **Idempotente:** dos llamadas seguidas devuelven la MISMA fila.
- **No reabre cerradas:** si la única sesión está cerrada (`is_active=False`), crea
  una fila nueva — preserva el histórico de aperturas/cierres (auditoría).
- **`terminal_id` vacío → 400** (no crea basura).

`apps/api/schemas.py`: nuevo esquema `SesionTerminalEntrada` (`terminal_id: str`,
`min_length=1`).

### 3.2 Frontend — servicio + hook

`apps/pos/src/services/terminalService.js`: nueva función `abrirSesionTerminal(terminalId)`
→ `POST /pos/sessions`.

`apps/pos/src/hooks/useTerminals.js`: `selectTerminal` ahora, **tras el lock
exitoso**, llama a `abrirSesionTerminal(terminalId)`. Si abrir la sesión falla, se
reporta el error (no se oculta).

---

## 4. Pruebas

### 4.1 Backend — `apps/api/tests/test_bug01_sesion_terminal.py` (5 tests)

| Test | Verifica |
|---|---|
| `test_abrir_sesion_crea_si_no_existe` | 201 + fila nueva activa |
| `test_abrir_sesion_es_idempotente` | 2ª llamada devuelve la MISMA fila (RN-01) |
| `test_abrir_sesion_no_reabre_cerrada` | Una cerrada no se reutiliza; nace una nueva |
| `test_tras_abrir_sesion_el_ticket_ya_no_da_rn24` | **Reproduce BUG-01**: sin sesión 400; tras abrir, 201 |
| `test_abrir_sesion_terminal_vacio_400` | `terminal_id` en blanco → 400, sin crear filas |

### 4.2 Frontend — `apps/pos/src/hooks/useTerminals.bug01.test.jsx` (3 tests)

| Test | Verifica |
|---|---|
| criterio 1 | Tras el lock, se llama a `abrirSesionTerminal` con el `terminal_id` |
| criterio 2 | Si el lock falla, NO se abre la sesión |
| criterio 3 | Si abrir la sesión falla, `selectTerminal` reporta el error |

### 4.3 Suites completas (sin regresiones)

- **Backend:** `344 passed` (339 previos + 5 nuevos).
- **Frontend:** `783 passed` en 69 archivos (780 previos + 3 nuevos).

---

## 5. Archivos tocados

| Archivo | Cambio |
|---|---|
| `apps/api/routers/pos.py` | Endpoint `POST /pos/sessions` + import del esquema |
| `apps/api/schemas.py` | Esquema `SesionTerminalEntrada` |
| `apps/api/tests/test_bug01_sesion_terminal.py` | **Nuevo** — 5 tests |
| `apps/pos/src/services/terminalService.js` | `abrirSesionTerminal` |
| `apps/pos/src/hooks/useTerminals.js` | `selectTerminal` abre la sesión tras el lock |
| `apps/pos/src/hooks/useTerminals.bug01.test.jsx` | **Nuevo** — 3 tests |

---

## 6. Verificación en vivo

Pendiente de confirmación del operador: seleccionar la terminal 4 y enviar una
cuenta al pizarrón debe funcionar sin el modal de RN-24.
