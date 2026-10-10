/**
 * Puerta de FASE 5.3 — Pizarrón de cuentas abiertas (interfaz 13).
 *
 * Verifica los 8 criterios de la sub-fase 5.3:
 *   1. Renderiza una tarjeta (post-it) por cuenta.
 *   2. Muestra el folio corto (`#` + últimos 3 dígitos) y el total formateado.
 *   3. El post-it (la propia tarjeta) llama a `recuperarCuenta` con el `id` correcto.
 *   4. Estado vacío: "No hay cuentas pendientes en el pizarrón".
 *   5. Estado de carga: indicador visible.
 *   6. Estado de error: mensaje visible.
 *   7. Contenedor raíz fluido (`w-full`) y sin ancho fijo (R-01).
 *   8. Cada tarjeta tiene `min-h-tactil` (R-04).
 *
 * NOTA DE PARIDAD (F12.6/F12.9): el pizarrón del viejo POS muestra el folio
 * CORTO (`#001` vía `slice(-3)`) y la tarjeta entera es el elemento clickeable
 * (no existe un botón "Recuperar" separado). Esta compuerta se alineó a esa
 * presentación real tras el rewrite de F12.6.
 *
 * El componente consume `useOpenAccounts`; aquí se inyectan dobles del servicio
 * y del cliente para no tocar la red.
 *
 * Este archivo lo ejecuta Vitest (jsdom) vía `npm run test` en apps/pos.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

import OpenAccountsCorkboard from './OpenAccountsCorkboard.jsx';

afterEach(() => {
  cleanup();
});

/** Una cuenta de ejemplo (proyección ligera, contrato 23). */
function cuentaEjemplo(extra = {}) {
  return {
    id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    account_num: 'T-0001',
    status: 'OPEN',
    total: '150.00',
    version: 3,
    ...extra,
  };
}

/** Servicio doble que devuelve una lista de cuentas. */
function servicioCon(cuentas) {
  return {
    listarCuentasAbiertas: vi.fn(async () => ({
      outcome: 'ok',
      reason: null,
      data: { cuentas },
    })),
  };
}

/** Servicio doble que falla con un `reason`. */
function servicioQueFalla(reason) {
  return {
    listarCuentasAbiertas: vi.fn(async () => ({
      outcome: 'error',
      reason,
      data: null,
    })),
  };
}

/** Cliente doble que devuelve un ticket fresco (contrato 21). */
function clienteCon(ticket) {
  return {
    leerTicket: vi.fn(async () => ticket),
  };
}

// ---------------------------------------------------------------------------
// 1. Una tarjeta por cuenta
// ---------------------------------------------------------------------------

