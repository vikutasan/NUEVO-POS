/**
 * Punto de entrada del POS nuevo — Fase 1.
 *
 * Rutas:
 *   /           → TerminalSelector (landing)
 *   /pos        → RetailVisionPOS (pantalla de venta) — Fase 3
 *   /caja       → GestorDeCaja — Fase 4
 *
 * FASE 1 (28 Sep 2026): monta el TerminalSelector como landing page.
 * El cajero selecciona su terminal antes de entrar al POS.
 *
 * El tema se aplica ANTES de montar React (evita parpadeo).
 */

import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import TerminalSelector from './components/TerminalSelector.jsx';
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
    const eleccion = localStorage.getItem('pos_tema') || null;
    const tema = await resolverTema(TEMA_DEL_MODULO, eleccion, null);
    aplicarTema(tema);
  } catch (err) {
    // Si algo falla, el POS sigue funcionando con los valores de index.css.
    console.warn('[theme-engine] No se pudo aplicar el tema:', err.message);
  }
}

// Aplicar tema ANTES de montar React (evita parpadeo).
inicializarTema();

/**
 * App root — gestiona el estado global mínimo (usuario, terminal).
 * El ruteo determina en qué "habitación" del edificio estás.
 */
function App() {
  // TODO(fase2): esto vendrá del login. Por ahora, usuario demo.
  const [currentUser] = useState({
    id: 1,
    name: 'Cajero Demo',
    role: 'ADMIN',
    permissions: { access_any_terminal: 'full', access_terminal_manager: 'full' },
  });
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const navigate = useNavigate();

  function handleTerminalSelected(terminalId) {
    setSelectedTerminal(terminalId);
    navigate('/pos');
  }

  function handleBackToTerminals() {
    setSelectedTerminal(null);
    navigate('/');
  }

  return (
    <Routes>
      <Route path="/" element={
        <TerminalSelector
          currentUser={currentUser}
          onTerminalSelected={handleTerminalSelected}
        />
      } />
      <Route path="/pos" element={
        selectedTerminal
          ? <RetailVisionPOS
              terminalId={selectedTerminal}
              currentUser={currentUser}
              onBackToTerminals={handleBackToTerminals}
            />
          : <TerminalSelector
              currentUser={currentUser}
              onTerminalSelected={handleTerminalSelected}
            />
      } />
    </Routes>
  );
}

const root = document.getElementById('root');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
