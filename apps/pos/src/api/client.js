/**
 * Cliente del API del POS nuevo — P2.5.
 *
 * Habla con el API PROPIO del POS nuevo (`CONFIG.API_BASE_URL`), nunca con el
 * del ERP. Expone las operaciones del flujo E.1 (venta directa):
 *
 *   - `getCatalogo()`      → GET  /catalog/products-for-sale   (contrato 1)
 *   - `getSesionActiva()`  → GET  /pos/session-active          (contrato 9)
 *   - `crearVenta()`       → POST /pos/tickets                 (RN-14..RN-27)
 *   - `cobrarTicket()`     → POST /pos/tickets/{id}/pay        (RN-23, RN-62/63)
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

export default {
  getCatalogo,
  getSesionActiva,
  crearVenta,
  cobrarTicket,
  ApiError,
};
