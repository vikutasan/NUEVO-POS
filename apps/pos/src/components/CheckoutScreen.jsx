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

/**
 * Redondea a 2 decimales (frontera del dinero, DT-02).
 *
 * FIX "suma_no_cuadra" (4ª vuelta, 7 Oct 2026): el pago único enviaba
 * `monto = Math.min(capturado, total)` SIN redondear. Como `total` puede venir
 * con error de coma flotante (p. ej. `99.99000000000001`), el backend recibía
 * `Decimal("99.99000000000001")` y RN-94 lo rechazaba contra `Decimal("99.99")`.
 * Todo monto que cruce la frontera se redondea con esta función.
 */
function redondear2(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

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

/**
 * F9.1.5.0 — Métodos de pago de primer nivel (UX heredada del viejo POS).
 *
 * El viejo POS desdobla la tarjeta en DEBITO / CREDITO (y un QR que el nuevo
 * POS NUNCA tuvo). Aquí se hereda ese desdoble SIN el QR: cuatro botones de
 * primer nivel. El backend ya acepta DEBITO y CREDITO como métodos de primera
 * clase (`METODOS_VALIDOS`), así que no hay cambio de contrato.
 */
const METODOS_PAGO = [
  { id: 'EFECTIVO', etiqueta: 'Efectivo', icono: '💵' },
  { id: 'DEBITO', etiqueta: 'Débito', icono: '💳' },
  { id: 'CREDITO', etiqueta: 'Crédito', icono: '💳' },
  { id: 'TRANSFERENCIA', etiqueta: 'Transferencia', icono: '🏦' },
];

/** Denominaciones rápidas de efectivo (MXN). */
const BILLETES_RAPIDOS = [50, 100, 200, 500];

/** Etiqueta legible de un método de pago. */
function etiquetaMetodo(metodo) {
  const encontrado = METODOS_PAGO.find((m) => m.id === metodo);
  if (encontrado) return encontrado.etiqueta;
  return metodo;
}

/**
 * F12.21 — Etiqueta legible del tipo de entrega de un pedido.
 * Paridad con el viejo POS (`CheckoutScreen.jsx` §6.8).
 */
function etiquetaEntrega(deliveryType) {
  if (deliveryType === 'DOMICILIO') return 'Domicilio';
  if (deliveryType === 'PICKUP') return 'Recoger en tienda';
  return deliveryType || '—';
}

/**
 * F12.21 — Etiqueta legible del tipo de empaque de un pedido.
 */
function etiquetaEmpaque(packagingType) {
  if (packagingType === 'PROPIO') return 'Empaque propio (del cliente)';
  if (packagingType === 'VENTA') return 'Empaque de venta (se cobra)';
  return packagingType || '—';
}

/**
 * F12.21 — Formatea una fecha ISO a hora local legible (es-MX).
 * Devuelve '—' si no hay fecha válida.
 */
function formatearFechaHora(fecha) {
  if (!fecha) return '—';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * F12.21 — Fila etiqueta/valor del panel "Confirmar con el Cliente".
 * Paridad con el `OrderDetailRow` del viejo POS (§6.8).
 */
function OrderDetailRow({ label, value, highlight = false }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-crema-ticket/50">
        {label}
      </span>
      <span
        className={`text-sm font-semibold ${
          highlight ? 'text-acento' : 'text-crema-ticket'
        }`}
      >
        {value || '—'}
      </span>
    </div>
  );
}

export default function CheckoutScreen({
  total,
  onConfirmar,
  onCancelar,
  procesando,
  error,
  montoMinimo,
  // F12.21 — Revisión pre-cobro de un PEDIDO (paridad con el viejo POS §6.8).
  // Cuando viene el bloque `order_*` (contrato 3), el modal muestra un panel
  // derecho "Confirmar con el Cliente" para que el cajero valide los datos
  // (entrega, cliente, teléfono, compromiso, empaque, dirección, notas) ANTES
  // de cobrar. En una VENTA DIRECTA llega `null` y el panel NO se pinta.
  orderData = null,
  // F12.21 — Líneas del pedido (para el "Contenido del Pedido" del panel).
  lineas = [],
}) {
  const esPedido = Boolean(orderData && orderData.order_type === 'PEDIDO');
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

  /**
   * Método real que se envía al backend.
   *
   * F9.1.5.0 — ya no existe el id de UI `TARJETA`: la tarjeta se desdobla en
   * `DEBITO` / `CREDITO` como botones de primer nivel. Se conserva el mapeo
   * `TARJETA → DEBITO` por retrocompatibilidad (tests/llamadas antiguas), pero
   * la UI ya no lo produce.
   */
  function metodoCanonico(m) {
    if (m === 'TARJETA') return 'DEBITO';
    return METODOS_VALIDOS.includes(m) ? m : 'EFECTIVO';
  }

  /**
   * Acota un monto capturado al saldo PENDIENTE del ticket (redondeado a 2
   * decimales). Es el ÚNICO punto donde se decide cuánto se APLICA al total.
   *
   * FIX "suma_no_cuadra" (6ª vuelta, 7 Oct 2026) — el acotamiento debe ser
   * UNIVERSAL: antes solo aplicaba a EFECTIVO (`if (metodoReal !== 'EFECTIVO')
   * return capturado`), así que un abono de TARJETA por encima del pendiente
   * (p. ej. $10 efectivo + $1000 tarjeta sobre un total de $47) se registraba
   * íntegro ($1000) → suma 1010 ≠ 47 → RN-94 → `suma_no_cuadra`. Ahora cada
   * método se acota al pendiente; el excedente de efectivo queda como
   * `recibido` (vuelto), y en tarjeta simplemente no se cobra de más.
   *
   * @param {number} capturado  monto que tecleó el cajero
   * @param {number} pendiente  saldo por cubrir (ya excluye abonos previos)
   * @returns {number} lo que se APLICA al total (nunca más que el pendiente)
   */
  function acotarAlPendiente(capturado, pendiente) {
    return Math.min(capturado, Math.max(0, pendiente));
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
   * el cliente entrega; `cambio` = `recibido − monto`.
   *
   * 2ª VUELTA (7 Oct 2026) — BUG del caso `pendiente === 0`: cuando el total YA
   * estaba cubierto por abonos previos, la versión anterior devolvía `capturado`
   * (el monto completo) en vez de `0`. Así, agregar un 2º abono sobre una cuenta
   * ya saldada sumaba de más (p. ej. $100 + $50 = $150 ≠ $100) → RN-94 →
   * `suma_no_cuadra`. Ahora, si no queda nada por aplicar, el monto aplicado es
   * `0` y `manejarAgregarPago` rechaza el abono (no tiene sentido abonar $0).
   */
  function montoAplicado(metodoReal, capturado) {
    const pendiente = Math.max(0, Math.round((total - resumen.abonado) * 100) / 100);
    // Si ya no queda pendiente, no se aplica nada (el excedente sería cambio).
    return acotarAlPendiente(capturado, pendiente);
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
    // F9.1.5.0 — DEBITO/CREDITO son métodos de primer nivel; se cargan tal cual.
    setMetodo(abono.metodo);
  }

  /**
   * Guarda la edición del abono en curso (MISMO criterio que agregar).
   *
   * FIX "suma_no_cuadra" (6ª vuelta, 7 Oct 2026) — la edición seguía con la
   * lógica vieja: solo acotaba EFECTIVO al pendiente y dejaba TARJETA/
   * TRANSFERENCIA con el monto capturado tal cual. Eso reabría el bug por la
   * puerta de la edición (editar un abono de tarjeta a $1000 sobre un pendiente
   * de $37 registraba $1000 → RN-94 → `suma_no_cuadra`). Ahora usa el MISMO
   * helper `acotarAlPendiente` que el alta, sin rama por método.
   */
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
    const monto = acotarAlPendiente(capturado, pendiente);
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

  /**
   * Confirma el cobro: con abonos envía N pagos; sin abonos, el pago único.
   *
   * 3ª VUELTA (7 Oct 2026) — El pago único enviaba `{metodo, recibido, cambio}`
   * SIN `monto`, confiando en que el backend lo reconstruyera desde el total del
   * ticket (`_normalizar_pagos`). Eso funcionaba para el total completo, pero
   * era FRÁGIL: si el monto aplicado no coincidía con el total (p. ej. pago
   * parcial de un PEDIDO con `montoMinimo < total`), el backend ponía
   * `monto = total` y la suma NO cuadraba → RN-94 → `suma_no_cuadra`.
   *
   * Ahora el pago único envía SIEMPRE un `monto` EXPLÍCITO = lo que se APLICA
   * al total (nunca más que el total), y `recibido` = el efectivo entregado.
   * Así el contrato es explícito y el vuelto (`recibido − monto`) queda claro:
   *   - EFECTIVO: `monto = min(capturado, total)`; `recibido = capturado`;
   *     `cambio = recibido − monto`.
   *   - TARJETA/TRANSFERENCIA: `monto = total` (se cobra el total exacto).
   * El backend sigue aceptando la forma vieja (retrocompatibilidad), pero el
   * POS ya no depende de ese default.
   */
  function manejarConfirmar() {
    if (hayAbonos) {
      onConfirmar({ abonos });
      return;
    }
    const metodoReal = metodoCanonico(metodo);
    // 4ª VUELTA (7 Oct 2026) — TODO monto que cruza la frontera se redondea a 2
    // decimales. Antes `monto = Math.min(capturado, total)` viajaba con el error
    // de coma flotante de `total` (p. ej. 99.99000000000001) y el backend lo
    // rechazaba con RN-94 (`suma_no_cuadra`). `recibido` y `cambio` se redondean
    // por la misma razón (el cambio es `recibido − monto`, ambos ya redondeados).
    if (esEfectivo) {
      const monto = redondear2(Math.min(montoCapturado, total));
      const recibido = redondear2(montoCapturado);
      onConfirmar({
        metodo: metodoReal,
        monto,
        recibido,
        cambio: redondear2(Math.max(recibido - monto, 0)),
      });
      return;
    }
    const totalRedondeado = redondear2(total);
    onConfirmar({
      metodo: metodoReal,
      monto: totalRedondeado,
      recibido: totalRedondeado,
      cambio: 0,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-fondo-profundo/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cobro del ticket"
    >
      <div
        className={`w-full ${
          esPedido ? 'max-w-[1400px]' : 'max-w-[1100px]'
        } mx-auto bg-fondo-panel rounded-canon50 overflow-hidden flex flex-col lg:flex-row`}
      >
        {/* Columna principal: métodos de pago */}
        <div className="flex-1 p-6 flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-crema-ticket">
            {esPedido ? 'Cobrar pedido' : 'Cobrar ticket'}
          </h2>

          {error ? (
            <div role="alert" className="rounded-canon35 bg-peligro/20 text-peligro px-4 py-3 text-sm font-semibold">
              {error}
            </div>
          ) : null}

          {/* 1. Método de pago (F9.1.5.0: 4 métodos de primer nivel, sin QR) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

            {/* F9.1.5.1 — Teclado + "+ Agregar pago" en la MISMA fila, con el
                botón a la DERECHA y grande (UX heredada del viejo POS). El
                texto se conserva ("+ Agregar pago"), solo cambia de posición. */}
            <div className="flex gap-3">
              <div className="flex-grow">
                {/* Teclado numérico táctil (F9.0.2) — SIEMPRE visible (FIX D2):
                    antes vivía dentro del bloque `esEfectivo` y desaparecía al
                    elegir tarjeta/transferencia. */}
                <TecladoNumerico
                  valor={montoAbono}
                  onCambiar={setMontoAbono}
                  deshabilitado={procesando}
                />
              </div>

              {editandoId ? (
                <div className="w-24 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={manejarGuardarEdicion}
                    disabled={procesando}
                    className="flex-1 min-h-tactil rounded-canon35 bg-acento text-fondo-profundo font-bold text-xs uppercase leading-tight transition hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Guardar abono
                  </button>
                  <button
                    type="button"
                    onClick={manejarCancelarEdicion}
                    disabled={procesando}
                    className="flex-1 min-h-tactil rounded-canon35 text-crema-ticket border border-white/20 hover:border-peligro hover:text-peligro text-xs uppercase leading-tight transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={manejarAgregarPago}
                  disabled={procesando || montoCapturado <= 0}
                  className="w-24 min-h-tactil rounded-canon35 bg-acento text-fondo-profundo font-bold flex flex-col items-center justify-center gap-1 transition hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span aria-hidden="true" className="text-2xl">➕</span>
                  <span className="text-xs uppercase leading-none">Agregar</span>
                  <span className="text-xs uppercase leading-none">pago</span>
                </button>
              )}
            </div>

            {!hayAbonos && mensajeValidacion ? (
              <p className="text-sm text-peligro font-semibold">{mensajeValidacion}</p>
            ) : null}
          </div>

        </div>

        {/* F12.21 — Panel "Confirmar con el Cliente" (paridad con el viejo POS
            §6.8). Solo aparece en un PEDIDO: el cajero valida los datos de
            entrega con el cliente ANTES de cobrar. En una VENTA DIRECTA no se
            pinta y el modal conserva su ancho original. */}
        {esPedido ? (
          <div className="w-full lg:w-[320px] lg:flex-shrink-0 bg-fondo-profundo/60 border-y lg:border-y-0 lg:border-x border-white/10 p-6 flex flex-col gap-4 overflow-y-auto">
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-bold text-acento">
                Confirmar con el Cliente
              </h3>
              <p className="text-xs text-crema-ticket/60">
                Verifica estos datos antes de cobrar.
              </p>
            </div>

            <OrderDetailRow
              label="Tipo de entrega"
              value={etiquetaEntrega(orderData.delivery_type)}
              highlight
            />
            <OrderDetailRow label="Cliente" value={orderData.customer_name} />
            <OrderDetailRow label="Teléfono" value={orderData.customer_phone} />
            <OrderDetailRow
              label="Entrega compromiso"
              value={formatearFechaHora(orderData.committed_at)}
            />

            {/* Contenido del pedido (líneas del carrito) */}
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-crema-ticket/50">
                Contenido del pedido
              </span>
              {Array.isArray(lineas) && lineas.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {lineas.map((l, i) => (
                    <li
                      key={l.item_id || l.product_id || i}
                      className="flex items-center justify-between gap-2 text-sm text-crema-ticket"
                    >
                      <span className="truncate">
                        {l.quantity}× {l.name}
                      </span>
                      <span className="text-crema-ticket/70 whitespace-nowrap">
                        {formatearPrecio(
                          (Number(l.unit_price) || 0) * (Number(l.quantity) || 0),
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-sm text-crema-ticket/50">—</span>
              )}
            </div>

            <OrderDetailRow
              label="Empaque"
              value={etiquetaEmpaque(orderData.packaging_type)}
            />
            {orderData.delivery_type === 'DOMICILIO' ? (
              <OrderDetailRow
                label="Dirección"
                value={orderData.delivery_address}
              />
            ) : null}
            {orderData.order_notes ? (
              <OrderDetailRow label="Notas" value={orderData.order_notes} />
            ) : null}

            {procesando ? (
              <div className="mt-auto rounded-canon35 bg-acento/20 text-acento px-4 py-3 text-sm font-bold text-center">
                ✅ PAGADO — EN ESPERA DE PRODUCCIÓN
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Columna lateral: pagos + resumen + acciones (w-full lg:w-1/3, R-01).
            F9.1.5.2 — los abonos se cargan AQUÍ (panel derecho), como el viejo
            POS; se elimina el resumen duplicado que vivía en la izquierda. */}
        <div className="w-full lg:w-1/3 lg:flex-shrink-0 bg-fondo-profundo p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-crema-ticket/60">Total a cobrar</span>
            <span className="text-3xl font-bold text-acento">{formatearPrecio(total)}</span>
          </div>

          {/* Lista de abonos agregados (F9.1.5.2 — panel derecho) */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-crema-ticket/70">
              Abonos del ticket
            </span>
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
                        {a.recibido && a.recibido !== a.monto
                          ? `Entregó ${formatearPrecio(a.recibido)} (Aplica: ${formatearPrecio(a.monto)})`
                          : formatearPrecio(a.monto)}
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
