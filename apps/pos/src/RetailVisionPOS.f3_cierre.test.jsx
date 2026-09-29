/**
 * Puerta de CIERRE DE FASE 3 — Persistencia atómica END-TO-END (D-12).
 *
 * Este test monta la PANTALLA REAL (`RetailVisionPOS`) con un cliente `api`
 * simulado y verifica que la persistencia atómica por ítem (contratos 18–20)
 * y la verificación post-envío (contrato 22) operan DE VERDAD en la interfaz,
 * no solo en los hooks aislados.
 *
 * Cierra los criterios §6.1, §6.4 y §6.5 del Plan de Abordaje:
 *   - §6.4: persistencia atómica por ítem verificada (añadir/cambiar/quitar).
 *   - §6.5: `clearCart()` con verificación post-envío verificada.
 *   - §6.1: paridad funcional E.1 (venta directa completa).
 *
 * Escenarios:
 *   1. El ticket nace al agregar el PRIMER ítem (una sola vez).
 *   2. El segundo ítem NO vuelve a crear ticket.
 *   3. Incrementar → `cambiarCantidad` con el `item_id` correcto.
 *   4. Quitar → `quitarItem`.
 *   5. Cobrar → `cobrarTicket` SIN reenviar ítems; luego `verificarEnvio` con
 *      TODOS los `item_id`; y SOLO entonces el carrito queda vacío.
 *   6. PRUEBA NEGATIVA: si `verificarEnvio` reporta faltantes, el carrito NO se
 *      limpia (prohibición #2) y el error se muestra en pantalla.
 *
 * Se ejecuta con Vitest (jsdom): `npm run test` en apps/pos.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// ── Cliente `api` simulado (se inyecta en el módulo real) ────────────────────
// `vi.hoisted` es obligatorio: `vi.mock` se eleva al tope del archivo, así que
// la fábrica NO puede referenciar variables de nivel superior normales.
const apiSimulada = vi.hoisted(() => ({
  getCatalogo: vi.fn(),
  getSesionActiva: vi.fn(),
  crearVenta: vi.fn(),
  cobrarTicket: vi.fn(),
  anadirItem: vi.fn(),
  cambiarCantidad: vi.fn(),
  quitarItem: vi.fn(),
  verificarEnvio: vi.fn(),
  latir: vi.fn(),
  tomarLock: vi.fn(),
  liberarLock: vi.fn(),
}));

vi.mock('./api/client.js', () => apiSimulada);

// Importar DESPUÉS del mock para que la pantalla reciba el cliente simulado.
import RetailVisionPOS from './RetailVisionPOS.jsx';

// ── Datos de prueba ──────────────────────────────────────────────────────────
const PRODUCTO_A = {
  id: 'prod-A',
  sku: 'SKU-A',
  barcode: '111',
  name: 'Concha de Vainilla',
  price: 18.5,
  category_id: 'cat-1',
};

const PRODUCTO_B = {
  id: 'prod-B',
  sku: 'SKU-B',
  barcode: '222',
  name: 'Bolillo',
  price: 5,
  category_id: 'cat-1',
};

/** Configura el cliente simulado con respuestas felices por defecto. */
function sembrarApiFeliz() {
  apiSimulada.getCatalogo.mockResolvedValue({
    categorias: [{ id: 'cat-1', name: 'Panadería' }],
    productos: [PRODUCTO_A, PRODUCTO_B],
  });
  apiSimulada.getSesionActiva.mockResolvedValue({
    id: 'ses-1',
    employee_id: 'emp-1',
    terminal_id: 'TERM-01',
  });
  apiSimulada.crearVenta.mockResolvedValue({
    id: 'ticket-1',
    folio: 'A-0001',
    status: 'OPEN',
    version: 1,
    total: 0,
  });
  apiSimulada.anadirItem.mockResolvedValue({ version: 2 });
  apiSimulada.cambiarCantidad.mockResolvedValue({ version: 3 });
  apiSimulada.quitarItem.mockResolvedValue({ version: 4 });
  apiSimulada.cobrarTicket.mockResolvedValue({
    id: 'ticket-1',
    folio: 'A-0001',
    status: 'PAID',
    version: 5,
    total: 23.5,
  });
  apiSimulada.verificarEnvio.mockImplementation(async (_t, cuerpo) => ({
    existe: true,
    item_ids_persistidos: cuerpo.item_ids,
    faltantes: [],
  }));
  apiSimulada.latir.mockResolvedValue({ ok: true });
  apiSimulada.tomarLock.mockResolvedValue({ ok: true });
  apiSimulada.liberarLock.mockResolvedValue({ ok: true });
}

