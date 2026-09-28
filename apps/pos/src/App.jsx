/**
 * App — Raíz del POS nuevo.
 *
 * Flujo de navegación (Fase 1 + Fase 2):
 *   1. LoginScreen (PIN) → autenticación
 *   2. TerminalSelector → elegir terminal
 *   3. /pos → RetailVisionPOS (Fase 3)
 *
 * El estado de autenticación se gestiona con useAuth.
 * El estado de terminal se gestiona localmente.
 */

import React, { useState, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import LoginScreen from './components/LoginScreen.jsx';
import TerminalSelector from './components/TerminalSelector.jsx';

// Fase 3: lazy load porque aún no está construido
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
  const { currentUser, isAuthenticated, login, logout } = useAuth();
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const navigate = useNavigate();

  // Paso 1: si no estás autenticado → Login
  if (!isAuthenticated) {
    return <LoginScreen onLogin={login} />;
  }

  // Paso 2: si estás autenticado pero no elegiste terminal → Selector
  function handleTerminalSelected(terminalId) {
    setSelectedTerminal(terminalId);
    navigate('/pos');
  }

  function handleBackToTerminals() {
    setSelectedTerminal(null);
    navigate('/');
  }

  function handleLogout() {
    logout();
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
                onLogout={handleLogout}
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
