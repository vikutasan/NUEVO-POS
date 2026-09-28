/**
 * Tema default del módulo POS — apps/pos/src/theme/default.js
 *
 * FASE D — "Madera Oscura Cálida"
 *
 * Inspirado en la estética del POS actual de R de Rico:
 * - El acento verde lima (#c1d72e) se mantiene idéntico.
 * - Los fondos negros fríos se reemplazan por marrones oscuros cálidos,
 *   simulando la textura de madera (wood_bg.jpg) con un color sólido.
 * - El texto blanco se reemplaza por crema cálido (#f5efe3).
 * - El rojo frío se reemplaza por rojo arcilla (#c0392b).
 *
 * La sensación es: "tu POS de siempre, pero con el calor de la madera".
 *
 * El dueño aprueba o ajusta (28 Sep 2026).
 */
export default {
  nombre: 'Madera Oscura (default)',

  // Los 6 colores (canales RGB).
  acento:           '193 215 46',   // #c1d72e — verde lima (idéntico al POS viejo)
  fondoProfundo:    '28 22 19',     // #1c1613 — madera quemada (cálido, no negro frío)
  fondoProfundoAlt: '20 15 12',     // #140f0c — madera noche (más oscuro, cálido)
  fondoPanel:       '42 33 28',     // #2a211c — madera panel (como el #2d1e13 del header Grandeza)
  cremaTicket:      '245 239 227',  // #f5efe3 — crema cálido (no blanco frío)
  peligro:          '192 57 43',    // #c0392b — rojo arcilla (cálido, no #ef4444)

  // Los 3 radios (mantenemos los del POS viejo: 50px modales, 25px botones).
  radioPequeno: '25px',
  radioMedio:   '35px',
  radioGrande:  '50px',


  // Las 2 tipografías.
  fuenteUI:     'Inter, system-ui, sans-serif',
  fuenteTicket: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};
