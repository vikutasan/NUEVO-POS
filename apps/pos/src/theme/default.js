/**
 * Tema default del módulo POS — apps/pos/src/theme/default.js
 *
 * FASE D — "Madera Natural"
 *
 * Usa el tono dominante ORIGINAL de la textura wood_bg.jpg del POS viejo:
 * un ámbar/miel cálido (#DEB47C). Como el fondo es CLARO, el texto pasa
 * a ser oscuro (marrón profundo) y el acento se ajusta para contraste.
 *
 * El dueño aprueba o ajusta (28 Sep 2026).
 */
export default {
  nombre: 'Madera Natural (default)',

  // Los 6 colores (canales RGB).
  acento:           '51 105 30',    // #33691E — verde bosque (oscuro sobre madera, familia del verde lima)
  fondoProfundo:    '222 180 124',  // #DEB47C — madera clara (tono dominante de wood_bg.jpg)
  fondoProfundoAlt: '196 154 92',   // #C49A5C — madera media (vetas del grano)
  fondoPanel:       '232 200 153',  // #E8C899 — madera clara (paneles sobre el fondo)
  cremaTicket:      '42 24 16',     // #2A1810 — marrón profundo (texto oscuro sobre fondo claro)
  peligro:          '231 76 60',    // #E74C3C — rojo coral vivo (brillante, muy distinguible del verde)

  // Los 3 radios.
  radioPequeno: '25px',
  radioMedio:   '35px',
  radioGrande:  '50px',



  // Las 2 tipografías.
  fuenteUI:     'Inter, system-ui, sans-serif',
  fuenteTicket: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};
