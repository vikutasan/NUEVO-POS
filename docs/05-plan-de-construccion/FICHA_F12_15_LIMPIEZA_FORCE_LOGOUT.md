# FICHA F12.15 — Limpieza explícita en force-logout (DESCARTADA con evidencia)

> **Sub-fase:** 12.15 — limpieza explícita de sesión en force-logout (REGLA 19)
> **Fase:** 12 — Portar funcionalidades del POS viejo al POS nuevo
> **Estado:** ✅ CERRADA — **DESCARTADA** (disparador prohibido por §10.4; REGLA 19 ya satisfecha)
> **Fecha:** 2026-10-06
> **Commit:** `1aceea1` — F12.15: cerrar como DESCARTADA (disparador prohibido por 10.4; REGLA 19 ya cubierta por las 5 rutas de salida)
> **Plan rector:** §10.4 de `HALLAZGOS_AUDITORIA_BRECHAS_POS.md` + REGLA 19 + §6.8

---

## 1. Qué se auditó

F12.11 (la auditoría handler-por-handler) clasificó el efecto #18 del viejo POS
(`handleForceLogout` — **limpieza explícita de sesión**) como **OMITIDA** y lo derivó a
F12.15 con severidad MEDIA:

> "Si otro usuario toma la terminal, el estado local debe limpiarse explícitamente
> (no depender del desmontaje)."

La **verificación** (REGLA DURA 2: "verificar, no asumir") reveló **dos hechos** que
justifican cerrar F12.15 como **DESCARTADA**:

1. **El disparador está PROHIBIDO.** El `handleForceLogout` del viejo POS se activaba
   por el `ForceLogoutModal` / `lockWarning` — el **polling de seguridad** que
   verificaba "¿sigo siendo el dueño del lock?". Ese mecanismo fue la causa del **bug
   anti-ping-pong** y fue **DESCARTADO explícitamente** (V-06 del Plan Maestro). §10.4
   lo prohíbe de forma terminante.
2. **REGLA 19 ya está satisfecha.** El nuevo POS **no tiene** un handler de force-logout
   (el logout se delega al padre `App.jsx`), pero **todas sus rutas de salida** ya
   cumplen la limpieza espejo. No hay estado local que quede sucio.

### El hueco (clasificación F12.11)

| # | Hueco | Clase | Decisión |
|---|---|---|---|
| 1 | `handleForceLogout` — limpieza explícita de sesión | OMITIDA | **DESCARTAR** — disparador prohibido (§10.4); REGLA 19 ya cubierta |

---

## 2. Evidencia 1 — El disparador está prohibido (§10.4)

`HALLAZGOS_AUDITORIA_BRECHAS_POS.md` §10.4 (líneas 402–414):

> **⛔ PROHIBIDO portar `ForceLogoutModal`, `lockWarning`, o cualquier polling de
> seguridad que verifique "¿sigo siendo el dueño del lock?".**
>
> Esta feature fue la causa del **bug anti-ping-pong** en el viejo POS y fue
> **DESCARTADA explícitamente** (V-06 en el Plan Maestro). El mecanismo de
> recuperación del nuevo POS es el **TTL** (RN-36): si el lock se pierde, expira
> naturalmente. No hay nada que detectar ni nada que alertar al cajero.
>
> **NO confundir con:** el `useBeforeUnload` (B1), que sí libera el lock como
> cortesía al cerrar la pestaña. Eso es un RELEASE proactivo, no un POLLING
> de vigilancia.

**Conclusión:** portar `handleForceLogout` implicaría portar su disparador (el polling
de seguridad), que está **prohibido**. La limpieza explícita **no tiene disparador
legítimo** en el nuevo POS. El TTL (RN-36) resuelve el caso "otro usuario toma la
terminal" sin detección ni alerta.

---

## 3. Evidencia 2 — REGLA 19 ya está satisfecha en todas las rutas de salida

REGLA 19 (limpieza espejo): *toda rama de salida limpia lo mismo*. El nuevo POS tiene
**5 rutas de salida**, y **todas** cumplen:

