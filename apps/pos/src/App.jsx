/**
 * App — Raíz del POS nuevo.
 *
 * Flujo de navegación:
 *   / → TerminalSelector → elegir terminal
 *   /pos → RetailVisionPOS (Fase 3)
 *
 * SIN LOGIN PROPIO: cuando el POS se integre al ERP, recibirá
 * currentUser como prop desde el App.jsx del ERP (que ya tiene login).
 * Mientras tanto, usamos un usuario demo hardcodeado.
 *
 * TODO(integración): reemplazar el usuario demo por prop del ERP.
 */

import React, { useState, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import TerminalSelector from './components/TerminalSelector.jsx';
import { useTheme } from './hooks/useTheme.js';

const RetailVisionPOS = lazy(() => import('./RetailVisionPOS.jsx').catch(() => ({
  default: () => (
    <div style={{ background: '#0a0a0a', color: '#fff', minHeight: '100vh',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', gap: '1rem' }}>
      <span style={{ fontSize: '4rem' }}>🚧</span>
      <h2 style={{ fontWeight: 900, fontSize: '1.5rem' }}>POS en construcción</h2>
      <p style={{ opacity: 0.5, fontSize: '0.875rem' }}>Fase 3</p>
    </div>
  ),
})));

export default function App() {
  // F7.1 — cablea el motor de temas: resuelve y aplica el tema al montar.
  // El hook escribe las CSS vars en el contenedor raíz del POS (no en :root).
  useTheme();

  // TODO(integración): recibir como prop del ERP en vez de hardcodear.
  const [currentUser] = useState({
    id: 1,
    name: 'Victor',
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
    <Suspense fallback={
      <div style={{ background: '#0a0a0a', color: '#fff', minHeight: '100vh',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ opacity: 0.4, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.3em', fontSize: '0.8rem' }}>Cargando...</p>
      </div>
    }>
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
    </Suspense>
  );
}