describe('F5.3 — criterio 1: una tarjeta por cuenta', () => {
  it('renderiza una tarjeta por cada cuenta abierta', async () => {
    const cuentas = [
      cuentaEjemplo({ id: 'id-1', account_num: 'T-0001' }),
      cuentaEjemplo({ id: 'id-2', account_num: 'T-0002' }),
      cuentaEjemplo({ id: 'id-3', account_num: 'T-0003' }),
    ];
    render(
      <OpenAccountsCorkboard terminalId="TERM-01" servicioCuentas={servicioCon(cuentas)} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('folio-id-1')).toBeTruthy();
    });
    expect(screen.getByTestId('folio-id-2')).toBeTruthy();
    expect(screen.getByTestId('folio-id-3')).toBeTruthy();
    // Cada post-it es un elemento clickeable (role="button").
    expect(screen.getAllByRole('button', { name: /Ver Cuenta/i })).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 2. Folio y total formateado
// ---------------------------------------------------------------------------

describe('F5.3 — criterio 2: folio y total formateado', () => {
  it('muestra el folio corto y el total en formato de moneda', async () => {
    const cuentas = [cuentaEjemplo({ id: 'id-1', account_num: 'T-0042', total: '150.00' })];
    render(
      <OpenAccountsCorkboard terminalId="TERM-01" servicioCuentas={servicioCon(cuentas)} />
    );

    await waitFor(() => {
      // El viejo POS muestra el folio CORTO: `#` + últimos 3 dígitos.
      expect(screen.getByTestId('folio-id-1').textContent).toBe('#042');
    });
    // $150.00 en es-MX.
    expect(screen.getByTestId('total-id-1').textContent).toContain('150.00');
  });
});

// ---------------------------------------------------------------------------
// 3. El botón "Recuperar" llama con el id correcto
// ---------------------------------------------------------------------------

describe('F5.3 — criterio 3: recuperar con el id correcto', () => {
  it('llama a recuperarCuenta con el id de la cuenta tocada', async () => {
    const cuentas = [
      cuentaEjemplo({ id: 'id-1', account_num: 'T-0001' }),
      cuentaEjemplo({ id: 'id-2', account_num: 'T-0002' }),
    ];
    const clienteApi = clienteCon({ id: 'id-2', version: 9 });
    const onRecuperar = vi.fn();

    render(
      <OpenAccountsCorkboard
        terminalId="TERM-01"
        servicioCuentas={servicioCon(cuentas)}
        clienteApi={clienteApi}
        onRecuperar={onRecuperar}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('folio-id-2')).toBeTruthy();
    });

    // El post-it entero es el elemento clickeable (role="button").
    const postIts = screen.getAllByRole('button', { name: /Ver Cuenta/i });
    fireEvent.click(postIts[1]);

    await waitFor(() => {
      expect(clienteApi.leerTicket).toHaveBeenCalledWith('id-2');
    });
    // F12.10b — `onRecuperar` recibe DOS argumentos: (1) el ticket fresco del
    // contrato 21 y (2) la cuenta rica del pizarrón (contrato 23), que es la
    // ÚNICA que trae `order_type`/`delivery_type`/cliente para restaurar el
    // contexto de un PEDIDO. El segundo argumento es la cuenta tocada.
    expect(onRecuperar).toHaveBeenCalledWith(
      { id: 'id-2', version: 9 },
      expect.objectContaining({ id: 'id-2', account_num: 'T-0002' }),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Estado vacío
// ---------------------------------------------------------------------------

describe('F5.3 — criterio 4: estado vacío', () => {
  it('muestra "No hay cuentas pendientes en el pizarrón" cuando la lista está vacía', async () => {
    render(
      <OpenAccountsCorkboard terminalId="TERM-01" servicioCuentas={servicioCon([])} />
    );

    await waitFor(() => {
      expect(
        screen.getByText('No hay cuentas pendientes en el pizarrón'),
      ).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Estado de carga
// ---------------------------------------------------------------------------

describe('F5.3 — criterio 5: estado de carga', () => {
  it('muestra el indicador de carga mientras la lectura está en vuelo', () => {
    // Un servicio que nunca resuelve mantiene el estado de carga.
    const servicioLento = {
      listarCuentasAbiertas: vi.fn(() => new Promise(() => {})),
    };
    render(
      <OpenAccountsCorkboard terminalId="TERM-01" servicioCuentas={servicioLento} />
    );

    expect(screen.getByText('Cargando cuentas…')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 6. Estado de error
// ---------------------------------------------------------------------------

describe('F5.3 — criterio 6: estado de error', () => {
  it('muestra un banner persistente con el mensaje del fallo', async () => {
    render(
      <OpenAccountsCorkboard
        terminalId="TERM-01"
        servicioCuentas={servicioQueFalla('sin_conexion')}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByRole('alert').textContent).toContain('No hay conexión');
  });
});

// ---------------------------------------------------------------------------
// 7. Contenedor raíz fluido (R-01)
// ---------------------------------------------------------------------------

describe('F5.3 — criterio 7: contenedor raíz fluido (R-01)', () => {
  it('el contenedor raíz usa w-full y no un ancho fijo', async () => {
    const { container } = render(
      <OpenAccountsCorkboard terminalId="TERM-01" servicioCuentas={servicioCon([])} />
    );

    // Esperar a que la lectura asíncrona se asiente antes de medir el DOM,
    // para no disparar un `act(...)` warning por un setState fuera de act.
    await waitFor(() => {
      expect(
        screen.getByText('No hay cuentas pendientes en el pizarrón'),
      ).toBeTruthy();
    });

    const raiz = container.firstChild;
    expect(raiz.className).toContain('w-full');
    expect(raiz.className).toContain('max-w-[1100px]');
    // No debe haber un ancho fijo en píxeles sin un `max-` que lo acote.
    expect(raiz.className).not.toMatch(/(^|\s)w-\[\d+px\]/);
  });
});

// ---------------------------------------------------------------------------
// 8. Táctil ≥ 44px (R-04)
// ---------------------------------------------------------------------------

describe('F5.3 — criterio 8: táctil (R-04)', () => {
  it('cada tarjeta de cuenta usa min-h-tactil', async () => {
    const cuentas = [cuentaEjemplo({ id: 'id-1' })];
    const { container } = render(
      <OpenAccountsCorkboard terminalId="TERM-01" servicioCuentas={servicioCon(cuentas)} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('folio-id-1')).toBeTruthy();
    });

    const tarjetas = container.querySelectorAll('li');
    expect(tarjetas.length).toBe(1);
    expect(tarjetas[0].className).toContain('min-h-tactil');
  });
});

// ---------------------------------------------------------------------------
// 9. Scroll lateral con muchas cuentas (BUG-10, paridad con el POS viejo)
// ---------------------------------------------------------------------------

describe('BUG-10 — scroll lateral del pizarrón', () => {
  it('el tablero acota su altura y el wrapper del grid es el contenedor con scroll', async () => {
    // Muchas cuentas: el grid debe poder desbordar y desplazarse.
    const cuentas = Array.from({ length: 12 }, (_, i) =>
      cuentaEjemplo({ id: `id-${i}`, account_num: `T-000${i}` }),
    );
    const { container } = render(
      <OpenAccountsCorkboard terminalId="TERM-01" servicioCuentas={servicioCon(cuentas)} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('folio-id-0')).toBeTruthy();
    });

    // El tablero (hijo directo de la raíz) acota su altura y recorta el
    // desborde; el scroll vive DENTRO, no en el modal exterior.
    const tablero = container.firstChild.firstChild;
    expect(tablero.className).toContain('max-h-[85vh]');
    expect(tablero.className).toContain('overflow-hidden');
    expect(tablero.className).toContain('flex-col');

    // El WRAPPER del grid es el contenedor con scroll y la barra estilizada.
    // (No el `<ul>`: si el grid llevara `flex-1`, sus filas se comprimirían y
    // los post-its `aspect-square` se encimarían — el bug que este fix cierra.)
    const wrapper = container.querySelector('ul').parentElement;
    expect(wrapper.className).toContain('overflow-y-auto');
    expect(wrapper.className).toContain('custom-scrollbar');
    expect(wrapper.className).toContain('flex-1');

    // El grid NO debe estirarse (`flex-1`) ni desplazarse: alto automático.
    const grid = container.querySelector('ul');
    expect(grid.className).toContain('content-start');
    expect(grid.className).not.toContain('flex-1');
    expect(grid.className).not.toContain('overflow-y-auto');
  });
});
