/**
 * `RetailVisionPOS` — interfaz 1 del registro de la superficie (Pantalla raíz).
 *
 * Contenedor raíz declarado: `w-full h-screen flex flex-col`.
 *   - MOSTRADOR (≥1024px): layout completo de 2 columnas (cuerpo + ticket).
 *   - COMPACTO (768–1023px): el ticket lateral se estrecha; el grid a 3 columnas.
 *   - MÓVIL (<768px): el ticket se convierte en panel inferior deslizable; el
 *     grid a 2 columnas.
 *
 * FASE 3.4 — REFACTOR: de monolito a ORQUESTADOR DE HOOKS.
 *   Antes, esta pantalla tenía toda la lógica (estado del carrito, cobro,
 *   fetch) inline. Ahora delega en los hooks de la Fase 3.3:
 *
 *     - `useCart`            → carrito + persistencia atómica por ítem.
 *     - `useTicketActions`   → crear ticket / cobrar con `{outcome, reason}`.
 *     - `useTerminalLocking` → heartbeat + candado de terminal (OMEGA).
 *     - `useBarcodeScanner`  → lector de código de barras.
 *     - `useNetworkHealth`   → indicador de red (Fase 3.1).
 *     - `useModo`            → los 3 modos de layout (R-03).
 *
 * La pantalla solo ORQUESTA: carga catálogo/sesión, conecta los hooks y pinta
 * los componentes (`POSHeader`, `CategoryBar`, `ProductGrid`, `SalesReceipt`,
 * `CheckoutScreen`, `POSOverlays`).
 *
 * R-01: `w-full` en el contenedor raíz. R-03: los 3 modos son explícitos.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from '../../shared/config.js';
import * as api from './api/client.js';
import { useModo } from './hooks/useModo.js';
import { useCart } from './hooks/useCart.js';
import { useTicketActions } from './hooks/useTicketActions.js';
import { useTerminalLocking } from './hooks/useTerminalLocking.js';
import { useBarcodeScanner } from './hooks/useBarcodeScanner.js';
import { useNetworkHealth } from './hooks/useNetworkHealth.js';
import CategoryBar from './components/CategoryBar.jsx';
import ProductGrid from './components/ProductGrid.jsx';
import SalesReceipt from './components/SalesReceipt.jsx';
import CheckoutScreen from './components/CheckoutScreen.jsx';
import POSHeader from './components/POSHeader.jsx';
import { OverlayExito, OverlayError } from './components/POSOverlays.jsx';

export default function RetailVisionPOS() {
  const { modo, esMovil } = useModo();
  const { enLinea } = useNetworkHealth();

  // ── Estado de la pantalla (solo lo que NO vive en un hook) ─────────────────
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [categoriaActiva, setCategoriaActiva] = useState(null);
  const [sesion, setSesion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [checkoutAbierto, setCheckoutAbierto] = useState(false);
  const [ticketAbierto, setTicketAbierto] = useState(false);
  const [banner, setBanner] = useState(null);

  // ── Hooks del POS (Fase 3.3) ───────────────────────────────────────────────
  const carrito = useCart({ api, ticketId: null, version: 0 });
  const acciones = useTicketActions({
    api,
    terminalId: CONFIG.TERMINAL_ID,
    channel: CONFIG.CANAL,
  });
  const locking = useTerminalLocking({
    api,
    terminalId: CONFIG.TERMINAL_ID,
    usuarioId: sesion?.employee_id || null,
  });

  // ── Carga inicial: catálogo + sesión activa ────────────────────────────────
  useEffect(() => {
    let activo = true;
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const [catalogo, sesionActiva] = await Promise.all([
          api.getCatalogo(CONFIG.CANAL),
          api.getSesionActiva(CONFIG.TERMINAL_ID),
        ]);
        if (!activo) return;
        setCategorias(catalogo.categorias || []);
        setProductos(catalogo.productos || []);
        setSesion(sesionActiva || null);
      } catch (causa) {
        if (activo) setError(causa.message || 'Error al cargar el catálogo');
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  // ── Filtro por categoría ───────────────────────────────────────────────────
  const productosVisibles = useMemo(() => {
    if (categoriaActiva === null) return productos;
    return productos.filter((p) => p.category_id === categoriaActiva);
  }, [productos, categoriaActiva]);

  // ── RN-17: un producto aparece una sola vez; agregarlo incrementa ──────────
  const agregarProducto = useCallback(
    (producto) => {
      carrito.anadirLinea({
        product_id: producto.id,
        quantity: 1,
        unit_price: Number(producto.price),
      });
    },
    [carrito]
  );

  const incrementar = useCallback(
    (linea) => {
      carrito.cambiarCantidad(linea.item_id, linea.quantity + 1);
    },
    [carrito]
  );

  const decrementar = useCallback(
    (linea) => {
      if (linea.quantity <= 1) {
        carrito.quitarLinea(linea.item_id);
        return;
      }
      carrito.cambiarCantidad(linea.item_id, linea.quantity - 1);
    },
    [carrito]
  );

  const quitar = useCallback(
    (linea) => {
      carrito.quitarLinea(linea.item_id);
    },
    [carrito]
  );

  // ── Lector de código de barras: busca el producto y lo agrega ──────────────
  const productosRef = useRef(productos);
  productosRef.current = productos;

  const alEscanear = useCallback(
    (codigo) => {
      const producto = productosRef.current.find(
        (p) => p.sku === codigo || p.barcode === codigo
      );
      if (!producto) {
        setBanner({ tipo: 'error', mensaje: `Código no encontrado: ${codigo}` });
        return;
      }
      setBanner(null);
      carrito.anadirLinea({
        product_id: producto.id,
        quantity: 1,
        unit_price: Number(producto.price),
      });
    },
    [carrito]
  );

  useBarcodeScanner({ alEscanear });

  // ── Cobro: crea el ticket y lo paga (RN-14..RN-27, RN-62/63) ───────────────
  const confirmarCobro = useCallback(
    async (pago) => {
      setError(null);
      setBanner(null);

      const items = carrito.lineas.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
      }));

      const creado = await acciones.crearTicket(items);
      if (creado.outcome !== 'ok') {
        setError(creado.reason || 'Error al crear el ticket');
        return;
      }

      const pagado = await acciones.cobrar({
        metodo: pago.metodo,
        recibido: pago.recibido,
        cambio: pago.cambio,
      });
      if (pagado.outcome !== 'ok') {
        setError(pagado.reason || 'Error al cobrar el ticket');
        return;
      }

      // Cobro verificado: limpieza del carrito (prohibición #2).
      await carrito.clearCart();
      setCheckoutAbierto(false);
    },
    [acciones, carrito]
  );

  const total = carrito.total;
  const estadoCuenta = acciones.ticket
    ? acciones.ticket.status === 'PAID'
      ? 'PAGADA'
      : 'NUEVA_VENTA'
    : acciones.enviando
      ? 'COBRANDO'
      : 'NUEVA_VENTA';

  return (
    <div className="w-full h-screen flex flex-col text-crema-ticket" style={{ backgroundColor: 'rgb(var(--madera))' }}>
      <POSHeader
        terminalId={CONFIG.TERMINAL_ID}
        estado={estadoCuenta}
        tipoVenta={CONFIG.CANAL}
        sesionAbierta={Boolean(sesion)}
        enLinea={enLinea}
        modo={modo}
      />

      {error ? (
        <div className="w-full bg-peligro/20 text-peligro px-4 py-2 text-sm">{error}</div>
      ) : null}

      {/* Cuerpo: 2 columnas en MOSTRADOR, apilado en MÓVIL */}
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 p-4">
        <section className="flex-1 min-w-0 flex flex-col gap-4">
          <CategoryBar
            categorias={categorias}
            categoriaActiva={categoriaActiva}
            onSeleccionar={setCategoriaActiva}
          />
          {cargando ? (
            <div className="w-full flex items-center justify-center py-16 text-crema-ticket/50">
              Cargando catálogo…
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ProductGrid productos={productosVisibles} onAgregar={agregarProducto} />
            </div>
          )}
        </section>

        {/* Ticket: panel lateral en MOSTRADOR/COMPACTO, panel inferior en MÓVIL */}
        <div className="hidden lg:flex lg:flex-shrink-0">
          <SalesReceipt
            lineas={carrito.lineas}
            onIncrementar={incrementar}
            onDecrementar={decrementar}
            onQuitar={quitar}
            onCobrar={() => setCheckoutAbierto(true)}
            cobrando={acciones.enviando}
            terminalId={CONFIG.TERMINAL_ID}
            banner={banner}
          />
        </div>
      </main>

      {/* Barra inferior en MÓVIL: abre el ticket como panel deslizable */}
      {esMovil ? (
        <button
          type="button"
          onClick={() => setTicketAbierto(true)}
          className="w-full min-h-tactil bg-acento text-fondo-profundo font-bold flex items-center justify-between px-4"
        >
          <span>Ver ticket ({carrito.lineas.length})</span>
          <span>${total.toFixed(2)}</span>
        </button>
      ) : null}

      {esMovil && ticketAbierto ? (
        <div className="fixed inset-0 z-40 bg-fondo-profundo/80 flex items-end">
          <div className="w-full max-h-[85vh] overflow-y-auto">
            <SalesReceipt
              lineas={carrito.lineas}
              onIncrementar={incrementar}
              onDecrementar={decrementar}
              onQuitar={quitar}
              onCobrar={() => {
                setTicketAbierto(false);
                setCheckoutAbierto(true);
              }}
              cobrando={acciones.enviando}
              terminalId={CONFIG.TERMINAL_ID}
              banner={banner}
            />
            <button
              type="button"
              onClick={() => setTicketAbierto(false)}
              className="w-full min-h-tactil bg-fondo-panel text-crema-ticket"
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}

      {checkoutAbierto ? (
        <CheckoutScreen
          total={total}
          onConfirmar={confirmarCobro}
          onCancelar={() => setCheckoutAbierto(false)}
          procesando={acciones.enviando}
          error={error}
        />
      ) : null}

      <OverlayExito
        ticket={acciones.ticket && acciones.ticket.status === 'PAID' ? acciones.ticket : null}
        onNuevaVenta={() => {
          setError(null);
          setBanner(null);
        }}
      />

      <OverlayError
        mensaje={null}
        onCerrar={() => setError(null)}
      />
    </div>
  );
}