| # | Ruta | Archivo:línea | Qué limpia / hace | REGLA 19 |
|---|---|---|---|---|
| 1 | `intentarSalir` | `RetailVisionPOS.jsx:731` | Cuenta vacía → sale directo; cuenta con ítems → abre el modal de 3 caminos (NO hay pérdida silenciosa) | ✅ |
| 2 | `salirEnviandoAlPizarron` | `RetailVisionPOS.jsx:741` | La cuenta YA está persistida por la persistencia atómica por ítem (contratos 18–20); solo sale, NO borra | ✅ |
| 3 | `salirSinEnviar` | `RetailVisionPOS.jsx:794` | `await carrito.clearCart()` (descarte explícito) y luego sale; si el descarte falla, sale igual (intención del operador) | ✅ |
| 4 | `useBeforeUnload` #1 | `RetailVisionPOS.jsx:235` | Emergency-save: envía ticket + carrito por `sendBeacon` al cerrar la pestaña | ✅ |
| 5 | `useBeforeUnload` #2 | `RetailVisionPOS.jsx:256` | Lock release: libera el candado de terminal por `sendBeacon` (cicatriz OMEGA) | ✅ |

**El logout se delega al padre** (`App.jsx` → `onBackToTerminals`). El componente
`RetailVisionPOS` **se desmonta** al salir, y el desmontaje limpia el estado local
(React descarta el árbol de hooks). No hay estado local que sobreviva al logout.

### Por qué NO se necesita limpieza explícita adicional

El viejo POS necesitaba limpieza explícita **porque** su `handleForceLogout` limpiaba
el estado **antes** de delegar el logout — para que el `ForceLogoutModal` (que
sobrevivía al logout) no mostrara estado sucio. El nuevo POS **no tiene** ese modal
(prohibido), así que **no hay nada que sobreviva** al desmontaje. La limpieza explícita
sería código muerto.

---

## 4. Decisión

**F12.15 se cierra como DESCARTADA.** No se implementa nada:

- El disparador (`handleForceLogout` / polling de seguridad) está **prohibido** por §10.4.
- REGLA 19 ya está **satisfecha** por las 5 rutas de salida existentes.
- El TTL (RN-36) resuelve el caso "otro usuario toma la terminal" sin detección.

Cerrar como DESCARTADA **con evidencia** es la acción correcta: evita reintroducir el
bug anti-ping-pong (V-06) y evita escribir código muerto.

---

## 5. Verificación

| Puerta | Comando | Resultado |
|---|---|---|
| CI completo | `npm run ci` (desde `../NUEVO-POS`) | ✅ lint 295 archivos / 0 errores; tests Node 3/3, componentes PASA, API PASA; guards 7/7 |

No se añaden tests: F12.15 no introduce código. La evidencia es documental (las 5 rutas
de salida ya están cubiertas por los tests de F9.0.1 y F12.x existentes).

---

## 6. Trazabilidad

- **§10.4** — prohibición de portar `ForceLogoutModal` / `lockWarning` / polling de
  seguridad. ✅ respetada.
- **REGLA 19** — limpieza espejo. ✅ satisfecha por las 5 rutas de salida.
- **RN-36** — TTL del lock (15 min): el mecanismo de recuperación sin detección. ✅
- **V-06** — el bug anti-ping-pong del viejo POS. ✅ no reintroducido.
- **§6.8** — UX heredada: la salvaguarda de salida con cuenta abierta (modal de 3
  caminos) SÍ se heredó (F9.0.1); el polling de seguridad NO (prohibido). ✅
- **REGLA DURA 2 (E-19) "verificar, no asumir"** — la auditoría clasificó F12.15 como
  MEDIA; la verificación reveló que el disparador está prohibido y REGLA 19 ya está
  cubierta. ✅

---

## 7. Cierre

F12.15 queda **CERRADA como DESCARTADA**. El disparador está prohibido (§10.4) y
REGLA 19 ya está satisfecha por las 5 rutas de salida del nuevo POS. No se implementa
código. Con esto, la Fase 12 (portar funcionalidades del viejo POS) queda **completa**:
F12.12 (auto-heal 409), F12.13 (mutex) y F12.14 (bloqueo sin red) se implementaron;
F12.15 se descartó con evidencia.
