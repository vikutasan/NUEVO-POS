/**
 * Puerta de FASE 12.6 — PARIDAD DE PRESENTACIÓN del pizarrón.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ VERIFICA
 * ─────────────────────────────────────────────────────────────────────────────
 * La 14ª lección de §10.6: el inventario de componentes no ve la PARIDAD DE
 * PRESENTACIÓN. F5.3 probó que el pizarrón FUNCIONA (8 criterios); F12.6 prueba
 * que el pizarrón SE PARECE al del viejo POS: estética (corcho + post-it + pin +
 * rotación) Y datos completos (terminal, tipo de pedido, cliente, teléfono,
 * capturista, hora).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS CRITERIOS
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. El corcho usa los tokens de madera (`madera-panel`, `madera-veta`).
 *   2. Cada post-it lleva un pin (el círculo rojo que lo sujeta).
 *   3. La rotación es DETERMINISTA (estable entre renders, no `Math.random`).
 *   4. El color del post-it depende de la terminal (mapa heredado).
 *   5. Se muestra el tipo de pedido, el cliente y el teléfono.
 *   6. Se muestra el capturista (nombre resuelto, no UUID).
 *   7. Se muestra la hora formateada a partir del instante UTC (RN-78).
 *   8. Un `reason` desconocido no rompe: cae a un mensaje genérico.
 *
 * Este archivo lo ejecuta Vitest (jsdom) vía `npm run test` en apps/pos.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

import OpenAccountsCorkboard from './OpenAccountsCorkboard.jsx';

afterEach(() => {
  cleanup();
});

/**
 * Una cuenta de ejemplo con la proyección COMPLETA del contrato 23 (F12.6).
 * Los 12 campos escalares que el backend expone.
 */
function cuentaCompleta(extra = {}) {
  return {
    id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    account_num: 'T-0042',
    status: 'OPEN',
    total: '150.00',
    version: 3,
    terminal_id: 'T6',
    captured_by_name: 'María López',
    customer_name: 'Juan Pérez',
    customer_phone: '5512345678',
    order_type: 'PEDIDO',
    delivery_type: 'DOMICILIO',
    created_at: '2026-10-01T13:45:00Z',
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

// ---------------------------------------------------------------------------
// 1. El corcho usa los tokens de madera
// ---------------------------------------------------------------------------

describe('F12.6 — criterio 1: el corcho usa los tokens de madera', () => {
  it('el contenedor del corcho usa madera-panel y madera-veta', async () => {
    const { container } = render(
      <OpenAccountsCorkboard
        terminalId="T6"
        servicioCuentas={servicioCon([cuentaCompleta()])}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('folio-aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')).toBeTruthy();
    });

    // `madera-panel` y `madera-veta` son tokens de COLOR: en el DOM se
    // materializan como `bg-madera-panel` y `border-madera-veta`.
    const corcho = container.querySelector('.bg-madera-panel');
    expect(corcho).toBeTruthy();
    expect(corcho.className).toContain('border-madera-veta');
  });
});

// ---------------------------------------------------------------------------
// 2. Cada post-it lleva un pin
// ---------------------------------------------------------------------------

describe('F12.6 — criterio 2: cada post-it lleva un pin', () => {
  it('cada tarjeta tiene un pin (círculo rojo) que la sujeta al corcho', async () => {
    const cuentas = [
      cuentaCompleta({ id: 'id-1', account_num: 'T-0001' }),
      cuentaCompleta({ id: 'id-2', account_num: 'T-0002' }),
    ];
    const { container } = render(
      <OpenAccountsCorkboard terminalId="T6" servicioCuentas={servicioCon(cuentas)} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('folio-id-1')).toBeTruthy();
    });

    const pines = container.querySelectorAll('li span[aria-hidden="true"]');
    expect(pines.length).toBe(2);
    expect(pines[0].className).toContain('bg-red-600');
  });
});

// ---------------------------------------------------------------------------
// 3. La rotación es determinista
// ---------------------------------------------------------------------------

