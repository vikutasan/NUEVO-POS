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
 *
 * FASE 12.7 — Cierre de brechas B1..B4 (evaluación del 5 Oct 2026).
 *   B1: El default del tipo de movimiento es SALIDA (lo más frecuente).
 *   B2: La apertura del turno tiene confirmación de 2 pasos.
 *   B3: El cierre del turno tiene confirmación de 2 pasos (acción irreversible).
 *   B4: Tras cerrar, se ofrece "Iniciar Nuevo Turno" sin salir del gestor.
 *
 * FASE 10.4 — Contexto diario post-corte (contrato 28, `pos.contexto_diario`).
 * Al confirmar el cierre del turno se abre `DailyContextModal` para registrar
 * clima / atípico / notas del día. Es NO crítico: si falla, el corte ya quedó
 * cerrado y el cajero puede omitirlo. La integración se hereda del viejo POS
 * (§6.8); la implementación se reescribe con el contrato `{outcome, reason}`.
 *
 * @see PLAN_DE_ABORDAJE_F10_4_CONTEXTO_DIARIO.md
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as caja from './services/cashService.js';
import * as contexto from './services/dailyContextService.js';
import { esOk } from './utils/outcome.js';
import DailyContextModal from './components/DailyContextModal.jsx';
import TecladoTactil from './components/TecladoTactil.jsx';
import { imprimirCorte } from './services/printService.js';
import { generarCorteHTML } from './utils/ticketGenerator.js';

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

/**
 * FASE 10.6.3 — PARIDAD DE OPERACIÓN. Formatea la hora de un movimiento.
 *
 * El viejo POS mostraba la hora de cada movimiento en la lista; el nuevo POS
 * solo mostraba tipo y monto, así que el cajero no podía ubicar un movimiento
 * en el tiempo ni distinguir dos movimientos idénticos. La hora viaja en UTC
 * (RN-78) y aquí se formatea a hora local del negocio.
 */
