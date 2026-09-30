/**
 * Puerta de FASE 10.6.1 — Teclado táctil del Gestor de Caja (frontend).
 *
 * Verifica que `GestorDeCaja` recupera la OPERACIÓN del teclado táctil del viejo
 * POS: el cajero toca un campo de monto y teclea en pantalla, sin depender del
 * teclado físico. La IMPLEMENTACIÓN se reescribe (§6.8): el teclado es un
 * componente puro (`TecladoTactil`) y la máquina de foco vive en el contenedor.
 *
 *   1. Sin campo enfocado, el teclado NO se muestra.
 *   2. Al enfocar un campo, el teclado aparece y refleja su etiqueta.
 *   3. Teclear dígitos construye el monto en el campo enfocado.
 *   4. Un solo punto decimal (el segundo se ignora).
 *   5. Máximo dos decimales (el tercero se ignora).
 *   6. `←` borra el último carácter; `C` limpia todo.
 *   7. `ENTER` avanza el foco al siguiente campo del estado (CIERRE).
 *   8. El monto tecleado se envía al registrar el movimiento.
 *
 * Este archivo lo ejecuta Vitest (jsdom) vía `npm run test` en apps/pos.
 *
 * @see PLAN_DE_ABORDAJE_F10_6_PARIDAD_DE_OPERACION_DE_CAJA.md §5 (F10.6.1)
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

import GestorDeCaja from './GestorDeCaja.jsx';

afterEach(() => {
  cleanup();
});

/** Turno abierto de ejemplo (contrato 10). */
function turnoAbierto() {
  return {
    cash_session_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    terminal_id: 'TERM-01',
    monto_inicial: '500.00',
    abierta_en: '2026-09-30T14:00:00Z',
  };
}

/** Resumen del turno (contrato 12) mínimo. */
function resumenTurno(extra = {}) {
  return {
    esperado: '1500.00',
    movimientos: [],
    fondo_inicial: '500.00',
    total_entradas: '0.00',
    total_salidas: '0.00',
    total_credito: '0.00',
    total_debito: '0.00',
    total_ventas: '0.00',
    num_transacciones: 0,
    ...extra,
  };
}

/** Servicio de caja doble con turno ya abierto. */
function servicioCaja(resumen = resumenTurno()) {
  return {
    obtenerTurnoActivo: vi.fn(async () => ({
      outcome: 'ok',
      reason: null,
      data: turnoAbierto(),
    })),
    obtenerResumen: vi.fn(async () => ({
      outcome: 'ok',
      reason: null,
      data: resumen,
    })),
    cerrarTurno: vi.fn(),
    abrirTurno: vi.fn(),
    registrarMovimiento: vi.fn(async () => ({
      outcome: 'ok',
      reason: null,
      data: { id: 'mov-1' },
    })),
  };
}

/** Servicio de contexto doble (contrato 28) — no interviene aquí. */
function servicioContexto() {
  return {
    CLIMAS: [],
    enviarContextoDiario: vi.fn(async () => ({ outcome: 'ok', reason: null, data: {} })),
  };
}

/** Monta el gestor con un turno ya abierto y espera el resumen asíncrono. */
async function montarConTurnoAbierto(servicio) {
  render(
    <GestorDeCaja
      terminalId="TERM-01"
      usuarioId="user-1"
      servicio={servicio}
      servicioContexto={servicioContexto()}
    />
  );
  await waitFor(() => {
    expect(screen.getByText('Resumen del turno')).toBeTruthy();
  });
  await waitFor(() => {
    expect(servicio.obtenerResumen).toHaveBeenCalled();
  });
}

/** Monta el gestor SIN turno (formulario de apertura). */
async function montarSinTurno(servicio) {
  servicio.obtenerTurnoActivo = vi.fn(async () => ({
    outcome: 'ok',
    reason: null,
    data: null,
  }));
  render(
    <GestorDeCaja
      terminalId="TERM-01"
      usuarioId="user-1"
      servicio={servicio}
      servicioContexto={servicioContexto()}
    />
  );
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Abrir turno' })).toBeTruthy();
  });
}

/** Pulsa una tecla del teclado táctil por su aria-label. */
function teclear(tecla) {
  fireEvent.click(screen.getByLabelText(`Tecla ${tecla}`));
}

// ---------------------------------------------------------------------------
// 1. Visibilidad del teclado
// ---------------------------------------------------------------------------