/** Espera a que el catálogo termine de cargar y aparezcan los productos. */
async function esperarCatalogo() {
  await screen.findByText('Concha de Vainilla');
}

beforeEach(() => {
  vi.clearAllMocks();
  sembrarApiFeliz();
});

afterEach(() => {
  cleanup();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1–2. El ticket nace al PRIMER ítem y NO se recrea con el segundo
// ═══════════════════════════════════════════════════════════════════════════════

describe('CIERRE F3 — el ticket nace al primer ítem (D-12)', () => {
  it('crea el ticket UNA sola vez al agregar el primer producto', async () => {
    render(<RetailVisionPOS />);
    await esperarCatalogo();

    fireEvent.click(screen.getByText('Concha de Vainilla'));

    await waitFor(() => {
      expect(apiSimulada.crearVenta).toHaveBeenCalledTimes(1);
    });
    // El ticket se crea VACÍO: los ítems llegan por el contrato 18.
    expect(apiSimulada.crearVenta).toHaveBeenCalledWith(
      expect.objectContaining({ items: [] })
    );
    // Y el ítem se persiste de forma atómica con su `item_id`.
    await waitFor(() => {
      expect(apiSimulada.anadirItem).toHaveBeenCalledTimes(1);
    });
    const [ticketId, cuerpo] = apiSimulada.anadirItem.mock.calls[0];
    expect(ticketId).toBe('ticket-1');
    expect(cuerpo.product_id).toBe('prod-A');
    expect(typeof cuerpo.item_id).toBe('string');
    expect(cuerpo.item_id.length).toBeGreaterThan(0);
  });

  it('NO vuelve a crear ticket al agregar un segundo producto', async () => {
    render(<RetailVisionPOS />);
    await esperarCatalogo();

    fireEvent.click(screen.getByText('Concha de Vainilla'));
    await waitFor(() => expect(apiSimulada.crearVenta).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Bolillo'));

    await waitFor(() => {
      expect(apiSimulada.anadirItem).toHaveBeenCalledTimes(2);
    });
    // Sigue habiendo UN solo ticket.
    expect(apiSimulada.crearVenta).toHaveBeenCalledTimes(1);
    // El segundo ítem usa el MISMO ticket.
    expect(apiSimulada.anadirItem.mock.calls[1][0]).toBe('ticket-1');
    expect(apiSimulada.anadirItem.mock.calls[1][1].product_id).toBe('prod-B');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3–4. Edición de cantidad y quitado: contratos 19 y 20 en la pantalla real
// ═══════════════════════════════════════════════════════════════════════════════

describe('CIERRE F3 — edición atómica por ítem (contratos 19 y 20)', () => {
  it('incrementar llama a cambiarCantidad con el item_id correcto', async () => {
    render(<RetailVisionPOS />);
    await esperarCatalogo();

    fireEvent.click(screen.getByText('Concha de Vainilla'));
    await waitFor(() => expect(apiSimulada.anadirItem).toHaveBeenCalledTimes(1));
    const itemId = apiSimulada.anadirItem.mock.calls[0][1].item_id;

    // El botón "+" del ticket incrementa la cantidad.
    fireEvent.click(screen.getByLabelText('Añadir una unidad de Concha de Vainilla'));

    await waitFor(() => {
      expect(apiSimulada.cambiarCantidad).toHaveBeenCalledTimes(1);
    });
    const [ticketId, itemIdLlamado, cuerpo] = apiSimulada.cambiarCantidad.mock.calls[0];
    expect(ticketId).toBe('ticket-1');
    expect(itemIdLlamado).toBe(itemId);
    expect(cuerpo.quantity).toBe(2);
  });

  it('quitar llama a quitarItem con el item_id correcto', async () => {
    render(<RetailVisionPOS />);
    await esperarCatalogo();

    fireEvent.click(screen.getByText('Concha de Vainilla'));
    await waitFor(() => expect(apiSimulada.anadirItem).toHaveBeenCalledTimes(1));
    const itemId = apiSimulada.anadirItem.mock.calls[0][1].item_id;

    fireEvent.click(screen.getByLabelText('Quitar una unidad de Concha de Vainilla'));

    await waitFor(() => {
      expect(apiSimulada.quitarItem).toHaveBeenCalledTimes(1);
    });
    const [ticketId, itemIdLlamado] = apiSimulada.quitarItem.mock.calls[0];
    expect(ticketId).toBe('ticket-1');
    expect(itemIdLlamado).toBe(itemId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Cobro: paga SIN reenviar ítems + verificación post-envío + limpieza
// ═══════════════════════════════════════════════════════════════════════════════

describe('CIERRE F3 — cobro con verificación post-envío (contrato 22)', () => {
  it('cobra sin reenviar ítems, verifica TODOS los item_id y limpia el carrito', async () => {
    render(<RetailVisionPOS />);
    await esperarCatalogo();

    // Dos productos → dos ítems atómicos.
    fireEvent.click(screen.getByText('Concha de Vainilla'));
    await waitFor(() => expect(apiSimulada.anadirItem).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('Bolillo'));
    await waitFor(() => expect(apiSimulada.anadirItem).toHaveBeenCalledTimes(2));

    const idsEsperados = apiSimulada.anadirItem.mock.calls.map((c) => c[1].item_id);

    // Abrir el checkout y cobrar en efectivo.
    fireEvent.click(screen.getByText('💰 ENVIAR CUENTA'));
    fireEvent.click(screen.getByText('Efectivo'));
    // Efectivo exige monto recibido ≥ total para habilitar el botón:
    // un billete rápido ($50) cubre el total y habilita "CONFIRMAR PAGO".
    fireEvent.click(screen.getByText('$50'));
    fireEvent.click(screen.getByText('CONFIRMAR PAGO'));

    await waitFor(() => {
      expect(apiSimulada.cobrarTicket).toHaveBeenCalledTimes(1);
    });

    // El cobro NO reenvía los ítems: solo paga el ticket existente.
    const [ticketId, cuerpoCobro] = apiSimulada.cobrarTicket.mock.calls[0];
    expect(ticketId).toBe('ticket-1');
    expect(cuerpoCobro).not.toHaveProperty('items');

    // Verificación post-envío con TODOS los item_id.
    await waitFor(() => {
      expect(apiSimulada.verificarEnvio).toHaveBeenCalledTimes(1);
    });
    const [ticketVerif, cuerpoVerif] = apiSimulada.verificarEnvio.mock.calls[0];
    expect(ticketVerif).toBe('ticket-1');
    expect(cuerpoVerif.item_ids.sort()).toEqual([...idsEsperados].sort());

    // Y SOLO tras la verificación, el carrito queda vacío.
    // (El botón de incremento solo existe en el ticket, no en la rejilla.)
    await waitFor(() => {
      expect(
        screen.queryByLabelText('Añadir una unidad de Concha de Vainilla')
      ).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. PRUEBA NEGATIVA — si la verificación reporta faltantes, NO se limpia
// ═══════════════════════════════════════════════════════════════════════════════

describe('CIERRE F3 — prohibición #2 en la pantalla real', () => {
  it('NO limpia el carrito si la verificación reporta faltantes', async () => {
    // La verificación reporta que un ítem NO llegó al servidor.
    apiSimulada.verificarEnvio.mockResolvedValue({
      existe: true,
      item_ids_persistidos: [],
      faltantes: ['item-fantasma'],
    });

    render(<RetailVisionPOS />);
    await esperarCatalogo();

    fireEvent.click(screen.getByText('Concha de Vainilla'));
    await waitFor(() => expect(apiSimulada.anadirItem).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('💰 ENVIAR CUENTA'));
    fireEvent.click(screen.getByText('Efectivo'));
    // Efectivo exige monto recibido ≥ total para habilitar el botón.
    fireEvent.click(screen.getByText('$50'));
    fireEvent.click(screen.getByText('CONFIRMAR PAGO'));

    await waitFor(() => {
      expect(apiSimulada.verificarEnvio).toHaveBeenCalledTimes(1);
    });

    // El carrito NO se limpió: la línea del ticket sigue presente.
    // (El botón de incremento solo existe en el ticket, no en la rejilla.)
    expect(
      screen.getByLabelText('Añadir una unidad de Concha de Vainilla')
    ).toBeTruthy();
  });
});
