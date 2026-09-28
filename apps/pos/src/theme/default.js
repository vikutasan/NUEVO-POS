/**
 * Tema default del módulo POS — apps/pos/src/theme/default.js
 *
 * Este archivo contiene el tema POR DEFECTO del POS.
 *
 * ESTADO ACTUAL: usa la PALETA CANÓNICA como valor PROVISIONAL.
 * El valor final lo define el dueño en la Fase D (diseño del default).
 * Cuando el dueño apruebe su diseño (Vía A manual o Vía B extractor),
 * estos valores se reemplazan con los aprobados.
 *
 * Los valores son CANALES RGB (ej: "193 215 46"), no hex.
 * Esto es necesario para que Tailwind resuelva las opacidades.
 *
 * Fase 2 — 28 Sep 2026.
 */
export default {
  nombre: 'Default (provisional — paleta canónica)',

  // Los 6 colores (canales RGB).
  acento:           '193 215 46',   // #c1d72e — verde lima
  fondoProfundo:    '10 10 10',     // #0a0a0a — casi negro
  fondoProfundoAlt: '8 8 8',       // #080808 — negro
  fondoPanel:       '26 26 26',     // #1a1a1a — gris oscuro
  cremaTicket:      '253 251 247',  // #fdfbf7 — blanco cálido
  peligro:          '239 68 68',    // #ef4444 — rojo

  // Los 3 radios.
  radioPequeno: '35px',
  radioMedio:   '40px',
  radioGrande:  '50px',

  // Las 2 tipografías.
  fuenteUI:     'Inter, system-ui, sans-serif',
  fuenteTicket: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};
