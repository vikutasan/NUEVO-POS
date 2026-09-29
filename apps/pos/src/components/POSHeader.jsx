/**
 * `POSHeader` — interfaz 2 del registro de la superficie (Cabecera).
 *
 * Contenedor raíz declarado: `w-full flex items-center justify-between`.
 *   - MOSTRADOR (≥1024px): 3 zonas (terminal · estado · sesión/red).
 *   - COMPACTO (768–1023px): se oculta el texto de modo.
 *   - MÓVIL (<768px): se ocultan los textos secundarios; quedan los indicadores.
 *
 * Muestra:
 *   - IZQUIERDA: la terminal activa y el botón "Cambiar Estación".
 *   - CENTRO: el ESTADO DE LA CUENTA (NUEVA VENTA / COBRANDO / PAGADA) y el
 *     TIPO DE VENTA (canal: PANADERIA, etc.).
 *   - DERECHA: el estado de sesión y el INDICADOR DE RED (en línea / sin red).
 *
 * R-01: `w-full` en el contenedor raíz (fluido). R-04: el botón de terminal
 * respeta el target táctil de 44×44px.
 */

import React from 'react';

/** Etiquetas humanas del estado de la cuenta. */
const ETIQUETAS_ESTADO = Object.freeze({
  NUEVA_VENTA: 'Nueva Venta',
  COBRANDO: 'Cobrando…',
  PAGADA: 'Venta Cobrada',
});

/**
 * @param {object} props
 * @param {string} props.terminalId - terminal activa (p. ej. "TERM-01").
 * @param {string} [props.estado='NUEVA_VENTA'] - NUEVA_VENTA | COBRANDO | PAGADA.
 * @param {string} [props.tipoVenta] - canal de la venta (RN-13).
 * @param {boolean} [props.sesionAbierta=false] - ¿hay sesión de terminal activa?
 * @param {boolean} [props.enLinea=true] - indicador de red.
 * @param {string} [props.modo] - modo de layout (R-03).
 * @param {() => void} [props.onCambiarEstacion] - abre el selector de terminal.
 */
export default function POSHeader({
  terminalId,
  estado = 'NUEVA_VENTA',
  tipoVenta,
  sesionAbierta = false,
  enLinea = true,
  modo,
  onCambiarEstacion,
}) {
  const etiquetaEstado = ETIQUETAS_ESTADO[estado] || ETIQUETAS_ESTADO.NUEVA_VENTA;
  const nombreTerminal =
    terminalId === 'CAJA' ? 'Caja Central' : `Terminal ${terminalId || '—'}`;

  return (
    <header className="w-full flex items-center justify-between px-4 py-3 bg-fondo-profundo-alt border-b border-white/5 z-20">
      {/* IZQUIERDA: Terminal */}
      <button
        type="button"
        onClick={onCambiarEstacion}
        className="min-h-tactil bg-fondo-profundo border border-white/5 px-6 py-2 rounded-xl flex items-center transition-all group shadow-2xl hover:bg-fondo-panel"
      >
        <div className="text-left">
          <p className="text-[18px] font-black uppercase text-crema-ticket tracking-widest leading-none mb-1">
            {nombreTerminal}
          </p>
          <p className="text-[14px] font-black text-acento uppercase tracking-tighter leading-none">
            Cambiar Estación
          </p>
        </div>
      </button>

      {/* CENTRO: Estado de la cuenta + tipo de venta */}
      <div className="bg-fondo-profundo border border-white/10 px-8 py-2 rounded-3xl shadow-2xl flex flex-col items-center">
        <span className="text-[7px] font-black uppercase text-crema-ticket tracking-[0.5em] mb-0.5">
          Estado de Transaccion
        </span>
        <span className="text-3xl font-black uppercase tracking-tighter italic text-acento drop-shadow-[0_0_12px_rgba(193,215,46,0.4)]">
          {etiquetaEstado}
        </span>
        {tipoVenta ? (
          <span className="hidden sm:inline text-[8px] font-black uppercase text-crema-ticket/50 tracking-[0.3em] mt-0.5">
            {tipoVenta}
          </span>
        ) : null}
      </div>

      {/* DERECHA: Sesión + Red + Modo */}
      <div className="flex items-center gap-2">
        <span
          className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
            sesionAbierta
              ? 'bg-acento text-fondo-profundo shadow-lg'
              : 'bg-peligro text-crema-ticket'
          }`}
        >
          {sesionAbierta ? 'Sesión abierta' : 'Sin sesión'}
        </span>

        {/* Indicador de red (punto + etiqueta) */}
        <span
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-fondo-profundo border border-white/5"
          title={enLinea ? 'En línea' : 'Sin conexión'}
        >
          <span
            aria-hidden="true"
            className={`w-2.5 h-2.5 rounded-full ${
              enLinea ? 'bg-acento' : 'bg-peligro animate-pulse'
            }`}
          />
          <span className="hidden sm:inline text-[9px] font-black uppercase tracking-widest text-crema-ticket/70">
            {enLinea ? 'En línea' : 'Sin red'}
          </span>
        </span>

        {modo ? (
          <span className="hidden sm:inline text-[9px] font-black text-crema-ticket/50 uppercase tracking-widest">
            Modo: {modo}
          </span>
        ) : null}
      </div>
    </header>
  );
}
