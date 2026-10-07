/**
 * Puerta de FASE 9.1.3 — UI de pagos mixtos (`CheckoutScreen`).
 *
 * Verifica los criterios del plan (§3.4):
 *   1. Agregar 2 pagos (efectivo + tarjeta) y ver el FALTANTE en vivo.
 *   2. Editar un abono antes de confirmar.
 *   3. Borrar un abono antes de confirmar.
 *   4. Confirmar habilitado SOLO cuando la suma cuadra.
 *   5. El caso de UN solo pago sigue funcionando idéntico (REGRESIÓN).
 *   6. Se conserva el `TecladoNumerico` de F9.0.2.
 *
 * @see PLAN_DE_ABORDAJE_FASE_9_1_PAGOS_MIXTOS.md §3.4
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import CheckoutScreen from './CheckoutScreen.jsx';

afterEach(() => {
  cleanup();
});

/** Monta el checkout con un total y espías de confirmación/cancelación. */
function montar(total = 100) {
  const onConfirmar = vi.fn();
  const onCancelar = vi.fn();
  render(
    <CheckoutScreen
      total={total}
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
      procesando={false}
      error={null}
    />
  );
  return { onConfirmar, onCancelar };
}

/**
 * Devuelve el input de captura del monto.
 *
 * FIX "cobro parcial": la captura es ÚNICA. En efectivo la etiqueta es
 * "Efectivo recibido"; en tarjeta/transferencia es "Monto a cobrar". El
 * teclado numérico y el input nativo escriben el MISMO campo.
 *
 * El helper es agnóstico al método: busca la etiqueta de efectivo y, si no
 * existe (porque el método cambió), cae a la de tarjeta/transferencia.
 */
function inputMonto() {
  return (
    screen.queryByLabelText('Efectivo recibido') ||
    screen.getByLabelText('Monto a cobrar')
  );
}

/** Devuelve el input de captura cuando el método NO es efectivo. */
function inputMontoNoEfectivo() {
  return screen.getByLabelText('Monto a cobrar');
}

/** Captura el input de monto y le escribe un valor. */
function escribirMonto(valor) {
  fireEvent.change(inputMonto(), { target: { value: String(valor) } });
}

/** Selecciona un método de pago por su etiqueta visible. */
function elegirMetodo(etiqueta) {
  fireEvent.click(screen.getByText(etiqueta));
}

/** Localiza el botón "Agregar pago" (su etiqueta incluye el método). */
function botonAgregarPago() {
  return screen.getByRole('button', { name: /Agregar pago/ });
}

/** Agrega un abono con el método ya seleccionado. */
function agregarAbono(monto) {
  escribirMonto(monto);
  fireEvent.click(botonAgregarPago());
}

// ---------------------------------------------------------------------------
// 1. Agregar pagos y ver el faltante
// ---------------------------------------------------------------------------

