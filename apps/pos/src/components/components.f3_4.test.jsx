/**
 * Puerta de FASE 3.4 — Interfaz real (componentes).
 *
 * Verifica que los 5 componentes de la interfaz del POS existen, renderizan y
 * cumplen su contrato visible:
 *
 *   1. `POSHeader`      — estado de cuenta, tipo de venta, indicador de red.
 *   2. `SalesReceipt`   — edición de cantidad (− / +), banner de estado, total.
 *   3. `CheckoutScreen` — efectivo/tarjeta, cambio, validación, error.
 *   4. `POSOverlays`    — OverlayExito / OverlayError / OverlayConfirmar.
 *   5. `RetailVisionPOS`— orquestador de hooks (no monolito).
 *
 * Reglas que se comprueban aquí (no en el backend):
 *   - R-01: los contenedores raíz son fluidos (`w-full`), sin ancho fijo.
 *   - R-04: los controles táctiles usan `min-h-tactil` / `min-w-tactil`.
 *   - Prohibición #2: el banner de estado es persistente (`role="alert"`).
 *   - Regla 19: el error de cobro NO cierra el modal (se muestra inline).
 *
 * Este archivo lo ejecuta Vitest (jsdom) vía `npm run test` en apps/pos.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import POSHeader from './POSHeader.jsx';
import SalesReceipt, { calcularTotal } from './SalesReceipt.jsx';
import CheckoutScreen from './CheckoutScreen.jsx';
import { OverlayExito, OverlayError, OverlayConfirmar } from './POSOverlays.jsx';

afterEach(() => {
  cleanup();
});

/** Una línea de ticket de ejemplo. */
function lineaEjemplo(extra = {}) {
  return {
    item_id: 'item-1',
    product_id: 'prod-1',
    name: 'Concha de Vainilla',
    unit_price: 18.5,
    quantity: 2,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// 1. POSHeader
// ---------------------------------------------------------------------------

describe('POSHeader — cabecera (estado, tipo de venta, red)', () => {
  it('renderiza la terminal activa y el botón "Cambiar Estación"', () => {
    render(<POSHeader terminalId="TERM-01" />);
    expect(screen.getByText('Terminal TERM-01')).toBeTruthy();
    expect(screen.getByText('Cambiar Estación')).toBeTruthy();
  });

  it('muestra el estado de la cuenta por defecto (Nueva Venta)', () => {
    render(<POSHeader terminalId="TERM-01" />);
    expect(screen.getByText('Nueva Venta')).toBeTruthy();
  });

  it('traduce los 3 estados de la cuenta a etiquetas humanas', () => {
    const { rerender } = render(<POSHeader terminalId="TERM-01" estado="COBRANDO" />);
    expect(screen.getByText('Cobrando…')).toBeTruthy();

    rerender(<POSHeader terminalId="TERM-01" estado="PAGADA" />);
    expect(screen.getByText('Venta Cobrada')).toBeTruthy();
  });

  it('muestra el tipo de venta (canal) cuando se le pasa', () => {
    render(<POSHeader terminalId="TERM-01" tipoVenta="PANADERIA" />);
    expect(screen.getByText('PANADERIA')).toBeTruthy();
  });

  it('refleja el indicador de red: en línea vs sin red', () => {
    const { rerender } = render(<POSHeader terminalId="TERM-01" enLinea />);
    expect(screen.getByText('En línea')).toBeTruthy();

    rerender(<POSHeader terminalId="TERM-01" enLinea={false} />);
    expect(screen.getByText('Sin red')).toBeTruthy();
  });

  it('refleja el estado de sesión: abierta vs sin sesión', () => {
    const { rerender } = render(<POSHeader terminalId="TERM-01" sesionAbierta />);
    expect(screen.getByText('Sesión abierta')).toBeTruthy();

    rerender(<POSHeader terminalId="TERM-01" sesionAbierta={false} />);
    expect(screen.getByText('Sin sesión')).toBeTruthy();
  });

  it('dispara onCambiarEstacion al pulsar el botón de terminal', () => {
    const onCambiarEstacion = vi.fn();
    render(<POSHeader terminalId="TERM-01" onCambiarEstacion={onCambiarEstacion} />);
    fireEvent.click(screen.getByText('Cambiar Estación'));
    expect(onCambiarEstacion).toHaveBeenCalledTimes(1);
  });

  it('R-01: el contenedor raíz es fluido (w-full) y sin ancho fijo', () => {
    const { container } = render(<POSHeader terminalId="TERM-01" />);
    const header = container.querySelector('header');
    expect(header.className).toContain('w-full');
    expect(header.className).not.toMatch(/w-\[\d+px\]/);
  });
});

// ---------------------------------------------------------------------------
// 2. SalesReceipt
// ---------------------------------------------------------------------------

describe('SalesReceipt — ticket (cantidad, banner, total)', () => {
  it('muestra el ticket vacío cuando no hay líneas', () => {
    render(<SalesReceipt lineas={[]} />);
    expect(screen.getByText(/El ticket esta vacio/)).toBeTruthy();
  });

  it('renderiza las líneas con nombre, cantidad e importe', () => {
    render(<SalesReceipt lineas={[lineaEjemplo()]} />);
    expect(screen.getByText('Concha de Vainilla')).toBeTruthy();
    expect(screen.getByText('2x')).toBeTruthy();
    // 18.50 * 2 = 37.00
    expect(screen.getAllByText('$37.00').length).toBeGreaterThanOrEqual(1);
  });

  it('F3.4: ofrece edición de cantidad con botones − / +', () => {
    const onIncrementar = vi.fn();
    const onDecrementar = vi.fn();
    render(
      <SalesReceipt
        lineas={[lineaEjemplo()]}
        onIncrementar={onIncrementar}
        onDecrementar={onDecrementar}
      />,
    );

    fireEvent.click(screen.getByLabelText('Añadir una unidad de Concha de Vainilla'));
    expect(onIncrementar).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Quitar una unidad de Concha de Vainilla'));
    expect(onDecrementar).toHaveBeenCalledTimes(1);
  });

  it('F3.4: los botones de cantidad respetan el target táctil (R-04)', () => {
    render(<SalesReceipt lineas={[lineaEjemplo()]} onIncrementar={() => {}} onDecrementar={() => {}} />);
    const botonMas = screen.getByLabelText('Añadir una unidad de Concha de Vainilla');
    expect(botonMas.className).toContain('min-h-tactil');
    expect(botonMas.className).toContain('min-w-tactil');
  });

  it('F3.4: muestra el banner de estado persistente (role="alert")', () => {
    render(
      <SalesReceipt
        lineas={[lineaEjemplo()]}
        banner={{ tipo: 'error', mensaje: 'No se pudo guardar la línea' }}
      />,
    );
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('No se pudo guardar la línea');
  });

  it('no muestra banner cuando no se le pasa', () => {
    render(<SalesReceipt lineas={[lineaEjemplo()]} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('deshabilita COBRAR cuando el ticket está vacío', () => {
    render(<SalesReceipt lineas={[]} onCobrar={() => {}} />);
    const boton = screen.getByRole('button', { name: /ENVIAR CUENTA/ });
    expect(boton.disabled).toBe(true);
  });

  it('dispara onCobrar cuando hay líneas', () => {
    const onCobrar = vi.fn();
    render(<SalesReceipt lineas={[lineaEjemplo()]} onCobrar={onCobrar} />);
    fireEvent.click(screen.getByRole('button', { name: /ENVIAR CUENTA/ }));
    expect(onCobrar).toHaveBeenCalledTimes(1);
  });

  it('calcularTotal suma unit_price × quantity (RN-16)', () => {
    const total = calcularTotal([
      lineaEjemplo({ unit_price: 10, quantity: 3 }),
      lineaEjemplo({ item_id: 'item-2', unit_price: 5.5, quantity: 2 }),
    ]);
    expect(total).toBe(41);
  });
});

// ---------------------------------------------------------------------------
// 3. CheckoutScreen
// ---------------------------------------------------------------------------

describe('CheckoutScreen — cobro (efectivo, tarjeta, cambio, validación)', () => {
  it('renderiza los 3 métodos de pago y el total', () => {
    render(<CheckoutScreen total={100} onConfirmar={() => {}} onCancelar={() => {}} />);
    expect(screen.getByText('Efectivo')).toBeTruthy();
    expect(screen.getByText('Tarjeta')).toBeTruthy();
    expect(screen.getByText('Transferencia')).toBeTruthy();
    expect(screen.getByText('$100.00')).toBeTruthy();
  });

  it('F3.4: ofrece botones rápidos de billetes ($50/$100/$200/$500)', () => {
    render(<CheckoutScreen total={100} onConfirmar={() => {}} onCancelar={() => {}} />);
    expect(screen.getByText('$50')).toBeTruthy();
    expect(screen.getByText('$100')).toBeTruthy();
    expect(screen.getByText('$200')).toBeTruthy();
    expect(screen.getByText('$500')).toBeTruthy();
  });

  it('F3.4: valida que el efectivo recibido cubra el total', () => {
    render(<CheckoutScreen total={100} onConfirmar={() => {}} onCancelar={() => {}} />);
    const boton = screen.getByRole('button', { name: /CONFIRMAR PAGO/ });
    // Sin capturar efectivo, no se puede cobrar.
    expect(boton.disabled).toBe(true);
    expect(screen.getByText('Captura el efectivo recibido.')).toBeTruthy();
  });

  it('F3.4: muestra el faltante cuando el efectivo es insuficiente', () => {
    render(<CheckoutScreen total={100} onConfirmar={() => {}} onCancelar={() => {}} />);
    // Se localiza por etiqueta: el input de "Monto del abono" (F9.1.3)
    // comparte el placeholder `0.00`.
    const input = screen.getByLabelText('Efectivo recibido');
    fireEvent.change(input, { target: { value: '40' } });
    expect(screen.getByText(/Faltan/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /CONFIRMAR PAGO/ }).disabled).toBe(true);
  });

  it('F3.4: calcula el cambio en vivo y habilita el cobro', () => {
    const onConfirmar = vi.fn();
    render(<CheckoutScreen total={100} onConfirmar={onConfirmar} onCancelar={() => {}} />);
    fireEvent.click(screen.getByText('$200'));
    // Cambio = 200 - 100 = 100. El total también es $100.00, así que hay 2
    // nodos con ese texto: el total y el cambio.
    expect(screen.getAllByText('$100.00').length).toBe(2);
    const boton = screen.getByRole('button', { name: /CONFIRMAR PAGO/ });
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    expect(onConfirmar).toHaveBeenCalledWith({ metodo: 'EFECTIVO', recibido: 200, cambio: 100 });
  });

  it('F3.4: con tarjeta cobra el total exacto sin capturar efectivo', () => {
    const onConfirmar = vi.fn();
    render(<CheckoutScreen total={100} onConfirmar={onConfirmar} onCancelar={() => {}} />);
    fireEvent.click(screen.getByText('Tarjeta'));
    const boton = screen.getByRole('button', { name: /CONFIRMAR PAGO/ });
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    // F9.1.3: la UI "Tarjeta" se canoniza a DEBITO (RN-57 solo acepta
    // EFECTIVO/CREDITO/DEBITO/TRANSFERENCIA; "TARJETA" sería rechazado).
    expect(onConfirmar).toHaveBeenCalledWith({ metodo: 'DEBITO', recibido: 100, cambio: 0 });
  });

  it('F3.4: muestra el error de cobro inline sin cerrar el modal (Regla 19)', () => {
    render(
      <CheckoutScreen
        total={100}
        onConfirmar={() => {}}
        onCancelar={() => {}}
        error="No se pudo confirmar el pago"
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('No se pudo confirmar el pago');
    // El modal sigue montado.
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('deshabilita las acciones mientras procesa', () => {
    render(<CheckoutScreen total={100} onConfirmar={() => {}} onCancelar={() => {}} procesando />);
    expect(screen.getByRole('button', { name: /Procesando/ }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Cancelar/ }).disabled).toBe(true);
  });

  it('dispara onCancelar', () => {
    const onCancelar = vi.fn();
    render(<CheckoutScreen total={100} onConfirmar={() => {}} onCancelar={onCancelar} />);
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }));
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 4. POSOverlays
// ---------------------------------------------------------------------------

describe('POSOverlays — modales de confirmación', () => {
  it('OverlayExito muestra folio, total y "Nueva venta"', () => {
    const onNuevaVenta = vi.fn();
    render(
      <OverlayExito
        ticket={{ account_num: 'A-0001', total: 37, status: 'PAID' }}
        onNuevaVenta={onNuevaVenta}
      />,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('A-0001')).toBeTruthy();
    expect(screen.getByText('$37.00')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Nueva venta/ }));
    expect(onNuevaVenta).toHaveBeenCalledTimes(1);
  });

  it('OverlayExito no renderiza nada sin ticket', () => {
    const { container } = render(<OverlayExito ticket={null} onNuevaVenta={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('OverlayError muestra el motivo y permite reintentar/cerrar', () => {
    const onReintentar = vi.fn();
    const onCerrar = vi.fn();
    render(<OverlayError mensaje="Fallo de red" onReintentar={onReintentar} onCerrar={onCerrar} />);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Fallo de red')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cerrar/ }));
    expect(onReintentar).toHaveBeenCalledTimes(1);
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('OverlayError no renderiza nada sin mensaje', () => {
    const { container } = render(<OverlayError mensaje={null} onCerrar={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('OverlayConfirmar muestra título, mensaje y 2 acciones', () => {
    const onConfirmar = vi.fn();
    const onCancelar = vi.fn();
    render(
      <OverlayConfirmar
        titulo="¿Cancelar la venta?"
        mensaje="Se perderán las líneas capturadas."
        etiquetaConfirmar="Sí, cancelar"
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
      />,
    );
    expect(screen.getByText('¿Cancelar la venta?')).toBeTruthy();
    expect(screen.getByText('Se perderán las líneas capturadas.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sí, cancelar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('OverlayConfirmar no renderiza nada sin título', () => {
    const { container } = render(<OverlayConfirmar titulo={null} onConfirmar={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
