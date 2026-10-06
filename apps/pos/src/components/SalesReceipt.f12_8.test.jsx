/**
 * Compuerta de FASE 12.8 — PARIDAD DE OPERACIÓN: el cobro se habilita SOLO
 * cuando la terminal está habilitada como caja (turno abierto).
 *
 * QUÉ PRUEBA ESTA COMPUERTA
 * -------------------------
 * El viejo POS (`apps/pos/components/SalesReceipt.jsx:116-135`) deshabilita el
 * botón de cobro con `cashEnabled`:
 *
 *   <button
 *     onClick={() => cashEnabled && handleCheckout()}
 *     disabled={!cashEnabled}
 *     title={!cashEnabled ? 'Presione "🏦 CAJA" para habilitar el cobro' : ''}
 *   >
 *     {cashEnabled ? 'Total a Pagar' : 'Caja no habilitada'}
 *   </button>
 *
 * El nuevo POS había PERDIDO esa compuerta: el botón COBRAR estaba siempre
 * activo (salvo ticket vacío o cobro en curso). El backend lo rechazaba
 * después (RN-49), pero la UI ofrecía una acción inválida. Es la 15ª instancia
 * de §10.6: el componente existe y pasa su test, pero su OPERACIÓN (gate del
 * cobro por caja habilitada) se perdió en la traducción.
 *
 * Esta compuerta fija las invariantes de la operación heredada:
 *   1. Sin caja habilitada, el botón COBRAR está DESHABILITADO.
 *   2. Sin caja habilitada, el rótulo dice "Caja no habilitada".
 *   3. Sin caja habilitada, el `title` guía a habilitar la caja.
 *   4. Con caja habilitada, el botón está HABILITADO y el rótulo dice
 *      "Total a Pagar".
 *   5. Con caja habilitada y ticket con líneas, `onCobrar` se dispara.
 *   6. Sin caja habilitada, pulsar el botón NO dispara `onCobrar`.
 *   7. Un ticket vacío sigue bloqueando el cobro aunque la caja esté habilitada.
 *   8. Un cobro en curso sigue bloqueando el botón.
 *
 * §6.8 — la INTEGRACIÓN se hereda; solo la IMPLEMENTACIÓN se reescribe.
 * El backend sigue siendo la autoridad final (RN-49).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import SalesReceipt from './SalesReceipt.jsx';

const LINEA = {
  item_id: 'ITEM-1',
  product_id: 'PROD-1',
  name: 'Concha',
  unit_price: 12.5,
  quantity: 2,
};

function montar(props = {}) {
  const base = {
    lineas: [LINEA],
    onIncrementar: vi.fn(),
    onDecrementar: vi.fn(),
    onQuitar: vi.fn(),
    onCobrar: vi.fn(),
    cobrando: false,
    terminalId: 'TERM-01',
    banner: null,
    cajaHabilitada: false,
  };
  return render(<SalesReceipt {...base} {...props} />);
}

function botonCobrar() {
  return screen.getByRole('button', { name: /ENVIAR CUENTA|Cobrando/ });
}

describe('F12.8 — sin caja habilitada el cobro está bloqueado', () => {
  it('el botón COBRAR está deshabilitado', () => {
    montar({ cajaHabilitada: false });
    expect(botonCobrar().disabled).toBe(true);
  });

  it('el rótulo dice "Caja no habilitada"', () => {
    montar({ cajaHabilitada: false });
    expect(screen.getByText('Caja no habilitada')).toBeTruthy();
    expect(screen.queryByText('Total a Pagar')).toBeNull();
  });

  it('el title guía a habilitar la caja', () => {
    montar({ cajaHabilitada: false });
    expect(botonCobrar().getAttribute('title')).toBe(
      'Presione "🏦 CAJA" para habilitar el cobro',
    );
  });

  it('pulsar el botón NO dispara onCobrar', () => {
    const onCobrar = vi.fn();
    montar({ cajaHabilitada: false, onCobrar });
    fireEvent.click(botonCobrar());
    expect(onCobrar).not.toHaveBeenCalled();
  });
});

describe('F12.8 — con caja habilitada el cobro está disponible', () => {
  it('el botón COBRAR está habilitado', () => {
    montar({ cajaHabilitada: true });
    expect(botonCobrar().disabled).toBe(false);
  });

  it('el rótulo dice "Total a Pagar"', () => {
    montar({ cajaHabilitada: true });
    expect(screen.getByText('Total a Pagar')).toBeTruthy();
    expect(screen.queryByText('Caja no habilitada')).toBeNull();
  });

  it('pulsar el botón dispara onCobrar', () => {
    const onCobrar = vi.fn();
    montar({ cajaHabilitada: true, onCobrar });
    fireEvent.click(botonCobrar());
    expect(onCobrar).toHaveBeenCalledTimes(1);
  });

  it('no hay title de bloqueo', () => {
    montar({ cajaHabilitada: true });
    expect(botonCobrar().getAttribute('title')).toBe('');
  });
});

describe('F12.8 — los bloqueos previos se preservan', () => {
  it('un ticket vacío bloquea el cobro aunque la caja esté habilitada', () => {
    montar({ cajaHabilitada: true, lineas: [] });
    expect(botonCobrar().disabled).toBe(true);
  });

  it('un cobro en curso bloquea el botón', () => {
    montar({ cajaHabilitada: true, cobrando: true });
    expect(botonCobrar().disabled).toBe(true);
  });

  it('el default de cajaHabilitada es false (fail-safe)', () => {
    // Sin la prop, el componente NO habilita el cobro: el estado seguro es
    // "caja no habilitada". El backend sigue siendo la autoridad (RN-49).
    render(
      <SalesReceipt
        lineas={[LINEA]}
        onIncrementar={vi.fn()}
        onDecrementar={vi.fn()}
        onQuitar={vi.fn()}
        onCobrar={vi.fn()}
        cobrando={false}
        terminalId="TERM-01"
        banner={null}
      />,
    );
    expect(botonCobrar().disabled).toBe(true);
    expect(screen.getByText('Caja no habilitada')).toBeTruthy();
  });
});
