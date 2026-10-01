/**
 * Pizarrón de cuentas abiertas — FASE 5.3 + FASE 12.6 (paridad de presentación).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ ES
 * ─────────────────────────────────────────────────────────────────────────────
 * El pizarrón de corcho con post-its que muestra las cuentas OPEN de la
 * terminal en curso. Es la versión nueva del `OpenAccountsCorkboard` del viejo
 * POS: la INTEGRACIÓN se hereda (§6.8), la IMPLEMENTACIÓN se reescribe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ (F12.6 — PARIDAD DE PRESENTACIÓN)
 * ─────────────────────────────────────────────────────────────────────────────
 * El pizarrón de F5.3 era un modal plano que solo mostraba folio + total. El
 * viejo POS mostraba un corcho con post-its que llevaban, además: terminal,
 * tipo de pedido, cliente, teléfono, capturista y hora. F12.6 cierra esa
 * brecha: estética (corcho + post-it + pin + rotación) Y datos completos.
 *
 * Los datos viajan por el contrato 23 (`CuentaAbiertaSalida`), que en F12.6 se
 * amplió de 5 a 12 campos escalares. El POS NO lee tablas ajenas (A-02): el
 * nombre del capturista llega ya resuelto y congelado en el ticket.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRATO DE PROPS
 * ─────────────────────────────────────────────────────────────────────────────
 *   terminalId      — la terminal en curso (RN-31: solo sus cuentas OPEN).
 *   servicioCuentas — el servicio del contrato 23 (`listarCuentasAbiertas`).
 *   clienteApi      — el cliente del POS (`leerTicket`) para recuperar.
 *   onRecuperar     — callback con el ticket recuperado.
 *   onCerrar        — callback opcional para cerrar el pizarrón.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REGLAS QUE GOBIERNAN ESTE COMPONENTE
 * ─────────────────────────────────────────────────────────────────────────────
 *   RN-31  — el pizarrón lista SOLO las cuentas OPEN de su terminal.
 *   RN-78  — los instantes viajan en UTC; aquí se formatean a hora local.
 *   R-01   — sin anchos fijos (`w-full max-w-[1000px]`, nunca `w-[Npx]`).
 *   R-04   — objetivo táctil ≥ 44px (`min-h-tactil`).
 *   Regla 15 — "respuesta ligera" = proyección de campos escalares explícitos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL CONTRATO `{outcome, reason}` (PROHIBICIÓN #2)
 * ─────────────────────────────────────────────────────────────────────────────
 * El POS NUNCA usa try/catch para decidir. El hook devuelve `{outcome, reason}`
 * y aquí se decide con `outcome === 'ok'`. El error se traduce a un mensaje
 * humano con `mensajeDeError(reason)`.
 */

import React from 'react';

import useOpenAccounts from '../hooks/useOpenAccounts.js';

/**
 * Rotaciones deterministas de los post-its.
 *
 * POR QUÉ deterministas y no aleatorias: el viejo POS usaba `Math.random()`,
 * lo que hacía que el pizarrón "saltara" en cada re-render y volvía el test
 * inestable. Aquí la rotación depende del ÍNDICE, así que es estable entre
 * renders y verificable en la compuerta.
 */
const ROTACIONES = [
  '-rotate-1',
  'rotate-1',
  '-rotate-2',
  'rotate-2',
  '-rotate-3',
  'rotate-3',
];

/**
 * Color del post-it por terminal — heredado del viejo POS.
 *
 * POR QUÉ: el color es una señal visual de un vistazo ("¿de qué terminal es
 * esta cuenta?"). Se conserva el mapa exacto del viejo POS para no romper la
 * memoria muscular del personal.
 */
const COLOR_POR_TERMINAL = {
  T6: 'bg-yellow-200',
  T5: 'bg-blue-200',
  T4: 'bg-green-200',
  T3: 'bg-pink-200',
  T2: 'bg-purple-200',
  CAJA: 'bg-orange-200',
};

/** Rotación estable para el post-it en la posición `indice`. */
function rotacionDe(indice) {
  return ROTACIONES[indice % ROTACIONES.length];
}

/** Color del post-it según la terminal; amarillo claro si es desconocida. */
function colorDe(terminal) {
  return COLOR_POR_TERMINAL[terminal] || 'bg-yellow-100';
}

/**
 * Formatea un instante UTC a hora local (RN-78).
 *
 * POR QUÉ: el backend guarda y transporta en UTC; la conversión a la zona del
 * usuario es responsabilidad de la capa de presentación. Devuelve '—' si el
 * instante no es válido, para no romper la tarjeta.
 */
function formatearHora(instante) {
  if (!instante) return '—';
  const fecha = new Date(instante);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formatea el total como moneda MXN.
 *
 * POR QUÉ: el total viaja como string decimal (para no perder precisión en el
 * transporte); aquí se convierte a número solo para presentarlo. Si no es
 * numérico, se muestra el valor crudo en vez de 'NaN'.
 */
function formatearTotal(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return String(valor ?? '—');
  return numero.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
  });
}

/**
 * Traduce el `reason` del contrato a un mensaje humano.
 *
 * POR QUÉ: el `reason` es un código estable para la máquina; el usuario merece
 * una frase. El mapa es explícito para que un `reason` nuevo no pase inadvertido.
 */