describe('F10.6.1 — criterio 1: el teclado aparece solo con un campo enfocado', () => {
  it('no muestra el teclado si ningún campo está enfocado', async () => {
    const servicio = servicioCaja();
    await montarConTurnoAbierto(servicio);
    expect(screen.queryByLabelText('Teclado táctil')).toBeNull();
  });

  it('muestra el teclado al enfocar el monto del movimiento', async () => {
    const servicio = servicioCaja();
    await montarConTurnoAbierto(servicio);
    fireEvent.focus(screen.getByTestId('campo-montoMov'));
    expect(screen.getByLabelText('Teclado táctil')).toBeTruthy();
    expect(screen.getByText('Monto del movimiento')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. Construcción del monto
// ---------------------------------------------------------------------------

describe('F10.6.1 — criterio 2: teclear construye el monto', () => {
  it('concatena los dígitos en el campo enfocado', async () => {
    const servicio = servicioCaja();
    await montarConTurnoAbierto(servicio);
    fireEvent.focus(screen.getByTestId('campo-montoMov'));

    teclear('1');
    teclear('2');
    teclear('3');

    expect(screen.getByTestId('campo-montoMov').value).toBe('123');
    expect(screen.getByTestId('teclado-display').textContent).toBe('123');
  });

  it('ignora un segundo punto decimal', async () => {
    const servicio = servicioCaja();
    await montarConTurnoAbierto(servicio);
    fireEvent.focus(screen.getByTestId('campo-montoMov'));

    teclear('1');
    teclear('.');
    teclear('5');
    teclear('.'); // ignorado
    teclear('9');

    expect(screen.getByTestId('campo-montoMov').value).toBe('1.59');
  });

  it('limita a dos decimales', async () => {
    const servicio = servicioCaja();
    await montarConTurnoAbierto(servicio);
    fireEvent.focus(screen.getByTestId('campo-montoMov'));

    teclear('1');
    teclear('.');
    teclear('2');
    teclear('3');
    teclear('4'); // ignorado (tercer decimal)

    expect(screen.getByTestId('campo-montoMov').value).toBe('1.23');
  });

  it('no deja ceros a la izquierda', async () => {
    const servicio = servicioCaja();
    await montarConTurnoAbierto(servicio);
    fireEvent.focus(screen.getByTestId('campo-montoMov'));

    teclear('0');
    teclear('5');

    expect(screen.getByTestId('campo-montoMov').value).toBe('5');
  });
});

// ---------------------------------------------------------------------------
// 3. Borrado y limpieza
// ---------------------------------------------------------------------------

describe('F10.6.1 — criterio 3: borrar y limpiar', () => {
  it('← borra el último carácter', async () => {
    const servicio = servicioCaja();
    await montarConTurnoAbierto(servicio);
    fireEvent.focus(screen.getByTestId('campo-montoMov'));

    teclear('1');
    teclear('2');
    teclear('3');
    teclear('←');

    expect(screen.getByTestId('campo-montoMov').value).toBe('12');
  });

  it('C limpia todo el campo', async () => {
    const servicio = servicioCaja();
    await montarConTurnoAbierto(servicio);
    fireEvent.focus(screen.getByTestId('campo-montoMov'));

    teclear('1');
    teclear('2');
    teclear('C');

    expect(screen.getByTestId('campo-montoMov').value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 4. ENTER avanza el foco (estado CIERRE)
// ---------------------------------------------------------------------------

describe('F10.6.1 — criterio 4: ENTER avanza el foco', () => {
  it('pasa de efectivo a crédito y luego a débito', async () => {
    const servicio = servicioCaja();
    await montarConTurnoAbierto(servicio);

    // Entrar al estado CIERRE.
    fireEvent.click(screen.getByText('Cerrar turno'));

    fireEvent.focus(screen.getByTestId('campo-conteoEfectivo'));
    // El display del teclado refleja el campo enfocado (su etiqueta).
    expect(screen.getByTestId('teclado-display').previousSibling.textContent).toBe(
      'Efectivo contado'
    );

    teclear('ENTER');
    expect(screen.getByTestId('teclado-display').previousSibling.textContent).toBe(
      'Crédito contado'
    );

    teclear('ENTER');
    expect(screen.getByTestId('teclado-display').previousSibling.textContent).toBe(
      'Débito contado'
    );

    // En el último campo, ENTER desenfoca (el teclado desaparece).
    teclear('ENTER');
    expect(screen.queryByLabelText('Teclado táctil')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. El monto tecleado llega al servicio
// ---------------------------------------------------------------------------

describe('F10.6.1 — criterio 5: el monto tecleado se envía', () => {
  it('registra el movimiento con el monto construido en pantalla', async () => {
    const servicio = servicioCaja();
    await montarConTurnoAbierto(servicio);

    fireEvent.focus(screen.getByTestId('campo-montoMov'));
    teclear('2');
    teclear('5');
    teclear('.');
    teclear('5');

    fireEvent.change(screen.getByLabelText('Motivo del movimiento'), {
      target: { value: 'Cambio' },
    });
    fireEvent.click(screen.getByText('Registrar movimiento'));

    await waitFor(() => {
      expect(servicio.registrarMovimiento).toHaveBeenCalledWith(
        expect.objectContaining({ monto: 25.5, motivo: 'Cambio' })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// 6. El teclado también sirve en el formulario de apertura
// ---------------------------------------------------------------------------

describe('F10.6.1 — criterio 6: teclado en el formulario de apertura', () => {
  it('permite teclear el fondo inicial', async () => {
    const servicio = servicioCaja();
    await montarSinTurno(servicio);

    fireEvent.focus(screen.getByTestId('campo-fondoInicial'));
    teclear('5');
    teclear('0');
    teclear('0');

    expect(screen.getByTestId('campo-fondoInicial').value).toBe('500');
  });
});
