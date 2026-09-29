/**
 * useNetworkHealth — banner rojo fijo + botón bloqueado (v6.1, $453).
 *
 * Cicatriz v6.1 ($453): con la red caída, el botón de cobro seguía activo.
 * El cajero cobraba, el `fetch` fallaba en silencio y la cuenta quedaba
 * inconsistente. Pérdida documentada: $453.
 *
 * Este hook expone el estado de red y, sobre todo, `botonBloqueado`, que
 * la UI DEBE usar para deshabilitar el cobro cuando no hay red.
 *
 * @see PLAN_MAESTRO_DEFINITIVO_POS.md §5 (fixed red banner)
 * @see PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md §4 FASE 3.1
 */

import { useEffect, useRef, useState } from 'react';

/** Intervalo de sondeo por defecto. */
export const INTERVALO_POR_DEFECTO = 5000;

/**
 * Sonda real: intenta un HEAD al endpoint de salud.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function sondaReal(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * @param {object} [opciones]
 * @param {string} [opciones.url='/health'] - endpoint de salud
 * @param {number} [opciones.intervaloMs=5000]
 * @param {() => Promise<boolean>} [opciones.sonda] - inyectable para tests
 * @param {boolean} [opciones.activo=true]
 * @returns {{ enLinea: boolean, bannerVisible: boolean, botonBloqueado: boolean }}
 */
export function useNetworkHealth(opciones = {}) {
  const {
    url = '/health',
    intervaloMs = INTERVALO_POR_DEFECTO,
    sonda = null,
    activo = true,
  } = opciones;

  // Arrancamos optimistas: asumimos red hasta que la sonda diga lo contrario.
  const [enLinea, setEnLinea] = useState(true);
  const sondaRef = useRef(sonda);
  sondaRef.current = sonda;

  useEffect(() => {
    if (!activo || typeof window === 'undefined') return undefined;

    let cancelado = false;

    async function verificar() {
      const fn = sondaRef.current || (() => sondaReal(url));
      let resultado = false;
      try {
        resultado = await fn();
      } catch {
        resultado = false;
      }
      if (!cancelado) setEnLinea(Boolean(resultado));
    }

    verificar();
    const id = setInterval(verificar, intervaloMs);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [activo, url, intervaloMs]);

  return {
    enLinea,
    bannerVisible: !enLinea,
    botonBloqueado: !enLinea,
  };
}

export default useNetworkHealth;