describe('F9.1.3 — agregar pagos y ver el faltante', () => {
  it('agrega un abono de efectivo y muestra el faltante', () => {
    montar(100);
    agregarAbono(40);
    // El abono aparece en la lista (se busca dentro de la lista para no
    // confundirlo con el botón de método "Efectivo").
    const lista = screen.getByLabelText('Abonos agregados');
    expect(lista.querySelectorAll('li')).toHaveLength(1);
    expect(lista.textContent).toContain('Efectivo');
    // El resumen muestra el faltante de $60.
    expect(screen.getByText('Faltante')).toBeTruthy();
    expect(screen.getByText('$60.00')).toBeTruthy();
  });

  it('agrega un segundo abono (tarjeta) y el faltante llega a cero', () => {
    montar(100);
    agregarAbono(40);
    elegirMetodo('Tarjeta');
    agregarAbono(60);
    // Dos abonos en la lista.
    const lista = screen.getByLabelText('Abonos agregados');
    expect(lista.querySelectorAll('li')).toHaveLength(2);
    // Faltante en cero.
    expect(screen.getByText('$0.00')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. Editar un abono
// ---------------------------------------------------------------------------

describe('F9.1.3 — editar un abono', () => {
  it('edita el monto de un abono y recalcula el faltante', () => {
    montar(100);
    agregarAbono(40);
    fireEvent.click(screen.getByText('Editar'));
    // El formulario entra en modo edición.
    escribirMonto(100);
    fireEvent.click(screen.getByText('Guardar abono'));
    // Ya cuadra: el faltante es cero.
    expect(screen.getByText('$0.00')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 3. Borrar un abono
// ---------------------------------------------------------------------------

describe('F9.1.3 — borrar un abono', () => {
  it('borra un abono y vuelve a mostrar el faltante', () => {
    montar(100);
    agregarAbono(100);
    // Con un abono que cubre el total, el faltante es cero.
    expect(screen.getByText('$0.00')).toBeTruthy();
    fireEvent.click(screen.getByText('Borrar'));
    // Sin abonos, vuelve el mensaje de "sin abonos".
    expect(screen.getByText(/Sin abonos/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 4. Confirmar habilitado solo cuando cuadra
// ---------------------------------------------------------------------------

describe('F9.1.3 — confirmar solo cuando cuadra', () => {
  it('el botón está deshabilitado con faltante y se habilita al cuadrar', () => {
    montar(100);
    agregarAbono(40);
    const boton = screen.getByText('CONFIRMAR PAGO');
    expect(boton.disabled).toBe(true);
    agregarAbono(60);
    expect(screen.getByText('CONFIRMAR PAGO').disabled).toBe(false);
  });

  it('al confirmar con abonos envía la lista de abonos', () => {
    const { onConfirmar } = montar(100);
    agregarAbono(40);
    elegirMetodo('Tarjeta');
    agregarAbono(60);
    fireEvent.click(screen.getByText('CONFIRMAR PAGO'));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    const payload = onConfirmar.mock.calls[0][0];
    expect(Array.isArray(payload.abonos)).toBe(true);
    expect(payload.abonos).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 5. Regresión: un solo pago
// ---------------------------------------------------------------------------

describe('F9.1.3 — regresión: un solo pago', () => {
  it('sin abonos, confirma el pago único con el método seleccionado', () => {
    const { onConfirmar } = montar(100);
    // Efectivo recibido = 100 (cubre el total).
    escribirMonto(100);
    fireEvent.click(screen.getByText('CONFIRMAR PAGO'));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    const payload = onConfirmar.mock.calls[0][0];
    expect(payload.metodo).toBe('EFECTIVO');
    expect(payload.recibido).toBe(100);
    expect(payload.abonos).toBeUndefined();
  });

  it('en efectivo con recibido menor al total, el botón está deshabilitado', () => {
    montar(100);
    escribirMonto(50);
    expect(screen.getByText('CONFIRMAR PAGO').disabled).toBe(true);
  });

  it('con tarjeta (sin abonos) se puede cobrar el total exacto', () => {
    const { onConfirmar } = montar(100);
    elegirMetodo('Tarjeta');
    fireEvent.click(screen.getByText('CONFIRMAR PAGO'));
    const payload = onConfirmar.mock.calls[0][0];
    expect(payload.metodo).toBe('DEBITO');
    expect(payload.recibido).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 6. Se conserva el TecladoNumerico (F9.0.2)
// ---------------------------------------------------------------------------

describe('F9.1.3 — se conserva el teclado numérico', () => {
  it('el teclado táctil sigue presente en el modo efectivo', () => {
    montar(100);
    // El teclado expone teclas numéricas (1..9) y el 0.
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 7. FIX "cobro parcial" — regresión de los dos defectos reportados
// ---------------------------------------------------------------------------

describe('FIX cobro parcial — D1: el abono parcial en efectivo es descubrible', () => {
  it('el botón "Agregar pago" está visible y habilitado tras capturar un monto', () => {
    montar(100);
    const boton = botonAgregarPago();
    // Sin monto capturado, el botón está deshabilitado (no hay nada que abonar).
    expect(boton.disabled).toBe(true);
    // Al capturar un monto parcial, se habilita.
    escribirMonto(40);
    expect(botonAgregarPago().disabled).toBe(false);
  });

  it('permite abonar un pago parcial en efectivo y muestra el faltante', () => {
    montar(100);
    // Abono parcial de $40 en efectivo (el resto queda pendiente).
    agregarAbono(40);
    const lista = screen.getByLabelText('Abonos agregados');
    expect(lista.querySelectorAll('li')).toHaveLength(1);
    expect(lista.textContent).toContain('Efectivo');
    expect(screen.getByText('$60.00')).toBeTruthy();
  });
});

describe('FIX cobro parcial — D2: el teclado NO desaparece al elegir tarjeta', () => {
  it('el teclado numérico sigue visible con el método Tarjeta', () => {
    montar(100);
    elegirMetodo('Tarjeta');
    // El teclado debe seguir montado (antes desaparecía con `esEfectivo`).
    expect(screen.getByRole('group', { name: 'Teclado numérico de efectivo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '7' })).toBeTruthy();
  });

  it('permite teclear el monto del abono con tarjeta usando el teclado', () => {
    montar(100);
    elegirMetodo('Tarjeta');
    // Teclea "60" con el teclado en pantalla.
    fireEvent.click(screen.getByRole('button', { name: '6' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    // El input de captura (etiqueta "Monto a cobrar") refleja lo tecleado.
    expect(inputMontoNoEfectivo().value).toBe('60');
    // Y se puede agregar como abono de tarjeta.
    fireEvent.click(botonAgregarPago());
    const lista = screen.getByLabelText('Abonos agregados');
    expect(lista.querySelectorAll('li')).toHaveLength(1);
    expect(lista.textContent).toContain('Tarjeta');
  });

  it('permite un pago mixto: efectivo parcial + tarjeta parcial', () => {
    montar(100);
    // 1) Abono parcial en efectivo.
    agregarAbono(40);
    // 2) Cambia a tarjeta y abona el resto con el teclado.
    elegirMetodo('Tarjeta');
    fireEvent.click(screen.getByRole('button', { name: '6' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    fireEvent.click(botonAgregarPago());
    // Dos abonos y el faltante en cero.
    const lista = screen.getByLabelText('Abonos agregados');
    expect(lista.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('$0.00')).toBeTruthy();
    expect(screen.getByText('CONFIRMAR PAGO').disabled).toBe(false);
  });
});
