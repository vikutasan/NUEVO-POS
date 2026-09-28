/**
 * `RetailVisionPOS` — interfaz 1 del registro de la superficie (Pantalla raíz).
 *
 * Contenedor raíz declarado: `w-full h-screen flex flex-col`.
 *   - MOSTRADOR (≥1024px): layout completo de 2 columnas (cuerpo + ticket).
 *   - COMPACTO (768–1023px): el ticket lateral se estrecha; el grid a 3 columnas.
 *   - MÓVIL (<768px): el ticket se convierte en panel inferior deslizable; el
 *     grid a 2 columnas.
 *
 * Esta pantalla orquesta el flujo E.1 (venta directa):
 *   1. Carga el catálogo (contrato 1) y la sesión activa (contrato 9).
 *   2. El cajero agrega productos (RN-17: un producto una vez, incrementa).
 *   3. Cobra (RN-16: total = suma de subtotales; RN-23: no modificar PAID).
 *   4. El ticket queda PAID en la BD `nuevo_pos`.
 *
 * R-01: `w-full` en el contenedor raíz. R-03: los 3 modos son explícitos.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CONFIG } from '../../shared/config.js';
import * as api from './api/client.js';
import { useModo } from './hooks/useModo.js';
import CategoryBar from './components/CategoryBar.jsx';
import ProductGrid from './components/ProductGrid.jsx';
import SalesReceipt from './components/SalesReceipt.jsx';
import CheckoutScreen from './components/CheckoutScreen.jsx';

export default function RetailVisionPOS() {
  const { modo, esMovil } = useModo();

  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [categoriaActiva, setCategoriaActiva] = useState(null);
  const [sesion, setSesion] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [checkoutAbierto, setCheckoutAbierto] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [ticketPagado, setTicketPagado] = useState(null);
  const [ticketAbierto, setTicketAbierto] = useState(false);

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
  const agregarProducto = useCallback((producto) => {
    setLineas((previas) => {
      const existente = previas.find((l) => l.product_id === producto.id);
      if (existente) {
        return previas.map((l) =>
          l.product_id === producto.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...previas,
        {
          product_id: producto.id,
          name: producto.name,
          unit_price: Number(producto.price),
          quantity: 1,
        },
      ];
    });
  }, []);

  const incrementar = useCallback((linea) => {
    setLineas((previas) =>
      previas.map((l) =>
        l.product_id === linea.product_id ? { ...l, quantity: l.quantity + 1 } : l
      )
    );
  }, []);

  const decrementar = useCallback((linea) => {
    setLineas((previas) =>
      previas
        .map((l) =>
          l.product_id === linea.product_id ? { ...l, quantity: l.quantity - 1 } : l
        )
        .filter((l) => l.quantity > 0)
    );
  }, []);

  const quitar = useCallback((linea) => {
    setLineas((previas) => previas.filter((l) => l.product_id !== linea.product_id));
  }, []);

  // ── Cobro: crea el ticket y lo paga (RN-14..RN-27, RN-62/63) ───────────────
  const confirmarCobro = useCallback(
    async (pago) => {
      setCobrando(true);
      setError(null);
      try {
        const creado = await api.crearVenta({
          terminal_id: CONFIG.TERMINAL_ID,
          channel: CONFIG.CANAL,
          items: lineas.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
          })),
        });

        const pagado = await api.cobrarTicket(creado.id, {
          payment_details: {
            metodo: pago.metodo,
            recibido: pago.recibido,
            cambio: pago.cambio,
          },
          version: creado.version,
        });

        setTicketPagado(pagado);
        setCheckoutAbierto(false);
        setLineas([]);
      } catch (causa) {
        setError(causa.message || 'Error al cobrar el ticket');
      } finally {
        setCobrando(false);
      }
    },
    [lineas]
  );

  const total = useMemo(
    () => lineas.reduce((acc, l) => acc + l.unit_price * l.quantity, 0),
    [lineas]
  );

  return (
    <div className="w-full h-screen flex flex-col bg-madera text-crema-ticket">
      {/* Header (réplica estética del POSHeader viejo) */}
      <header className="w-full flex items-center justify-between px-4 py-3 bg-fondo-profundo-alt border-b border-white/5 z-20">
        {/* IZQUIERDA: Terminal */}
        <button type="button" className="bg-fondo-profundo border border-white/5 px-6 py-2 rounded-xl flex items-center transition-all group shadow-2xl hover:bg-fondo-panel">
          <div className="text-left">
            <p className="text-[18px] font-black uppercase text-crema-ticket tracking-widest leading-none mb-1">
              {CONFIG.TERMINAL_ID === 'CAJA' ? 'Caja Central' : `Terminal ${CONFIG.TERMINAL_ID}`}
            </p>
            <p className="text-[14px] font-black text-acento uppercase tracking-tighter leading-none">
              Cambiar Estación
            </p>
          </div>
        </button>

        {/* CENTRO: Estado de Transacción */}
        <div className="bg-fondo-profundo border border-white/10 px-8 py-2 rounded-3xl shadow-2xl flex flex-col items-center">
          <span className="text-[7px] font-black uppercase text-crema-ticket tracking-[0.5em] mb-0.5">Estado de Transaccion</span>
          <span className="text-3xl font-black uppercase tracking-tighter italic text-acento drop-shadow-[0_0_12px_rgba(193,215,46,0.4)]">
            NUEVA VENTA
          </span>
        </div>

        {/* DERECHA: Sesión + Modo */}
        <div className="flex items-center gap-2">
          <span
            className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
              sesion
                ? 'bg-acento text-fondo-profundo shadow-lg'
                : 'bg-peligro text-crema-ticket'
            }`}
          >
            {sesion ? 'Sesión abierta' : 'Sin sesión'}
          </span>
          <span className="hidden sm:inline text-[9px] font-black text-crema-ticket/50 uppercase tracking-widest">
            Modo: {modo}
          </span>
        </div>
      </header>

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
            lineas={lineas}
            onIncrementar={incrementar}
            onDecrementar={decrementar}
            onQuitar={quitar}
            onCobrar={() => setCheckoutAbierto(true)}
            cobrando={cobrando}
            terminalId={CONFIG.TERMINAL_ID}
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
          <span>Ver ticket ({lineas.length})</span>
          <span>${total.toFixed(2)}</span>
        </button>
      ) : null}

      {esMovil && ticketAbierto ? (
        <div className="fixed inset-0 z-40 bg-fondo-profundo/80 flex items-end">
          <div className="w-full max-h-[85vh] overflow-y-auto">
            <SalesReceipt
              lineas={lineas}
              onIncrementar={incrementar}
              onDecrementar={decrementar}
              onQuitar={quitar}
              onCobrar={() => {
                setTicketAbierto(false);
                setCheckoutAbierto(true);
              }}
              cobrando={cobrando}
              terminalId={CONFIG.TERMINAL_ID}
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
          procesando={cobrando}
        />
      ) : null}

      {ticketPagado ? (
        <div className="fixed inset-0 z-50 bg-fondo-profundo/80 flex items-center justify-center p-4">
          <div className="w-full max-w-[420px] bg-crema-ticket text-fondo-profundo rounded-canon40 p-6 flex flex-col gap-4 text-center">
            <h2 className="text-2xl font-bold">✅ Venta cobrada</h2>
            <p className="text-sm">
              Folio <strong>{ticketPagado.account_num}</strong>
            </p>
            <p className="text-3xl font-bold text-acento">
              ${Number(ticketPagado.total).toFixed(2)}
            </p>
            <p className="text-xs text-fondo-profundo/60">
              Estado: {ticketPagado.status}
            </p>
            <button
              type="button"
              onClick={() => setTicketPagado(null)}
              className="w-full min-h-tactil rounded-canon35 bg-acento text-fondo-profundo font-bold"
            >
              Nueva venta
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
