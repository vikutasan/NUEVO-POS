/**
 * `GestorDeCaja` — interfaz 9 del registro de la superficie (Pantalla).
 *
 * La pantalla de caja del POS nuevo (FASE 4.3). Cubre el flujo E.5 (corte de
 * caja) con TRES estados mutuamente excluyentes:
 *
 *   1. SIN TURNO  → formulario de apertura (fondo inicial).
 *   2. ABIERTO    → resumen en vivo (esperado vs contado), lista de movimientos,
 *                   alta de movimiento y botón de cierre.
 *   3. CIERRE     → captura de conteos físicos (efectivo, crédito, débito) y
 *                   muestra la DIFERENCIA (descuadre) al confirmar.
 *
 * Contenedor raíz declarado: `w-full max-w-[1100px] mx-auto` (fluido, R-01).
 *   - MOSTRADOR: 2 columnas (resumen | movimientos).
 *   - COMPACTO:  1 columna.
 *   - MÓVIL:     1 columna, acciones apiladas.
 *
 * Reglas de batalla respetadas:
 *   - Contrato `{outcome, reason}`: la pantalla NUNCA usa try/catch; decide con
 *     `esOk(resultado)` y muestra `resultado.reason` en el banner rojo.
 *   - Banner de error PERSISTENTE (no se auto-oculta) — Regla 19 / prohibición #2.
 *   - Sin timers ni auto-guardado (prohibición #1).
 *   - Sin estado leído en callbacks async: se usa el valor devuelto por el
 *     servicio, no un cierre sobre el estado de React.
 *
 * @see PLAN_DE_ABORDAJE_FASE_4_POR_PARTES.md §7 (Sub-fase 4.3)
 * @see FICHA_F4_2_CASH_SERVICE.md (el servicio que consume)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as caja from './services/cashService.js';
import { esOk } from './utils/outcome.js';

/** Formatea un valor como moneda mexicana. */
function formatearPrecio(valor) {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return '$0.00';
  return numero.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
}

/** Traduce un `reason` del servicio a un mensaje humano. */
const MENSAJES = Object.freeze({
  sin_conexion: 'No hay conexión con el servidor de caja.',
  ya_hay_turno_abierto: 'Ya hay un turno de caja abierto en esta terminal.',
  turno_no_encontrado: 'El turno de caja ya no existe.',
  datos_invalidos: 'Los datos capturados no son válidos.',
  error_desconocido: 'Ocurrió un error inesperado.',
});

function mensajeDe(reason) {
  if (!reason) return MENSAJES.error_desconocido;
  return MENSAJES[reason] || reason;
}

/** Los 3 estados de la pantalla. */
export const ESTADOS = Object.freeze({
  SIN_TURNO: 'sin_turno',
  ABIERTO: 'abierto',
  CIERRE: 'cierre',
});