function formatearHora(iso) {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
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
  usuarioNombre = null,
  servicio = caja,
  servicioContexto = contexto,
  onCerrar,
  // FIX "habilitar caja" — paridad con el viejo POS (§6.8). El gestor avisa al
  // contenedor cuando el turno se ABRE o se CIERRA, para que el estado del
  // padre (`turnoCaja`) se actualice AL INSTANTE y no solo al cerrar el modal.
  // Sin esto, el botón del header seguía diciendo "○ Habilitar" con la caja ya
  // abierta, y la landing nunca se enteraba.
  onCajaHabilitada,
  onCajaDeshabilitada,
}) {
  const [estado, setEstado] = useState(ESTADOS.SIN_TURNO);
  const [turno, setTurno] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  // FASE 10.4 — contexto diario post-corte (no crítico).
  const [mostrarContexto, setMostrarContexto] = useState(false);
  const [contextoRegistrado, setContextoRegistrado] = useState(false);

  // Campos del formulario de apertura.
  const [fondoInicial, setFondoInicial] = useState('');

  // B2 — Confirmación de 2 pasos al abrir turno.
  const [confirmandoFondo, setConfirmandoFondo] = useState(false);

  // Campos del formulario de movimiento.
  // B1 — Default SALIDA: en una panadería las salidas de efectivo (cambio,
  // compras menores) son más frecuentes que las entradas.
  const [tipoMov, setTipoMov] = useState('SALIDA');
  const [montoMov, setMontoMov] = useState('');
  const [motivoMov, setMotivoMov] = useState('');

  // Campos del formulario de cierre.
  const [conteoEfectivo, setConteoEfectivo] = useState('');
  const [conteoCredito, setConteoCredito] = useState('');
  const [conteoDebito, setConteoDebito] = useState('');
  const [diferencia, setDiferencia] = useState(null);
  // B3 — Confirmación de 2 pasos al cerrar turno (acción irreversible).
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);

  // FASE 10.6.1 — máquina de foco del teclado táctil. `campoActivo` es el nombre
  // del campo que el teclado está editando (null = ninguno). El teclado solo
  // emite teclas; aquí se decide qué campo recibe cada una.
  const [campoActivo, setCampoActivo] = useState(null);

  // Espejo de los valores en un ref: PROHIBICIÓN #3 — los callbacks leen del
  // ref, nunca de un cierre sobre el estado de React (evita el bug del $453).
  const valoresRef = useRef({});

  valoresRef.current = {
    fondoInicial,
    montoMov,
    conteoEfectivo,
    conteoCredito,
    conteoDebito,
  };

  /** Los campos que el teclado táctil puede editar, en orden de tabulación. */
  const CAMPOS = useMemo(
    () => ({
      fondoInicial: { etiqueta: 'Fondo inicial', set: setFondoInicial },
      montoMov: { etiqueta: 'Monto del movimiento', set: setMontoMov },
      conteoEfectivo: { etiqueta: 'Efectivo contado', set: setConteoEfectivo },
      conteoCredito: { etiqueta: 'Crédito contado', set: setConteoCredito },
      conteoDebito: { etiqueta: 'Débito contado', set: setConteoDebito },
    }),
    [],
  );

  /** Orden de tabulación por estado (ENTER avanza al siguiente campo). */
  const ORDEN_POR_ESTADO = useMemo(
    () => ({
      [ESTADOS.SIN_TURNO]: ['fondoInicial'],
      [ESTADOS.ABIERTO]: ['montoMov'],
      [ESTADOS.CIERRE]: ['conteoEfectivo', 'conteoCredito', 'conteoDebito'],
    }),
    [],
  );

  /**
   * Aplica una tecla al campo activo respetando las reglas de captura de dinero:
   * un solo punto decimal, máximo dos decimales, sin ceros a la izquierda.
   * Devuelve el nuevo texto del campo.
   */
  const aplicarTecla = useCallback((actual, tecla) => {
    const texto = String(actual ?? '');
    if (tecla === 'C') return '';
    if (tecla === '←') return texto.slice(0, -1);
    if (tecla === '.') {
      if (texto.includes('.')) return texto; // un solo punto
      return texto === '' ? '0.' : `${texto}.`;
    }
    // Dígito.
    const punto = texto.indexOf('.');
    if (punto >= 0 && texto.length - punto > 2) return texto; // máximo 2 decimales
    if (texto === '0') return tecla; // sin ceros a la izquierda
    return `${texto}${tecla}`;
  }, []);

  /** Maneja una tecla del teclado táctil (máquina de foco). */
  const alPulsarTecla = useCallback(
    (tecla) => {
      if (!campoActivo) return;
      const campo = CAMPOS[campoActivo];
      if (!campo) return;

      if (tecla === 'ENTER') {
        const orden = ORDEN_POR_ESTADO[estado] || [];
        const i = orden.indexOf(campoActivo);
        const siguiente = orden[i + 1] || null;
        setCampoActivo(siguiente);
        return;
      }

      const actual = valoresRef.current[campoActivo];
      campo.set(aplicarTecla(actual, tecla));
    },
    [campoActivo, CAMPOS, ORDEN_POR_ESTADO, estado, aplicarTecla],
  );

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
        // FIX "habilitar caja" — si al montar ya había un turno abierto (p. ej.
        // el operador recargó la página con la caja abierta), el contenedor
        // debe enterarse de inmediato: el botón del header pasa a "● Activa".
        onCajaHabilitada?.(r.data.cash_session_id);
      } else {
        setEstado(ESTADOS.SIN_TURNO);
      }
    }

    cargar();
    return () => {
      vigente = false;
    };
  }, [servicio, onCajaHabilitada]);

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

  /**
   * B2 — Paso 1: valida el fondo y pide confirmación.
   * El cajero ve el monto que va a registrar y decide si procede.
   */
  const alPedirConfirmacionFondo = useCallback(() => {
    const monto = Number(fondoInicial);
    if (Number.isNaN(monto) || monto < 0) {
      setError('Ingrese un monto válido para el fondo inicial.');
      return;
    }
    setError(null);
    setConfirmandoFondo(true);
  }, [fondoInicial]);

  /** B2 — Paso 2: abre el turno con el fondo confirmado (RN-49, RN-50). */
  const alAbrirTurno = useCallback(async () => {
    setConfirmandoFondo(false);
    setError(null);
    setOcupado(true);
    const r = await servicio.abrirTurno({
      terminal_id: terminalId,
      usuario_id: usuarioId,
      monto_inicial: Number(fondoInicial) || 0,
      // FASE 10.5 — paridad de datos: el viejo POS persistía el NOMBRE del
      // cajero (`employee_name`); el nuevo guardaba el UUID. Se envía el
      // nombre si el contenedor lo provee; si no, el backend cae al UUID.
      usuario_nombre: usuarioNombre || undefined,
    });
    setOcupado(false);

    if (!esOk(r)) {
      // FIX "habilitar caja" — RECUPERACIÓN del 409 (RN-49). El viejo POS, al
      // recibir "ya existe una sesión activa", NO se quedaba atorado: releía la
      // sesión abierta y sincronizaba el estado. El nuevo POS solo mostraba el
      // error, dejando al operador con un turno abierto que no podía ver ni
      // gestionar. Aquí se replica la recuperación: se relee el turno activo y,
      // si existe, se adopta como propio (estado ABIERTO + aviso al contenedor).
      if (r.reason === 'ya_hay_turno_abierto') {
        const activo = await servicio.obtenerTurnoActivo();
        if (esOk(activo) && activo.data && activo.data.cash_session_id) {
          setTurno(activo.data);
          setEstado(ESTADOS.ABIERTO);
          onCajaHabilitada?.(activo.data.cash_session_id);
          return;
        }
      }
      setError(mensajeDe(r.reason));
      return;
    }
    setTurno(r.data);
    setEstado(ESTADOS.ABIERTO);
    // FIX "habilitar caja" — avisa al contenedor AL INSTANTE: el botón del
    // header pasa a "● Activa" sin esperar a que se cierre el modal.
    onCajaHabilitada?.(r.data.cash_session_id);
  }, [servicio, terminalId, usuarioId, usuarioNombre, fondoInicial, onCajaHabilitada]);

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

  /**
   * Elimina un movimiento mal capturado (RN-52, contrato 29).
   *
   * FASE 10.6.2 — paridad de operación. El viejo POS permitía borrar un
   * movimiento mientras la caja estuviera abierta; el nuevo POS no ofrecía
   * forma de corregir un error de captura. Solo se permite con la caja
   * ABIERTA (RN-52): si el API responde 400, se muestra el motivo.
   */
  const alEliminarMovimiento = useCallback(
    async (movementId) => {
      setError(null);
      setOcupado(true);
      const r = await servicio.eliminarMovimiento(movementId);
      setOcupado(false);

      if (!esOk(r)) {
        setError(mensajeDe(r.reason));
        return;
      }
      await refrescarResumen();
    },
    [servicio, refrescarResumen],
  );

  /**
   * B3 — Paso 1: pide confirmación antes de cerrar (acción irreversible).
   * El cajero ve los conteos capturados y el descuadre en vivo.
   */
  const alPedirConfirmacionCierre = useCallback(() => {
    setError(null);
    setConfirmandoCierre(true);
  }, []);

  /** B3 — Paso 2: cierra el turno con los conteos confirmados (RN-54, RN-55). */
  const alCerrarTurno = useCallback(async () => {
    setConfirmandoCierre(false);
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
    // FIX "habilitar caja" — avisa al contenedor AL INSTANTE: el botón del
    // header vuelve a "○ Habilitar" y la landing deja de marcar la terminal
    // como caja, sin esperar a que se cierre el modal.
    onCajaDeshabilitada?.();
    // FASE 10.4 — el corte ya quedó cerrado; el contexto es NO crítico.
    setMostrarContexto(true);
  }, [servicio, turno, conteoEfectivo, conteoCredito, conteoDebito, onCajaDeshabilitada]);

  /**
   * B4 — Iniciar un nuevo turno sin salir del gestor.
   * Resetea todo el estado de la pantalla al modo SIN_TURNO.
   */
  const alNuevoTurno = useCallback(() => {
    setEstado(ESTADOS.SIN_TURNO);
    setTurno(null);
    setResumen(null);
    setMovimientos([]);
    setFondoInicial('');
    setTipoMov('SALIDA');
    setMontoMov('');
    setMotivoMov('');
    setConteoEfectivo('');
    setConteoCredito('');
    setConteoDebito('');
    setDiferencia(null);
    setConfirmandoFondo(false);
    setConfirmandoCierre(false);
    setMostrarContexto(false);
    setContextoRegistrado(false);
    setError(null);
    setCampoActivo(null);
  }, []);

  /** Cierra el modal de contexto diario (guardado u omitido). */
  const alCerrarContexto = useCallback((registrado = false) => {
    setMostrarContexto(false);
    if (registrado) setContextoRegistrado(true);
  }, []);

  const esperado = useMemo(() => Number(resumen?.esperado ?? 0), [resumen]);
  const capturado = Number(conteoEfectivo) || 0;
  const descuadreEnVivo = capturado - esperado;

  /**
   * FASE 10.6.4 — PARIDAD DE OPERACIÓN. Imprime el corte de caja.
   *
   * El viejo POS imprimía el corte al cerrar el turno (auto-print) y ofrecía un
   * botón para reimprimirlo; el nuevo POS cerraba el turno pero NUNCA imprimía
   * el corte, así que el cajero no tenía el comprobante físico del arqueo. La
   * integración se hereda del viejo POS (§6.8); la implementación se reescribe
   * con el servicio de impresión del POS nuevo (`imprimirCorte`).
   *
   * El HTML se genera con `generarCorteHTML` (string térmico autosuficiente) a
   * partir de los mismos datos que alimentan el `CorteTicketTemplate` oculto.
   * La impresión es NO crítica: si falla, el corte ya quedó cerrado.
   *
   * NOTA: este `useCallback` se declara DESPUÉS de `esperado`/`capturado`
   * porque su arreglo de dependencias los evalúa durante el render; declararlo
   * antes dispara un ReferenceError de zona muerta temporal (TDZ).
   */
  const alImprimirCorte = useCallback(() => {
    const datos = {
      terminalId,
      cajero: turno?.usuario_nombre || usuarioNombre || '—',
      abiertaEn: turno?.abierta_en || null,
      cerradaEn: new Date().toISOString(),
      esperado,
      contado: capturado,
      credito: Number(conteoCredito) || 0,
      debito: Number(conteoDebito) || 0,
      movimientos,
    };
    imprimirCorte(generarCorteHTML(datos));
  }, [
    terminalId,
    turno,
    usuarioNombre,
    esperado,
    capturado,
    conteoCredito,
    conteoDebito,
    movimientos,
  ]);

  // FASE 10.5 — paridad de datos: el desglose que el viejo POS mostraba al
  // cajero (fondo, entradas, salidas, ventas por método, total y número de
  // transacciones). El contrato 12 lo expone; aquí solo se formatea.
  const desglose = useMemo(
    () => ({
      fondo_inicial: Number(resumen?.fondo_inicial ?? 0),
      total_entradas: Number(resumen?.total_entradas ?? 0),
      total_salidas: Number(resumen?.total_salidas ?? 0),
      total_credito: Number(resumen?.total_credito ?? 0),
      total_debito: Number(resumen?.total_debito ?? 0),
      total_ventas: Number(resumen?.total_ventas ?? 0),
      num_transacciones: Number(resumen?.num_transacciones ?? 0),
    }),
    [resumen],
  );

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
              type="text"
              inputMode="decimal"
              value={fondoInicial}
              onChange={(e) => setFondoInicial(e.target.value)}
              onFocus={() => setCampoActivo('fondoInicial')}
              aria-label="Fondo inicial"
              data-testid="campo-fondoInicial"
              className={`min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border px-4 ${
                campoActivo === 'fondoInicial' ? 'border-acento' : 'border-white/10'
              }`}
            />
          </label>
          {/* B2 — Botón dispara confirmación, NO abre directamente */}
          <button
            type="button"
            onClick={alPedirConfirmacionFondo}
            disabled={ocupado}
            className="min-h-tactil rounded-canon35 bg-acento text-fondo-profundo font-semibold px-4 disabled:opacity-50"
          >
            Abrir turno
          </button>

          {/* B2 — Modal de confirmación del fondo */}
          {confirmandoFondo ? (
            <div
              role="alertdialog"
              aria-label="Confirmar fondo inicial"
              className="rounded-canon35 bg-fondo-profundo border border-acento/40 p-4 flex flex-col gap-3"
            >
              <p className="text-crema-ticket font-semibold">
                ¿Confirmar fondo inicial de{' '}
                <strong className="text-acento">{formatearPrecio(Number(fondoInicial) || 0)}</strong>?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmandoFondo(false)}
                  className="min-h-tactil flex-1 rounded-canon35 bg-fondo-panel text-crema-ticket border border-white/10 px-4"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={alAbrirTurno}
                  disabled={ocupado}
                  className="min-h-tactil flex-1 rounded-canon35 bg-acento text-fondo-profundo font-semibold px-4 disabled:opacity-50"
                >
                  {ocupado ? 'Abriendo…' : 'Sí, abrir turno'}
                </button>
              </div>
            </div>
          ) : null}
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
            {/* FASE 10.5 — desglose de paridad (lo que el viejo POS mostraba). */}
            <div
              aria-label="Desglose del turno"
              className="border-t border-white/10 pt-3 flex flex-col gap-2 text-sm text-crema-ticket"
            >
              <h3 className="font-semibold text-crema-ticket/80">Desglose del turno</h3>
              <dl className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <dt className="text-crema-ticket/60">Fondo inicial</dt>
                  <dd data-testid="desglose-fondo">{formatearPrecio(desglose.fondo_inicial)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-crema-ticket/60">Entradas</dt>
                  <dd data-testid="desglose-entradas">
                    {formatearPrecio(desglose.total_entradas)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-crema-ticket/60">Salidas</dt>
                  <dd data-testid="desglose-salidas">{formatearPrecio(desglose.total_salidas)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-crema-ticket/60">Ventas en efectivo</dt>
                  <dd data-testid="desglose-efectivo">
                    {formatearPrecio(desglose.total_ventas - desglose.total_credito - desglose.total_debito)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-crema-ticket/60">Crédito</dt>
                  <dd data-testid="desglose-credito">{formatearPrecio(desglose.total_credito)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-crema-ticket/60">Débito</dt>
                  <dd data-testid="desglose-debito">{formatearPrecio(desglose.total_debito)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-crema-ticket/60">Total de ventas</dt>
                  <dd data-testid="desglose-total-ventas">
                    {formatearPrecio(desglose.total_ventas)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-crema-ticket/60">Transacciones</dt>
                  <dd data-testid="desglose-transacciones">{desglose.num_transacciones}</dd>
                </div>
              </dl>
            </div>

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
                  <li key={m.movement_id || `${m.tipo}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="flex-1">
                      {m.tipo === 'ENTRADA' ? '↑' : '↓'} {m.motivo || m.tipo}
                    </span>
                    {/* FASE 10.6.3 — la hora del movimiento (paridad con el viejo POS). */}
                    <span
                      className="text-crema-ticket/60 tabular-nums"
                      data-testid={`hora-movimiento-${i}`}
                    >
                      {formatearHora(m.creado_en)}
                    </span>
                    <span className="font-semibold">{formatearPrecio(m.monto)}</span>
                    {/* FASE 10.6.2 — eliminar un movimiento mal capturado (RN-52). */}
                    <button
                      type="button"
                      onClick={() => alEliminarMovimiento(m.movement_id)}
                      disabled={ocupado || !m.movement_id}
                      aria-label={`Eliminar movimiento ${m.motivo || m.tipo}`}
                      data-testid={`eliminar-movimiento-${i}`}
                      className="min-h-tactil min-w-tactil rounded-canon35 bg-peligro/20 text-peligro border border-peligro/40 font-bold disabled:opacity-40"
                    >
                      ✕
                    </button>
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
                type="text"
                inputMode="decimal"
                value={montoMov}
                onChange={(e) => setMontoMov(e.target.value)}
                onFocus={() => setCampoActivo('montoMov')}
                aria-label="Monto del movimiento"
                placeholder="Monto"
                data-testid="campo-montoMov"
                className={`min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border px-4 ${
                  campoActivo === 'montoMov' ? 'border-acento' : 'border-white/10'
                }`}
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
                type="text"
                inputMode="decimal"
                value={conteoEfectivo}
                onChange={(e) => setConteoEfectivo(e.target.value)}
                onFocus={() => setCampoActivo('conteoEfectivo')}
                aria-label="Efectivo contado"
                data-testid="campo-conteoEfectivo"
                className={`min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border px-4 ${
                  campoActivo === 'conteoEfectivo' ? 'border-acento' : 'border-white/10'
                }`}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-crema-ticket">
              Crédito
              <input
                type="text"
                inputMode="decimal"
                value={conteoCredito}
                onChange={(e) => setConteoCredito(e.target.value)}
                onFocus={() => setCampoActivo('conteoCredito')}
                aria-label="Crédito contado"
                data-testid="campo-conteoCredito"
                className={`min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border px-4 ${
                  campoActivo === 'conteoCredito' ? 'border-acento' : 'border-white/10'
                }`}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-crema-ticket">
              Débito
              <input
                type="text"
                inputMode="decimal"
                value={conteoDebito}
                onChange={(e) => setConteoDebito(e.target.value)}
                onFocus={() => setCampoActivo('conteoDebito')}
                aria-label="Débito contado"
                data-testid="campo-conteoDebito"
                className={`min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border px-4 ${
                  campoActivo === 'conteoDebito' ? 'border-acento' : 'border-white/10'
                }`}
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
              className="rounded-canon35 bg-acento/20 text-crema-ticket px-4 py-3 text-sm flex flex-col gap-2"
            >
              <span>
                Turno cerrado. Diferencia final:{' '}
                <strong data-testid="diferencia-final">
                  {formatearPrecio(diferencia.diferencia)}
                </strong>
              </span>
              {/* FASE 10.6.4 — imprimir el corte (paridad con el viejo POS). */}
              <button
                type="button"
                onClick={alImprimirCorte}
                data-testid="imprimir-corte"
                className="self-start min-h-tactil rounded-canon35 bg-acento text-fondo-profundo font-semibold px-4"
              >
                Imprimir corte
              </button>
              {/* FASE 10.4 — contexto diario post-corte (no crítico). */}
              {contextoRegistrado ? (
                <span data-testid="contexto-registrado" className="text-crema-ticket/70">
                  ✅ Contexto del día registrado.
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setMostrarContexto(true)}
                  className="self-start min-h-tactil rounded-canon35 bg-fondo-profundo text-crema-ticket border border-white/10 px-4"
                >
                  Registrar contexto del día
                </button>
              )}
            </div>
          ) : null}

          <div className="flex gap-3">
            {!diferencia ? (
              <>
                <button
                  type="button"
                  onClick={() => setEstado(ESTADOS.ABIERTO)}
                  className="min-h-tactil flex-1 rounded-canon35 bg-fondo-profundo text-crema-ticket border border-white/10 px-4"
                >
                  Cancelar
                </button>
                {/* B3 — Paso 1: pide confirmación */}
                <button
                  type="button"
                  onClick={alPedirConfirmacionCierre}
                  disabled={ocupado}
                  className="min-h-tactil flex-1 rounded-canon35 bg-peligro/80 text-crema-ticket font-semibold px-4 disabled:opacity-50"
                >
                  Cerrar turno
                </button>
              </>
            ) : (
              /* B4 — Botón para iniciar nuevo turno sin salir del gestor */
              <button
                type="button"
                onClick={alNuevoTurno}
                data-testid="nuevo-turno"
                className="min-h-tactil flex-1 rounded-canon35 bg-acento text-fondo-profundo font-semibold px-4"
              >
                Iniciar Nuevo Turno
              </button>
            )}
          </div>

          {/* B3 — Modal de confirmación del cierre (acción irreversible) */}
          {confirmandoCierre ? (
            <div
              role="alertdialog"
              aria-label="Confirmar cierre de turno"
              className="rounded-canon35 bg-peligro/10 border border-peligro/40 p-4 flex flex-col gap-3"
            >
              <p className="text-crema-ticket font-semibold">
                ⚠️ Esta acción es <strong className="text-peligro">irreversible</strong>.
              </p>
              <p className="text-sm text-crema-ticket/70">
                ¿Confirmar cierre con descuadre de{' '}
                <strong className={descuadreEnVivo === 0 ? 'text-acento' : 'text-peligro'}>
                  {formatearPrecio(descuadreEnVivo)}
                </strong>?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmandoCierre(false)}
                  className="min-h-tactil flex-1 rounded-canon35 bg-fondo-panel text-crema-ticket border border-white/10 px-4"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={alCerrarTurno}
                  disabled={ocupado}
                  data-testid="confirmar-cierre-definitivo"
                  className="min-h-tactil flex-1 rounded-canon35 bg-peligro text-white font-semibold px-4 disabled:opacity-50"
                >
                  {ocupado ? 'Cerrando…' : 'Sí, cerrar turno'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* FASE 10.6.1 — teclado táctil (paridad de operación del viejo POS).
          Solo se muestra cuando hay un campo enfocado: el cajero toca el campo
          y luego teclea. El teclado es puro; la máquina de foco vive arriba. */}
      {campoActivo ? (
        <TecladoTactil
          valor={valoresRef.current[campoActivo] ?? ''}
          onTecla={alPulsarTecla}
          activo
          etiqueta={CAMPOS[campoActivo]?.etiqueta || ''}
        />
      ) : null}

      {/* FASE 10.4 — modal de contexto diario (se abre al cerrar el turno). */}
      {mostrarContexto ? (
        <DailyContextModal
          servicio={servicioContexto}
          onCerrar={alCerrarContexto}
        />
      ) : null}

      {/* FASE 10.6.4 — NOTA DE DISEÑO: el viejo POS montaba un
          `CorteTicketTemplate` oculto y serializaba su DOM para imprimir. El
          POS nuevo NO lo necesita: `alImprimirCorte` genera el string térmico
          con `generarCorteHTML` (autosuficiente, sin leer el DOM). Montar una
          copia oculta duplicaría los `data-testid` del resumen visible
          (`esperado`, `contado`, `diferencia`, `movimientos`) y rompería las
          consultas de los tests. La paridad es de OPERACIÓN (se imprime el
          corte), no de DOM. */}
    </div>
  );
}