function mensajeDeError(reason) {
  const mapa = {
    sin_conexion: 'No hay conexión con el servidor.',
    terminal_invalida: 'La terminal no es válida.',
    datos_invalidos: 'Los datos recibidos no son válidos.',
  };
  if (mapa[reason]) return mapa[reason];
  // Un `reason` no mapeado se muestra VERBATIM: puede ser el mensaje crudo de
  // un error de red (p. ej. "red caída"). Tragárselo con un texto genérico
  // escondería el diagnóstico que el cajero necesita para reportar la falla.
  if (typeof reason === 'string' && reason.trim()) return reason;
  return 'No se pudieron cargar las cuentas abiertas.';
}

/**
 * Pizarrón de cuentas abiertas.
 *
 * @param {object} props
 * @param {string} [props.terminalId]
 * @param {object} props.servicioCuentas
 * @param {object} props.clienteApi
 * @param {(ticket: object) => void} [props.onRecuperar]
 * @param {() => void} [props.onCerrar]
 */
export default function OpenAccountsCorkboard({
  terminalId = '',
  servicioCuentas,
  clienteApi,
  onRecuperar,
  onCerrar,
}) {
  const { cuentas, cargando, error, recuperarCuenta } = useOpenAccounts({
    terminalId,
    servicioCuentas,
    clienteApi,
  });

  /**
   * Recupera una cuenta y entrega el ticket al padre.
   *
   * POR QUÉ se decide con `outcome`: el contrato `{outcome, reason}` es la
   * única vía de decisión (PROHIBICIÓN #2). Si la recuperación falla, no se
   * llama al padre: el error ya lo pinta el hook.
   */
  async function manejarRecuperar(id) {
    const resultado = await recuperarCuenta(id);
    if (
      resultado &&
      resultado.outcome === 'ok' &&
      typeof onRecuperar === 'function'
    ) {
      onRecuperar(resultado.data);
    }
  }

  return (
    <div className="w-full max-w-[1000px] mx-auto p-4">
      {/* ── El corcho ───────────────────────────────────────────────────── */}
      <div
        className="rounded-canon40 border-[20px] border-madera-veta bg-madera-panel p-6 shadow-2xl"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgb(var(--madera) / 0.35) 0%, transparent 45%), radial-gradient(circle at 75% 65%, rgb(var(--madera) / 0.30) 0%, transparent 50%)',
        }}
      >
        {/* ── Encabezado ──────────────────────────────────────────────── */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-crema">
              Cuentas en Espera
            </h2>
            <p className="text-sm text-crema/70">
              Pizarrón de Control R de Rico
            </p>
          </div>
          {typeof onCerrar === 'function' && (
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              title="Cerrar"
              className="min-h-tactil min-w-tactil rounded-canon35 bg-peligro/80 px-4 font-bold text-crema hover:bg-peligro"
            >
              ✕
            </button>
          )}
        </div>

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-canon35 border border-peligro bg-peligro/15 px-4 py-3 text-crema"
          >
            {mensajeDeError(error)}
          </div>
        )}

        {/* ── Cargando ────────────────────────────────────────────────── */}
        {cargando && (
          <p className="py-8 text-center text-crema/80">Cargando cuentas…</p>
        )}

        {/* ── Vacío ───────────────────────────────────────────────────── */}
        {!cargando && !error && cuentas.length === 0 && (
          <p className="py-8 text-center text-crema/80">
            No hay cuentas abiertas.
          </p>
        )}

        {/* ── Los post-its ────────────────────────────────────────────── */}
        {!cargando && cuentas.length > 0 && (
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cuentas.map((cuenta, indice) => (
              <li
                key={cuenta.id}
                className={`relative min-h-tactil rounded-canon35 p-4 shadow-lg transition-transform hover:rotate-0 ${colorDe(
                  cuenta.terminal_id,
                )} ${rotacionDe(indice)}`}
              >
                {/* El pin que sujeta el post-it al corcho. */}
                <span
                  aria-hidden="true"
                  className="absolute -top-3 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-red-600 shadow"
                />

                {/* Folio + terminal */}
                <div className="mb-2 flex items-center justify-between">
                  <span
                    data-testid={`folio-${cuenta.id}`}
                    className="font-mono text-lg font-bold text-gray-900"
                  >
                    {cuenta.account_num}
                  </span>
                  {cuenta.terminal_id && (
                    <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold text-gray-800">
                      {cuenta.terminal_id}
                    </span>
                  )}
                </div>

                {/* Tipo de pedido + cliente + teléfono */}
                {cuenta.order_type === 'PEDIDO' && (
                  <div className="mb-2 text-sm text-gray-800">
                    <p className="font-semibold">
                      📦 PEDIDO
                      {cuenta.delivery_type
                        ? ` · ${cuenta.delivery_type}`
                        : ''}
                    </p>
                    {cuenta.customer_name && (
                      <p className="truncate">👤 {cuenta.customer_name}</p>
                    )}
                    {cuenta.customer_phone && (
                      <p className="truncate">📞 {cuenta.customer_phone}</p>
                    )}
                  </div>
                )}

                {/* Capturista + hora */}
                <div className="mb-3 space-y-0.5 text-xs text-gray-700">
                  {cuenta.captured_by_name && (
                    <p className="truncate">📝 {cuenta.captured_by_name}</p>
                  )}
                  <p>🕒 {formatearHora(cuenta.created_at)}</p>
                </div>

                {/* Total */}
                <p
                  data-testid={`total-${cuenta.id}`}
                  className="mb-3 text-right text-xl font-bold text-gray-900"
                >
                  {formatearTotal(cuenta.total)}
                </p>

                {/* Recuperar */}
                <button
                  type="button"
                  onClick={() => manejarRecuperar(cuenta.id)}
                  className="min-h-tactil w-full rounded-canon35 bg-acento px-4 font-bold text-crema hover:brightness-110"
                >
                  Recuperar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
