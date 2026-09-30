/**
 * useCart — carrito con persistencia atómica por ítem (v6.0 SaaS).
 *
 * Cicatriz v6.0 (SaaS): el carrito se persistía como un BLOB completo. Si dos
 * operaciones concurrentes tocaban el carrito, la última escritura pisaba a la
 * anterior y se perdían líneas. La corrección es persistir POR ÍTEM: cada
 * `item_id` es una operación atómica e idempotente (contrato 18).
 *
 * Reglas duras que este hook respeta:
 *   - Prohibición #3: los callbacks asíncronos leen `useRef`, nunca estado
 *     cerrado (Ticket #906, $124 → $2).
 *   - Prohibición #2: `clearCart()` SOLO ocurre tras HTTP 200 **+ verificación
 *     post-envío** (contrato 22). Si la verificación falla, el carrito NO se
 *     limpia.
 *   - H1: los `useEffect` dependen de primitivos, no de objetos recreados.
 *
 * @see PLAN_MAESTRO_DEFINITIVO_POS.md §5 (reglas arquitectónicas)
 * @see PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md §4 FASE 3.3
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aOutcome, esOk } from '../utils/outcome.js';
import { withRetries } from '../utils/withRetries.js';
import { buildResetPatch, aplicarReset } from '../state/sessionReset.js';

/** Genera un `item_id` estable para una línea del carrito. */
export function nuevoItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {object} [opciones]
 * @param {object} [opciones.api] - cliente con `anadirItem`, `cambiarCantidad`,
 *   `quitarItem` y `verificarEnvio`. Inyectable para tests.
 * @param {string} [opciones.ticketId] - ticket OPEN en el servidor (si existe).
 * @param {number} [opciones.version] - versión optimista del ticket.
 * @param {() => void} [opciones.alLimpiar] - callback tras limpieza verificada.
 * @returns {object} estado y acciones del carrito
 */
