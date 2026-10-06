# FICHA F12.11 — Auditoría handler-por-handler (viejo POS → nuevo POS)

> **Fase:** F12 (paridad funcional con el viejo POS) — sub-fase **F12.11**.
> **Tipo:** AUDITORÍA (no implementa; **detecta y clasifica** huecos).
> **Regla que la gobierna:** REGLA DURA 2 / E-19 — *"Verificar, no asumir"*.
> **Cicatriz que la origina:** F12.10. El usuario reportó que recuperar una
> cuenta del pizarrón "no funcionaba". La causa raíz no era un bug aislado:
> era que el nuevo POS había **omitido en silencio** varios efectos observables
> del viejo POS. F12.10b cerró 3 de esos huecos en UN solo handler
> (`handleRecoverAccount`). La pregunta del usuario — *"¿así como esto hay
> muchas más omisiones?"* — exige una respuesta **sistemática**, no anecdótica.
> Esta ficha es esa respuesta.

---

## 1. Método (el ciclo de 6 pasos, aplicado a TODOS los handlers)

Para cada handler del viejo POS se ejecuta el ciclo canónico:

1. **Detectar** — enumerar el handler y sus efectos observables.
2. **Verificar** — buscar el efecto equivalente en el nuevo POS (no asumir).
3. **Clasificar** — asignar una categoría de paridad (ver §2).
4. **Adaptar** — (solo si hay hueco) definir la sub-fase F12.x que lo cierra.
5. **Probar** — (solo si hay hueco) la compuerta de la sub-fase.
6. **Ficha+commit** — (solo si hay hueco) su propia ficha.

**Fuentes auditadas (viejo POS):**
- [`apps/pos/hooks/useTicketActions.js`](../../../../apps/pos/hooks/useTicketActions.js:1) — 4 handlers.
- [`apps/pos/RetailVisionPOS.jsx`](../../../../apps/pos/RetailVisionPOS.jsx:1) — 8 handlers.

