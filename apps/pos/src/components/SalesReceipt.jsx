/**
 * `SalesReceipt` — interfaz 14 del registro de la superficie (Panel).
 *
 * Réplica estética del POS viejo:
 *   - Fondo crema (#fdfbf7) con texto negro, fuente mono.
 *   - Borde zigzag en la parte superior (SVG).
 *   - Encabezado con "R DE RICO" en font-black uppercase + "Ticket de Venta".
 *   - Líneas con cantidad grande (3xl) + nombre uppercase + importe.
 *   - Ticket vacío: "★ El ticket esta vacio ★" con borde dashed.
 *   - Footer con total + botón COBRAR verde.
 *
 * FASE 3.4 añade:
 *   - EDICIÓN DE CANTIDAD: botones − / + por línea (target táctil ≥44px).
 *   - BANNER DE ESTADO: aviso persistente (fijo, no auto-ocultable) cuando hay
 *     un error de persistencia o ítems no verificados (Regla 19 / prohibición #2).
 *
 * R-01: `w-full max-w-[420px]` es fluido. R-04: botones ≥ 44px.
 */

import React from 'react';

/** Formatea un precio numérico como moneda mexicana. */
function formatearPrecio(valor) {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return '$0.00';
  return `$${numero.toFixed(2)}`;
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
  banner,
}) {
  const total = calcularTotal(lineas);
  const vacio = lineas.length === 0;

  return (
    <aside className="w-full max-w-[420px] flex flex-col bg-crema-ticket text-fondo-profundo shadow-2xl relative border-l border-fondo-profundo/10 overflow-visible transition-all duration-500 font-mono z-50">

      {/* Borde zigzag superior (como el ticket viejo) */}
      <div className="absolute top-[-14px] left-0 right-0 w-full overflow-hidden" style={{ height: '14px' }}>
        <svg viewBox="0 0 420 14" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <path d="M0,14 L10,0 L20,14 L30,0 L40,14 L50,0 L60,14 L70,0 L80,14 L90,0 L100,14 L110,0 L120,14 L130,0 L140,14 L150,0 L160,14 L170,0 L180,14 L190,0 L200,14 L210,0 L220,14 L230,0 L240,14 L250,0 L260,14 L270,0 L280,14 L290,0 L300,14 L310,0 L320,14 L330,0 L340,14 L350,0 L360,14 L370,0 L380,14 L390,0 L400,14 L410,0 L420,14 Z" fill="rgb(var(--crema-ticket))" />
        </svg>
      </div>

      {/* BANNER DE ESTADO: persistente, no se auto-oculta (Regla 19) */}
      {banner ? (
        <div
          role="alert"
          className={`px-6 py-2 text-[11px] font-black uppercase tracking-wider border-b-2 ${
            banner.tipo === 'error'
              ? 'bg-peligro/15 text-peligro border-peligro/40'
              : 'bg-acento/20 text-fondo-profundo border-acento/50'
          }`}
        >
          {banner.mensaje}
        </div>
      ) : null}

      {/* Encabezado: R DE RICO — Ticket de Venta */}
      <header className="px-6 pt-6 pb-3 border-b-[1.5px] border-dashed border-fondo-profundo/30 flex justify-between items-start -mt-0">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-fondo-profundo/10 rounded-full flex items-center justify-center text-2xl">🏪</div>
          <div className="flex flex-col justify-center pt-1">
            <h2 className="text-base font-black uppercase tracking-widest leading-none text-fondo-profundo">R DE RICO</h2>
            <h3 className="text-[11px] font-bold text-fondo-profundo/50 uppercase tracking-widest mt-1">Ticket de Venta</h3>
          </div>
        </div>
        <div className="flex flex-col items-end justify-center text-xs text-fondo-profundo/50 pt-1">
          <p className="leading-none mb-1 font-black">Term {terminalId || '01'}</p>
          <p className="leading-none">{new Date().toLocaleDateString()}</p>
        </div>
      </header>

      {/* Encabezado de columnas */}
      <div className="flex justify-between text-xs text-fondo-profundo/60 font-black border-b-2 border-fondo-profundo/20 pb-2 pt-2 mb-1 uppercase tracking-wider px-6">
        <span>Cant. - Articulo</span>
        <span>Importe</span>
      </div>

      {/* Líneas del ticket */}
      <div className="flex-1 overflow-y-auto px-6 py-3">
        {vacio ? (
          <div className="h-full flex flex-col items-center justify-center text-fondo-profundo/40 space-y-4">
            <p className="font-mono text-xs uppercase text-center border-2 border-dashed border-fondo-profundo/20 p-4 w-full">
              ★ El ticket esta vacio ★
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {lineas.map((linea) => (
              <li key={linea.item_id || linea.product_id} className="flex justify-between items-start group">
                <div className="flex gap-3 w-3/4">
                  {/* EDICIÓN DE CANTIDAD: − cantidad + (target táctil ≥44px) */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Quitar una unidad de ${linea.name}`}
                      onClick={() => onDecrementar(linea)}
                      className="min-h-tactil min-w-tactil flex items-center justify-center rounded-full bg-fondo-profundo/10 text-fondo-profundo font-black text-xl leading-none hover:bg-fondo-profundo/20 active:scale-95 transition-all"
                    >
                      −
                    </button>
                    <div className="font-black min-w-[40px] text-center text-3xl leading-none">
                      {linea.quantity}x
                    </div>
                    <button
                      type="button"
                      aria-label={`Añadir una unidad de ${linea.name}`}
                      onClick={() => onIncrementar(linea)}
                      className="min-h-tactil min-w-tactil flex items-center justify-center rounded-full bg-fondo-profundo/10 text-fondo-profundo font-black text-xl leading-none hover:bg-fondo-profundo/20 active:scale-95 transition-all"
                    >
                      +
                    </button>
                  </div>
                  <div>
                    <p className="font-black text-lg uppercase leading-tight text-fondo-profundo/90">{linea.name}</p>
                    <p className="text-base text-fondo-profundo/50 uppercase">{formatearPrecio(linea.unit_price)} c/u</p>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end">
                  <p className="font-black text-2xl">{formatearPrecio(Number(linea.unit_price) * linea.quantity)}</p>
                  <button
                    type="button"
                    onClick={() => onQuitar(linea)}
                    className="text-[9px] text-peligro font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity mt-1 hover:underline"
                  >
                    [ Quitar ]
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer: Total + COBRAR */}
      <footer className="px-6 py-4 border-t-2 border-dashed border-fondo-profundo/30 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase text-fondo-profundo/40 tracking-widest">Caja de Habilitada</span>
            <span className="text-xl font-black uppercase">COBRAR</span>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight">{formatearPrecio(total)}</span>
        </div>
        <button
          type="button"
          disabled={vacio || cobrando}
          onClick={onCobrar}
          className="w-full min-h-[60px] rounded-canon35 bg-acento text-fondo-profundo font-black text-xl uppercase tracking-widest hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xl active:scale-95"
        >
          {cobrando ? '⏳ Cobrando…' : '💰 ENVIAR CUENTA'}
        </button>
      </footer>
    </aside>
  );
}
