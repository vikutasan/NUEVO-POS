/**
 * Punto de entrada del POS nuevo — P2.1.
 *
 * Monta la pantalla raíz `RetailVisionPOS` (interfaz 1 del registro de la
 * superficie). El flujo E.1 (venta directa) vive dentro de esa pantalla.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import RetailVisionPOS from './RetailVisionPOS.jsx';
import './index.css';

const root = document.getElementById('root');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <RetailVisionPOS />
  </React.StrictMode>
);
