/**
 * useTerminals — Hook de gestión de terminales.
 *
 * Responsabilidad: toda la lógica de negocio del selector de terminales.
 * - Polling del estado de terminales (cada 15s)
 * - Selección y lock de terminal
 * - Gestión (agregar, editar, eliminar, guardar)
 *
 * NO contiene JSX (eso va en el componente).
 * NO contiene fetch directo (eso va en el servicio).
 *
 * @see FICHA 12 de ESPECIFICACION_DE_INTERFACES_POS.md
 * @see resolveCardState en utils/terminalCardState.js
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  fetchTerminalStatuses,
  lockTerminal,
  unlockTerminal,
  fetchTerminalConfig,
  saveTerminalConfig,
} from '../services/terminalService.js';
import { resolveCardState, resolveNetStatus } from '../utils/terminalCardState.js';

const POLL_INTERVAL_MS = 15_000;

/** Clave de `localStorage` donde se persiste la preferencia de orden visual. */
export const CLAVE_ORDEN_TERMINALES = 'pos.ordenTerminales';

/** Orden por defecto: de izquierda a derecha (el orden canónico del array). */
export const ORDEN_IZQ_DER = 'izq-der';

/** Orden invertido: de derecha a izquierda (solo afecta al despliegue visual). */
export const ORDEN_DER_IZQ = 'der-izq';

/**
 * Lee la preferencia de orden desde `localStorage`.
 * Devuelve `ORDEN_IZQ_DER` si el valor falta, es inválido o el acceso falla.
 */
export function leerOrdenGuardado() {
  try {
    const valor = localStorage.getItem(CLAVE_ORDEN_TERMINALES);
    return valor === ORDEN_DER_IZQ ? ORDEN_DER_IZQ : ORDEN_IZQ_DER;
  } catch {
    return ORDEN_IZQ_DER;
  }
}

const DEFAULT_TERMINALS = [
  { id: 'T1', name: 'Terminal 1', icon: '🖥️' },
  { id: 'T2', name: 'Terminal 2', icon: '🖥️' },
  { id: 'T3', name: 'Terminal 3', icon: '🖥️' },
  { id: 'T4', name: 'Terminal 4', icon: '🖥️' },
  { id: 'T5', name: 'Terminal 5', icon: '🖥️' },
  { id: 'T6', name: 'Terminal 6', icon: '🖥️' },
];

/**
 * @param {object} currentUser - { id, name, role, permissions }
 * @returns {object} Estado y acciones del selector de terminales
 */
export function useTerminals(currentUser) {
  const [terminals, setTerminals] = useState(DEFAULT_TERMINALS);
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locking, setLocking] = useState(false);
  const [ordenTerminales, setOrdenTerminales] = useState(leerOrdenGuardado);
  const pollRef = useRef(null);

  // Orden de despliegue derivado. NUNCA muta `terminals`: trabaja sobre una copia.
  const terminalesDesplegadas = useMemo(
    () => (ordenTerminales === ORDEN_DER_IZQ ? [...terminals].reverse() : terminals),
    [terminals, ordenTerminales]
  );

  // Persistir la preferencia de orden (best effort: nunca rompe la UI).
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_ORDEN_TERMINALES, ordenTerminales);
    } catch {
      // Silencioso: si localStorage no está disponible, la preferencia es de sesión.
    }
  }, [ordenTerminales]);

  // Alternar el orden de despliegue (izq-der <-> der-izq).
  const invertirOrden = useCallback(() => {
    setOrdenTerminales(prev => (prev === ORDEN_IZQ_DER ? ORDEN_DER_IZQ : ORDEN_IZQ_DER));
  }, []);

  // Cargar configuración y estado al montar
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [config, statusMap] = await Promise.all([
          fetchTerminalConfig().catch(() => DEFAULT_TERMINALS),
          fetchTerminalStatuses().catch(() => ({})),
        ]);
        if (cancelled) return;
        setTerminals(config);
        setStatuses(statusMap);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Polling del estado
  useEffect(() => {
    async function poll() {
      try {
        const statusMap = await fetchTerminalStatuses();
        setStatuses(statusMap);
      } catch {
        // Silencioso en polling: no bloquear la UI por un fallo de red
      }
    }

    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, []);

  // Resolver estado de una tarjeta
  const getCardState = useCallback(
    (terminalId) => resolveCardState(statuses[terminalId], currentUser?.id),
    [statuses, currentUser?.id]
  );

  // Resolver estado de red
  const getNetStatus = useCallback(
    (terminalId) => resolveNetStatus(statuses[terminalId]),
    [statuses]
  );

  // Seleccionar terminal (tomar lock)
  const selectTerminal = useCallback(async (terminalId) => {
    if (!currentUser?.id) return { success: false, message: 'Sin usuario' };
    setLocking(true);
    try {
      const result = await lockTerminal(terminalId, currentUser.id);
      if (result.success) {
        // Refresh statuses after lock
        const statusMap = await fetchTerminalStatuses().catch(() => statuses);
        setStatuses(statusMap);
      }
      return result;
    } catch (err) {
      return { success: false, message: err.message };
    } finally {
      setLocking(false);
    }
  }, [currentUser?.id, statuses]);

  // Liberar terminal
  const releaseTerminal = useCallback(async (terminalId) => {
    if (!currentUser?.id) return;
    try {
      await unlockTerminal(terminalId, currentUser.id);
      const statusMap = await fetchTerminalStatuses().catch(() => statuses);
      setStatuses(statusMap);
    } catch {
      // Best effort
    }
  }, [currentUser?.id, statuses]);

  // --- Gestión de terminales ---

  const addTerminal = useCallback((position = 'end') => {
    setTerminals(prev => {
      const nums = prev
        .filter(t => t.id.startsWith('T'))
        .map(t => parseInt(t.id.replace('T', '')) || 0);
      const nextNum = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
      const newT = { id: `T${nextNum}`, name: `Terminal ${nextNum}`, icon: '🖥️' };
      return position === 'start' ? [newT, ...prev] : [...prev, newT];
    });
  }, []);

  const updateTerminal = useCallback((terminalId, updates) => {
    setTerminals(prev =>
      prev.map(t => t.id === terminalId ? { ...t, ...updates } : t)
    );
  }, []);

  const removeTerminal = useCallback((terminalId) => {
    const status = statuses[terminalId];
    if (status?.occupier_id) {
      return { success: false, reason: 'occupied', message: `Terminal ocupada por ${status.occupier_name}` };
    }
    setTerminals(prev => prev.filter(t => t.id !== terminalId));
    return { success: true };
  }, [statuses]);

  const saveConfig = useCallback(async () => {
    try {
      const result = await saveTerminalConfig(terminals);
      return result;
    } catch (err) {
      return { success: false, message: err.message };
    }
  }, [terminals]);

  return {
    // Estado
    terminals,
    statuses,
    loading,
    error,
    locking,
    // Orden de despliegue (F6.5)
    ordenTerminales,
    terminalesDesplegadas,
    invertirOrden,
    // Resolución
    getCardState,
    getNetStatus,
    // Acciones de selección
    selectTerminal,
    releaseTerminal,
    // Acciones de gestión
    addTerminal,
    updateTerminal,
    removeTerminal,
    saveConfig,
  };
}
