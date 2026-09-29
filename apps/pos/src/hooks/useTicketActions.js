/**
 * useTicketActions — acciones del ticket con contrato `{outcome, reason}`.
 *
 * Cicatriz v7.0.3 (cuentas perdidas): las acciones de persistencia podían
 * lanzar excepciones que nadie capturaba, o "tener éxito" devolviendo algo
 * ambiguo. El resultado fueron cuentas que se perdían silenciosamente.
 *
 * Este hook garantiza que TODA acción devuelve `{ outcome, reason, data }` y
 * NUNCA lanza. Además, toda rama de salida (éxito, fallo, timeout) limpia
 * EXACTAMENTE los mismos refs (Regla 19 — limpieza espejo).
 *
 * Reglas duras:
 *   - Prohibición #3: callbacks async leen `useRef`, no estado cerrado.
 *   - H1: `useEffect` deps = primitivos.
 *   - Contrato `{outcome, reason}` en toda función de persistencia.
 *
 * @see PLAN_MAESTRO_DEFINITIVO_POS.md §5 (reglas arquitectónicas)
 * @see PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md §4 FASE 3.3
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { aOutcome, esOk } from '../utils/outcome.js';
import { withRetries } from '../utils/withRetries.js';
import { buildResetPatch, aplicarReset } from '../state/sessionReset.js';

/**
 * @param {object} [opciones]
 * @param {object} [opciones.api] - cliente con `crearVenta` y `cobrarTicket`.
 * @param {string} [opciones.terminalId]
 * @param {string} [opciones.channel]
 * @param {() => void} [opciones.alCobrar] - callback tras cobro verificado.
 * @returns {object} estado y acciones del ticket
 */
export function useTicketActions(opciones = {}) {
  const { api = null, terminalId = null, channel = 'PANADERIA', alCobrar = null } = opciones;

  const [ticket, setTicket] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [ultimoOutcome, setUltimoOutcome] = useState(null);

  // Refs espejo (prohibición #3).
  const ticketRef = useRef(ticket);
  const enviandoRef = useRef(false);
  const apiRef = useRef(api);
  const terminalRef = useRef(terminalId);
  const channelRef = useRef(channel);
  const alCobrarRef = useRef(alCobrar);

  ticketRef.current = ticket;
  apiRef.current = api;
  terminalRef.current = terminalId;
  channelRef.current = channel;
  alCobrarRef.current = alCobrar;

  // H1: deps primitivos.
  useEffect(() => {
    terminalRef.current = terminalId;
  }, [terminalId]);

  useEffect(() => {
    channelRef.current = channel;
  }, [channel]);

  /** Limpieza espejo: TODA rama de salida limpia los mismos refs (Regla 19). */
  const limpiarRefs = useCallback(() => {
    aplicarReset(
      { ticketRef, enviandoRef },
      buildResetPatch({ ticketRef, enviandoRef })
    );
  }, []);

  /**
   * Crea el ticket con sus líneas (contrato 3). NUNCA lanza.
   * @param {Array<{product_id: string, quantity: number}>} items
   * @returns {Promise<import('../utils/outcome.js').Outcome>}
   */
  const crearTicket = useCallback(async (items) => {
    const cliente = apiRef.current;
    if (!cliente) {
      const r = { outcome: 'error', reason: 'api_no_disponible', data: null };
      setUltimoOutcome(r);
      return r;
    }

    enviandoRef.current = true;
    setEnviando(true);
    try {
      const resultado = await aOutcome(() =>
        withRetries(() =>
          cliente.crearVenta({
            terminal_id: terminalRef.current,
            channel: channelRef.current,
            items,
          })
        )
      );

      if (esOk(resultado)) {
        setTicket(resultado.data);
        ticketRef.current = resultado.data;
      } else {
        limpiarRefs();
      }
      setUltimoOutcome(resultado);
      return resultado;
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }, [limpiarRefs]);

  /**
   * Cobra el ticket (contrato 4). NUNCA lanza. Toda rama limpia los mismos refs.
   * @param {object} paymentDetails
   * @returns {Promise<import('../utils/outcome.js').Outcome>}
   */
  const cobrar = useCallback(async (paymentDetails) => {
    const cliente = apiRef.current;
    const actual = ticketRef.current;
    if (!cliente || !actual) {
      const r = { outcome: 'error', reason: 'sin_ticket_o_api', data: null };
      setUltimoOutcome(r);
      return r;
    }

    enviandoRef.current = true;
    setEnviando(true);
    try {
      const resultado = await aOutcome(() =>
        withRetries(() =>
          cliente.cobrarTicket(actual.id, {
            payment_details: paymentDetails,
            version: actual.version,
          })
        )
      );

      if (esOk(resultado)) {
        setTicket(resultado.data);
        ticketRef.current = resultado.data;
        if (typeof alCobrarRef.current === 'function') alCobrarRef.current(resultado.data);
      } else {
        // Simetría: el fallo limpia los MISMOS refs que el éxito.
        limpiarRefs();
      }
      setUltimoOutcome(resultado);
      return resultado;
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }, [limpiarRefs]);

  return {
    ticket,
    enviando,
    ultimoOutcome,
    crearTicket,
    cobrar,
  };
}

export default useTicketActions;
