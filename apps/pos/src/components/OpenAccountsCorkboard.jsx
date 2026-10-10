/**
 * Pizarrón de cuentas abiertas — FASE 5.3 + FASE 12.6 (paridad de presentación).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ ES
 * ─────────────────────────────────────────────────────────────────────────────
 * El pizarrón de corcho con post-its que muestra las cuentas OPEN. Es la
 * versión nueva del `OpenAccountsCorkboard` del viejo POS: la INTEGRACIÓN se
 * hereda (§6.8), la IMPLEMENTACIÓN se reescribe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D1 — CAJA VE TODAS LAS CUENTAS (5 Oct 2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cuando `cajaHabilitada === true`, el pizarrón muestra TODAS las cuentas
 * OPEN de TODAS las terminales. El viejo POS hacía esto: cuando la terminal
 * era CAJA, el header decía "X TOTALES" y listaba todo. El nuevo POS portó
 * este comportamiento pasando `todasLasTerminales: true` al hook.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRATO DE PROPS
 * ─────────────────────────────────────────────────────────────────────────────
 *   terminalId       — la terminal en curso (RN-31: solo sus cuentas OPEN).
 *   cajaHabilitada   — si true, ignora el filtro y muestra TODAS las cuentas.
 *   servicioCuentas  — el servicio del contrato 23 (`listarCuentasAbiertas`).
 *   clienteApi       — el cliente del POS (`leerTicket`) para recuperar.
 *   onRecuperar      — callback con el ticket recuperado.
 *   onCerrar         — callback opcional para cerrar el pizarrón.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REGLAS QUE GOBIERNAN ESTE COMPONENTE
 * ─────────────────────────────────────────────────────────────────────────────
 *   RN-31  — el pizarrón lista SOLO las cuentas OPEN de su terminal (o TODAS
 *            si es CAJA — ver D1 arriba).
 *   RN-78  — los instantes viajan en UTC; aquí se formatean a hora local.
 *   R-01   — sin anchos fijos (`w-full max-w-[1000px]`, nunca `w-[Npx]`).
 *   R-03   — 3 modos explícitos (grid cols: 1 → sm:2 → lg:3).
 *   R-04   — objetivo táctil ≥ 44px (`min-h-tactil`).
 *   DT-09  — tokens semánticos, no colores hardcodeados.
 */

import React from 'react';

import useOpenAccounts from '../hooks/useOpenAccounts.js';
import {
  PALETA_POST_ITS,
  COLOR_SIN_ASIGNAR,
} from '../constants/paletaPostIts.js';

