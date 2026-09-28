/**
 * Tema "Minimal" del módulo POS — apps/pos/src/theme/minimal.js
 *
 * Pensado para quien quiere lo esencial sin adornos.
 * Grises neutros con acento verde lima menos saturado.
 * Radios más pequeños (12px) para un look técnico.
 *
 * Este tema también vive en packages/theme-engine/temas-compartidos/
 * para que otros módulos lo reusen. Aquí se importa desde ahí.
 *
 * Fuente: PROPUESTA_APARIENCIA_POR_MODULO_V4.md §8.3 (Candidata C adaptada).
 *
 * Fase 2 — 28 Sep 2026.
 */
export default {
  nombre: 'Minimal',

  acento:           '163 198 20',   // #a3c614 — lima cítrica
  fondoProfundo:    '17 17 17',     // #111111 — negro neutro
  fondoProfundoAlt: '28 28 28',     // #1c1c1c — gris oscuro
  fondoPanel:       '28 28 28',     // #1c1c1c — gris oscuro
  cremaTicket:      '250 250 250',  // #fafafa — blanco puro
  peligro:          '214 69 69',    // #d64545 — rojo tomate

  radioPequeno: '12px',
  radioMedio:   '16px',
  radioGrande:  '20px',

  fuenteUI:     'Inter, system-ui, sans-serif',
  fuenteTicket: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};
