/**
 * Cliente del API del POS nuevo — P2.5 + FASE 3.4 (atómico + locking).
 *
 * Habla con el API PROPIO del POS nuevo (`CONFIG.API_BASE_URL`), nunca con el
 * del ERP. Expone las operaciones del flujo E.1 (venta directa):
 *
 *   - `getCatalogo()`      → GET  /catalog/products-for-sale   (contrato 1)
 *   - `getSesionActiva()`  → GET  /pos/session-active          (contrato 9)
 *   - `crearVenta()`       → POST /pos/tickets                 (RN-14..RN-27)
 *   - `cobrarTicket()`     → POST /pos/tickets/{id}/pay        (RN-23, RN-62/63)
 *
 * FASE 3.4 añade las operaciones ATÓMICAS por ítem (contratos 18–22) y las de
 * candado de terminal (heartbeat OMEGA), que consumen los hooks de la Fase 3.3:
 *
 *   - `anadirItem()`       → POST   /pos/tickets/{id}/items          (contrato 18)
 *   - `cambiarCantidad()`  → PATCH  /pos/tickets/{id}/items/{item}   (contrato 19)
 *   - `quitarItem()`       → DELETE /pos/tickets/{id}/items/{item}   (contrato 20)
 *   - `leerTicket()`       → GET    /pos/tickets/{id}                (contrato 21)
 *   - `verificarEnvio()`   → POST   /pos/tickets/{id}/verify         (contrato 22)
 *   - `latir()`            → POST   /pos/terminals/{id}/heartbeat    (OMEGA)
 *   - `tomarLock()`        → POST   /pos/terminals/{id}/lock         (RN-03)
 *   - `liberarLock()`      → POST   /pos/terminals/{id}/unlock       (RN-05)
 *
 * Todas las respuestas se normalizan a `{ ok, data, error }` para que la UI no
 * tenga que envolver cada llamada en try/catch.
 */

import { CONFIG } from '../../../shared/config.js';

/** Error de API con el código HTTP y el mensaje del servidor. */
export class ApiError extends Error {
  constructor(mensaje, codigo, detalle) {
    super(mensaje);
    this.name = 'ApiError';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

/**
 * Normaliza un id de usuario a string para la frontera HTTP.
 *
 * Los contratos de candado declaran `usuario_id` como `str` (Pydantic v2 rechaza
 * un número con 422). El usuario que entrega el ERP puede traer el id como número
 * (p. ej. `1`). Esta coerción vive AQUÍ, en la frontera del cliente, para que los
 * hooks no tengan que conocer el tipo exacto que exige el contrato.
 *
 * @param {string|number} usuarioId
 * @returns {string}
 */
function aIdTexto(usuarioId) {
  return usuarioId === null || usuarioId === undefined ? '' : String(usuarioId);
}

/**
 * Ejecuta una petición al API del POS nuevo.
 * @param {string} ruta  Ruta relativa (p. ej. `/catalog/products-for-sale`).
 * @param {object} [opciones]  Opciones de fetch (method, body, …).
 * @returns {Promise<object>}  El JSON de la respuesta.
 */
async function peticion(ruta, opciones = {}) {
  const url = `${CONFIG.API_BASE_URL}${ruta}`;
  const cabeceras = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };

  let respuesta;
  try {
    respuesta = await fetch(url, { ...opciones, headers: cabeceras });
  } catch (causa) {
    throw new ApiError(
      `No se pudo contactar el API del POS nuevo en ${CONFIG.API_BASE_URL}`,
      0,
      causa
    );
  }

  const texto = await respuesta.text();
  let cuerpo = null;
  if (texto) {
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      cuerpo = { detalle: texto };
    }
  }

  if (!respuesta.ok) {
    const mensaje =
      (cuerpo && (cuerpo.detail || cuerpo.detalle || cuerpo.message)) ||
      `Error ${respuesta.status} del API del POS nuevo`;
    throw new ApiError(mensaje, respuesta.status, cuerpo);
  }

  return cuerpo;
}

/** GET /catalog/products-for-sale — contrato 1 (proyección de venta). */
export function getCatalogo(channel = CONFIG.CANAL) {
  const qs = new URLSearchParams({ channel });
  return peticion(`/catalog/products-for-sale?${qs.toString()}`);
}

/** GET /pos/session-active — contrato 9 (sesión de terminal activa). */
export function getSesionActiva(terminalId = CONFIG.TERMINAL_ID) {
  const qs = new URLSearchParams({ terminal_id: terminalId });
  return peticion(`/pos/session-active?${qs.toString()}`);
}

/**
 * POST /pos/tickets — crea el ticket con sus líneas (RN-14..RN-27).
 * @param {{terminal_id: string, channel: string, items: Array<{product_id: string, quantity: number}>}} cuerpo
 */
export function crearVenta(cuerpo) {
  return peticion('/pos/tickets', {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  });
}

/**
 * POST /pos/tickets/{id}/pay — cobra el ticket (RN-23, RN-62/63).
 * @param {string} ticketId
 * @param {{payment_details: object, version: number}} cuerpo
 */
