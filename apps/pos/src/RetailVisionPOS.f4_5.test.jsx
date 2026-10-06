/**
 * Puerta de FASE 4.5 — MONTAJE DEL GESTOR DE CAJA (integración end-to-end).
 *
 * Este test monta la PANTALLA REAL (`RetailVisionPOS`) con el cliente `api`
 * simulado y verifica que el Gestor de Caja dejó de ser un HUÉRFANO:
 *
 *   - F4.5.1 → el botón "💰" (aria-label "Gestor de caja") existe en el header.
 *   - F4.5.2 → pulsarlo monta `GestorDeCaja` (overlay `role="dialog"`).
 *   - F4.5.3 → sin turno de caja abierto, el cobro NO se dispara: se muestra el
 *              aviso "Abre la caja antes de cobrar" (RN-49) y se ofrece abrir el
 *              gestor. Con turno abierto, el cobro SÍ se dispara.
 *
 * La lección que esta puerta blinda (F4.5): "el componente existe y pasa su
 * test" ≠ "el usuario puede llegar a él". Por eso aquí se prueba el CAMINO
 * COMPLETO desde el header hasta el cobro, no el componente aislado.
 *
 * Se ejecuta con Vitest (jsdom):
 *   npx vitest run src/RetailVisionPOS.f4_5.test.jsx
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
  // Contratos de caja (Fase 4) — el `cashService` real los consume.
  getSesionCajaActiva: vi.fn(),
  abrirTurno: vi.fn(),
  registrarMovimiento: vi.fn(),
  getResumenTurno: vi.fn(),
  cerrarTurno: vi.fn(),
  getReporteDiario: vi.fn(),
  // Contratos de la Fase 8 (los servicios reales los consumen).
  getBeneficiosParaTicket: vi.fn(),
  encolarTicket: vi.fn(),
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

const TURNO_ABIERTO = {
  cash_session_id: 'caja-1',
  terminal_id: 'TERM-01',
  status: 'OPEN',
  opening_float: '200.00',
};

/** Configura el cliente simulado con respuestas felices por defecto. */
function sembrarApiFeliz() {
  apiSimulada.getCatalogo.mockResolvedValue({
    categorias: [{ id: 'cat-1', name: 'Panadería' }],
    productos: [PRODUCTO_A],
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
    total: 18.5,
  });
  apiSimulada.verificarEnvio.mockImplementation(async (_t, cuerpo) => ({
    existe: true,
    item_ids_persistidos: cuerpo.item_ids,
    faltantes: [],
  }));
  apiSimulada.latir.mockResolvedValue({ ok: true });
  apiSimulada.tomarLock.mockResolvedValue({ ok: true });
  apiSimulada.liberarLock.mockResolvedValue({ ok: true });
  // Por defecto: NO hay turno de caja abierto (el caso que la guarda vigila).
  apiSimulada.getSesionCajaActiva.mockResolvedValue(null);
  apiSimulada.abrirTurno.mockResolvedValue(TURNO_ABIERTO);
  apiSimulada.getResumenTurno.mockResolvedValue({
    cash_session_id: 'caja-1',
    esperado_en_caja: '200.00',
  });
  apiSimulada.cerrarTurno.mockResolvedValue({ cash_session_id: 'caja-1' });
  apiSimulada.getReporteDiario.mockResolvedValue({ fecha: '2026-09-30' });
  apiSimulada.getBeneficiosParaTicket.mockResolvedValue(null);
  apiSimulada.encolarTicket.mockResolvedValue({ evento_id: 'ticket:A-0001' });
}

/** Espera a que el catálogo termine de cargar y aparezcan los productos. */
async function esperarCatalogo() {
  await screen.findByText('Concha de Vainilla');
}

/** Localiza el botón "💰" del header (aria-label "Gestor de caja"). */
function botonCaja() {
  return screen.getByRole('button', { name: /Gestor de caja/i });
}

/** Localiza el botón de producto (aria-label "Agregar <nombre> al ticket"). */
function botonProducto() {
  return screen.getByRole('button', {
    name: /Agregar Concha de Vainilla al ticket/i,
  });
}

/**
 * Agrega el producto al carrito y abre el modal de pago, sin confirmar.
 *
 * F12.8/F12.9 — El botón "💰 COBRAR" está gateado por la caja habilitada
 * (§6.8, paridad de operación con el viejo POS). Por eso este helper SOLO
 * puede abrir el modal cuando hay turno de caja abierto (`conCaja: true`).
 * Sin caja, el botón está deshabilitado y el modal es inalcanzable: ese es
 * precisamente el comportamiento corregido que verifica F4.5.3.
 *
 * F12.9 — El modal de pago lo abre COBRAR, NO "ENVIAR CUENTA". El viejo POS
 * tenía DOS botones distintos: COBRAR (gateado por caja, abre el modal) y
 * ENVIAR CUENTA (manda al pizarrón, sin gate de caja). El nuevo POS los había
 * conflacionado; F12.9 los separó. Este helper cobra, así que pulsa COBRAR.
 */
