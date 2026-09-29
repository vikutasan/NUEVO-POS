/**
 * Puerta de FASE 3.3 — Hooks del POS (el corazón).
 *
 * Verifica los 5 criterios de la puerta (Plan de Abordaje §4 FASE 3.3):
 *
 *   ✓ clearCart solo ocurre tras HTTP 200 + verificación
 *   ✓ callback async lee useRef, no estado cerrado (Ticket #906)
 *   ✓ useTicketActions devuelve { outcome, reason } en toda rama
 *   ✓ simetría de limpieza: éxito y fallo limpian los mismos refs
 *   ✓ useEffect deps son primitivos (H1)
 *
 * Se ejecuta con Vitest (jsdom): npm run test (en apps/pos)
 *
 * 29 Sep 2026.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCart } from './useCart.js';
import { useTicketActions } from './useTicketActions.js';
import { useTerminalLocking } from './useTerminalLocking.js';
import { useBarcodeScanner } from './useBarcodeScanner.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Criterio 1 — clearCart solo tras HTTP 200 + verificación post-envío
// ═══════════════════════════════════════════════════════════════════════════════

describe('useCart — clearCart solo tras verificación', () => {
  it('NO limpia el carrito si la verificación reporta faltantes', async () => {
    const api = {
      anadirItem: vi.fn(async () => ({ version: 2 })),
      verificarEnvio: vi.fn(async () => ({
        existe: true,
        item_ids_persistidos: [],
        faltantes: ['item-1'],
      })),
    };

    const { result } = renderHook(() => useCart({ api, ticketId: 'T1', version: 1 }));

    await act(async () => {
      await result.current.anadirLinea({ item_id: 'item-1', product_id: 'P1', quantity: 1 });
    });

    let salida;
    await act(async () => {
      salida = await result.current.clearCart();
    });

    expect(salida.outcome).toBe('error');
    expect(salida.reason).toBe('items_no_persistidos');
    // El carrito NO se limpió.
    expect(result.current.lineas.length).toBe(1);
  });

  it('SÍ limpia el carrito cuando la verificación confirma todo persistido', async () => {
    const api = {
      anadirItem: vi.fn(async () => ({ version: 2 })),
      verificarEnvio: vi.fn(async () => ({
        existe: true,
        item_ids_persistidos: ['item-1'],
        faltantes: [],
      })),
    };

    const { result } = renderHook(() => useCart({ api, ticketId: 'T1', version: 1 }));

    await act(async () => {
      await result.current.anadirLinea({ item_id: 'item-1', product_id: 'P1', quantity: 1 });
    });

    let salida;
    await act(async () => {
      salida = await result.current.clearCart();
    });

    expect(salida.outcome).toBe('ok');
    expect(salida.data.verificado).toBe(true);
    expect(result.current.lineas.length).toBe(0);
  });

  it('NO limpia si la verificación falla (red caída)', async () => {
    const api = {
      anadirItem: vi.fn(async () => ({ version: 2 })),
      verificarEnvio: vi.fn(async () => {
        throw new Error('timeout');
      }),
    };

    const { result } = renderHook(() => useCart({ api, ticketId: 'T1', version: 1 }));

    await act(async () => {
      await result.current.anadirLinea({ item_id: 'item-1', product_id: 'P1', quantity: 1 });
    });

    let salida;
    await act(async () => {
      salida = await result.current.clearCart();
    });

    expect(salida.outcome).toBe('error');
    expect(result.current.lineas.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Criterio 2 — callback async lee useRef, no estado cerrado (Ticket #906)
// ═══════════════════════════════════════════════════════════════════════════════

describe('useCart — el callback async lee useRef (Ticket #906)', () => {
  it('clearCart ve las líneas añadidas DESPUÉS de crear el callback', async () => {
    const api = {
      anadirItem: vi.fn(async () => ({ version: 2 })),
      verificarEnvio: vi.fn(async (_t, cuerpo) => ({
        existe: true,
        item_ids_persistidos: cuerpo.item_ids,
        faltantes: [],
      })),
    };

    const { result } = renderHook(() => useCart({ api, ticketId: 'T1', version: 1 }));

    // Se añade una línea DESPUÉS de que el hook montó (el callback ya existía).
    await act(async () => {
      await result.current.anadirLinea({ item_id: 'item-9', product_id: 'P9', quantity: 1 });
    });

    await act(async () => {
      await result.current.clearCart();
    });

    // La verificación recibió el item_id real, no un estado cerrado vacío.
    expect(api.verificarEnvio).toHaveBeenCalledWith('T1', { item_ids: ['item-9'] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Criterio 3 — useTicketActions devuelve { outcome, reason } en toda rama
// ═══════════════════════════════════════════════════════════════════════════════

describe('useTicketActions — contrato { outcome, reason }', () => {
  it('devuelve { outcome, reason } cuando no hay API', async () => {
    const { result } = renderHook(() => useTicketActions({ api: null }));

    let salida;
    await act(async () => {
      salida = await result.current.crearTicket([{ product_id: 'P1', quantity: 1 }]);
    });

    expect(salida).toHaveProperty('outcome');
    expect(salida).toHaveProperty('reason');
    expect(salida.outcome).toBe('error');
    expect(salida.reason).toBe('api_no_disponible');
  });

  it('devuelve { outcome:"ok", reason:null } cuando la API responde', async () => {
    const api = {
      crearVenta: vi.fn(async () => ({ id: 'T1', version: 1, total: 10 })),
    };
    const { result } = renderHook(() => useTicketActions({ api }));

    let salida;
    await act(async () => {
      salida = await result.current.crearTicket([{ product_id: 'P1', quantity: 1 }]);
    });

    expect(salida.outcome).toBe('ok');
    expect(salida.reason).toBeNull();
  });

  it('NUNCA lanza: convierte un rechazo en { outcome:"error" }', async () => {
    const api = {
      crearVenta: vi.fn(async () => {
        throw new Error('500 del servidor');
      }),
    };
    const { result } = renderHook(() => useTicketActions({ api }));

    let salida;
    await act(async () => {
      salida = await result.current.crearTicket([{ product_id: 'P1', quantity: 1 }]);
    });

    expect(salida.outcome).toBe('error');
    expect(typeof salida.reason).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Criterio 4 — simetría de limpieza: éxito y fallo limpian los mismos refs
// ═══════════════════════════════════════════════════════════════════════════════

describe('useTicketActions — simetría de limpieza (Regla 19)', () => {
  it('el fallo deja el ticket en null (misma limpieza que el éxito)', async () => {
    const api = {
      crearVenta: vi.fn(async () => {
        throw new Error('fallo');
      }),
    };
    const { result } = renderHook(() => useTicketActions({ api }));

    await act(async () => {
      await result.current.crearTicket([{ product_id: 'P1', quantity: 1 }]);
    });

    // Tras un fallo, no queda un ticket huérfano (cuenta fantasma).
    expect(result.current.ticket).toBeNull();
    expect(result.current.enviando).toBe(false);
  });

  it('el éxito deja el ticket y enviando=false', async () => {
    const api = {
      crearVenta: vi.fn(async () => ({ id: 'T1', version: 1, total: 10 })),
    };
    const { result } = renderHook(() => useTicketActions({ api }));

    await act(async () => {
      await result.current.crearTicket([{ product_id: 'P1', quantity: 1 }]);
    });

    expect(result.current.ticket).not.toBeNull();
    expect(result.current.enviando).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Criterio 5 — useEffect deps son primitivos (H1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('H1 — los hooks no re-registran listeners por objetos recreados', () => {
  it('useBarcodeScanner NO re-registra el listener si el callback cambia de identidad', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { rerender } = renderHook(
      ({ cb }) => useBarcodeScanner({ alEscanear: cb }),
      { initialProps: { cb: () => {} } }
    );

    const altasIniciales = addSpy.mock.calls.filter(([t]) => t === 'keydown').length;

    // Re-render con un callback NUEVO (identidad distinta) pero mismas deps primitivas.
    rerender({ cb: () => {} });

    const altasFinales = addSpy.mock.calls.filter(([t]) => t === 'keydown').length;
    // No se volvió a registrar: el callback vive en un ref (prohibición #3).
    expect(altasFinales).toBe(altasIniciales);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('useTerminalLocking late solo cuando el lock está tomado', async () => {
    vi.useFakeTimers();
    const api = {
      tomarLock: vi.fn(async () => ({ ok: true })),
      latir: vi.fn(async () => ({ ok: true })),
      liberarLock: vi.fn(async () => ({ ok: true })),
    };

    const { result } = renderHook(() =>
      useTerminalLocking({ api, terminalId: 'TERM-1', usuarioId: 'U1', intervaloMs: 1000 })
    );

    // Sin lock tomado, no hay latidos.
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    expect(api.latir).not.toHaveBeenCalled();

    // Toma el lock → empiezan los latidos.
    await act(async () => {
      await result.current.tomarLock();
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    expect(api.latir).toHaveBeenCalled();

    vi.useRealTimers();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Extra — useBarcodeScanner entrega el código al recibir Enter
// ═══════════════════════════════════════════════════════════════════════════════

describe('useBarcodeScanner — entrega el código completo', () => {
  it('acumula caracteres rápidos y entrega al Enter', () => {
    const alEscanear = vi.fn();
    renderHook(() => useBarcodeScanner({ alEscanear, umbralMs: 1000 }));

    act(() => {
      for (const ch of 'ABC123') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    expect(alEscanear).toHaveBeenCalledWith('ABC123');
  });

  it('ignora códigos demasiado cortos', () => {
    const alEscanear = vi.fn();
    renderHook(() => useBarcodeScanner({ alEscanear, umbralMs: 1000, longitudMinima: 3 }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'A' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    expect(alEscanear).not.toHaveBeenCalled();
  });
});