export function cobrarTicket(ticketId, cuerpo) {
  return peticion(`/pos/tickets/${ticketId}/pay`, {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 3.4 — Operaciones ATÓMICAS por ítem (contratos 18–22)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /pos/tickets/{id}/items — añade un ítem (contrato 18, IDEMPOTENTE).
 * Reenviar el mismo `item_id` es un NO-OP en el servidor.
 * @param {string} ticketId
 * @param {{item_id: string, product_id: string, quantity: number, version: number}} cuerpo
 */
export function anadirItem(ticketId, cuerpo) {
  return peticion(`/pos/tickets/${ticketId}/items`, {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  });
}

/**
 * PATCH /pos/tickets/{id}/items/{item_id} — cambia la cantidad (contrato 19).
 * @param {string} ticketId
 * @param {string} itemId
 * @param {{quantity: number, version: number}} cuerpo
 */
export function cambiarCantidad(ticketId, itemId, cuerpo) {
  return peticion(`/pos/tickets/${ticketId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(cuerpo),
  });
}

/**
 * DELETE /pos/tickets/{id}/items/{item_id} — quita un ítem (contrato 20).
 * @param {string} ticketId
 * @param {string} itemId
 * @param {{version: number}} cuerpo
 */
export function quitarItem(ticketId, itemId, cuerpo) {
  return peticion(`/pos/tickets/${ticketId}/items/${itemId}`, {
    method: 'DELETE',
    body: JSON.stringify(cuerpo),
  });
}

/** GET /pos/tickets/{id} — lectura ligera del ticket (contrato 21, 5 campos). */
export function leerTicket(ticketId) {
  return peticion(`/pos/tickets/${ticketId}`);
}

/**
 * POST /pos/tickets/{id}/verify — verificación post-envío (contrato 22).
 * Confirma en BD que el ticket y sus ítems existen antes de limpiar el carrito.
 * @param {string} ticketId
 * @param {{item_ids: string[]}} cuerpo
 */
export function verificarEnvio(ticketId, cuerpo) {
  return peticion(`/pos/tickets/${ticketId}/verify`, {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 3.4 — Candado de terminal + heartbeat (OMEGA)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /pos/terminals/{id}/heartbeat — late mientras la pestaña vive (OMEGA).
 * @param {string} terminalId
 * @param {string} usuarioId
 */
export function latir(terminalId, usuarioId) {
  return peticion(`/pos/terminals/${terminalId}/heartbeat`, {
    method: 'POST',
    body: JSON.stringify({ usuario_id: aIdTexto(usuarioId) }),
  });
}

/**
 * POST /pos/terminals/{id}/lock — toma el candado exclusivo (RN-03).
 * @param {string} terminalId
 * @param {string} usuarioId
 */
export function tomarLock(terminalId, usuarioId) {
  return peticion(`/pos/terminals/${terminalId}/lock`, {
    method: 'POST',
    body: JSON.stringify({ usuario_id: aIdTexto(usuarioId) }),
  });
}

/**
 * POST /pos/terminals/{id}/unlock — libera el candado (RN-05).
 * @param {string} terminalId
 * @param {string} usuarioId
 */
export function liberarLock(terminalId, usuarioId) {
  return peticion(`/pos/terminals/${terminalId}/unlock`, {
    method: 'POST',
    body: JSON.stringify({ usuario_id: aIdTexto(usuarioId) }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 4.2 — Caja (contratos 9–14)
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /cash/active-session — turno de caja abierto (contrato 9). */
export function getSesionCajaActiva() {
  return peticion('/cash/active-session');
}

/**
 * POST /cash/open-session — abre el turno de caja (contrato 10, RN-49/RN-50).
 * @param {{terminal_id: string, usuario_id: string, monto_inicial: number|string}} cuerpo
 */
export function abrirTurno(cuerpo) {
  return peticion('/cash/open-session', {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  });
}

/**
 * POST /cash/movements — registra una entrada o salida (contrato 11, RN-51/RN-55).
 * @param {{cash_session_id: string, tipo: string, monto: number|string, motivo: string}} cuerpo
 */
export function registrarMovimiento(cuerpo) {
  return peticion('/cash/movements', {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  });
}

/** GET /cash/session-summary/{id} — resumen del turno (contrato 12, RN-53). */
export function getResumenTurno(cashSessionId) {
  return peticion(`/cash/session-summary/${cashSessionId}`);
}

/**
 * POST /cash/close-session — cierra el turno con los conteos (contrato 13, RN-54/RN-55).
 * @param {{cash_session_id: string, montos_fisicos: number|string, credito: number|string, debito: number|string}} cuerpo
 */
export function cerrarTurno(cuerpo) {
  return peticion('/cash/close-session', {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  });
}

/** GET /cash/daily-report/{fecha} — reporte del día local (contrato 14, RN-59). */
export function getReporteDiario(fecha) {
  return peticion(`/cash/daily-report/${fecha}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 5.1 — Pizarrón de cuentas abiertas (contrato 23)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /pos/open-accounts — las cuentas OPEN de una terminal (contrato 23).
 *
 * Devuelve una PROYECCIÓN ligera (5 campos por cuenta), no la tabla `tickets`.
 * El pizarrón (F5.3) usa esto para descubrir qué cuentas están "en el corcho".
 *
 * @param {string} terminalId
 */
export function listarCuentasAbiertas(terminalId) {
  const qs = new URLSearchParams({ terminal_id: terminalId });
  return peticion(`/pos/open-accounts?${qs.toString()}`);
}

export default {
  getCatalogo,
  getSesionActiva,
  crearVenta,
  cobrarTicket,
  anadirItem,
  cambiarCantidad,
  quitarItem,
  leerTicket,
  verificarEnvio,
  latir,
  tomarLock,
  liberarLock,
  getSesionCajaActiva,
  abrirTurno,
  registrarMovimiento,
  getResumenTurno,
  cerrarTurno,
  getReporteDiario,
  listarCuentasAbiertas,
  ApiError,
};
