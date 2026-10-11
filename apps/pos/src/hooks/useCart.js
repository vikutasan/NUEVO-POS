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
 * ¿El cliente expone `leerTicket` (contrato 21)?
 *
 * Se accede a la propiedad dentro de un `try/catch` porque los mocks de Vitest
 * lanzan al leer un export NO definido (en vez de devolver `undefined`). Sin
 * esto, un test que mockea `api/client.js` sin `leerTicket` rompería al
 * refrescar el total (DT-02 regla 6).
 *
 * @param {object} cliente
 * @returns {boolean}
 */
function tieneLeerTicket(cliente) {
  try {
    return typeof cliente.leerTicket === 'function';
  } catch {
    return false;
  }
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
  // DT-02 regla 6: el dinero NO se suma en el frontend. El total es el que
  // reporta el BACKEND (`Numeric(12,2)`, contrato 21/30). `null` = aún no se
  // conoce (modo local sin ticket, o antes de la primera lectura).
  const [totalServidor, setTotalServidor] = useState(null);

  // Refs espejo: los callbacks async leen SIEMPRE de aquí (prohibición #3).
  const lineasRef = useRef(lineas);
  const versionRef = useRef(versionActual);
  const ticketRef = useRef(ticketId);
  const enviandoRef = useRef(false);
  const apiRef = useRef(api);
  const alLimpiarRef = useRef(alLimpiar);
  const totalServidorRef = useRef(totalServidor);

  lineasRef.current = lineas;
  versionRef.current = versionActual;
  ticketRef.current = ticketId;
  apiRef.current = api;
  alLimpiarRef.current = alLimpiar;
  totalServidorRef.current = totalServidor;

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
    if (!cliente || !idTicket || !tieneLeerTicket(cliente)) return null;
    const lectura = await aOutcome(() => cliente.leerTicket(idTicket));
    if (!esOk(lectura) || !lectura.data) return null;
    const fresca = lectura.data.version;
    if (Number.isInteger(fresca) && fresca >= 0) {
      setVersionActual(fresca);
      versionRef.current = fresca;
    }
    // DT-02 regla 6: el total SIEMPRE viene del backend. Aprovechamos la misma
    // lectura (contrato 21) para refrescarlo; `total` viaja como String en el
    // cable (DT-02 regla 7) y se coerciona con `Number()` en la frontera.
    const totalFresco = lectura.data.total;
    if (totalFresco !== undefined && totalFresco !== null) {
      const n = Number(totalFresco);
      if (Number.isFinite(n)) {
        setTotalServidor(n);
        totalServidorRef.current = n;
      }
    }
    return Number.isInteger(fresca) && fresca >= 0 ? fresca : null;
  }, []);

  /**
   * Refresca el total desde el BACKEND (contrato 21).
   *
   * DT-02 regla 6: "El dinero no se suma en el frontend. Los totales vienen del
   * backend. El frontend solo formatea." Este helper es la ÚNICA fuente del
   * total cuando existe un ticket en el servidor. Se invoca tras CADA escritura
   * (añadir/cambiar/quitar) y al hidratar una cuenta, de modo que el total que
   * ve el cajero es EXACTAMENTE el `Numeric(12,2)` que el backend persistió —
   * nunca una suma de flotantes local.
   *
   * @returns {Promise<number|null>} el total del servidor, o `null` si no se pudo.
   */
  const refrescarTotal = useCallback(async () => {
    const cliente = apiRef.current;
    const idTicket = ticketRef.current;
    if (!cliente || !idTicket || !tieneLeerTicket(cliente)) return null;
    const lectura = await aOutcome(() => cliente.leerTicket(idTicket));
    if (!esOk(lectura) || !lectura.data) return null;
    const bruto = lectura.data.total;
    if (bruto === undefined || bruto === null) return null;
    const n = Number(bruto);
    if (!Number.isFinite(n)) return null;
    setTotalServidor(n);
    totalServidorRef.current = n;
    return n;
  }, []);

  useEffect(() => {
    ticketRef.current = ticketId;
  }, [ticketId]);

  /**
   * Total del ticket.
   *
   * DT-02 regla 6 (FIX arquitectónico, 7 Oct 2026): el dinero NO se suma en el
   * frontend. El total es el que reporta el BACKEND (`Numeric(12,2)`, contrato
   * 21/30), leído tras cada escritura. El frontend SOLO formatea.
   *
   * La 4ª vuelta del bug `suma_no_cuadra` había "resuelto" el síntoma redondeando
   * una suma de flotantes local (`Math.round(reduce(...) * 100) / 100`). Eso
   * seguía violando DT-02 regla 6: el frontend seguía sumando dinero. Aquí se
   * elimina esa suma por completo.
   *
   * Fallback local: SOLO cuando NO hay API ni ticket (carrito puramente en
   * memoria, sin verdad de servidor). En ese caso no hay `Numeric(12,2)` que
   * consultar y la suma local es la única opción; se redondea a 2 decimales para
   * no propagar ruido de coma flotante.
   */
  const total = useMemo(() => {
    if (totalServidor !== null) return totalServidor;
    // Modo local (sin ticket en el servidor): no hay verdad de servidor.
    // DT-02-FALLBACK-LOCAL: única suma de dinero permitida en el frontend, y
    // SOLO en ausencia total de servidor. El guard E-09-FE la tolera por el
    // marcador explícito.
    return (
      Math.round(
        lineas.reduce((acc, l) => acc + Number(l.unit_price) * Number(l.quantity), 0) * 100 // DT-02-FALLBACK-LOCAL
      ) / 100
    );
  }, [totalServidor, lineas]);

  /**
   * Añade una línea de forma ATÓMICA e IDEMPOTENTE (contrato 18).
   * Si no hay `api`, opera solo en memoria (modo local).
   *
   * F12.23b — PARIDAD RN-17 CON EL POS VIEJO (§6.8): el POS viejo fusionaba por
   * `product.id` (`apps/pos/hooks/useCart.js:105`) [N-01-LEGACY: cita del viejo]:
   * tocar N veces el mismo
   * producto dejaba UNA línea con `quantity: N`, no N líneas de 1. Aquí se
   * replica esa regla: si el llamador NO trae un `item_id` explícito (es decir,
   * viene de un tap en la ficha del producto o del lector), se fusiona por
   * `product_id`. Si SÍ trae `item_id` (p. ej. una línea hidratada del servidor
   * con su identidad ya asignada), se conserva la ruta por `item_id` para no
   * pisar la identidad que el servidor conoce.
   *
   * @param {{product_id: string, quantity?: number, unit_price?: number, item_id?: string}} linea
   * @returns {Promise<import('../utils/outcome.js').Outcome>}
   */
  const anadirLinea = useCallback(async (linea) => {
    const cantidad = Number(linea.quantity ?? 1);
    // ¿El llamador trae identidad propia? Si no, la línea se identifica por su
    // `product_id` (fusión RN-17); si sí, por su `item_id`.
    const itemIdExplicito = linea.item_id || null;

    // F12.23b — resolver la línea EXISTENTE antes de escribir. Si el llamador no
    // dio `item_id`, buscamos por `product_id` en el espejo `lineasRef` (que
    // SIEMPRE tiene el estado actual, prohibición #3). Si hay fusión, reutilizamos
    // el `item_id` de la línea existente para que el SERVIDOR también fusione
    // (contrato 18: `anadirItem` con el mismo `item_id` incrementa, no duplica).
    const existente =
      itemIdExplicito !== null
        ? lineasRef.current.find((l) => l.item_id === itemIdExplicito) || null
        : lineasRef.current.find((l) => l.product_id === linea.product_id) || null;
    // Clave efectiva: la de la línea existente si fusionamos; si no, la explícita
    // o una nueva.
    const itemId = existente ? existente.item_id : itemIdExplicito || nuevoItemId();

    // Actualización optimista local (el servidor confirma después).
    setLineas((prev) => {
      // F12.23b — clave de fusión: `item_id` si el llamador lo dio; si no,
      // `product_id` (paridad con el POS viejo, que fusionaba por producto).
      const objetivo = itemIdExplicito
        ? prev.find((l) => l.item_id === itemIdExplicito)
        : prev.find((l) => l.product_id === linea.product_id);
      if (objetivo) {
        return prev.map((l) =>
          l === objetivo ? { ...l, quantity: l.quantity + cantidad } : l
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
    // DT-02 regla 6: tras persistir, el total lo dicta el BACKEND.
    if (esOk(resultado)) await refrescarTotal();
    return resultado;
  }, [sincronizarVersion, refrescarTotal]);

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
    // DT-02 regla 6: tras persistir, el total lo dicta el BACKEND.
    if (esOk(resultado)) await refrescarTotal();
    return resultado;
  }, [sincronizarVersion, refrescarTotal]);

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
    // DT-02 regla 6: tras persistir, el total lo dicta el BACKEND.
    if (esOk(resultado)) await refrescarTotal();
    return resultado;
  }, [sincronizarVersion, refrescarTotal]);

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
    // BUG-07 — Se envían también las CANTIDADES: RN-17 fusiona los productos
    // repetidos en UNA fila del servidor, así que comparar el número de LÍNEAS
    // del carrito contra el número de FILAS daba un falso déficit (mismo
    // producto 2× = 2 líneas vs 1 fila). La verificación correcta es por
    // UNIDADES (contrato 22).
    const cantidades = lineasRef.current.map((l) => Number(l.quantity ?? 1));

    // Sin API o sin ticket: limpieza local (no hay nada que verificar).
    if (!cliente || !idTicket) {
      setLineas([]);
      setTotalServidor(null);
      totalServidorRef.current = null;
      if (typeof alLimpiarRef.current === 'function') alLimpiarRef.current();
      return { outcome: 'ok', reason: null, data: { verificado: false, local: true } };
    }

    enviandoRef.current = true;
    setEnviando(true);
    try {
      // 1) Verificación post-envío (contrato 22): ¿están TODOS persistidos?
      // BUG-07 — Se envían `item_ids` Y `cantidades` para que el backend
      // verifique por UNIDADES (no por número de filas, que RN-17 fusiona).
      const verificacion = await aOutcome(() =>
        withRetries(() =>
          cliente.verificarEnvio(idTicket, { item_ids: ids, cantidades })
        )
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
      setTotalServidor(null);
      totalServidorRef.current = null;
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
   * @param {number|string} [totalServidor] - total del ticket (contrato 30,
   *   `Numeric(12,2)`). DT-02 regla 6: se ADOPTA el total del backend en vez de
   *   recalcularlo sumando las líneas en el frontend.
   * @returns {{outcome: 'ok', reason: null, data: {hidratadas: number}}}
   */
  const hidratarLineas = useCallback((lineasServidor, versionServidor, totalServidor) => {
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

    // DT-02 regla 6: el total de una cuenta recuperada es el del BACKEND.
    if (totalServidor !== undefined && totalServidor !== null) {
      const n = Number(totalServidor);
      if (Number.isFinite(n)) {
        setTotalServidor(n);
        totalServidorRef.current = n;
      }
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
    refrescarTotal,
  };
}

export default useCart;
