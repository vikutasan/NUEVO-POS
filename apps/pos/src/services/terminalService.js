/**
 * Servicio de terminales — Capa de contrato con el backend.
 *
 * Responsabilidad: comunicarse con la API de terminales.
 * NO contiene lógica de negocio (eso va en el hook).
 * NO contiene estado de React (eso va en el componente).
 *
 * Endpoints consumidos:
 *   GET  /pos/terminals/status   → estado de todas las terminales
 *   POST /pos/terminals/lock     → tomar lock de una terminal
 *   POST /pos/terminals/unlock   → liberar lock
 *   GET  /pos/terminals/config   → configuración (lista, iconos)
 *   POST /pos/terminals/config   → guardar configuración
 *
 * @see FICHA 12 de ESPECIFICACION_DE_INTERFACES_POS.md
 * @see PLAN_MAESTRO_DEFINITIVO_POS.md §7 Fase 1
 */

const API_BASE_URL = 'http://localhost:5101';

/**
 * Obtiene el estado de ocupación de todas las terminales.
 * @returns {Promise<Object>} Mapa { T1: { occupier_id, occupier_name, locked_at, stale_session }, ... }
 */
export async function fetchTerminalStatuses() {
  const res = await fetch(`${API_BASE_URL}/pos/terminals/status`);
  if (!res.ok) throw new Error(`Terminal status: ${res.status}`);
  return res.json();
}

/**
 * Toma el lock de una terminal para el usuario actual.
 * @param {string} terminalId - ID de la terminal (ej: "T1")
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} { success: bool, message: string }
 */
export async function lockTerminal(terminalId, userId) {
  const res = await fetch(`${API_BASE_URL}/pos/terminals/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terminal_id: terminalId, user_id: userId }),
  });
  if (!res.ok) throw new Error(`Lock terminal: ${res.status}`);
  return res.json();
}

/**
 * Libera el lock de una terminal.
 * @param {string} terminalId - ID de la terminal
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} { success: bool }
 */
export async function unlockTerminal(terminalId, userId) {
  const res = await fetch(`${API_BASE_URL}/pos/terminals/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terminal_id: terminalId, user_id: userId }),
  });
  if (!res.ok) throw new Error(`Unlock terminal: ${res.status}`);
  return res.json();
}

/**
 * Obtiene la configuración de terminales (lista + iconos).
 * @returns {Promise<Array>} [{ id, name, icon }, ...]
 */
export async function fetchTerminalConfig() {
  const res = await fetch(`${API_BASE_URL}/pos/terminals/config`);
  if (!res.ok) throw new Error(`Terminal config: ${res.status}`);
  return res.json();
}

/**
 * Guarda la configuración de terminales.
 * @param {Array} terminals - [{ id, name, icon }, ...]
 * @returns {Promise<Object>} { success: bool }
 */
export async function saveTerminalConfig(terminals) {
  const res = await fetch(`${API_BASE_URL}/pos/terminals/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terminals }),
  });
  if (!res.ok) throw new Error(`Save terminal config: ${res.status}`);
  return res.json();
}