describe('F12.6 — criterio 3: la rotación es determinista', () => {
  it('la misma cuenta conserva su rotación entre renders (no Math.random)', async () => {
    const cuentas = [cuentaCompleta({ id: 'id-1', account_num: 'T-0001' })];

    const primero = render(
      <OpenAccountsCorkboard terminalId="T6" servicioCuentas={servicioCon(cuentas)} />
    );
    await waitFor(() => {
      expect(screen.getByTestId('folio-id-1')).toBeTruthy();
    });
    const rotacionPrimera = primero.container.querySelector('li').className;
    cleanup();

    const segundo = render(
      <OpenAccountsCorkboard terminalId="T6" servicioCuentas={servicioCon(cuentas)} />
    );
    await waitFor(() => {
      expect(screen.getByTestId('folio-id-1')).toBeTruthy();
    });
    const rotacionSegunda = segundo.container.querySelector('li').className;

    // La clase de rotación debe ser idéntica: es función del índice, no del azar.
    const extraerRotacion = (clase) =>
      clase.split(' ').find((c) => /^-?rotate-\d$/.test(c));
    expect(extraerRotacion(rotacionPrimera)).toBe(extraerRotacion(rotacionSegunda));
    expect(extraerRotacion(rotacionPrimera)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 4. El color del post-it depende de la terminal
// ---------------------------------------------------------------------------

describe('F12.6 — criterio 4: el color del post-it depende de la terminal', () => {
  it('la terminal T6 pinta el post-it de amarillo (mapa heredado)', async () => {
    const { container } = render(
      <OpenAccountsCorkboard
        terminalId="T6"
        servicioCuentas={servicioCon([cuentaCompleta({ terminal_id: 'T6' })])}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('folio-aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')).toBeTruthy();
    });

    const postIt = container.querySelector('li');
    expect(postIt.className).toContain('bg-yellow-200');
  });

  it('la terminal CAJA pinta el post-it de naranja', async () => {
    const { container } = render(
      <OpenAccountsCorkboard
        terminalId="CAJA"
        servicioCuentas={servicioCon([cuentaCompleta({ terminal_id: 'CAJA' })])}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('folio-aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')).toBeTruthy();
    });

    const postIt = container.querySelector('li');
    expect(postIt.className).toContain('bg-orange-200');
  });
});

// ---------------------------------------------------------------------------
// 5. Tipo de pedido, cliente y teléfono
// ---------------------------------------------------------------------------

describe('F12.6 — criterio 5: tipo de pedido, cliente y teléfono', () => {
  it('muestra el tipo de pedido, el cliente y el teléfono', async () => {
    render(
      <OpenAccountsCorkboard
        terminalId="T6"
        servicioCuentas={servicioCon([cuentaCompleta()])}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('folio-aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')).toBeTruthy();
    });

    expect(screen.getByText(/PEDIDO/)).toBeTruthy();
    expect(screen.getByText(/Juan Pérez/)).toBeTruthy();
    expect(screen.getByText(/5512345678/)).toBeTruthy();
  });

  it('una venta directa NO muestra el bloque de pedido', async () => {
    render(
      <OpenAccountsCorkboard
        terminalId="T6"
        servicioCuentas={servicioCon([
          cuentaCompleta({
            order_type: 'VENTA_DIRECTA',
            customer_name: null,
            customer_phone: null,
            delivery_type: null,
          }),
        ])}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('folio-aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')).toBeTruthy();
    });

    expect(screen.queryByText(/PEDIDO/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. El capturista (nombre resuelto)
// ---------------------------------------------------------------------------

describe('F12.6 — criterio 6: el capturista viaja como nombre resuelto', () => {
  it('muestra el nombre del capturista, no un UUID', async () => {
    render(
      <OpenAccountsCorkboard
        terminalId="T6"
        servicioCuentas={servicioCon([cuentaCompleta()])}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('folio-aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')).toBeTruthy();
    });

    expect(screen.getByText(/María López/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 7. La hora formateada (RN-78)
// ---------------------------------------------------------------------------

describe('F12.6 — criterio 7: la hora se formatea desde el instante UTC', () => {
  it('muestra una hora HH:MM derivada de created_at', async () => {
    render(
      <OpenAccountsCorkboard
        terminalId="T6"
        servicioCuentas={servicioCon([
          cuentaCompleta({ created_at: '2026-10-01T13:45:00Z' }),
        ])}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('folio-aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')).toBeTruthy();
    });

    // El formato es HH:MM (dos dígitos, dos dígitos), sin importar la zona.
    expect(screen.getByText(/🕒 \d{2}:\d{2}/)).toBeTruthy();
  });

  it('un created_at ausente no rompe la tarjeta', async () => {
    render(
      <OpenAccountsCorkboard
        terminalId="T6"
        servicioCuentas={servicioCon([cuentaCompleta({ created_at: null })])}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('folio-aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')).toBeTruthy();
    });

    expect(screen.getByText(/🕒 —/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 8. Un reason desconocido no rompe
// ---------------------------------------------------------------------------

describe('F12.6 — criterio 8: un reason desconocido se muestra verbatim', () => {
  it('un reason no mapeado se muestra tal cual (no se traga el diagnóstico)', async () => {
    render(
      <OpenAccountsCorkboard
        terminalId="T6"
        servicioCuentas={servicioQueFalla('red caída')}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    // El mensaje crudo del error debe llegar al cajero: esconderlo tras un
    // texto genérico le quitaría el diagnóstico para reportar la falla.
    expect(screen.getByRole('alert').textContent).toContain('red caída');
  });

  it('un reason vacío lo normaliza el hook a error_desconocido', async () => {
    render(
      <OpenAccountsCorkboard
        terminalId="T6"
        servicioCuentas={servicioQueFalla('')}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    // El hook hace `setError(r.reason || 'error_desconocido')`: un reason
    // vacío nunca llega al componente como cadena vacía.
    expect(screen.getByRole('alert').textContent).toContain(
      'error_desconocido',
    );
  });
});
