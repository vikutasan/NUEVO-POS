/**
 * sessionReset — limpieza espejo explícita (Regla 19).
 *
 * Cicatriz: la "cuenta fantasma". Cuando una operación terminaba (por
 * éxito, por fallo, por timeout o por desmontaje), cada rama de salida
 * limpiaba un subconjunto DISTINTO de refs. El resultado: refs huérfanos
 * que hacían reaparecer una cuenta ya cerrada.
 *
 * La Regla 19 exige que TODA rama de salida limpie EXACTAMENTE los
 * mismos refs. Esta utilidad hace esa simetría verificable: `buildResetPatch`
 * devuelve siempre las mismas claves, sin importar quién la llame.
 *
 * Es pura: no depende de React ni del DOM.
 *
 * @see PLAN_MAESTRO_DEFINITIVO_POS.md §5 (cleanup mirror)
 * @see PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md §4 FASE 3.1
 */

/**
 * Valor inicial canónico de cada ref al resetear.
 * Centralizado para que "limpiar" signifique lo mismo en todas partes.
 */
export const VALOR_INICIAL = Object.freeze({
  carritoRef: null,
  ticketRef: null,
  folioRef: null,
  versionRef: null,
  ultimoEnvioRef: null,
  enviandoRef: null,
});

/**
 * Construye el patch de reset. Devuelve SIEMPRE las mismas claves
 * (las de `VALOR_INICIAL`), garantizando la simetría de limpieza.
 *
 * @param {object} [refs] - refs actuales (solo se usan sus claves)
 * @returns {object} patch con TODAS las claves en su valor inicial
 */
export function buildResetPatch(refs = {}) {
  const patch = {};
  // 1) Todas las claves canónicas, siempre.
  for (const clave of Object.keys(VALOR_INICIAL)) {
    patch[clave] = VALOR_INICIAL[clave];
  }
  // 2) Cualquier ref extra declarado por el llamador también se limpia,
  //    para que un ref nuevo no quede huérfano por olvido.
  for (const clave of Object.keys(refs)) {
    if (!(clave in patch)) patch[clave] = null;
  }
  return patch;
}

/**
 * Aplica el patch a los refs (mutación controlada de `.current`).
 * Acepta refs de React (`{ current }`) o valores planos.
 *
 * @param {object} refs - mapa de refs
 * @param {object} patch - resultado de `buildResetPatch`
 * @returns {object} los mismos refs, ya reseteados
 */
export function aplicarReset(refs, patch) {
  if (!refs || typeof refs !== 'object') {
    throw new TypeError('aplicarReset: `refs` debe ser un objeto');
  }
  for (const [clave, valor] of Object.entries(patch)) {
    const ref = refs[clave];
    if (ref && typeof ref === 'object' && 'current' in ref) {
      ref.current = valor;
    } else {
      refs[clave] = valor;
    }
  }
  return refs;
}

/**
 * Atajo: construye el patch y lo aplica en un solo paso.
 * @param {object} refs
 * @returns {object} los refs reseteados
 */
export function resetearSesion(refs) {
  return aplicarReset(refs, buildResetPatch(refs));
}

export default { buildResetPatch, aplicarReset, resetearSesion, VALOR_INICIAL };
