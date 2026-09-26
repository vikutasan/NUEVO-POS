/**
 * `CheckoutScreen` — interfaz 8 del registro de la superficie (Modal).
 *
 * Contenedor raíz declarado: `w-full max-w-[1100px] mx-auto`.
 *   - MOSTRADOR: modal centrado w-full max-w-[1100px]; columna lateral
 *                w-full lg:w-[320px].
 *   - COMPACTO:  modal w-full max-w-[800px].
 *   - MÓVIL:     modal w-full, 1 columna.
 *
 * R-01: `w-full max-w-[1100px]` es fluido. R-04: los botones de pago respetan
 * el target táctil de 44×44px. La paleta usa `fondo-panel` (#1a1a1a) y el
 * acento (#c1d72e).
 */

import React, { useState } from 'react';

/** Formatea un precio numérico como moneda mexicana. */
function formatearPrecio(valor) {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return '$0.00';
  return numero.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
}

const METODOS_PAGO = [
  { id: 'EFECTIVO', etiqueta: 'Efectivo', icono: '💵' },
  { id: 'TARJETA', etiqueta: 'Tarjeta', icono: '💳' },
  { id: 'TRANSFERENCIA', etiqueta: 'Transferencia', icono: '🏦' },
];

export default function CheckoutScreen({ total, onConfirmar, onCancelar, procesando }) {
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [recibido, setRecibido] = useState('');

  const montoRecibido = Number(recibido) || 0;
  const cambio = metodo === 'EFECTIVO' ? montoRecibido - total : 0;
  const puedeCobrar = metodo !== 'EFECTIVO' || montoRecibido >= total;

  return (
    <div
      className="fixed inset-0 z-50 bg-fondo-profundo/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cobro del ticket"
    >
      <div className="w-full max-w-[1100px] mx-auto bg-fondo-panel rounded-canon50 overflow-hidden flex flex-col lg:flex-row">
        {/* Columna principal: métodos de pago */}
        <div className="flex-1 p-6 flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-crema-ticket">Cobrar ticket</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {METODOS_PAGO.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetodo(m.id)}
                className={`min-h-tactil rounded-canon35 border px-4 py-3 font-semibold flex items-center justify-center gap-2 transition-colors ${
                  metodo === m.id
                    ? 'bg-acento text-fondo-profundo border-acento'
                    : 'bg-fondo-profundo text-crema-ticket border-white/10 hover:border-acento/60'
                }`}
              >
                <span aria-hidden="true">{m.icono}</span>
                {m.etiqueta}
              </button>
            ))}
          </div>

          {metodo === 'EFECTIVO' ? (
            <label className="flex flex-col gap-2">
              <span className="text-sm text-crema-ticket/70">Efectivo recibido</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.50"
                value={recibido}
                onChange={(e) => setRecibido(e.target.value)}
                className="min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket px-4 text-lg border border-white/10 focus:border-acento outline-none"
                placeholder="0.00"
              />
            </label>
          ) : null}
        </div>

        {/* Columna lateral: resumen y acciones (w-full lg:w-[320px]) */}
        <div className="w-full lg:w-[320px] lg:flex-shrink-0 bg-fondo-profundo p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-crema-ticket/60">Total a cobrar</span>
            <span className="text-3xl font-bold text-acento">{formatearPrecio(total)}</span>
          </div>

          {metodo === 'EFECTIVO' ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-crema-ticket/60">Cambio</span>
              <span
                className={`text-2xl font-bold ${
                  cambio < 0 ? 'text-peligro' : 'text-crema-ticket'
                }`}
              >
                {formatearPrecio(Math.max(cambio, 0))}
              </span>
            </div>
          ) : null}

          <div className="mt-auto flex flex-col gap-3">
            <button
              type="button"
              disabled={!puedeCobrar || procesando}
              onClick={() =>
                onConfirmar({
                  metodo,
                  recibido: metodo === 'EFECTIVO' ? montoRecibido : total,
                  cambio: metodo === 'EFECTIVO' ? Math.max(cambio, 0) : 0,
                })
              }
              className="w-full min-h-tactil rounded-canon35 bg-acento text-fondo-profundo font-bold text-lg hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {procesando ? 'Procesando…' : 'CONFIRMAR PAGO'}
            </button>
            <button
              type="button"
              onClick={onCancelar}
              disabled={procesando}
              className="w-full min-h-tactil rounded-canon35 bg-transparent text-crema-ticket border border-white/20 hover:border-peligro hover:text-peligro transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
