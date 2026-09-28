/**
 * Clasificación pura del estado visual de una terminal.
 *
 * Portado del POS viejo: apps/pos/utils/terminalCardState.js
 * Bug original documentado: el ocupante veía su propia terminal como "libre"
 * porque solo había 2 ramas (ocupada/libre) y no 3 (ocupada/mía/libre).
 *
 * Esta función extrae la clasificación a un lugar puro y testeable.
 * No depende de React ni del DOM.
 *
 * @param {object|null|undefined} info - Entrada de terminalStatuses[tid]
 * @param {number|string|null|undefined} currentUserId - ID del usuario actual
 * @returns {'free'|'mine'|'occupied'}
 */
export function resolveCardState(info, currentUserId) {
  if (!info || !info.occupier_id) return 'free';
  if (currentUserId != null && info.occupier_id === currentUserId) return 'mine';
  return 'occupied';
}

/**
 * Determina el estado de conexión de una terminal.
 *
 * Portado del POS viejo: TerminalSelector.jsx getNetStatus()
 * Usa la misma lógica de timeouts (25 min = inactiva, sin lock = disponible).
 *
 * @param {object|null|undefined} info - Entrada de terminalStatuses[tid]
 * @returns {{ color: string, label: string }}
 */
export function resolveNetStatus(info) {
  if (!info || !info.occupier_id) {
    return { color: '#555', label: 'DISPONIBLE' };
  }
  if (info.stale_session) {
    return { color: '#ef4444', label: 'SESIÓN EXPIRADA' };
  }
  if (info.locked_at) {
    const lockTime = new Date(info.locked_at.endsWith('Z') ? info.locked_at : info.locked_at + 'Z');
    const lockAgeMinutes = (Date.now() - lockTime.getTime()) / 60000;
    if (lockAgeMinutes < 25) {
      return { color: '#4ade80', label: 'EN LÍNEA' };
    }
  }
  return { color: '#f59e0b', label: 'INACTIVA' };
}
