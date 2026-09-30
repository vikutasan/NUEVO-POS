# FICHA DE CIERRE — FASE 8: Integración con CRM y Notificaciones (lado POS)

**Fecha:** 30 Sep 2026
**Fase:** F8 — Integración con CRM y Notificaciones (lado POS)
**Plan que la gobierna:** `PLAN_DE_ABORDAJE_FASE_8_POR_PARTES.md` §3.8 (v2.0)
**Regla que gobierna la ejecución:** REGLA DURA 2 — *"Verificar, no asumir"*
**Estado:** ✅ **CERRADA**
**Commit de cierre:** `9a21267` — *"F8.7: cierre de la Fase 8 — ficha de cierre CRM + Notificaciones (9 criterios, CI verde)"*
**Commit del Plan Maestro:** `5bebefa` (repo PLANOS-ARQUITECTONICOS) — *"docs(f8.7): Fase 8 marcada CERRADA en el Plan Maestro (v1.9)"*

---

## 1. Qué construyó la fase (lado POS)

La Fase 8 construye **solo el lado del POS**: los puntos de contacto para hablar con dos
módulos futuros del ERP (CRM y Notificaciones). **No construye** ninguno de esos módulos.

| Sub-fase | Entregable | Tipo | Commit |
|---|---|---|---|
| F8.0 | Contratos #26/#27 + reglas RN-82..RN-93 declaradas | Contratos + reglas | `e594de0` (+ hash `7f174bb`) |
| F8.1 | [`benefitsService.js`](../../apps/pos/src/services/benefitsService.js) — servicio de beneficios (contrato #26) | Producción | `b894f1d` |
| F8.2 | [`notificationsService.js`](../../apps/pos/src/services/notificationsService.js) — servicio de notificaciones (contrato #27) | Producción | `c42d83c` (+ hash `aaa2f85`) |
| F8.3 | [`useCustomerIdentification.js`](../../apps/pos/src/hooks/useCustomerIdentification.js) — hook de identificación | Producción | `e20a9a2` (+ hash `6b25a95`) |
| F8.4 | [`CustomerIdentificationPanel.jsx`](../../apps/pos/src/components/CustomerIdentificationPanel.jsx) — panel de identificación | Producción | `70685f5` (+ hash `2153f70`) |
| F8.5 | [`TicketDeliveryPanel.jsx`](../../apps/pos/src/components/TicketDeliveryPanel.jsx) — paso post-cobro de entrega | Producción | `d8bf8ca` (+ hash `5fd665e`) |
| F8.6 | Cableado end-to-end en [`RetailVisionPOS.jsx`](../../apps/pos/src/RetailVisionPOS.jsx) + [`POSHeader.jsx`](../../apps/pos/src/components/POSHeader.jsx) | Producción | `99e94cb` (+ hash `ea6717d`) |
| F8.7 | Cierre: CI completo + esta ficha + §7 del Plan Maestro | Documentación | _(este commit)_ |

**Total: 2 componentes + 2 llamadas a contrato. Nada más.**

---

## 2. La puerta de la Fase 8 — los 9 criterios de aceptación

| # | Criterio | Cómo se verifica | Resultado |
|---|---|---|---|
| 1 | Los contratos #26 y #27 están declarados | `listar_contratos()` devuelve 27 | ✅ |
| 2 | Las reglas RN-82..RN-93 están declaradas | `listar_reglas()` devuelve 93 | ✅ |
| 3 | El botón "Cliente" permite identificar por teléfono | Gate F8.4 | ✅ |
| 4 | El panel muestra los beneficios que el CRM devuelve | Gate F8.4 | ✅ |
| 5 | El paso de entrega ofrece Imprimir / WhatsApp / Email | Gate F8.5 | ✅ |
| 6 | Si el CRM está caído, la venta continúa sin beneficios | Gate F8.1 + F8.6 | ✅ |
| 7 | Si Notificaciones está caído, la venta continúa con impresión | Gate F8.2 + F8.6 | ✅ |
| 8 | El POS nunca importa `Order` ni escribe `customers`/`notification_outbox` | Guard de frontera (E-15) | ✅ |
| 9 | El POS nunca define ni persiste la política de lealtad | Gate F8.6 | ✅ |

**Los 9 criterios se cumplen.**

---

## 3. Evidencia del CI completo (F8.7)

**Comando:** `npm run ci` (desde `../NUEVO-POS`)

```
> npm run lint && npm run test && npm run guards

=== LINT (F0) ===
Archivos en la obra: 244
Lint OK: 0 errores.

=== TESTS (Fase 3.0 — runner real) ===
── Tests de Node (3 archivo(s)) ──        ✅ 3/3
── Tests de componentes React (Vitest) ── ✅ PASA
── Tests de la API (pytest en Docker) ──  ✅ PASA
✅ RESULTADO: TODOS LOS TESTS EN VERDE.

=== GUARDIANES DE ESTÁNDARES (F0 + F4/A-04) ===
Archivos de código escaneados: 160
[OK] E-05 — Silencios en ruta crítica (except ... pass) → 0
[OK] A-04 — Silencios en la ruta crítica de guardianes → 0
[OK] E-15 — Logs olvidados (console.log) → 0
[OK] E-15 — TODOs sin formato declarado → 0
[OK] R-01 — Ancho fijo en la superficie → 0
[OK] E-09 — Dinero en Float (Float en models.py) → 0
[OK] E-10 — Tiempo naive (DateTime() en models.py) → 0

PUERTA F0 EN VERDE · PUERTA F4/A-04 EN VERDE · PUERTA F5/R-01 EN VERDE
```

**Regresión completa del frontend:** `npx vitest run` →
`Test Files 35 passed (35) — Tests 444 passed (444)`.

**Los 7 guardianes limpios. Todos los tests verdes. Lint 0 errores.**

---

## 4. Trazabilidad (regla → sub-fase → test)

| Origen | Sub-fase | Test |
|---|---|---|
| Contrato #26 | F8.0 + F8.1 | `test_f2_frontera` (27) + `benefitsService.f8_1` |
| Contrato #27 | F8.0 + F8.2 | `test_f2_frontera` (27) + `notificationsService.f8_2` |
| RN-82, RN-83 | F8.3 + F8.4 | `useCustomerIdentification.f8_3` + `CustomerIdentificationPanel.f8_4` |
| RN-84 | F8.4 + F8.6 | `CustomerIdentificationPanel.f8_4` + `RetailVisionPOS.f8_6` |
| RN-86, RN-87 | F8.5 + F8.6 | `TicketDeliveryPanel.f8_5` + `RetailVisionPOS.f8_6` |
| RN-91 | F8.4 | `CustomerIdentificationPanel.f8_4` |
| RN-92 | F8.5 | `TicketDeliveryPanel.f8_5` |
| RN-85, RN-88, RN-89, RN-90, RN-93 | F8.0 (solo declaración) | `test_f3_comportamiento` (enunciado, no comportamiento) |
| DT-02 (dinero String) | F8.1 + F8.2 | `benefitsService.f8_1` + `notificationsService.f8_2` |
| DT-07 (degradación) | F8.1 + F8.2 + F8.6 | Los 3 gates |
| §6.8 (UX heredada) | F8.4 + F8.5 | Los 2 gates de componente |
| A-02 (frontera) | F8.6 | Guard E-15 |

---

## 5. El hallazgo central: un bug de producción cazado por la puerta

La puerta de F8.6 (cableado end-to-end) **cazó un bug de producción real** antes de que
llegara a producción:

> `asegurarTicket()` fijaba el estado de React (`setTicketId`) y `agregarProducto` llamaba
> **inmediatamente** a `carrito.anadirLinea(...)`, pero el `ticketRef.current` de `useCart`
> seguía en `null` (React aún no había re-renderizado). El **primer ítem de cada venta** se
> quedaba solo en memoria local y nunca se persistía por `anadirItem` (contrato 18). El
> ticket nacía vacío en el backend.

**Corrección:** `useCart.anadirLinea` acepta `linea.ticket_id` como override explícito;
`asegurarTicket` devuelve el id (string) y los 5 puntos de llamada lo pasan a `anadirLinea`.

Este hallazgo es la **justificación viva** de la REGLA DURA 2 y del principio "de adentro
hacia afuera": la puerta de integración end-to-end revela los defectos de costura que las
puertas unitarias no ven. Detalle completo en
[`FICHA_F8_6_CABLEADO_E2E.md`](./FICHA_F8_6_CABLEADO_E2E.md) §3.

---

## 6. Lo que esta fase NO hizo (y por qué)

1. **No construyó el CRM.** Ni sus tablas, ni sus pantallas, ni su lógica de lealtad.
2. **No construyó Notificaciones.** Ni el worker, ni la cola, ni la integración con WhatsApp.
3. **No definió la política de lealtad.** Eso es del CRM (RN-88).
4. **No tocó el ERP instalado.** Cero líneas de código de producción del ERP viejo.
5. **No bloquea la venta jamás.** Es la regla dura de toda la fase.

---

## 7. Riesgos residuales

| Riesgo | Estado |
|---|---|
| El bug `ticket` vs `ticketId` de F7.5a se repite en el cableado | **Mitigado** — la puerta F8.6 monta la pantalla REAL y lo cazó |
| El POS importa `Order` por descuido | **Mitigado** — Guard E-15 + criterio 8 de la puerta |
| La degradación no se prueba (solo el camino feliz) | **Mitigado** — cada gate tiene un criterio explícito de "proveedor caído" |
| Se construye código de módulos ajenos | **Mitigado** — §1.2 lo prohíbe explícitamente |

---

## 8. Conclusión

La Fase 8 queda **CERRADA**. El POS sabe hablar con el CRM y con Notificaciones **por
contrato**, degrada con elegancia si alguno cae, y **nunca bloquea la venta**. Los 9
criterios de aceptación se cumplen, los 7 guardianes están limpios y todos los tests están
en verde.

**Fin de la Ficha de Cierre de la Fase 8.**
