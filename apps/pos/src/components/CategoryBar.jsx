/**
 * `CategoryBar` — interfaz 21 del registro de la superficie (Composición).
 *
 * Réplica estética del POS viejo: tabs horizontales oscuras con la activa
 * en verde lima (#c1d72e), texto font-black uppercase tracking-widest.
 *
 * R-01: sin anchos absolutos. R-03: los 3 modos son explícitos. R-04: cada
 * botón respeta el target táctil de 44×44px (vía `min-h-tactil`).
 */

import React from 'react';

export default function CategoryBar({
  categorias,
  categoriaActiva,
  onSeleccionar,
  onExportarPDF = null,
}) {
  return (
    <div
      className="w-full flex items-center gap-2 overflow-x-auto pb-1"
      role="tablist"
      aria-label="Categorías de productos"
    >
      {/* Botón ESCÁNER IA (como el viejo) */}
      <button
        type="button"
        className={`shrink-0 min-h-tactil px-6 py-3 rounded-lg text-[18px] font-black uppercase tracking-widest transition-all whitespace-nowrap shadow-xl flex items-center gap-2 ${
          categoriaActiva === null
            ? 'bg-acento text-fondo-profundo shadow-acento/20'
            : 'bg-white/5 text-crema-ticket/90 hover:bg-white/10'
        }`}
        role="tab"
        aria-selected={categoriaActiva === null}
        onClick={() => onSeleccionar(null)}
      >
        📷 Escáner IA
      </button>

      {categorias.map((cat) => (
        <button
          key={cat.id}
          type="button"
          role="tab"
          aria-selected={categoriaActiva === cat.id}
          onClick={() => onSeleccionar(cat.id)}
          className={`shrink-0 min-h-tactil px-6 py-3 rounded-lg text-[18px] font-black uppercase tracking-widest transition-all whitespace-nowrap drop-shadow-sm ${
            categoriaActiva === cat.id
              ? 'bg-acento text-fondo-profundo'
              : 'bg-white/5 text-crema-ticket/90 hover:bg-white/10'
          }`}
        >
          {cat.name}
        </button>
      ))}

      {/* Botón EXPORTAR PDF (F6.3): abre el selector de categorías de la carta. */}
      {onExportarPDF && (
        <button
          type="button"
          onClick={onExportarPDF}
          className="shrink-0 min-h-tactil px-6 py-3 rounded-lg text-[18px] font-black uppercase tracking-widest transition-all whitespace-nowrap shadow-xl flex items-center gap-2 bg-white/5 text-crema-ticket/90 hover:bg-white/10"
          aria-label="Exportar carta a PDF"
        >
          📄 Exportar PDF
        </button>
      )}
    </div>
  );
}
