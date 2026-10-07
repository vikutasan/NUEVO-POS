/**
 * `CheckoutScreen` — interfaz 8 del registro de la superficie (Modal).
 *
 * Contenedor raíz declarado: `w-full max-w-[1100px] mx-auto`.
 *   - MOSTRADOR: modal centrado w-full max-w-[1100px]; columna lateral
 *                w-full lg:w-1/3 (fluida, R-01).
 *   - COMPACTO:  modal w-full max-w-[800px].
 *   - MÓVIL:     modal w-full, 1 columna.
 *
 * FASE 3.4 completa:
 *   - EFECTIVO: campo de recibido + botones rápidos ($50/$100/$200/$500) +
 *     cálculo de CAMBIO en vivo.
 *   - TARJETA / TRANSFERENCIA: sin captura de efectivo; cobra el total exacto.
 *   - VALIDACIÓN: no se puede cobrar en efectivo si el recibido < total; se
 *     muestra el faltante. El botón se deshabilita.
 *   - ERROR: si el cobro falla tras el envío, se muestra el motivo y NO se
 *     cierra el modal (el cajero puede reintentar).
 *
 * FASE 9.1.3 (pagos mixtos) — la cara visible:
 *   - Lista de ABONOS (chips) con método, monto y cambio si es efectivo.
 *   - Botón "Agregar pago" que usa el monto capturado + el método elegido.
 *   - Editar y borrar un abono antes de confirmar.
 *   - Resumen en vivo: total, abonado, FALTANTE y CAMBIO.
 *   - Bloqueo de confirmar si `faltante > 0` (con mensaje claro).
 *   - Se CONSERVA el caso de un solo pago: si el cajero no agrega abonos y
 *     confirma, se envía el pago único de siempre (regresión blindada).
 *   - Se CONSERVA el `TecladoNumerico` de F9.0.2 y los billetes rápidos.
 *
 * FIX "cobro parcial" (7 Oct 2026) — dos defectos de operación:
 *   - D1: no había forma descubrible de ABONAR un pago parcial en efectivo: el
 *     botón "Agregar pago" quedaba enterrado al fondo de la sección y la
 *     captura del abono era un input distinto del de "Efectivo recibido".
 *   - D2: al elegir TARJETA/TRANSFERENCIA DESAPARECÍA el teclado numérico
 *     (estaba dentro del bloque `esEfectivo`), así que el cajero no podía
 *     teclear el monto del abono con el teclado en pantalla.
 *   La corrección unifica la captura: UN solo input de monto + UN solo teclado
 *   SIEMPRE visibles, y el botón "Agregar pago" como acción primaria. El
 *   método elegido solo cambia la etiqueta y el cálculo del cambio.
 *
 * R-01: `w-full max-w-[1100px]` es fluido. R-04: los botones de pago respetan
 * el target táctil de 44×44px. La paleta usa `fondo-panel` (#1a1a1a) y el
 * acento (#c1d72e).
 *
 * @see PLAN_DE_ABORDAJE_FASE_9_1_PAGOS_MIXTOS.md §3.4
 */

import React, { useMemo, useState } from 'react';

import TecladoNumerico from './TecladoNumerico.jsx';
import { useCheckout } from '../hooks/useCheckout.js';
import { METODOS_VALIDOS } from '../services/checkoutService.js';

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

const METODOS_PAGO = [
  { id: 'EFECTIVO', etiqueta: 'Efectivo', icono: '💵' },
  { id: 'TARJETA', etiqueta: 'Tarjeta', icono: '💳' },
  { id: 'TRANSFERENCIA', etiqueta: 'Transferencia', icono: '🏦' },
];

/** Denominaciones rápidas de efectivo (MXN). */
const BILLETES_RAPIDOS = [50, 100, 200, 500];

