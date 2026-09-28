/**
 * Punto de entrada del POS nuevo — P2.1 / Fase 2.
 *
 * Monta la pantalla raíz `RetailVisionPOS` (interfaz 1 del registro de la
 * superficie). El flujo E.1 (venta directa) vive dentro de esa pantalla.
 *
 * FASE 2 (28 Sep 2026): al montar, resuelve el tema del módulo POS
 * (default o el elegido por el usuario) y lo aplica como variables CSS.
 * Esto conecta el theme-engine con la UI real.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import RetailVisionPOS from './RetailVisionPOS.jsx';
import './index.css';

// Theme engine (motor compartido).
import { aplicarTema, resolverTema } from '../../../packages/theme-engine/index.js';
// Contrato del módulo POS.
import { TEMA_DEL_MODULO } from './theme/index.js';

/**
 * Inicializa el tema del POS.
 * 1. Lee la elección del usuario (localStorage, nivel 1).
 * 2. Resuelve el tema (módulo → identidad → canónica).
 * 3. Lo aplica como variables CSS en :root.
 */
async function inicializarTema() {
  try {
    // Nivel 1: leer elección del navegador (Fase 4 — persistencia rápida).
    const eleccion = localStorage.getItem('pos_tema') || null;

    // Resolver: contrato del módulo + elección + identidad (null por ahora).
    const tema = await resolverTema(TEMA_DEL_MODULO, eleccion, null);

    // Aplicar: escribe los 6 canales RGB como variables CSS.
    aplicarTema(tema);
  } catch (err) {
    // Si algo falla, el POS sigue funcionando con los valores de index.css.
    console.warn('[theme-engine] No se pudo aplicar el tema:', err.message);
  }
}

// Aplicar tema ANTES de montar React (evita parpadeo).
inicializarTema();

const root = document.getElementById('root');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <RetailVisionPOS />
  </React.StrictMode>
);
