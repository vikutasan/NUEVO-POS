/**
 * `CheckoutScreen` — interfaz 8 del registro de la superficie (Modal).
 *
 * Contenedor raíz declarado: `w-full max-w-[1100px] mx-auto`.
 *   - MOSTRADOR: modal centrado w-full max-w-[1100px]; columna lateral
 *                w-full lg:w-1/3 (fluida, R-01).
 *   - COMPACTO:  modal w-full max-w-[800px].
 *   - MÓVIL:     modal w-full, 1 columna.
 *
 * FASE 3.4 completa:
 *   - EFECTIVO: campo de recibido + botones rápidos ($50/$100/$200/$500) +
 *     cálculo de CAMBIO en vivo.
 *   - TARJETA / TRANSFERENCIA: sin captura de efectivo; cobra el total exacto.
 *   - VALIDACIÓN: no se puede cobrar en efectivo si el recibido < total; se
 *     muestra el faltante. El botón se deshabilita.
 *   - ERROR: si el cobro falla tras el envío, se muestra el motivo y NO se
 *     cierra el modal (el cajero puede reintentar).
 *
 * R-01: `w-full max-w-[1100px]` es fluido. R-04: los botones de pago respetan
 * el target táctil de 44×44px. La paleta usa `fondo-panel` (#1a1a1a) y el
 * acento (#c1d72e).
 */

import React, { useMemo, useState } from 'react';

import TecladoNumerico from './TecladoNumerico.jsx';

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

/** Denominaciones rápidas de efectivo (MXN). */
const BILLETES_RAPIDOS = [50, 100, 200, 500];

export default function CheckoutScreen({ total, onConfirmar, onCancelar, procesando, error }) {
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [recibido, setRecibido] = useState('');

  const montoRecibido = Number(recibido) || 0;
  const esEfectivo = metodo === 'EFECTIVO';
  const cambio = esEfectivo ? montoRecibido - total : 0;
  const faltante = esEfectivo ? Math.max(total - montoRecibido, 0) : 0;
  const puedeCobrar = !esEfectivo || montoRecibido >= total;

  const mensajeValidacion = useMemo(() => {
    if (!esEfectivo) return null;
    if (montoRecibido === 0) return 'Captura el efectivo recibido.';
    if (faltante > 0) return `Faltan ${formatearPrecio(faltante)} para cubrir el total.`;
    return null;
  }, [esEfectivo, montoRecibido, faltante]);

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

          {error ? (
            <div role="alert" className="rounded-canon35 bg-peligro/20 text-peligro px-4 py-3 text-sm font-semibold">
              {error}
            </div>
          ) : null}

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

          {esEfectivo ? (
            <div className="flex flex-col gap-3">
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

              {/* Botones rápidos de billetes */}
              <div className="grid grid-cols-4 gap-2">
                {BILLETES_RAPIDOS.map((billete) => (
                  <button
                    key={billete}
                    type="button"
                    onClick={() => setRecibido(String(billete))}
                    className="min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border border-white/10 hover:border-acento/60 font-bold transition-colors"
                  >
                    ${billete}
                  </button>
                ))}
              </div>

              {/* Teclado numérico táctil (F9.0.2) — alternativa al input nativo */}
              <TecladoNumerico
                valor={recibido}
                onCambiar={setRecibido}
                deshabilitado={procesando}
              />

              {mensajeValidacion ? (
                <p className="text-sm text-peligro font-semibold">{mensajeValidacion}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Columna lateral: resumen y acciones (w-full lg:w-1/3, fluida R-01) */}
        <div className="w-full lg:w-1/3 lg:flex-shrink-0 bg-fondo-profundo p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-crema-ticket/60">Total a cobrar</span>
            <span className="text-3xl font-bold text-acento">{formatearPrecio(total)}</span>
          </div>

          {esEfectivo ? (
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
                  recibido: esEfectivo ? montoRecibido : total,
                  cambio: esEfectivo ? Math.max(cambio, 0) : 0,
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
