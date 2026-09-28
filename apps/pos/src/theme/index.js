/**
 * Contrato de temas del módulo POS — apps/pos/src/theme/index.js
 *
 * Este es el "formulario" que el POS llena para decirle al motor
 * qué temas tiene. Es la ÚNICA fuente de verdad del módulo sobre
 * sus temas disponibles.
 *
 * REGLAS:
 * - El default SIEMPRE está en 'permitidos'.
 * - Hay entre 1 y 3 permitidos (1 default + hasta 2 opcionales).
 * - Cada nombre en 'permitidos' tiene su loader en 'temas'.
 * - Si ofreceSelector es false, permitidos tiene exactamente 1.
 * - Un módulo NUNCA importa el motor de otro módulo.
 *
 * ESTADO ACTUAL:
 * - ofreceSelector: true (el POS ofrece cambiar de tema).
 * - 3 temas: default (provisional/canónica), nocturno, minimal.
 * - El default se reemplazará cuando el dueño apruebe su diseño (Fase D).
 *
 * Fase 2 — 28 Sep 2026.
 */

export const TEMA_DEL_MODULO = {
  /** Nombre del módulo. Debe coincidir con la carpeta. */
  modulo: 'pos',

  /** El tema con el que nace el módulo. Debe estar en 'permitidos'. */
  default: 'default',

  /**
   * ¿El módulo ofrece cambiar de tema?
   * Si es false, no hay selector y permitidos tiene exactamente 1.
   * Si es true, se muestra el ThemeSelector (Fase 4).
   */
  ofreceSelector: true,

  /**
   * Los temas que el usuario puede elegir.
   * Máximo 3: el default + hasta 2 opcionales.
   */
  permitidos: ['default', 'nocturno', 'minimal'],

  /**
   * Mapa de nombre → loader del tema.
   * Se usa import() dinámico para que los temas opcionales
   * no aumenten el bundle inicial (lazy loading).
   * El default se importa estáticamente (siempre está en el bundle).
   */
  temas: {
    default:  () => import('./default.js'),
    nocturno: () => import('./nocturno.js'),
    minimal:  () => import('./minimal.js'),
  },
};