/** Etiqueta legible de un método de pago. */
function etiquetaMetodo(metodo) {
  const encontrado = METODOS_PAGO.find((m) => m.id === metodo);
  if (encontrado) return encontrado.etiqueta;
  if (metodo === 'DEBITO') return 'Tarjeta (débito)';
  if (metodo === 'CREDITO') return 'Tarjeta (crédito)';
  return metodo;
}

export default function CheckoutScreen({ total, onConfirmar, onCancelar, procesando, error, montoMinimo }) {
  // P5 — El monto mínimo para confirmar. Default: total (pago completo).
  const minimo = (montoMinimo != null && montoMinimo > 0 && montoMinimo < total)
    ? montoMinimo
    : total;
  const [metodo, setMetodo] = useState('EFECTIVO');
  // Captura ÚNICA del monto a abonar (FIX cobro parcial): el teclado y el input
  // nativo escriben aquí, sin importar el método. Antes había dos campos
  // separados ("Efectivo recibido" y "Monto del abono") y el teclado solo
  // existía en efectivo.
  const [montoAbono, setMontoAbono] = useState('');
  const [editandoId, setEditandoId] = useState(null);

  const checkout = useCheckout({ total });
  const { abonos, resumen, puedeCobrar: cuadra, agregarPago, editarPago, borrarPago } =
    checkout;

  const esEfectivo = metodo === 'EFECTIVO';
  const montoCapturado = Number(montoAbono) || 0;

  // ¿Hay abonos agregados? Si no, el flujo es el de un solo pago (regresión).
  const hayAbonos = abonos.length > 0;

  // FIX cobro parcial: el pago único sigue funcionando sin agregar abonos.
  //   - Efectivo: se puede cobrar si el monto capturado cubre el mínimo.
  //   - Tarjeta/Transferencia: se cobra el total exacto (no requiere captura).
  const puedeCobrar = hayAbonos
    ? cuadra
    : !esEfectivo || montoCapturado >= minimo;

  const mensajeValidacion = useMemo(() => {
    if (hayAbonos) {
      if (resumen.faltante > 0) {
        return `Faltan ${formatearPrecio(resumen.faltante)} para cubrir el total.`;
      }
      return null;
    }
    if (!esEfectivo) return null;
    if (montoCapturado === 0) return 'Captura el efectivo recibido.';
    if (montoCapturado < minimo) {
      return `Faltan ${formatearPrecio(minimo - montoCapturado)} para cubrir el mínimo (${formatearPrecio(minimo)}).`;
    }
    return null;
  }, [hayAbonos, resumen.faltante, esEfectivo, montoCapturado, minimo]);

  // FIX "confirmar pago no hace nada" (7 Oct 2026) — el botón CONFIRMAR PAGO
  // se deshabilita cuando los abonos NO cuadran el total, pero el mensaje que
  // lo explicaba vivía SOLO en la columna izquierda (bajo la lista de abonos),
  // lejos del botón. El cajero veía un botón "muerto" y creía que la app no
  // respondía. Este mensaje se muestra JUNTO al botón (columna derecha) para
  // que la causa sea evidente en el mismo lugar donde se hace clic.
  const motivoBloqueo = useMemo(() => {
    if (procesando) return null;
    if (hayAbonos) {
      if (resumen.faltante > 0) {
        return `Faltan ${formatearPrecio(resumen.faltante)} para poder cobrar.`;
      }
      return null;
    }
    if (esEfectivo && montoCapturado < minimo) {
      return `Faltan ${formatearPrecio(minimo - montoCapturado)} para poder cobrar.`;
    }
    return null;
  }, [procesando, hayAbonos, resumen.faltante, esEfectivo, montoCapturado, minimo]);

  /** Método real que se envía al backend (TARJETA → DEBITO por defecto). */
  function metodoCanonico(m) {
    if (m === 'TARJETA') return 'DEBITO';
    return METODOS_VALIDOS.includes(m) ? m : 'EFECTIVO';
  }

  /**
   * FIX "suma_no_cuadra" (7 Oct 2026) — CAUSA REAL: al capturar un monto MAYOR
   * al pendiente (p. ej. total $100 y el cliente entrega $150 para probar el
   * cambio), el abono guardaba `monto = 150` (lo RECIBIDO) en vez de `monto =
   * 100` (lo APLICADO al total). Entonces la suma de `monto` (150) no cuadraba
   * el total (100) → RN-94 → `suma_no_cuadra` y el cobro se abortaba.
   *
   * El diseño (ver `checkoutService.calcularCambio`) es: `monto` = lo que se
   * APLICA al total (nunca más que el pendiente); `recibido` = el efectivo que
   * el cliente entrega; `cambio` = `recibido − monto`. Para EFECTIVO se aplica
   * `min(capturado, pendiente)` y el excedente queda como `recibido` (vuelto).
   * Para TARJETA/TRANSFERENCIA el monto aplicado es el capturado tal cual.
   */
  function montoAplicado(metodoReal, capturado) {
    if (metodoReal !== 'EFECTIVO') return capturado;
    const pendiente = Math.max(0, Math.round((total - resumen.abonado) * 100) / 100);
    return Math.min(capturado, pendiente > 0 ? pendiente : capturado);
  }

  /** Agrega el monto capturado como un abono con el método elegido. */
  function manejarAgregarPago() {
    const capturado = Number(montoAbono);
    if (!Number.isFinite(capturado) || capturado <= 0) return;
    const metodoReal = metodoCanonico(metodo);
    const monto = montoAplicado(metodoReal, capturado);
    const nuevo = agregarPago({
      metodo: metodoReal,
      monto,
      recibido: metodoReal === 'EFECTIVO' ? capturado : null,
    });
    if (nuevo) {
      setMontoAbono('');
      setEditandoId(null);
    }
  }

  /** Carga un abono en el formulario para editarlo. */
  function manejarEditar(abono) {
    setEditandoId(abono.id);
    setMontoAbono(String(abono.monto));
    setMetodo(abono.metodo === 'DEBITO' || abono.metodo === 'CREDITO' ? 'TARJETA' : abono.metodo);
  }

  /** Guarda la edición del abono en curso (mismo criterio que agregar). */
  function manejarGuardarEdicion() {
    const capturado = Number(montoAbono);
    if (!Number.isFinite(capturado) || capturado <= 0) return;
    const metodoReal = metodoCanonico(metodo);
    // Al editar, el pendiente excluye el monto ANTERIOR de este abono.
    const anterior = abonos.find((a) => a.id === editandoId);
    const abonadoSinEste = Math.max(
      0,
      Math.round((resumen.abonado - (Number(anterior?.monto) || 0)) * 100) / 100,
    );
    const pendiente = Math.max(0, Math.round((total - abonadoSinEste) * 100) / 100);
    const monto =
      metodoReal === 'EFECTIVO'
        ? Math.min(capturado, pendiente > 0 ? pendiente : capturado)
        : capturado;
    editarPago(editandoId, {
      metodo: metodoReal,
      monto,
      recibido: metodoReal === 'EFECTIVO' ? capturado : null,
    });
    setMontoAbono('');
    setEditandoId(null);
  }

  /** Cancela la edición en curso. */
  function manejarCancelarEdicion() {
    setMontoAbono('');
    setEditandoId(null);
  }

  /** Confirma el cobro: con abonos envía N pagos; sin abonos, el pago único. */
  function manejarConfirmar() {
    if (hayAbonos) {
      onConfirmar({ abonos });
      return;
    }
    onConfirmar({
      metodo: metodoCanonico(metodo),
      recibido: esEfectivo ? montoCapturado : (minimo < total ? minimo : total),
      cambio: esEfectivo ? Math.max(montoCapturado - minimo, 0) : 0,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-fondo-profundo/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cobro del ticket"
    >
      <div className="w-full max-w-[1100px] mx-auto bg-fondo-panel rounded-canon50 overflow-hidden flex flex-col lg:flex-row">
        {/* Columna principal: métodos de pago */}
        <div className="flex-1 p-6 flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-crema-ticket">Cobrar ticket</h2>

          {error ? (
            <div role="alert" className="rounded-canon35 bg-peligro/20 text-peligro px-4 py-3 text-sm font-semibold">
              {error}
            </div>
          ) : null}

          {/* 1. Método de pago */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {METODOS_PAGO.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetodo(m.id)}
                className={`min-h-tactil rounded-canon35 border px-4 py-3 font-semibold flex items-center justify-center gap-2 transition-colors ${
                  metodo === m.id
                    ? 'bg-acento text-fondo-profundo border-acento'
                    : 'bg-fondo-profundo text-crema-ticket border-white/10 hover:border-acento/60'
                }`}
              >
                <span aria-hidden="true">{m.icono}</span>
                {m.etiqueta}
              </button>
            ))}
          </div>

          {/* 2. Captura del monto (FIX cobro parcial: SIEMPRE visible, sin
              importar el método). El teclado numérico escribe este campo. */}
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-2">
              <span className="text-sm text-crema-ticket/70">
                {esEfectivo ? 'Efectivo recibido' : 'Monto a cobrar'}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.50"
                value={montoAbono}
                onChange={(e) => setMontoAbono(e.target.value)}
                className="min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket px-4 text-lg border border-white/10 focus:border-acento outline-none"
                placeholder="0.00"
              />
            </label>

            {/* Botones rápidos de billetes (solo efectivo) */}
            {esEfectivo ? (
              <div className="grid grid-cols-4 gap-2">
                {BILLETES_RAPIDOS.map((billete) => (
                  <button
                    key={billete}
                    type="button"
                    onClick={() => setMontoAbono(String(billete))}
                    className="min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border border-white/10 hover:border-acento/60 font-bold transition-colors"
                  >
                    ${billete}
                  </button>
                ))}
              </div>
            ) : null}

            {/* Teclado numérico táctil (F9.0.2) — SIEMPRE visible (FIX D2):
                antes vivía dentro del bloque `esEfectivo` y desaparecía al
                elegir tarjeta/transferencia. */}
            <TecladoNumerico
              valor={montoAbono}
              onCambiar={setMontoAbono}
              deshabilitado={procesando}
            />

            {!hayAbonos && mensajeValidacion ? (
              <p className="text-sm text-peligro font-semibold">{mensajeValidacion}</p>
            ) : null}
          </div>

          {/* 3. Abonos del ticket (F9.1.3) — el botón "Agregar pago" es la
              acción primaria y está SIEMPRE disponible (FIX D1). */}
          <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
            <span className="text-sm font-semibold text-crema-ticket/70">
              Abonos del ticket
            </span>

            {/* Lista de abonos agregados */}
            {hayAbonos ? (
              <ul className="flex flex-col gap-2" aria-label="Abonos agregados">
                {abonos.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-canon35 bg-fondo-profundo border border-white/10 px-4 py-2"
                  >
                    <span className="flex flex-col">
                      <span className="text-crema-ticket font-semibold">
                        {etiquetaMetodo(a.metodo)}
                      </span>
                      <span className="text-xs text-crema-ticket/60">
                        {formatearPrecio(a.monto)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => manejarEditar(a)}
                        disabled={procesando}
                        className="min-h-tactil px-3 rounded-canon35 text-crema-ticket border border-white/20 hover:border-acento/60 transition-colors"
                        aria-label={`Editar abono de ${formatearPrecio(a.monto)}`}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => borrarPago(a.id)}
                        disabled={procesando}
                        className="min-h-tactil px-3 rounded-canon35 text-peligro border border-peligro/40 hover:bg-peligro/10 transition-colors"
                        aria-label={`Borrar abono de ${formatearPrecio(a.monto)}`}
                      >
                        Borrar
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-crema-ticket/50">
                Sin abonos: se cobrará el total con el método seleccionado.
              </p>
            )}

            {/* Acción primaria: agregar el monto capturado como abono. */}
            <div className="flex items-center gap-2">
              {editandoId ? (
                <>
                  <button
                    type="button"
                    onClick={manejarGuardarEdicion}
                    disabled={procesando}
                    className="flex-1 min-h-tactil px-4 rounded-canon35 bg-acento text-fondo-profundo font-bold transition hover:brightness-95"
                  >
                    Guardar abono
                  </button>
                  <button
                    type="button"
                    onClick={manejarCancelarEdicion}
                    disabled={procesando}
                    className="min-h-tactil px-4 rounded-canon35 text-crema-ticket border border-white/20 hover:border-peligro hover:text-peligro transition-colors"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={manejarAgregarPago}
                  disabled={procesando || montoCapturado <= 0}
                  className="flex-1 min-h-tactil px-4 rounded-canon35 bg-acento text-fondo-profundo font-bold transition hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + Agregar pago ({esEfectivo ? 'Efectivo' : etiquetaMetodo(metodoCanonico(metodo))})
                </button>
              )}
            </div>

            {hayAbonos && mensajeValidacion ? (
              <p className="text-sm text-peligro font-semibold">{mensajeValidacion}</p>
            ) : null}
          </div>
        </div>

        {/* Columna lateral: resumen y acciones (w-full lg:w-1/3, fluida R-01) */}
        <div className="w-full lg:w-1/3 lg:flex-shrink-0 bg-fondo-profundo p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-crema-ticket/60">Total a cobrar</span>
            <span className="text-3xl font-bold text-acento">{formatearPrecio(total)}</span>
          </div>

          {hayAbonos ? (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-crema-ticket/60">Abonado</span>
                <span className="text-2xl font-bold text-crema-ticket">
                  {formatearPrecio(resumen.abonado)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-crema-ticket/60">Faltante</span>
                <span
                  className={`text-2xl font-bold ${
                    resumen.faltante > 0 ? 'text-peligro' : 'text-crema-ticket'
                  }`}
                >
                  {formatearPrecio(resumen.faltante)}
                </span>
              </div>
              {resumen.cambio > 0 ? (
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-crema-ticket/60">Cambio</span>
                  <span className="text-2xl font-bold text-crema-ticket">
                    {formatearPrecio(resumen.cambio)}
                  </span>
                </div>
              ) : null}
            </>
          ) : esEfectivo ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-crema-ticket/60">Cambio</span>
              <span
                className={`text-2xl font-bold ${
                  montoCapturado - minimo < 0 ? 'text-peligro' : 'text-crema-ticket'
                }`}
              >
                {formatearPrecio(Math.max(montoCapturado - minimo, 0))}
              </span>
            </div>
          ) : null}

          <div className="mt-auto flex flex-col gap-3">
            {/* FIX "confirmar pago no hace nada": el motivo por el que el botón
                está deshabilitado se muestra AQUÍ, junto al botón, no solo en
                la columna izquierda. Sin esto, el cajero ve un botón "muerto". */}
            {motivoBloqueo ? (
              <p
                role="status"
                className="rounded-canon35 bg-peligro/20 text-peligro px-4 py-3 text-sm font-semibold text-center"
              >
                {motivoBloqueo}
              </p>
            ) : null}
            <button
              type="button"
              disabled={!puedeCobrar || procesando}
              onClick={manejarConfirmar}
              className="w-full min-h-tactil rounded-canon35 bg-acento text-fondo-profundo font-bold text-lg hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {procesando ? 'Procesando…' : 'CONFIRMAR PAGO'}
            </button>
            <button
              type="button"
              onClick={onCancelar}
              disabled={procesando}
              className="w-full min-h-tactil rounded-canon35 bg-transparent text-crema-ticket border border-white/20 hover:border-peligro hover:text-peligro transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
