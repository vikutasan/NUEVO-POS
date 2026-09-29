/**
 * `OpenAccountsCorkboard` — interfaz 13 del registro de la superficie (Modal).
 *
 * El pizarrón de cuentas abiertas del POS nuevo (FASE 5.3). Es la superficie
 * del flujo "Recuperación de cuenta" (E.4): muestra las cuentas OPEN de la
 * terminal como tarjetas en un corcho, y permite recuperar una para retomarla.
 *
 * Contenedor raíz declarado: `w-full max-w-[1000px] mx-auto` (fluido, R-01).
 *   - MOSTRADOR: grid de 3 columnas.
 *   - COMPACTO:  grid de 2 columnas.
 *   - MÓVIL:     1 columna, scroll vertical.
 *
 * Reglas de batalla respetadas:
 *   - Contrato `{outcome, reason}`: el componente NUNCA usa try/catch; el hook
 *     `useOpenAccounts` ya entrega `{cuentas, cargando, error}`.
 *   - Banner de error PERSISTENTE (no se auto-oculta) — Regla 19 / prohibición #2.
 *   - Sin timers ni auto-guardado (prohibición #1): la recarga es a demanda.
 *   - Táctil: cada tarjeta y cada botón ≥ 44px (`min-h-tactil`, R-04).
 *   - La versión fresca la trae `recuperarCuenta` (contrato 21, lección v6.0).
 *
 * @see PLAN_DE_ABORDAJE_FASE_5_POR_PARTES.md §7 (Sub-fase 5.3)
 * @see FICHA_F5_2_HOOK_CUENTAS.md (el hook que consume)
 */

import React, { useCallback, useState } from 'react';
import { useOpenAccounts } from '../hooks/useOpenAccounts.js';
import { esOk } from '../utils/outcome.js';

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

/** Traduce un `reason` del hook a un mensaje humano. */
const MENSAJES = Object.freeze({
  sin_conexion: 'No hay conexión con el servidor.',
  terminal_invalida: 'La terminal no es válida.',
  datos_invalidos: 'Los datos recibidos no son válidos.',
  error_desconocido: 'Ocurrió un error inesperado.',
});

function mensajeDe(reason) {
  if (!reason) return MENSAJES.error_desconocido;
  return MENSAJES[reason] || reason;
}

/** Clases del grid según el modo activo (R-03). */
const GRID_POR_MODO = Object.freeze({
  MOSTRADOR: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  COMPACTO: 'grid-cols-1 sm:grid-cols-2',
  MOVIL: 'grid-cols-1',
});

export default function OpenAccountsCorkboard({
  terminalId,
  modo = 'MOSTRADOR',
  onRecuperar,
  onCerrar,
  servicioCuentas,
  clienteApi,
}) {
  const { cuentas, cargando, error, refrescar, recuperarCuenta } = useOpenAccounts({
    terminalId,
    servicioCuentas,
    clienteApi,
  });

  const [recuperando, setRecuperando] = useState(null);
  const [errorRecuperar, setErrorRecuperar] = useState(null);

  /** Recupera la versión fresca de una cuenta y avisa al POS. */
  const alRecuperar = useCallback(
    async (cuenta) => {
      setErrorRecuperar(null);
      setRecuperando(cuenta.id);
      const r = await recuperarCuenta(cuenta.id);
      setRecuperando(null);
      if (!esOk(r)) {
        setErrorRecuperar(mensajeDe(r.reason));
        return;
      }
      if (onRecuperar) onRecuperar(r.data);
    },
    [recuperarCuenta, onRecuperar]
  );

  const clasesGrid = GRID_POR_MODO[modo] || GRID_POR_MODO.MOSTRADOR;

  return (
    <div
      role="dialog"
      aria-label="Cuentas abiertas"
      className="w-full max-w-[1000px] mx-auto bg-fondo-profundo rounded-canon50 p-6 flex flex-col gap-4"
    >
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-crema-ticket">Cuentas abiertas</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={refrescar}
            disabled={cargando}
            className="min-h-tactil px-4 rounded-canon35 bg-fondo-panel text-crema-ticket border border-white/10 hover:border-acento/60 disabled:opacity-50"
          >
            {cargando ? 'Actualizando…' : 'Actualizar'}
          </button>
          {onCerrar ? (
            <button
              type="button"
              onClick={onCerrar}
              className="min-h-tactil px-4 rounded-canon35 bg-fondo-panel text-crema-ticket border border-white/10 hover:border-acento/60"
            >
              Cerrar
            </button>
          ) : null}
        </div>
      </header>

      {/* Banner de error PERSISTENTE (Regla 19 / prohibición #2) */}
      {error ? (
        <div
          role="alert"
          className="rounded-canon35 bg-peligro/20 text-peligro px-4 py-3 text-sm font-semibold"
        >
          {mensajeDe(error)}
        </div>
      ) : null}

      {errorRecuperar ? (
        <div
          role="alert"
          className="rounded-canon35 bg-peligro/20 text-peligro px-4 py-3 text-sm font-semibold"
        >
          {errorRecuperar}
        </div>
      ) : null}

      {/* Estado de carga */}
      {cargando && cuentas.length === 0 ? (
        <p role="status" className="text-crema-ticket/60 text-sm">
          Cargando cuentas…
        </p>
      ) : null}

      {/* Estado vacío */}
      {!cargando && !error && cuentas.length === 0 ? (
        <p role="status" className="text-crema-ticket/60 text-sm">
          No hay cuentas abiertas.
        </p>
      ) : null}

      {/* El corcho: una tarjeta por cuenta */}
      {cuentas.length > 0 ? (
        <ul className={`grid ${clasesGrid} gap-4 list-none p-0 m-0`}>
          {cuentas.map((cuenta) => (
            <li
              key={cuenta.id}
              className="min-h-tactil bg-fondo-panel rounded-canon50 p-4 flex flex-col gap-3 border border-white/10"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="text-lg font-bold text-crema-ticket"
                  data-testid={`folio-${cuenta.id}`}
                >
                  {cuenta.account_num}
                </span>
                <span
                  className="text-lg font-bold text-acento"
                  data-testid={`total-${cuenta.id}`}
                >
                  {formatearPrecio(cuenta.total)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => alRecuperar(cuenta)}
                disabled={recuperando === cuenta.id}
                className="min-h-tactil rounded-canon35 bg-acento text-fondo-profundo font-semibold px-4 disabled:opacity-50"
              >
                {recuperando === cuenta.id ? 'Recuperando…' : 'Recuperar'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
