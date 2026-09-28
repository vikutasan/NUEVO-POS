/**
 * Tema "Nocturno" del módulo POS — apps/pos/src/theme/nocturno.js
 *
 * Pensado para turnos de noche o locales con poca luz.
 * Azul profundo con acento ámbar cálido.
 *
 * Fuente: PROPUESTA_APARIENCIA_POR_MODULO_V4.md §8.2 (Candidata B).
 *
 * Fase 2 — 28 Sep 2026.
 */
export default {
  nombre: 'Nocturno',

  acento:           '240 165 0',    // #f0a500 — ámbar cálido
  fondoProfundo:    '13 27 42',     // #0d1b2a — azul noche
  fondoProfundoAlt: '27 42 58',     // #1b2a3a — azul panel
  fondoPanel:       '27 42 58',     // #1b2a3a — azul panel
  cremaTicket:      '242 246 250',  // #f2f6fa — blanco frío
  peligro:          '230 57 70',    // #e63946 — rojo coral

  radioPequeno: '35px',
  radioMedio:   '40px',
  radioGrande:  '50px',

  fuenteUI:     'Inter, system-ui, sans-serif',
  fuenteTicket: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};
