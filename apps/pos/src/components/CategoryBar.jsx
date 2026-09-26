/**
 * `CategoryBar` — interfaz 21 del registro de la superficie (Composición).
 *
 * Contenedor raíz declarado: `w-full flex items-center gap-2 overflow-x-auto`.
 *   - MOSTRADOR: barra de categorías + botón ESCÁNER IA.
 *   - COMPACTO:  barra con scroll horizontal.
 *   - MÓVIL:     barra con scroll horizontal.
 *
 * R-01: sin anchos absolutos. R-03: los 3 modos son explícitos. R-04: cada
 * botón respeta el target táctil de 44×44px (vía `min-h-tactil`).
 */

import React from 'react';

export default function CategoryBar({ categorias, categoriaActiva, onSeleccionar }) {
  return (
    <div
      className="w-full flex items-center gap-2 overflow-x-auto pb-1"
      role="tablist"
      aria-label="Categorías de productos"
    >
      <BotonCategoria
        etiqueta="Todas"
        icono="🧺"
        activa={categoriaActiva === null}
        onClick={() => onSeleccionar(null)}
      />
      {categorias.map((cat) => (
        <BotonCategoria
          key={cat.id}
          etiqueta={cat.name}
          icono={cat.icon || '📦'}
          activa={categoriaActiva === cat.id}
          onClick={() => onSeleccionar(cat.id)}
        />
      ))}
      <button
        type="button"
        className="ml-auto shrink-0 min-h-tactil px-4 rounded-canon35 bg-fondo-panel text-acento border border-acento/40 hover:bg-acento hover:text-fondo-profundo transition-colors text-sm font-semibold"
        aria-label="Escáner IA"
      >
        📷 ESCÁNER IA
      </button>
    </div>
  );
}

function BotonCategoria({ etiqueta, icono, activa, onClick }) {
  const base =
    'shrink-0 min-h-tactil px-4 rounded-canon35 border transition-colors text-sm font-semibold flex items-center gap-2';
  const estado = activa
    ? 'bg-acento text-fondo-profundo border-acento'
    : 'bg-fondo-panel text-crema-ticket border-white/10 hover:border-acento/60';
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      className={`${base} ${estado}`}
      onClick={onClick}
    >
      <span aria-hidden="true">{icono}</span>
      {etiqueta}
    </button>
  );
}