async function agregarYAbrirPago({ conCaja = false } = {}) {
  fireEvent.click(botonProducto());
  await waitFor(() => {
    expect(apiSimulada.crearVenta).toHaveBeenCalled();
  });
  const cobrar = await screen.findByRole('button', {
    name: /COBRAR/i,
  });
  await waitFor(() => {
    expect(cobrar.disabled).toBe(!conCaja);
  });
  if (!conCaja) {
    // Sin caja habilitada no se puede abrir el modal: se devuelve el botón
    // bloqueado para que el test verifique el gate.
    return cobrar;
  }
  fireEvent.click(cobrar);
  // El modal arranca en EFECTIVO; se elige "Tarjeta" para habilitar el botón
  // "CONFIRMAR PAGO" sin capturar efectivo.
  fireEvent.click(await screen.findByRole('button', { name: /Tarjeta/i }));
  const confirmar = await screen.findByRole('button', {
    name: /CONFIRMAR PAGO/i,
  });
  await waitFor(() => {
    expect(confirmar.disabled).toBe(false);
  });
  return confirmar;
}

beforeEach(() => {
  vi.clearAllMocks();
  sembrarApiFeliz();
});

afterEach(() => {
  cleanup();
});

describe('F4.5 — Montaje del Gestor de Caja', () => {
  it('F4.5.1 — el header expone el botón "Gestor de caja"', async () => {
    render(<RetailVisionPOS />);
    await esperarCatalogo();
    expect(botonCaja()).toBeTruthy();
  });

  it('F4.5.2 — pulsar el botón monta el GestorDeCaja (overlay dialog)', async () => {
    render(<RetailVisionPOS />);
    await esperarCatalogo();
    // Antes de pulsar, el gestor NO está montado.
    expect(screen.queryByRole('dialog', { name: /Gestor de caja/i })).toBeNull();
    fireEvent.click(botonCaja());
    // Tras pulsar, el overlay aparece.
    const dialogo = await screen.findByRole('dialog', { name: /Gestor de caja/i });
    expect(dialogo).toBeTruthy();
  });

  it('F4.5.3 — sin turno abierto, el botón de cobro está BLOQUEADO (F12.8)', async () => {
    // `getSesionCajaActiva` ya devuelve `null` por defecto: no hay turno.
    // F12.8 — Paridad de operación (§6.8): sin caja habilitada, el botón
    // "💰 COBRAR" está deshabilitado y el modal de pago es inalcanzable.
    // El usuario NO puede ni siquiera intentar cobrar. La guarda RN-49 sigue
    // existiendo como defensa en profundidad (probada en SalesReceipt.f12_8).
    render(<RetailVisionPOS />);
    await esperarCatalogo();
    const cobrar = await agregarYAbrirPago({ conCaja: false });
    expect(cobrar.disabled).toBe(true);
    // El cobro NUNCA llegó al backend.
    expect(apiSimulada.cobrarTicket).not.toHaveBeenCalled();
  });

  it('F4.5.3 — sin turno abierto, el rótulo guía a habilitar la caja (F12.8)', async () => {
    render(<RetailVisionPOS />);
    await esperarCatalogo();
    await agregarYAbrirPago({ conCaja: false });
    // El rótulo del footer cambia a "Caja no habilitada" y el title guía.
    expect(screen.getByText('Caja no habilitada')).toBeTruthy();
    const cobrar = screen.getByRole('button', { name: /COBRAR/i });
    expect(cobrar.getAttribute('title')).toBe(
      'Presione "🏦 CAJA" para habilitar el cobro',
    );
  });

  it('F4.5.3 — con turno abierto, el cobro SÍ se dispara', async () => {
    // Ahora sí hay turno: el gate F12.8 deja pasar el cobro.
    apiSimulada.getSesionCajaActiva.mockResolvedValue(TURNO_ABIERTO);
    render(<RetailVisionPOS />);
    await esperarCatalogo();
    // Se espera a que la pantalla haya leído el turno activo.
    await waitFor(() => {
      expect(apiSimulada.getSesionCajaActiva).toHaveBeenCalled();
    });
    const confirmar = await agregarYAbrirPago({ conCaja: true });
    fireEvent.click(confirmar);
    await waitFor(() => {
      expect(apiSimulada.cobrarTicket).toHaveBeenCalled();
    });
    // El aviso NO aparece cuando hay turno.
    expect(screen.queryByText(/Abre la caja antes de cobrar/i)).toBeNull();
  });
});