export function useCart(opciones = {}) {
  const { api = null, ticketId = null, version = 0, alLimpiar = null } = opciones;

  const [lineas, setLineas] = useState([]);
  const [versionActual, setVersionActual] = useState(version);
  const [enviando, setEnviando] = useState(false);

  // Refs espejo: los callbacks async leen SIEMPRE de aquí (prohibición #3).
  const lineasRef = useRef(lineas);
  const versionRef = useRef(versionActual);
  const ticketRef = useRef(ticketId);
  const enviandoRef = useRef(false);
  const apiRef = useRef(api);
  const alLimpiarRef = useRef(alLimpiar);

  lineasRef.current = lineas;
  versionRef.current = versionActual;
  ticketRef.current = ticketId;
  apiRef.current = api;
  alLimpiarRef.current = alLimpiar;

  // H1: el efecto depende de primitivos, no de objetos recreados en cada render.
  useEffect(() => {
    setVersionActual(version);
  }, [version]);

  useEffect(() => {
    ticketRef.current = ticketId;
  }, [ticketId]);

  /** Total local (suma de subtotales). El servidor es la fuente de verdad. */
  const total = useMemo(
    () => lineas.reduce((acc, l) => acc + Number(l.unit_price) * Number(l.quantity), 0),
    [lineas]
  );

  /**
   * Añade una línea de forma ATÓMICA e IDEMPOTENTE (contrato 18).
   * Si no hay `api`, opera solo en memoria (modo local).
   *
   * @param {{product_id: string, quantity?: number, unit_price?: number}} linea
   * @returns {Promise<import('../utils/outcome.js').Outcome>}
   */
  const anadirLinea = useCallback(async (linea) => {
    const itemId = linea.item_id || nuevoItemId();
    const cantidad = Number(linea.quantity ?? 1);

    // Actualización optimista local (el servidor confirma después).
    setLineas((prev) => {
      const existente = prev.find((l) => l.item_id === itemId);
      if (existente) {
        return prev.map((l) =>
          l.item_id === itemId ? { ...l, quantity: l.quantity + cantidad } : l
        );
      }
      return [
        ...prev,
        {
          item_id: itemId,
          product_id: linea.product_id,
          name: linea.name ?? null,
          quantity: cantidad,
          unit_price: Number(linea.unit_price ?? 0),
        },
      ];
    });

    const cliente = apiRef.current;
    // `linea.ticket_id` es un override explícito: lo usa la pantalla cuando
    // acaba de crear el ticket y el `ticketId` de React todavía no se propagó
    // al ref (el `setTicketId` es asíncrono). Sin este override, el PRIMER
    // ítem se quedaría solo en memoria y nunca se persistiría (contrato 18).
    const idTicket = linea.ticket_id || ticketRef.current;
    if (!cliente || !idTicket) {
      return { outcome: 'ok', reason: null, data: { item_id: itemId, local: true } };
    }

    const resultado = await aOutcome(() =>
      withRetries(() =>
        cliente.anadirItem(idTicket, {
          item_id: itemId,
          product_id: linea.product_id,
          quantity: cantidad,
          version: versionRef.current,
        })
      )
    );

    if (esOk(resultado) && resultado.data && typeof resultado.data.version === 'number') {
      setVersionActual(resultado.data.version);
    }
    return resultado;
  }, []);

  /**
   * Cambia la cantidad de una línea (contrato 19, bloqueo optimista).
   * @param {string} itemId
   * @param {number} quantity
   * @returns {Promise<import('../utils/outcome.js').Outcome>}
   */
  const cambiarCantidad = useCallback(async (itemId, quantity) => {
    setLineas((prev) =>
      prev.map((l) => (l.item_id === itemId ? { ...l, quantity: Number(quantity) } : l))
    );

    const cliente = apiRef.current;
    const idTicket = ticketRef.current;
    if (!cliente || !idTicket) {
      return { outcome: 'ok', reason: null, data: { item_id: itemId, local: true } };
    }

    const resultado = await aOutcome(() =>
      withRetries(() =>
        cliente.cambiarCantidad(idTicket, itemId, {
          quantity: Number(quantity),
          version: versionRef.current,
        })
      )
    );

    if (esOk(resultado) && resultado.data && typeof resultado.data.version === 'number') {
      setVersionActual(resultado.data.version);
    }
    return resultado;
  }, []);

  /**
   * Quita una línea (contrato 20, anti-degradación RN-37).
   * @param {string} itemId
   * @returns {Promise<import('../utils/outcome.js').Outcome>}
   */
  const quitarLinea = useCallback(async (itemId) => {
    setLineas((prev) => prev.filter((l) => l.item_id !== itemId));

    const cliente = apiRef.current;
    const idTicket = ticketRef.current;
    if (!cliente || !idTicket) {
      return { outcome: 'ok', reason: null, data: { item_id: itemId, local: true } };
    }

    const resultado = await aOutcome(() =>
      withRetries(() => cliente.quitarItem(idTicket, itemId, { version: versionRef.current }))
    );

    if (esOk(resultado) && resultado.data && typeof resultado.data.version === 'number') {
      setVersionActual(resultado.data.version);
    }
    return resultado;
  }, []);

  /**
   * Limpia el carrito SOLO tras HTTP 200 **+ verificación post-envío**.
   *
   * Prohibición #2: si la verificación no confirma que TODOS los `item_id`
   * están persistidos, el carrito NO se limpia y se devuelve `error`.
   *
   * @returns {Promise<import('../utils/outcome.js').Outcome>}
   */
  const clearCart = useCallback(async () => {
    if (enviandoRef.current) {
      return { outcome: 'error', reason: 'envio_en_curso', data: null };
    }

    const cliente = apiRef.current;
    const idTicket = ticketRef.current;
    const ids = lineasRef.current.map((l) => l.item_id);

    // Sin API o sin ticket: limpieza local (no hay nada que verificar).
    if (!cliente || !idTicket) {
      setLineas([]);
      if (typeof alLimpiarRef.current === 'function') alLimpiarRef.current();
      return { outcome: 'ok', reason: null, data: { verificado: false, local: true } };
    }

    enviandoRef.current = true;
    setEnviando(true);
    try {
      // 1) Verificación post-envío (contrato 22): ¿están TODOS persistidos?
      const verificacion = await aOutcome(() =>
        withRetries(() => cliente.verificarEnvio(idTicket, { item_ids: ids }))
      );

      if (!esOk(verificacion)) {
        return { outcome: 'error', reason: 'verificacion_fallo', data: null };
      }

      const faltantes = verificacion.data?.faltantes ?? [];
      if (faltantes.length > 0) {
        // NO se limpia: hay ítems que no llegaron al servidor.
        return {
          outcome: 'error',
          reason: 'items_no_persistidos',
          data: { faltantes },
        };
      }

      // 2) Verificado: ahora sí, limpieza espejo (Regla 19).
      setLineas([]);
      aplicarReset(
        { lineasRef, versionRef, ticketRef, enviandoRef },
        buildResetPatch({ lineasRef, versionRef, ticketRef, enviandoRef })
      );
      if (typeof alLimpiarRef.current === 'function') alLimpiarRef.current();
      return { outcome: 'ok', reason: null, data: { verificado: true } };
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }, []);

  return {
    lineas,
    total,
    version: versionActual,
    enviando,
    anadirLinea,
    cambiarCantidad,
    quitarLinea,
    clearCart,
  };
}

export default useCart;
