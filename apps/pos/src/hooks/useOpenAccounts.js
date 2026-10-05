/**
 * useOpenAccounts — estado del pizarrón de cuentas abiertas (F5.2).
 *
 * Expone la lista de cuentas OPEN de una terminal, su estado de carga/error,
 * una acción de refresco y una acción de recuperación.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LECCIÓN v6.0 — "Recuperación de cuenta = descargar versión fresca"
 * ─────────────────────────────────────────────────────────────────────────────
 * `recuperarCuenta(ticketId)` NO devuelve la copia que el pizarrón ya tiene en
 * memoria. Llama al contrato 21 (`pos.leer_ticket`) para traer la versión ACTUAL
 * del servidor. El bug que esto evita: el cajero abre una cuenta desde el
 * pizarrón, trabaja sobre una copia vieja, y al guardar pisa cambios que otra
 * terminal ya había hecho (o peor, escribe con un `version` obsoleto y recibe
 * un 409 confuso).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROHIBICIÓN #3 — nada de leer estado en callbacks asíncronos
 * ─────────────────────────────────────────────────────────────────────────────
 * Los callbacks leen de `useRef`, nunca del estado cerrado por el closure.
 * Si `refrescar` leyera `terminalId` del estado, una llamada disparada justo
 * antes de un cambio de terminal escribiría la respuesta de la terminal vieja.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * H1 — dependencias primitivas
 * ─────────────────────────────────────────────────────────────────────────────
 * El `useEffect` depende de `terminalId` (string primitivo), no de un objeto
 * recreado en cada render. Así no entra en un bucle de fetch infinito.
 *
 * @see PLAN_DE_ABORDAJE_FASE_5_POR_PARTES.md §6 (F5.2)
 * @see PLAN_MAESTRO_DEFINITIVO_POS.md §5 (Regla 1, Prohibición #3, H1)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as servicio from '../services/openAccountsService.js';
import * as cliente from '../api/client.js';
import { aOutcome, esOk } from '../utils/outcome.js';

/**
 * @param {object} [opciones]
 * @param {string} [opciones.terminalId] - terminal cuyas cuentas se listan
 * @param {object} [opciones.servicioCuentas] - inyectable para tests
 * @param {object} [opciones.clienteApi] - inyectable para tests
 * @returns {{
 *   cuentas: Array<object>,
 *   cargando: boolean,
 *   error: string|null,
 *   refrescar: () => Promise<void>,
 *   recuperarCuenta: (ticketId: string) => Promise<{outcome: string, reason: string|null, data: object|null}>,
 * }}
 */
export function useOpenAccounts(opciones = {}) {
  const {
    terminalId = '',
    todasLasTerminales = false,
    servicioCuentas = servicio,
    clienteApi = cliente,
  } = opciones;

  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  // Refs: los callbacks asíncronos leen de aquí, no del estado cerrado.
  const terminalRef = useRef(terminalId);
  terminalRef.current = terminalId;
  const todasLasTerminalesRef = useRef(todasLasTerminales);
  todasLasTerminalesRef.current = todasLasTerminales;
  const servicioRef = useRef(servicioCuentas);
  servicioRef.current = servicioCuentas;
  const clienteRef = useRef(clienteApi);
  clienteRef.current = clienteApi;

  // Guardia de desmontaje: evita escribir estado tras desmontar (cleanup).
  const vivoRef = useRef(true);
  useEffect(() => {
    vivoRef.current = true;
    return () => {
      vivoRef.current = false;
    };
  }, []);

  /**
   * Descarga la lista de cuentas abiertas de la terminal actual.
   * No lanza: el servicio ya devuelve `{outcome, reason}`.
   */
  const refrescar = useCallback(async () => {
    const id = terminalRef.current;
    if (!id) {
      setCuentas([]);
      setError(null);
      setCargando(false);
      return;
    }

    setCargando(true);
    // D1 — CAJA ve TODAS las cuentas; terminal normal solo las suyas (RN-31).
    const r = todasLasTerminalesRef.current
      ? await servicioRef.current.listarTodasLasCuentasAbiertas()
      : await servicioRef.current.listarCuentasAbiertas(id);
    if (!vivoRef.current) return;

    if (esOk(r)) {
      setCuentas(r.data?.cuentas ?? []);
      setError(null);
    } else {
      setCuentas([]);
      setError(r.reason || 'error_desconocido');
    }
    setCargando(false);
  }, []);

  /**
   * Recupera la versión FRESCA de una cuenta desde el servidor (contrato 21).
   * NO usa la copia del pizarrón: la lección v6.0 lo prohíbe.
   */
  const recuperarCuenta = useCallback(async (ticketId) => {
    const id = typeof ticketId === 'string' ? ticketId.trim() : '';
    if (!id) {
      return { outcome: 'error', reason: 'ticket_invalido', data: null };
    }
    return aOutcome(() => clienteRef.current.leerTicket(id));
  }, []);

  // Carga inicial y recarga al cambiar de terminal o modo (H1: dep primitiva).
  useEffect(() => {
    refrescar();
  }, [terminalId, todasLasTerminales, refrescar]);

  return { cuentas, cargando, error, refrescar, recuperarCuenta };
}

export default useOpenAccounts;
