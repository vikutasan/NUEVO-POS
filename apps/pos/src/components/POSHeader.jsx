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
 * @param {() => void} [props.onAbrirTema] - abre el panel de tema (F7.5).
 * @param {() => void} [props.onAbrirVoz] - abre el panel de voz (F7.5).
 * @param {() => void} [props.onAbrirCliente] - abre el panel de identificación
 *   del cliente (F8.6). Es la UX heredada del viejo POS (§6.8): el botón vive
 *   en el header, la implementación se reescribe.
 * @param {boolean} [props.clienteIdentificado=false] - ¿hay un cliente ya
 *   identificado en la cuenta en curso? (F8.6). Si es `true`, el botón se
 *   resalta, igual que `pedidoProgramado`.
 * @param {boolean} [props.vozDisponible=true] - ¿está disponible el dictado por
 *   voz? (F7.6.1). Si es `false`, el botón de voz se deshabilita, igual que en
 *   el viejo POS (`#btn-dictado-voz` con `disabled={!voiceAvailable}`).
 *
 * NOTA (F7.6.1): el botón de VISIÓN se retiró del header. La visión es un MODO
 * DE VISTA que se conmuta desde la `CategoryBar` (UX heredada del viejo POS),
 * no un overlay que se abra desde aquí.
 */