// Re-export para no romper a los consumidores históricos (tests, RetailVisionPOS).
export { PALETA_POST_ITS };

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
 * Color del post-it por terminal — asignación MANUAL (FASE 13.3).
 *
 * POR QUÉ: el color es una señal visual de un vistazo ("¿de qué terminal es
 * esta cuenta?"). El usuario asigna a mano un color de `PALETA_POST_ITS` a cada
 * terminal desde el gestor de terminales; la elección se persiste en el backend
 * (`terminal_config.json`) y llega aquí como la prop `coloresPorTerminal`.
 *
 * Una terminal que NO tenga color asignado sale AMARILLA CLARA
 * (`COLOR_SIN_ASIGNAR`), que es el aviso de "esta terminal no tiene color".
 *
 * BUG-02 (9 Oct 2026): el mapa se heredó del viejo POS con las claves VIEJAS
 * (`T6`, `T3`, …), pero el nuevo POS unificó los ids a `TERM-01..TERM-06`
 * (ver `useTerminals.js`, F7.7d). Se tradujo al vocabulario real.
 * BUG-03 (9 Oct 2026): se adoptó la paleta nueva de la imagen de diseño.
 * FASE 13.3 (9 Oct 2026): el mapa dejó de ser una constante local; ahora se
 * recibe por prop (`coloresPorTerminal`) desde el gestor de terminales.
 */

/** Rotación estable para el post-it en la posición `indice`. */
function rotacionDe(indice) {
  return ROTACIONES[indice % ROTACIONES.length];
}

/**
 * Color del post-it según la terminal.
 *
 * Asignación MANUAL: si la terminal tiene color en `coloresPorTerminal`, usa su
 * color; si no (terminal desconocida o sin color asignado), cae al amarillo
 * claro `COLOR_SIN_ASIGNAR`, que es el aviso visual de "sin color asignado".
 *
 * @param {string} terminal — el id de la terminal (p. ej. `TERM-01`).
 * @param {Record<string, string>} [coloresPorTerminal] — mapa id → token.
 */
export function colorDe(terminal, coloresPorTerminal = {}) {
  return coloresPorTerminal[terminal] || COLOR_SIN_ASIGNAR;
}

/**
 * Formatea un instante UTC a hora local (RN-78).
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
 * Etiqueta de entrega del post-it — heredada del viejo POS.
 *
 * POR QUÉ: el viejo POS mostraba, como línea propia, `🚗 DOMICILIO` o
 * `🏪 PICK UP` según `delivery_type`. El nuevo POS concatenaba el valor CRUDO
 * al badge (`📦 PEDIDO · DOMICILIO`), perdiendo el emoji y la separación visual.
 * Aquí se restaura el mapeo exacto del viejo POS (FIX_PIZARRON_PARIDAD_POSTIT).
 */
function etiquetaEntrega(deliveryType) {
  if (!deliveryType) return null;
  const valor = String(deliveryType).toUpperCase();
  if (valor === 'DOMICILIO' || valor === 'DELIVERY') return '🚗 DOMICILIO';
  if (valor === 'PICKUP' || valor === 'PICK UP' || valor === 'RECOLECCION') {
    return '🏪 PICK UP';
  }
  return String(deliveryType);
}

/**
 * Traduce el `reason` del contrato a un mensaje humano.
 */
function mensajeDeError(reason) {
  const mapa = {
    sin_conexion: 'No hay conexión con el servidor.',
    terminal_invalida: 'La terminal no es válida.',
    datos_invalidos: 'Los datos recibidos no son válidos.',
  };
  if (mapa[reason]) return mapa[reason];
  if (typeof reason === 'string' && reason.trim()) return reason;
  return 'No se pudieron cargar las cuentas abiertas.';
}

/**
 * Pizarrón de cuentas abiertas.
 *
 * @param {object} props
 * @param {string} [props.terminalId]
 * @param {boolean} [props.cajaHabilitada]
 * @param {object} [props.servicioCuentas]
 * @param {object} [props.clienteApi]
 * @param {Record<string, string>} [props.coloresPorTerminal] — mapa id → token
 *   de color (FASE 13.3). Lo construye `RetailVisionPOS` desde la config de
 *   terminales. Si falta, todos los post-its salen amarillos (`COLOR_SIN_ASIGNAR`).
 * @param {(ticket: object) => void} [props.onRecuperar]
 * @param {() => void} [props.onCerrar]
 */
export default function OpenAccountsCorkboard({
  terminalId = '',
  cajaHabilitada = false,
  servicioCuentas,
  clienteApi,
  coloresPorTerminal = {},
  // FIX_PIZARRON_NO_REFRESCA (8 Oct 2026) — Señal externa de refresco. El padre
  // la incrementa al enviar una cuenta al pizarrón; al cambiar, `useOpenAccounts`
  // vuelve a descargar la lista y el post-it nuevo aparece sin cerrar/reabrir.
  refrescarSenal = 0,
  onRecuperar,
  onCerrar,
}) {
  const { cuentas, cargando, error, refrescar, recuperarCuenta } = useOpenAccounts({
    terminalId,
    todasLasTerminales: cajaHabilitada,
    servicioCuentas,
    clienteApi,
    refrescarSenal,
  });

  /**
   * Recupera una cuenta y entrega al padre DOS cosas (F12.10b):
   *   1. `fresco` — la versión FRESCA del servidor (contrato 21, 5 escalares).
   *   2. `postit` — el objeto RICO del pizarrón (contrato 23), que SÍ trae el
   *      contexto de pedido (`order_type`, `delivery_type`, `customer_name`,
   *      `customer_phone`) y el capturista (`captured_by_name`).
   *
   * El contrato 21 devuelve EXACTAMENTE 5 campos escalares (Regla 15), así que
   * el contexto de pedido NO viaja en él. Sin el `postit`, recuperar un PEDIDO
   * perdía su bloque de pedido (hueco F12.10b). El padre adopta la identidad
   * fresca (`id` + `version`) y restaura el contexto desde el `postit`.
   */
  async function manejarRecuperar(cuenta) {
    const resultado = await recuperarCuenta(cuenta.id);
    if (
      resultado &&
      resultado.outcome === 'ok' &&
      typeof onRecuperar === 'function'
    ) {
      onRecuperar(resultado.data, cuenta);
    }
  }

  // D1 — Leyenda del encabezado: CAJA ve TOTALES, terminal normal ve "de esta terminal".
  const leyendaAlcance = cajaHabilitada
    ? `${cuentas.length} cuentas — TODAS las terminales`
    : `${cuentas.length} cuentas — Terminal ${terminalId || '—'}`;

  return (
    <div className="w-full max-w-[1100px] mx-auto p-4">
      {/* ── El corcho ─────────────────────────────────────────────────────
          FIX_PIZARRON_SCROLL (10 Oct 2026) — PARIDAD con el POS viejo: el
          tablero tiene ALTURA ACOTADA (`max-h-[85vh]`) y el grid de post-its
          es el contenedor con scroll (`flex-1 overflow-y-auto`). Antes el
          tablero crecía con el contenido y el scroll quedaba en el modal
          exterior, sin barra lateral visible. */}
      <div
        className="flex max-h-[85vh] flex-col overflow-hidden rounded-[40px] border-[20px] border-madera-veta bg-madera-panel p-4 sm:p-6 lg:p-8 shadow-2xl"
        style={{
          backgroundImage:
            'radial-gradient(circle at 2px 2px, rgba(0,0,0,0.15) 1px, transparent 0), radial-gradient(circle at 10px 10px, rgba(255,255,255,0.05) 1px, transparent 0)',
          backgroundSize: '15px 15px, 40px 40px',
        }}
      >
        {/* ── Encabezado ──────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-col sm:flex-row items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tighter italic text-crema">
              Cuentas en <span className="opacity-40">Espera</span>
            </h2>
            <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-crema/70">
              Pizarrón de Control R de Rico
            </p>
            {/* D1 — Alcance: TOTALES (caja) o terminal */}
            <p className="text-xs md:text-sm font-bold text-crema/50 mt-1">
              {leyendaAlcance}
            </p>
          </div>
          <div className="flex gap-2">
            {/* D4 — Botón refrescar manual */}
            <button
              type="button"
              onClick={refrescar}
              aria-label="Refrescar"
              title="Refrescar cuentas"
              className="min-h-tactil min-w-tactil rounded-[35px] bg-crema/10 px-4 font-bold text-crema hover:bg-crema/20 transition-all"
            >
              🔄
            </button>
            {typeof onCerrar === 'function' && (
              <button
                type="button"
                onClick={onCerrar}
                aria-label="Cerrar"
                title="Cerrar"
                className="min-h-tactil min-w-tactil rounded-[35px] bg-peligro/80 px-4 font-bold text-crema hover:bg-peligro transition-all"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-[35px] border border-peligro bg-peligro/15 px-4 py-3 text-crema"
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
          <div className="py-16 flex flex-col items-center justify-center space-y-4">
            <span className="text-6xl md:text-9xl italic font-black text-crema/20">VACÍO</span>
            <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.5em] text-crema/20">
              No hay cuentas pendientes en el pizarrón
            </p>
          </div>
        )}

        {/* ── Los post-its ──────────────────────────────────────────────
            FIX_PIZARRON_SCROLL (10 Oct 2026) — PARIDAD con el POS viejo.

            POR QUÉ un wrapper y no `flex-1` en el grid: si el grid lleva
            `flex-1`, el navegador lo estira a la altura del tablero y las
            FILAS se comprimen; como cada post-it conserva `aspect-square`
            (alto = ancho de columna), se desbordan de su fila y se ENCIMAN
            unos sobre otros. El scroll debe vivir en un wrapper de altura
            acotada (`flex-1 overflow-y-auto`) y el grid dentro debe tener
            alto automático (`content-start`) con separación amplia para que
            la rotación (±3°) no toque al vecino.

            FIX_PIZARRON_ALTO (10 Oct 2026) — PARIDAD con el POS viejo: el
            post-it es CUADRADO (`aspect-square`, alto = ancho de columna),
            NO una caja de `min-h` fijo. Con `min-h-[11rem]` + `justify-between`
            un pedido con poco texto quedaba estirado y el total se iba al
            fondo, dejando un hueco vacío enorme en medio. El cuadrado se
            ajusta solo al ancho de la columna y el contenido se reparte con
            `justify-between` sin huecos artificiales. */}
        {!cargando && cuentas.length > 0 && (
          <div className="custom-scrollbar flex-1 overflow-y-auto pr-2">
            <ul className="grid content-start grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12 xl:grid-cols-4">
            {cuentas.map((cuenta, indice) => (
              <li
                key={cuenta.id}
                className={`group relative flex aspect-square flex-col justify-between rounded-sm p-4 shadow-[5px_15px_30px_-5px_rgba(0,0,0,0.3)] hover:shadow-[10px_25px_50px_-10px_rgba(0,0,0,0.4)] hover:-translate-y-2 hover:rotate-0 transition-all cursor-pointer lg:p-6 ${colorDe(
                  cuenta.terminal_id,
                  coloresPorTerminal,
                )} ${rotacionDe(indice)}`}
                onClick={() => manejarRecuperar(cuenta)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    manejarRecuperar(cuenta);
                  }
                }}
              >
                {/* El pin que sujeta el post-it al corcho. */}
                <span
                  aria-hidden="true"
                  className="absolute -top-3 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-red-600 shadow-inner border border-red-700 z-20"
                >
                  <span className="absolute top-1 left-1 w-1.5 h-1.5 bg-white/40 rounded-full" />
                </span>

                {/* Folio + terminal */}
                <div className="text-[#3d2b1f]">
                  <div className="flex items-start justify-between mb-2 lg:mb-4">
                    <span
                      data-testid={`folio-${cuenta.id}`}
                      className="text-3xl lg:text-5xl font-black font-mono text-gray-900"
                    >
                      #{(cuenta.account_num || '').slice(-3)}
                    </span>
                    {cuenta.terminal_id && (
                      <span className="text-[10px] md:text-sm font-black bg-black/5 px-2 py-1 rounded-md uppercase tracking-widest opacity-60">
                        {cuenta.terminal_id}
                      </span>
                    )}
                  </div>

                  {/* Tipo de pedido + cliente — PARIDAD con el viejo POS
                      (FIX_PIZARRON_PARIDAD_POSTIT): badge "PEDIDO TENTATIVO",
                      línea de entrega con emoji y SIN teléfono (el viejo no lo
                      mostraba). */}
                  {cuenta.order_type === 'PEDIDO' ? (
                    <div className="mb-2 lg:mb-4">
                      <span className="inline-block bg-orange-600 text-white text-[10px] md:text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-sm mb-1">
                        📦 PEDIDO TENTATIVO
                      </span>
                      {cuenta.customer_name && (
                        <h4 className="text-sm md:text-xl font-black uppercase tracking-tighter leading-none mb-1 text-black truncate">
                          {cuenta.customer_name}
                        </h4>
                      )}
                      {etiquetaEntrega(cuenta.delivery_type) && (
                        <p className="text-[10px] md:text-xs font-bold text-orange-900 uppercase truncate">
                          {etiquetaEntrega(cuenta.delivery_type)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <h4 className="text-sm md:text-lg font-black uppercase tracking-tight leading-tight mb-2 lg:mb-4 opacity-35">
                      CLIENTE LOCAL
                    </h4>
                  )}

                  {/* Capturista + hora */}
                  <div className="space-y-0.5 opacity-50 mt-auto">
                    {cuenta.captured_by_name && (
                      <p className="text-[10px] md:text-xs font-black uppercase truncate flex items-center gap-1">
                        📝 {cuenta.captured_by_name}
                      </p>
                    )}
                    <p className="text-[10px] md:text-xs font-bold italic uppercase flex items-center gap-1">
                      🕒 {formatearHora(cuenta.created_at)}
                    </p>
                  </div>
                </div>

                {/* Total + label */}
                <div className="mt-2 lg:mt-4 pt-2 lg:pt-4 border-t border-[#3d2b1f]/10 flex justify-between items-end">
                  <span
                    data-testid={`total-${cuenta.id}`}
                    className="text-lg lg:text-xl font-black font-mono tracking-tighter text-[#3d2b1f] opacity-45"
                  >
                    {formatearTotal(cuenta.total)}
                  </span>
                  <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest opacity-30">
                    Ver Cuenta →
                  </span>
                </div>

                {/* Esquina doblada (efecto papel) */}
                <div className="absolute bottom-0 right-0 w-6 h-6 lg:w-8 lg:h-8 bg-gradient-to-br from-black/0 to-black/5 rounded-br-sm" />
              </li>
            ))}
            </ul>
          </div>
        )}
      </div>

      {/* FIX_PIZARRON_SCROLL — barra de scroll estilizada, PARIDAD con el
          POS viejo (`apps/pos/OpenAccountsCorkboard.jsx`). */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.18); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.3); }
      `}</style>
    </div>
  );
}
