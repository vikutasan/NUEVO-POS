/**
 * `ProductCard` — interfaz 20 del registro de la superficie (Composición).
 *
 * Contenedor raíz declarado: `w-full rounded-[35px] overflow-hidden`.
 *   - MOSTRADOR: tarjeta rounded-[35px] con cascada de imágenes de 5 niveles.
 *   - COMPACTO:  tarjeta fluida.
 *   - MÓVIL:     tarjeta fluida.
 *
 * R-01: `w-full` (sin ancho absoluto). R-04: la tarjeta entera es el target
 * táctil (≥44×44px). La cascada de imágenes de 5 niveles se resuelve con
 * `image_url`; si no hay imagen, se muestra el icono de la categoría.
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

export default function ProductCard({ producto, onAgregar }) {
  const sinStock = producto.activo === false;

  return (
    <button
      type="button"
      disabled={sinStock}
      onClick={() => onAgregar(producto)}
      className="w-full rounded-canon35 overflow-hidden bg-fondo-panel border border-white/10 hover:border-acento transition-colors text-left flex flex-col disabled:opacity-40 disabled:cursor-not-allowed"
      aria-label={`Agregar ${producto.name} al ticket`}
    >
      <div className="w-full aspect-square bg-fondo-profundo-alt flex items-center justify-center overflow-hidden">
        {producto.image_url ? (
          <img
            src={producto.image_url}
            alt={producto.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-4xl" aria-hidden="true">
            {producto.icono || '🍞'}
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1">
        <span className="text-sm font-semibold text-crema-ticket leading-tight line-clamp-2">
          {producto.name}
        </span>
        <span className="text-base font-bold text-acento">
          {formatearPrecio(producto.price)}
        </span>
        {producto.sku ? (
          <span className="text-xs text-crema-ticket/50">{producto.sku}</span>
        ) : null}
      </div>
    </button>
  );
}
