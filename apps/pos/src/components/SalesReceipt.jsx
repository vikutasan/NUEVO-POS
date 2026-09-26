/**
 * `SalesReceipt` — interfaz 14 del registro de la superficie (Panel).
 *
 * Contenedor raíz declarado: `w-full max-w-[420px] flex flex-col`.
 *   - MOSTRADOR: panel lateral w-full max-w-[420px].
 *   - COMPACTO:  panel colapsable (botón "Ver ticket").
 *   - MÓVIL:     panel inferior deslizable / pantalla completa.
 *
 * R-01: `w-full max-w-[420px]` es fluido (max-w, no w fijo). La crema del
 * ticket (`#fdfbf7`) es la identidad visual del panel (Documento 7 §2.1).
 *
 * NOTA DE TRAZABILIDAD: el plan de prueba en paralelo (P2.4) cita "interfaces
 * 8 y 15"; el registro de la superficie asigna SalesReceipt=14 y
 * CheckoutScreen=8. Se sigue el registro (fuente de verdad) y se documenta la
 * discrepancia en el §10 del plan.
 */

import React from 'react';

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

/** Calcula el total del ticket (RN-16: suma de subtotales). */
export function calcularTotal(lineas) {
  return lineas.reduce((acc, l) => acc + Number(l.unit_price) * l.quantity, 0);
}

export default function SalesReceipt({
  lineas,
  onIncrementar,
  onDecrementar,
  onQuitar,
  onCobrar,
  cobrando,
  terminalId,
}) {
  const total = calcularTotal(lineas);
  const vacio = lineas.length === 0;

  return (
    <aside className="w-full max-w-[420px] flex flex-col bg-crema-ticket text-fondo-profundo rounded-canon40 overflow-hidden">
      <header className="px-5 py-4 border-b border-fondo-profundo/10 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Ticket</h2>
          <p className="text-xs text-fondo-profundo/60">Terminal {terminalId}</p>
        </div>
        <span className="text-sm font-semibold bg-acento text-fondo-profundo px-3 py-1 rounded-canon35">
          {lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-3">
        {vacio ? (
          <p className="text-center text-fondo-profundo/50 py-10">
            El ticket está vacío. Toca un producto para agregarlo.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {lineas.map((linea) => (
              <li
                key={linea.product_id}
                className="flex items-center gap-3 border-b border-fondo-profundo/10 pb-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{linea.name}</p>
                  <p className="text-xs text-fondo-profundo/60">
                    {formatearPrecio(linea.unit_price)} c/u
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <BotonCantidad etiqueta="−" onClick={() => onDecrementar(linea)} />
                  <span className="w-8 text-center font-bold">{linea.quantity}</span>
                  <BotonCantidad etiqueta="+" onClick={() => onIncrementar(linea)} />
                </div>
                <span className="w-20 text-right font-bold text-sm">
                  {formatearPrecio(Number(linea.unit_price) * linea.quantity)}
                </span>
                <button
                  type="button"
                  onClick={() => onQuitar(linea)}
                  className="min-h-tactil min-w-tactil text-peligro hover:bg-peligro/10 rounded-canon35"
                  aria-label={`Quitar ${linea.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="px-5 py-4 border-t border-fondo-profundo/10 flex flex-col gap-3">
        <div className="flex items-center justify-between text-xl font-bold">
          <span>Total</span>
          <span>{formatearPrecio(total)}</span>
        </div>
        <button
          type="button"
          disabled={vacio || cobrando}
          onClick={onCobrar}
          className="w-full min-h-tactil rounded-canon35 bg-acento text-fondo-profundo font-bold text-lg hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {cobrando ? 'Cobrando…' : 'COBRAR'}
        </button>
      </footer>
    </aside>
  );
}

function BotonCantidad({ etiqueta, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-tactil min-w-tactil rounded-canon35 bg-fondo-profundo/5 hover:bg-acento/30 font-bold text-lg"
      aria-label={etiqueta === '+' ? 'Incrementar cantidad' : 'Decrementar cantidad'}
    >
      {etiqueta}
    </button>
  );
}
