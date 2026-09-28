import React, { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import TerminalSelector from './components/TerminalSelector.jsx';

export default function App() {
  const [currentUser] = useState({
    id: 1, name: 'Cajero Demo', role: 'ADMIN',
    permissions: { access_any_terminal: 'full', access_terminal_manager: 'full' },
  });

  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/" element={
        <TerminalSelector
          currentUser={currentUser}
          onTerminalSelected={(tid) => navigate('/pos')}
        />
      } />
      <Route path="/pos" element={
        <div style={{ background: '#0a0a0a', color: '#fff', minHeight: '100vh',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          🚧 POS en construcción (Fase 3)
        </div>
      } />
    </Routes>
  );
}
