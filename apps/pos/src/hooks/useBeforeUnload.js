/**
 * useBeforeUnload — persistencia al cerrar la pestaña (H3).
 *
 * Cicatriz H3: cuando el cajero cerraba la pestaña con una cuenta abierta,
 * el `fetch` normal se cancelaba y la cuenta se perdía. La solución es
 * `navigator.sendBeacon`, que el navegador garantiza enviar aunque la
 * página se esté cerrando.
 *
 * Regla de batalla: "sendBeacon on close".
 *
 * @see PLAN_MAESTRO_DEFINITIVO_POS.md §5 (reglas arquitectónicas)
 * @see PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md §4 FASE 3.1
 */

import { useEffect, useRef } from 'react';

/**
 * @param {object} opciones
 * @param {string} opciones.url - endpoint de persistencia
 * @param {() => (object|null)} opciones.obtenerPayload
 *        - devuelve el payload a enviar; `null` = no enviar nada
 * @param {boolean} [opciones.activo=true] - si false, no registra el listener
 * @param {(url: string, data: string) => boolean} [opciones.enviar]
 *        - inyectable para tests (por defecto `navigator.sendBeacon`)
 * @returns {{ enviado: boolean }} - estado observable (útil en tests)
 */
export function useBeforeUnload({ url, obtenerPayload, activo = true, enviar = null }) {
  const enviadoRef = useRef(false);
  // useRef para el callback: evita re-registrar el listener en cada render
  // (prohibición #3: no leer estado en callbacks asíncronos).
  const payloadRef = useRef(obtenerPayload);
  payloadRef.current = obtenerPayload;

  useEffect(() => {
    if (!activo || typeof window === 'undefined') return undefined;

    const alCerrar = () => {
      let payload = null;
      try {
        payload = payloadRef.current ? payloadRef.current() : null;
      } catch {
        payload = null;
      }
      if (payload == null) return;

      const data = JSON.stringify(payload);
      const enviarFn =
        enviar ||
        (typeof navigator !== 'undefined' && navigator.sendBeacon
          ? (u, d) => navigator.sendBeacon(u, d)
          : null);

      if (typeof enviarFn === 'function') {
        enviarFn(url, data);
        enviadoRef.current = true;
      }
    };

    window.addEventListener('beforeunload', alCerrar);
    return () => {
      window.removeEventListener('beforeunload', alCerrar);
    };
  }, [activo, url, enviar]);

  return { enviado: enviadoRef.current };
}

export default useBeforeUnload;