**Fuentes de contraste (nuevo POS):**
- [`../NUEVO-POS/apps/pos/src/hooks/useTicketActions.js`](../../apps/pos/src/hooks/useTicketActions.js:1)
- [`../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx:1)
- [`../NUEVO-POS/apps/pos/src/hooks/useCart.js`](../../apps/pos/src/hooks/useCart.js:1)
- [`../NUEVO-POS/apps/pos/src/hooks/useTerminalLocking.js`](../../apps/pos/src/hooks/useTerminalLocking.js:1)
- [`../NUEVO-POS/apps/pos/src/hooks/useBeforeUnload.js`](../../apps/pos/src/hooks/useBeforeUnload.js:1)
- [`../NUEVO-POS/apps/pos/src/hooks/useVoiceCart.js`](../../apps/pos/src/hooks/useVoiceCart.js:1)

---

## 2. Categorías de paridad (heredadas de F12.1–F12.9)

| Categoría | Significado |
|---|---|
| **PORTADA** | El efecto existe y es fiel al viejo POS. |
| **OMITIDA** | El efecto NO existe en el nuevo POS. **Hueco real.** |
| **HUÉRFANA** | El efecto existe pero nadie lo invoca (código muerto). |
| **DESCARTADA** | El efecto se decide NO portar, con justificación arquitectónica. |
| **INFIEL** | El efecto existe pero se comporta distinto (divergencia). |
| **OPERACIÓN** | El efecto existe pero está conflacionado con otro (un botón hace dos cosas). |
| **CONFLACIÓN** | Dos efectos del viejo POS se fusionaron en uno del nuevo. |

---

## 3. Tabla de huecos — `useTicketActions.js` (viejo POS)

| # | Handler viejo | Efecto observable | ¿Existe en el nuevo? | Contrato | Clasificación |
|---|---|---|---|---|---|
| 1 | `handleTicketAction('OPEN')` | Persiste el ticket OPEN + **verificación post-envío** (relee y confirma `status==='OPEN'`; si falla, NO limpia el carrito) | **SÍ** — pero por otra vía: la persistencia es **atómica por ítem** (contratos 18–20). Cada `anadirLinea` ya verificó. `enviarCuentaAlPizarron` usa `clearCart()` con verificación (contrato 22). | 18–20, 22 | **PORTADA** (vía distinta, mismo invariante) |
| 2 | `handleTicketAction('PAID')` | Cobra + imprime + limpia | **SÍ** — `confirmarCobro` → `acciones.cobrar` (contrato 4) + `clearCart` + `setEntregaAbierta`. | 4 | **PORTADA** |
| 3 | `handleTicketAction` — **auto-heal de conflicto de versión** (409) | Descarga la versión fresca del servidor, reemplaza el carrito, avisa "otro vendedor modificó esta cuenta" | **NO** — el nuevo POS muestra el error y NO auto-recupera. | 21 (leer_ticket) | **OMITIDA** → **F12.12** |
| 4 | `handleTicketAction` — **mutex `actionMutexRef`** | Serializa las acciones de persistencia (evita doble cobro por doble clic) | **PARCIAL** — `useTicketActions` tiene `enviandoRef` (bandera), pero NO un mutex que **rechace** una segunda llamada concurrente. | — | **INFIEL** → **F12.13** |
| 5 | `handleTicketAction` — **`withRetries` con `shouldRetry`** | Reintenta errores de RED; NO reintenta errores de NEGOCIO (409, folio pagado) | **SÍ** — `withRetries` existe y se usa en `crearTicket`/`cobrar`. | — | **PORTADA** |
| 6 | `handleAddToCart` | Agrega al carrito + **persiste inmediatamente** (optimistic update) | **SÍ** — `agregarProducto` → `asegurarTicket` + `carrito.anadirLinea` (contrato 18). | 18 | **PORTADA** |
| 7 | `handleAddToCart` — **`setLastSaveStatus('saved'/'failed')`** | Indicador visual de "guardado / no guardado" por ítem | **NO** — el nuevo POS no expone un estado de guardado por ítem en la UI. | — | **OMITIDA** → **F12.14** |
| 8 | `handleRecoverAccount` | Recupera la cuenta del pizarrón (hidrata el carrito) | **SÍ** — `recuperarCuentaAlCarrito` (F12.10 + F12.10b). | 21, 23, 30 | **PORTADA** (cerrada en F12.10b) |
| 9 | `handleRecoverAccount` — **guardia de cuenta vacía** | No adopta una cuenta sin líneas; avisa "Cuenta vacía" | **SÍ** — cerrada en F12.10b. | — | **PORTADA** (cerrada en F12.10b) |
| 10 | `handleRecoverAccount` — **restaurar Order Data si PEDIDO** | Restaura `order_type`/`delivery_type`/cliente desde el post-it | **SÍ** — cerrada en F12.10b (`construirBloquePedido`). | 3, 23 | **PORTADA** (cerrada en F12.10b) |
| 11 | `handleRecoverAccount` — **capturador original** | Restaura `originalCapturerRef` (quién abrió la cuenta) | **DESCARTADA** — el backend resuelve el capturador por RN-24 (sesión de terminal activa). No hay estado de capturador en el cliente. | — | **DESCARTADA** (F12.10b) |
| 12 | `handleRecoverAccount` — **`isRecoveringRef`** | Bloquea el auto-save mientras se recupera | **DESCARTADA** — el nuevo POS no tiene auto-save en bloque (la persistencia es por ítem). | — | **DESCARTADA** |

---

## 4. Tabla de huecos — `RetailVisionPOS.jsx` (viejo POS)

| # | Handler viejo | Efecto observable | ¿Existe en el nuevo? | Contrato | Clasificación |
|---|---|---|---|---|---|
| 13 | `handleTerminalSwitch` | Intercepta el cambio de terminal; si hay ítems, abre modal de confirmación | **SÍ** — `intentarSalir` (F9.0.1) abre `ExitAccountModal` si hay líneas. | — | **PORTADA** |
| 14 | `doTerminalExit` | Libera el lock + limpia la sesión + vuelve al selector | **SÍ** — `salirSinEnviar` + `useTerminalLocking.liberarLock` + `onBackToTerminals`. | 26 | **PORTADA** |
| 15 | `handleSendThenExit` | Envía al pizarrón y SOLO sale si el envío fue `success` (contrato de resultado) | **SÍ** — `salirEnviandoAlPizarron` (F9.0.1). La cuenta ya está persistida por ítem. | 18–20 | **PORTADA** |
| 16 | `handleExitWithoutSaving` | Descarta la cuenta y sale | **SÍ** — `salirSinEnviar`. | — | **PORTADA** |
| 17 | `handleForceLogout` — **beacon de emergencia** | `sendBeacon` SIN await al cerrar/forzar logout, con los ítems vivos | **SÍ** — `useBeforeUnload` #1 (emergency-save) con `sendBeacon`. | 27 | **PORTADA** |
| 18 | `handleForceLogout` — **limpieza explícita de sesión** | Limpia el estado ANTES de delegar el logout (no depende del desmontaje) | **NO** — el nuevo POS NO tiene un handler de force-logout. El logout se delega al padre (`App.jsx`) sin limpieza explícita previa. | — | **OMITIDA** → **F12.15** |
| 19 | `handleUpdateQuantity` | Actualiza la cantidad + persiste (contrato 19) | **SÍ** — `incrementar`/`decrementar` → `carrito.cambiarCantidad` (contrato 19). | 19 | **PORTADA** |
| 20 | `handleRemoveFromCart` | Quita la línea + persiste (contrato 20) | **SÍ** — `quitar` → `carrito.quitarLinea` (contrato 20). | 20 | **PORTADA** |
| 21 | `handleApplyVoiceProposal` | Aplica la propuesta de voz confirmada al carrito | **SÍ** — `useVoiceCart` + `VoiceCartPanel` (F7.2). | 17 | **PORTADA** |

---

## 5. Resumen ejecutivo

**Handlers auditados:** 21 efectos observables (12 en `useTicketActions`, 9 en `RetailVisionPOS`).

| Clasificación | Cantidad | Detalle |
|---|---|---|
| **PORTADA** | 15 | Fieles al viejo POS. |
| **DESCARTADA** | 3 | #11, #12 (F12.10b) — justificadas por RN-24 y por la persistencia por ítem. |
| **OMITIDA** | 3 | **#3** (auto-heal 409), **#7** (indicador de guardado), **#18** (limpieza de force-logout). |
| **INFIEL** | 1 | **#4** (mutex de acciones). |

### Los 4 huecos que se convierten en sub-fases

| Sub-fase | Hueco | Severidad | Justificación |
|---|---|---|---|
| **F12.12** | Auto-heal de conflicto de versión (409) | **ALTA** | Sin esto, dos cajeros sobre la misma cuenta se pisan y el segundo pierde su trabajo sin recuperación. El viejo POS lo resolvía descargando la versión fresca. |
| **F12.13** | Mutex de acciones de persistencia | **MEDIA** | Sin un mutex que rechace la segunda llamada, un doble clic en COBRAR puede disparar dos cobros. El `enviandoRef` mitiga pero no rechaza. |
| **F12.14** | Indicador de guardado por ítem (`lastSaveStatus`) | **BAJA** | Es UX de confianza: el cajero ve si el último ítem llegó al servidor. No afecta la integridad. |
| **F12.15** | Limpieza explícita en force-logout | **MEDIA** | Si otro usuario toma la terminal, el estado local debe limpiarse explícitamente (no depender del desmontaje). |

---

## 6. Nota de método — la 20ª instancia de §10.6

Esta auditoría es la **20ª instancia** de la lección §10.6 (*"de adentro hacia
afuera"*): el patrón de que un componente **existe** en el nuevo POS pero su
**integración** quedó incompleta. F12.9 fue la 16ª, F12.9.1 la 17ª, F12.10 la
18ª, F12.10b la 19ª, y esta auditoría la 20ª.

La diferencia es que F12.11 **no cierra un hueco**: los **enumera y clasifica
todos**, para que las sub-fases F12.12–F12.15 se ejecuten con compuerta y ficha
propias, sin volver a descubrir omisiones "en vivo" (que es exactamente lo que
pasó con F12.10).

---

## 7. Compuerta de F12.11

F12.11 es una auditoría: su compuerta es **documental**, no de código.

- [x] Los 4 handlers de `useTicketActions.js` (viejo) auditados.
- [x] Los 8 handlers de `RetailVisionPOS.jsx` (viejo) auditados.
- [x] Cada efecto observable clasificado con una categoría de paridad.
- [x] Cada hueco (OMITIDA/INFIEL) convertido en una sub-fase F12.x con severidad.
- [x] Los 3 huecos ya cerrados en F12.10b marcados como PORTADA/DESCARTADA.

**No hay cambios de código en F12.11.** El entregable es esta ficha.

---

## 8. Commit

`e31d463` — "F12.11: auditoria handler-por-handler (21 efectos; 3 OMITIDA + 1 INFIEL -> F12.12..F12.15)"