export default function GestorDeCaja({
  terminalId,
  usuarioId,
  servicio = caja,
  onCerrar,
}) {
  const [estado, setEstado] = useState(ESTADOS.SIN_TURNO);
  const [turno, setTurno] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  // Campos del formulario de apertura.
  const [fondoInicial, setFondoInicial] = useState('');

  // Campos del formulario de movimiento.
  const [tipoMov, setTipoMov] = useState('ENTRADA');
  const [montoMov, setMontoMov] = useState('');
  const [motivoMov, setMotivoMov] = useState('');

  // Campos del formulario de cierre.
  const [conteoEfectivo, setConteoEfectivo] = useState('');
  const [conteoCredito, setConteoCredito] = useState('');
  const [conteoDebito, setConteoDebito] = useState('');
  const [diferencia, setDiferencia] = useState(null);

  /** Carga el turno activo al montar (una sola vez, sin timers). */
  useEffect(() => {
    let vigente = true;

    async function cargar() {
      const r = await servicio.obtenerTurnoActivo();
      if (!vigente) return;
      if (!esOk(r)) {
        setError(mensajeDe(r.reason));
        return;
      }
      if (r.data && r.data.cash_session_id) {
        setTurno(r.data);
        setEstado(ESTADOS.ABIERTO);
      } else {
        setEstado(ESTADOS.SIN_TURNO);
      }
    }

    cargar();
    return () => {
      vigente = false;
    };
  }, [servicio]);

  /** Refresca el resumen del turno abierto. */
  const refrescarResumen = useCallback(async () => {
    if (!turno) return;
    const r = await servicio.obtenerResumen(turno.cash_session_id);
    if (esOk(r)) {
      setResumen(r.data);
      setMovimientos((r.data && r.data.movimientos) || []);
    } else {
      setError(mensajeDe(r.reason));
    }
  }, [servicio, turno]);

  useEffect(() => {
    if (estado === ESTADOS.ABIERTO && turno) refrescarResumen();
  }, [estado, turno, refrescarResumen]);

  /** Abre el turno con el fondo capturado (RN-49, RN-50). */
  const alAbrirTurno = useCallback(async () => {
    setError(null);
    setOcupado(true);
    const r = await servicio.abrirTurno({
      terminal_id: terminalId,
      usuario_id: usuarioId,
      monto_inicial: Number(fondoInicial) || 0,
    });
    setOcupado(false);

    if (!esOk(r)) {
      setError(mensajeDe(r.reason));
      return;
    }
    setTurno(r.data);
    setEstado(ESTADOS.ABIERTO);
  }, [servicio, terminalId, usuarioId, fondoInicial]);

  /** Registra una entrada o salida de efectivo (RN-51, RN-55). */
  const alRegistrarMovimiento = useCallback(async () => {
    setError(null);
    setOcupado(true);
    const r = await servicio.registrarMovimiento({
      cash_session_id: turno.cash_session_id,
      tipo: tipoMov,
      monto: Number(montoMov) || 0,
      motivo: motivoMov,
    });
    setOcupado(false);

    if (!esOk(r)) {
      setError(mensajeDe(r.reason));
      return;
    }
    setMontoMov('');
    setMotivoMov('');
    await refrescarResumen();
  }, [servicio, turno, tipoMov, montoMov, motivoMov, refrescarResumen]);

  /** Cierra el turno con los conteos físicos (RN-54, RN-55). */
  const alCerrarTurno = useCallback(async () => {
    setError(null);
    setOcupado(true);
    const r = await servicio.cerrarTurno({
      cash_session_id: turno.cash_session_id,
      montos_fisicos: Number(conteoEfectivo) || 0,
      credito: Number(conteoCredito) || 0,
      debito: Number(conteoDebito) || 0,
    });
    setOcupado(false);

    if (!esOk(r)) {
      setError(mensajeDe(r.reason));
      return;
    }
    setDiferencia(r.data);
  }, [servicio, turno, conteoEfectivo, conteoCredito, conteoDebito]);

  const esperado = useMemo(() => Number(resumen?.esperado ?? 0), [resumen]);
  const capturado = Number(conteoEfectivo) || 0;
  const descuadreEnVivo = capturado - esperado;

  return (
    <div className="w-full max-w-[1100px] mx-auto p-4 flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-crema-ticket">Gestor de Caja</h1>
        {onCerrar ? (
          <button
            type="button"
            onClick={onCerrar}
            className="min-h-tactil px-4 rounded-canon35 bg-fondo-panel text-crema-ticket border border-white/10 hover:border-acento/60"
          >
            Volver al POS
          </button>
        ) : null}
      </header>

      {/* Banner de error PERSISTENTE (Regla 19 / prohibición #2) */}
      {error ? (
        <div
          role="alert"
          className="rounded-canon35 bg-peligro/20 text-peligro px-4 py-3 text-sm font-semibold"
        >
          {error}
        </div>
      ) : null}

      {/* ── ESTADO 1: SIN TURNO ─────────────────────────────────────────── */}
      {estado === ESTADOS.SIN_TURNO ? (
        <section
          aria-label="Abrir turno de caja"
          className="bg-fondo-panel rounded-canon50 p-6 flex flex-col gap-4"
        >
          <h2 className="text-xl font-bold text-crema-ticket">Abrir turno</h2>
          <p className="text-sm text-crema-ticket/60">
            No hay un turno de caja abierto en esta terminal.
          </p>
          <label className="flex flex-col gap-2 text-sm text-crema-ticket">
            Fondo inicial
            <input
              type="number"
              min="0"
              step="0.01"
              value={fondoInicial}
              onChange={(e) => setFondoInicial(e.target.value)}
              aria-label="Fondo inicial"
              className="min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border border-white/10 px-4"
            />
          </label>
          <button
            type="button"
            onClick={alAbrirTurno}
            disabled={ocupado}
            className="min-h-tactil rounded-canon35 bg-acento text-fondo-profundo font-semibold px-4 disabled:opacity-50"
          >
            {ocupado ? 'Abriendo…' : 'Abrir turno'}
          </button>
        </section>
      ) : null}

      {/* ── ESTADO 2: ABIERTO ───────────────────────────────────────────── */}
      {estado === ESTADOS.ABIERTO ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section
            aria-label="Resumen del turno"
            className="bg-fondo-panel rounded-canon50 p-6 flex flex-col gap-3"
          >
            <h2 className="text-xl font-bold text-crema-ticket">Resumen del turno</h2>
            <dl className="flex flex-col gap-2 text-crema-ticket">
              <div className="flex justify-between">
                <dt className="text-crema-ticket/60">Esperado en caja</dt>
                <dd className="font-bold" data-testid="esperado">
                  {formatearPrecio(esperado)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-crema-ticket/60">Contado</dt>
                <dd className="font-bold" data-testid="contado">
                  {formatearPrecio(capturado)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-crema-ticket/60">Diferencia</dt>
                <dd
                  className={`font-bold ${descuadreEnVivo === 0 ? 'text-acento' : 'text-peligro'}`}
                  data-testid="diferencia"
                >
                  {formatearPrecio(descuadreEnVivo)}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setEstado(ESTADOS.CIERRE)}
              className="min-h-tactil rounded-canon35 bg-acento text-fondo-profundo font-semibold px-4"
            >
              Cerrar turno
            </button>
          </section>

          <section
            aria-label="Movimientos del turno"
            className="bg-fondo-panel rounded-canon50 p-6 flex flex-col gap-3"
          >
            <h2 className="text-xl font-bold text-crema-ticket">Movimientos</h2>

            <ul className="flex flex-col gap-1 text-sm text-crema-ticket">
              {movimientos.length === 0 ? (
                <li className="text-crema-ticket/50">Sin movimientos.</li>
              ) : (
                movimientos.map((m, i) => (
                  <li key={`${m.tipo}-${i}`} className="flex justify-between">
                    <span>
                      {m.tipo === 'ENTRADA' ? '↑' : '↓'} {m.motivo || m.tipo}
                    </span>
                    <span className="font-semibold">{formatearPrecio(m.monto)}</span>
                  </li>
                ))
              )}
            </ul>

            <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTipoMov('ENTRADA')}
                  className={`min-h-tactil flex-1 rounded-canon35 border px-3 font-semibold ${
                    tipoMov === 'ENTRADA'
                      ? 'bg-acento text-fondo-profundo border-acento'
                      : 'bg-fondo-profundo text-crema-ticket border-white/10'
                  }`}
                >
                  Entrada
                </button>
                <button
                  type="button"
                  onClick={() => setTipoMov('SALIDA')}
                  className={`min-h-tactil flex-1 rounded-canon35 border px-3 font-semibold ${
                    tipoMov === 'SALIDA'
                      ? 'bg-acento text-fondo-profundo border-acento'
                      : 'bg-fondo-profundo text-crema-ticket border-white/10'
                  }`}
                >
                  Salida
                </button>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={montoMov}
                onChange={(e) => setMontoMov(e.target.value)}
                aria-label="Monto del movimiento"
                placeholder="Monto"
                className="min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border border-white/10 px-4"
              />
              <input
                type="text"
                value={motivoMov}
                onChange={(e) => setMotivoMov(e.target.value)}
                aria-label="Motivo del movimiento"
                placeholder="Motivo"
                className="min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border border-white/10 px-4"
              />
              <button
                type="button"
                onClick={alRegistrarMovimiento}
                disabled={ocupado}
                className="min-h-tactil rounded-canon35 bg-acento text-fondo-profundo font-semibold px-4 disabled:opacity-50"
              >
                Registrar movimiento
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {/* ── ESTADO 3: CIERRE ────────────────────────────────────────────── */}
      {estado === ESTADOS.CIERRE ? (
        <section
          aria-label="Cerrar turno de caja"
          className="bg-fondo-panel rounded-canon50 p-6 flex flex-col gap-4"
        >
          <h2 className="text-xl font-bold text-crema-ticket">Arqueo y cierre</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-2 text-sm text-crema-ticket">
              Efectivo contado
              <input
                type="number"
                min="0"
                step="0.01"
                value={conteoEfectivo}
                onChange={(e) => setConteoEfectivo(e.target.value)}
                aria-label="Efectivo contado"
                className="min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border border-white/10 px-4"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-crema-ticket">
              Crédito
              <input
                type="number"
                min="0"
                step="0.01"
                value={conteoCredito}
                onChange={(e) => setConteoCredito(e.target.value)}
                aria-label="Crédito contado"
                className="min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border border-white/10 px-4"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-crema-ticket">
              Débito
              <input
                type="number"
                min="0"
                step="0.01"
                value={conteoDebito}
                onChange={(e) => setConteoDebito(e.target.value)}
                aria-label="Débito contado"
                className="min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border border-white/10 px-4"
              />
            </label>
          </div>

          <div className="flex justify-between text-crema-ticket">
            <span className="text-crema-ticket/60">Esperado</span>
            <span className="font-bold">{formatearPrecio(esperado)}</span>
          </div>
          <div className="flex justify-between text-crema-ticket">
            <span className="text-crema-ticket/60">Diferencia</span>
            <span
              className={`font-bold ${descuadreEnVivo === 0 ? 'text-acento' : 'text-peligro'}`}
              data-testid="descuadre"
            >
              {formatearPrecio(descuadreEnVivo)}
            </span>
          </div>

          {diferencia ? (
            <div
              role="status"
              className="rounded-canon35 bg-acento/20 text-crema-ticket px-4 py-3 text-sm"
            >
              Turno cerrado. Diferencia final:{' '}
              <strong data-testid="diferencia-final">
                {formatearPrecio(diferencia.diferencia)}
              </strong>
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setEstado(ESTADOS.ABIERTO)}
              className="min-h-tactil flex-1 rounded-canon35 bg-fondo-profundo text-crema-ticket border border-white/10 px-4"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={alCerrarTurno}
              disabled={ocupado || Boolean(diferencia)}
              className="min-h-tactil flex-1 rounded-canon35 bg-acento text-fondo-profundo font-semibold px-4 disabled:opacity-50"
            >
              {ocupado ? 'Cerrando…' : 'Confirmar cierre'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
