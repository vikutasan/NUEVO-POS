/**
 * `TecladoTactil` — teclado numérico en pantalla para el Gestor de Caja.
 *
 * FASE 10.6.1 — Paridad de operación del Gestor de Caja.
 *
 * El viejo POS definió este teclado por una NECESIDAD OPERATIVA REAL: el POS
 * corre en pantallas táctiles (kiosco), donde el teclado nativo del sistema es
 * lento, impreciso con dedos y puede estar deshabilitado. La operación se
 * reproduce; la implementación se reescribe con el sistema de diseño canónico
 * (§6.8: la integración se hereda, la implementación se reescribe).
 *
 * Este componente es PURO: no conoce la máquina de foco ni los formularios.
 * Solo muestra el valor en pantalla y emite cada tecla pulsada hacia arriba.
 * La decisión de qué hacer con cada tecla vive en el contenedor
 * (`GestorDeCaja`), igual que en el viejo POS.
 *
 * Teclas emitidas:
 *   - `'0'`..`'9'` y `'.'` → dígitos y punto decimal.
 *   - `'←'`               → borrar el último carácter.
 *   - `'C'`               → limpiar todo.
 *   - `'ENTER'`           → confirmar / avanzar el foco.
 *
 * @see PLAN_DE_ABORDAJE_F10_6_PARIDAD_DE_OPERACION_DE_CAJA.md §5 (F10.6.1)
 */

import React from 'react';

/** Las 12 teclas del bloque numérico, en orden de lectura. */
const TECLAS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0, '←']);

/**
 * @param {object} props
 * @param {string} props.valor        Valor actual del campo enfocado ('' si ninguno).
 * @param {(tecla: string) => void} props.onTecla  Callback al pulsar una tecla.
 * @param {boolean} [props.activo]    Si hay un campo enfocado (habilita el teclado).
 * @param {string} [props.etiqueta]   Texto del campo enfocado (ej. "Fondo inicial").
 */
export default function TecladoTactil({ valor = '', onTecla, activo = false, etiqueta = '' }) {
  const mostrar = activo ? String(valor || '') || '0.00' : '---';

  return (
    <section
      aria-label="Teclado táctil"
      className="bg-fondo-panel rounded-canon50 p-6 flex flex-col gap-4"
    >
      <h2 className="text-xl font-bold text-crema-ticket">Teclado táctil</h2>

      {/* Display "Valor en Pantalla" — refleja el campo enfocado. */}
      <div className="rounded-canon35 bg-fondo-profundo border border-white/10 py-4 text-center">
        <p className="text-[10px] font-black uppercase tracking-widest text-crema-ticket/40 mb-1">
          {activo && etiqueta ? etiqueta : 'Valor en pantalla'}
        </p>
        <p
          className="text-3xl font-black font-mono tracking-tighter text-acento"
          data-testid="teclado-display"
        >
          {mostrar}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TECLAS.map((tecla) => (
          <button
            key={tecla}
            type="button"
            onClick={() => onTecla(String(tecla))}
            disabled={!activo}
            aria-label={`Tecla ${tecla}`}
            className="min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border border-white/10 font-bold text-lg hover:border-acento/60 disabled:opacity-40"
          >
            {tecla}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onTecla('C')}
          disabled={!activo}
          aria-label="Tecla C"
          className="min-h-tactil rounded-canon35 bg-peligro/20 text-peligro border border-peligro/40 font-bold text-lg disabled:opacity-40"
        >
          C
        </button>
        <button
          type="button"
          onClick={() => onTecla('ENTER')}
          disabled={!activo}
          aria-label="Tecla ENTER"
          className="col-span-2 min-h-tactil rounded-canon35 bg-acento text-fondo-profundo font-black uppercase tracking-wider disabled:opacity-40"
        >
          ENTER / CONTINUAR
        </button>
      </div>
    </section>
  );
}
