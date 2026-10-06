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
import { esErrorDeNegocio, esConflictoDeVersion } from './useTicketActions.js';

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

  /**
   * F12.17 — Auto-heal de conflicto de versión (409) para las escrituras por
   * ítem (contratos 18–20).
   *
   * Cicatriz runtime: dos `anadirLinea` concurrentes (dos clics rápidos en
   * productos, o un clic + un escaneo de código de barras) leían el MISMO
   * `versionRef.current` antes de que la primera escritura confirmara. La
   * primera avanzaba el `version` en el servidor; la segunda enviaba el
   * `version` obsoleto y recibía 409. Como `anadirLinea` no filtraba el 409 en
   * `withRetries`, reintentaba 3× con el mismo `version` obsoleto (3× 409 más) y
   * el ítem NUNCA se persistía. El ledger de idempotencia quedaba vacío y
   * `verificar_envio` (contrato 22) marcaba TODOS los ítems como faltantes →
   * "No se pudo enviar: hay productos sin guardar en el servidor".
   *
   * La corrección es la MISMA que ya usa `cobrar` (F12.12): ante un 409, el
   * ticket sigue siendo VÁLIDO, solo está desactualizado. Se descarga la versión
   * fresca (contrato 21) y se re-sincroniza `versionRef` para que el reintento
   * encadene (REGLA 9 — auto-heal).
   *
   * @returns {Promise<number|null>} la versión fresca, o `null` si no se pudo.
   */
  const sincronizarVersion = useCallback(async () => {
    const cliente = apiRef.current;
    const idTicket = ticketRef.current;
    if (!cliente || !idTicket || typeof cliente.leerTicket !== 'function') return null;
    const lectura = await aOutcome(() => cliente.leerTicket(idTicket));
    if (!esOk(lectura) || !lectura.data) return null;
    const fresca = lectura.data.version;
    if (Number.isInteger(fresca) && fresca >= 0) {
      setVersionActual(fresca);
      versionRef.current = fresca;
      return fresca;
    }
    return null;
  }, []);

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

    // F12.17 — Escritura con auto-heal de versión (REGLA 9 + REGLA 18).
    //   1. `debeReintentar` NO reintenta un 409 (error de negocio): reintentar
    //      con el mismo `version` obsoleto es inútil y multiplica los 409.
    //   2. Ante un 409, se descarga la versión fresca y se reintenta UNA vez.
    let errorCrudo = null;
    let resultado = await aOutcome(() =>
      withRetries(
        () =>
          cliente.anadirItem(idTicket, {
            item_id: itemId,
            product_id: linea.product_id,
            quantity: cantidad,
            version: versionRef.current,
          }),
        {
          debeReintentar: (err) => {
            errorCrudo = err;
            return !esErrorDeNegocio(err);
          },
        }
      )
    );

    if (!esOk(resultado) && esConflictoDeVersion(errorCrudo)) {
      // Auto-heal: el ticket es válido, solo está desactualizado.
      const fresca = await sincronizarVersion();
      if (fresca !== null) {
        errorCrudo = null;
        resultado = await aOutcome(() =>
          withRetries(
            () =>
              cliente.anadirItem(idTicket, {
                item_id: itemId,
                product_id: linea.product_id,
                quantity: cantidad,
                version: versionRef.current,
              }),
            { debeReintentar: (err) => !esErrorDeNegocio(err) }
          )
        );
      }
    }

    if (esOk(resultado) && resultado.data && typeof resultado.data.version === 'number') {
      setVersionActual(resultado.data.version);
      versionRef.current = resultado.data.version;
    }
    return resultado;
  }, [sincronizarVersion]);

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

    let errorCrudo = null;
    let resultado = await aOutcome(() =>
      withRetries(
        () =>
          cliente.cambiarCantidad(idTicket, itemId, {
            quantity: Number(quantity),
            version: versionRef.current,
          }),
        {
          debeReintentar: (err) => {
            errorCrudo = err;
            return !esErrorDeNegocio(err);
          },
        }
      )
    );

    if (!esOk(resultado) && esConflictoDeVersion(errorCrudo)) {
      const fresca = await sincronizarVersion();
      if (fresca !== null) {
        errorCrudo = null;
        resultado = await aOutcome(() =>
          withRetries(
            () =>
              cliente.cambiarCantidad(idTicket, itemId, {
                quantity: Number(quantity),
                version: versionRef.current,
              }),
            { debeReintentar: (err) => !esErrorDeNegocio(err) }
          )
        );
      }
    }

    if (esOk(resultado) && resultado.data && typeof resultado.data.version === 'number') {
      setVersionActual(resultado.data.version);
      versionRef.current = resultado.data.version;
    }
    return resultado;
  }, [sincronizarVersion]);

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

    let errorCrudo = null;
    let resultado = await aOutcome(() =>
      withRetries(
        () => cliente.quitarItem(idTicket, itemId, { version: versionRef.current }),
        {
          debeReintentar: (err) => {
            errorCrudo = err;
            return !esErrorDeNegocio(err);
          },
        }
      )
    );

    if (!esOk(resultado) && esConflictoDeVersion(errorCrudo)) {
      const fresca = await sincronizarVersion();
      if (fresca !== null) {
        errorCrudo = null;
        resultado = await aOutcome(() =>
          withRetries(
            () => cliente.quitarItem(idTicket, itemId, { version: versionRef.current }),
            { debeReintentar: (err) => !esErrorDeNegocio(err) }
          )
        );
      }
    }

    if (esOk(resultado) && resultado.data && typeof resultado.data.version === 'number') {
      setVersionActual(resultado.data.version);
      versionRef.current = resultado.data.version;
    }
    return resultado;
  }, [sincronizarVersion]);

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
      //
      // F12.9 — `lineasRef` NO se pasa a `buildResetPatch`: está en
      // `FORBIDDEN_KEYS` porque tiene su propio ciclo de vida (se limpia aquí
      // mismo con `setLineas([])`, tras la verificación post-envío del
      // contrato 22). Pasarlo hacía que `buildResetPatch` lanzara un
      // `TypeError`, abortando la limpieza. El bug era latente: el camino de
      // éxito de `clearCart` nunca se ejercitó en producción hasta que F12.9
      // lo usó para enviar la cuenta al pizarrón sin caja.
      setLineas([]);
      aplicarReset(
        { versionRef, ticketRef, enviandoRef },
        buildResetPatch({ versionRef, ticketRef, enviandoRef })
      );
      if (typeof alLimpiarRef.current === 'function') alLimpiarRef.current();
      return { outcome: 'ok', reason: null, data: { verificado: true } };
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }, []);

  /**
   * Hidrata el carrito con las líneas de un ticket existente (F12.10).
   *
   * Cierra el hueco A-02 de la Regla 15: recuperar una cuenta del pizarrón
   * adoptaba la identidad (`id`) pero NO las líneas, porque el contrato 21
   * devuelve EXACTAMENTE 5 campos escalares. El contrato 30 (`pos.leer_lineas`)
   * devuelve las líneas; este método las instala en el carrito y adopta la
   * `version` del servidor para que la siguiente escritura encadene con
   * concurrencia optimista (RN-25).
   *
   * Reemplaza las líneas (no las suma): es una ADOPCIÓN de una cuenta, no una
   * operación de añadir. Normaliza cada línea a la forma del carrito local.
   *
   * @param {Array<{item_id: string, product_id: string, name?: string, quantity: number, unit_price: number|string}>} lineasServidor
   * @param {number} [versionServidor] - versión optimista del ticket (RN-25).
   * @returns {{outcome: 'ok', reason: null, data: {hidratadas: number}}}
   */
  const hidratarLineas = useCallback((lineasServidor, versionServidor) => {
    const normalizadas = (Array.isArray(lineasServidor) ? lineasServidor : []).map((l) => ({
      item_id: l.item_id,
      product_id: l.product_id,
      name: l.name ?? null,
      quantity: Number(l.quantity ?? 1),
      unit_price: Number(l.unit_price ?? 0),
    }));

    setLineas(normalizadas);
    lineasRef.current = normalizadas;

    if (Number.isInteger(versionServidor) && versionServidor >= 0) {
      setVersionActual(versionServidor);
      versionRef.current = versionServidor;
    }

    return { outcome: 'ok', reason: null, data: { hidratadas: normalizadas.length } };
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
    hidratarLineas,
  };
}

export default useCart;