export default function POSHeader({
  terminalId,
  estado = 'NUEVA_VENTA',
  tipoVenta,
  sesionAbierta = false,
  enLinea = true,
  modo,
  onCambiarEstacion,
  onAbrirTema,
  onAbrirVoz,
  vozDisponible = true,
  onAbrirPedido,
  pedidoProgramado = false,
  // F12.1 — Selector VENTA DIRECTA / PEDIDO (UX heredada del viejo POS, §6.8).
  // El botón 📌 de programación SOLO aparece cuando el tipo es 'PEDIDO',
  // igual que en `apps/pos/components/POSHeader.jsx` (viejo POS).
  tipoPedido = 'VENTA_DIRECTA',
  onCambiarTipoPedido,
  onLimpiarPedido,
  onAbrirCliente,
  clienteIdentificado = false,
  onAbrirCaja,
  cajaAbierta = false,
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

      {/* CENTRO: Estado de la cuenta + tipo de venta + selector Venta/Pedido */}
      <div className="flex items-center gap-3 flex-1 justify-center">
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
          {/* F12.1 — Badge de pedido tentativo (UX heredada del viejo POS). */}
          {pedidoProgramado ? (
            <span className="text-[8px] font-black uppercase text-acento tracking-widest mt-0.5">
              📦 Pedido tentativo
            </span>
          ) : null}
        </div>

        {/* F12.1 — Selector VENTA DIRECTA / PEDIDO (UX heredada del viejo POS,
            §6.8). Gobierna la aparición del botón 📌 de programación. Al volver
            a VENTA DIRECTA se limpia el bloque de pedido ya capturado. */}
        <div className="flex bg-[#0a0a0a] border border-white/10 rounded-full p-1.5 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)] items-center">
          <button
            type="button"
            id="btn-venta-directa"
            onClick={() => {
              onCambiarTipoPedido?.('VENTA_DIRECTA');
              onLimpiarPedido?.();
            }}
            aria-pressed={tipoPedido === 'VENTA_DIRECTA'}
            className={`min-h-tactil px-5 rounded-full text-[12px] font-black uppercase tracking-widest transition-all duration-300 ${
              tipoPedido === 'VENTA_DIRECTA'
                ? 'bg-acento text-black shadow-[0_2px_10px_rgba(193,215,46,0.3)] border-b-2 border-white/40'
                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            Venta Directa
          </button>
          <button
            type="button"
            id="btn-pedido"
            onClick={() => onCambiarTipoPedido?.('PEDIDO')}
            aria-pressed={tipoPedido === 'PEDIDO'}
            className={`min-h-tactil px-5 rounded-full text-[12px] font-black uppercase tracking-widest transition-all duration-300 ${
              tipoPedido === 'PEDIDO'
                ? 'bg-[#FF8C00] text-black shadow-[0_2px_10px_rgba(255,140,0,0.4)] border-b-2 border-white/40'
                : 'text-[#FF8C00]/40 hover:text-[#FF8C00]/80 hover:bg-[#FF8C00]/10'
            }`}
          >
            📦 Pedido
          </button>
        </div>
        
        {/* F7.5.6 — Programar pedido (puente POS → Pedidos). Movido aquí para coincidir 
            con la UX heredada del viejo POS. Se resalta cuando ya hay un pedido programado. */}
        {tipoPedido === 'PEDIDO' ? (
          <button
            type="button"
            id="btn-programacion-pedido"
            onClick={() => onAbrirPedido?.()}
            className={`min-h-tactil px-5 rounded-2xl flex items-center justify-center transition-all shadow-lg border ${
              pedidoProgramado
                ? 'bg-[#FF8C00] text-black border-[#FF8C00]'
                : 'bg-fondo-profundo border-[#FF8C00]/40 text-[#FF8C00] hover:bg-[#FF8C00]/10'
            }`}
            title={pedidoProgramado ? 'Pedido programado' : 'Programar pedido'}
            aria-label="Programar pedido"
          >
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center leading-none">
                <span className="text-[12px] font-black uppercase tracking-widest">Programación</span>
                <span className="text-[8px] font-black uppercase tracking-[0.3em] opacity-80 mt-0.5">del pedido</span>
              </div>
              <span aria-hidden="true" className="text-[16px] drop-shadow-md">📅</span>
            </div>
          </button>
        ) : null}
      </div>

      {/* DERECHA: Acciones de IA (F7.5/F7.6) + Sesión + Red + Modo */}
      <div className="flex items-center gap-2">
        {/* F4.5.1 — Gestor de Caja (UX heredada del viejo POS, §6.8). Es el
            punto de entrada al turno de caja: sin él, RN-49 impide cobrar.
            Se resalta cuando hay un turno de caja ABIERTO. */}
        <button
          type="button"
          onClick={() => onAbrirCaja?.()}
          className={`min-h-tactil min-w-tactil border rounded-xl px-3 flex items-center justify-center transition-all ${
            cajaAbierta
              ? 'bg-acento text-fondo-profundo border-acento'
              : 'bg-fondo-profundo border-white/5 hover:bg-fondo-panel'
          }`}
          title={cajaAbierta ? 'Caja abierta' : 'Abrir caja'}
          aria-label="Gestor de caja"
        >
          <span aria-hidden="true">💰</span>
        </button>
        {/* Acciones de IA: tema (overlay nuevo) y voz (overlay con gate).
            R-04: target ≥44px. La visión NO vive aquí: es un modo de vista
            que se conmuta desde la CategoryBar (UX heredada del viejo POS). */}

        {/* F8.6 — Identificación del cliente (CRM). UX heredada del viejo POS
            (§6.8): el botón vive en el header. Se resalta cuando ya hay un
            cliente identificado en la cuenta en curso. */}
        <button
          type="button"
          onClick={() => onAbrirCliente?.()}
          className={`min-h-tactil min-w-tactil border rounded-xl px-3 flex items-center justify-center transition-all ${
            clienteIdentificado
              ? 'bg-acento text-fondo-profundo border-acento'
              : 'bg-fondo-profundo border-white/5 hover:bg-fondo-panel'
          }`}
          title={clienteIdentificado ? 'Cliente identificado' : 'Identificar cliente'}
          aria-label="Identificar cliente"
        >
          <span aria-hidden="true">👤</span>
        </button>
        <button
          type="button"
          onClick={() => onAbrirTema?.()}
          className="min-h-tactil min-w-tactil bg-fondo-profundo border border-white/5 rounded-xl px-3 flex items-center justify-center hover:bg-fondo-panel transition-all"
          title="Cambiar tema"
          aria-label="Cambiar tema"
        >
          <span aria-hidden="true">🎨</span>
        </button>
        <button
          type="button"
          onClick={() => onAbrirVoz?.()}
          disabled={!vozDisponible}
          className={`min-h-tactil min-w-tactil border border-white/5 rounded-xl px-3 flex items-center justify-center transition-all ${
            vozDisponible
              ? 'bg-fondo-profundo hover:bg-fondo-panel'
              : 'bg-fondo-profundo/40 opacity-40 cursor-not-allowed'
          }`}
          title={vozDisponible ? 'Dictado por voz' : 'Dictado por voz no disponible'}
          aria-label="Dictado por voz"
        >
          <span aria-hidden="true">🎤</span>
        </button>

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
