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
 * CIERRE FASE 3 (D-12) — PERSISTENCIA ATÓMICA END-TO-END:
 *   Antes, `useCart` recibía `ticketId: null` clavado, así que cada ítem se
 *   persistía SOLO en memoria y el cobro reenviaba TODOS los ítems de golpe
 *   (el patrón "BLOB completo" que la cicatriz v6.0 quiso eliminar).
 *   Ahora el ticket OPEN nace al agregar el PRIMER ítem y su `id` se cablea a
 *   `useCart`, de modo que los contratos 18–20 (añadir/cambiar/quitar por
 *   `item_id`) se ejercen de verdad en la pantalla real. El cobro ya NO
 *   reenvía los ítems: solo paga el ticket que ya existe.
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
// F7.5 — Integración de los entregables de la Fase 7 en la pantalla real.
import { useTheme } from './hooks/useTheme.js';
import { useVoiceCart } from './hooks/useVoiceCart.js';
import { useVision } from './hooks/useVision.js';
import CategoryBar from './components/CategoryBar.jsx';
import ProductGrid from './components/ProductGrid.jsx';
import SalesReceipt from './components/SalesReceipt.jsx';
import CheckoutScreen from './components/CheckoutScreen.jsx';
import POSHeader from './components/POSHeader.jsx';
import ThemeSelector from './components/ThemeSelector.jsx';
import VoiceCartPanel from './components/VoiceCartPanel.jsx';
import VisionVisor from './components/VisionVisor.jsx';
import OrderProgrammingModal from './components/OrderProgrammingModal.jsx';
// F8.6 — Integración con CRM y Notificaciones (lado POS).
import CustomerIdentificationPanel from './components/CustomerIdentificationPanel.jsx';
import TicketDeliveryPanel from './components/TicketDeliveryPanel.jsx';
import { OverlayExito, OverlayError, OfflineBanner } from './components/POSOverlays.jsx';
// F9.0.1 — Salvaguarda de salida con cuenta abierta (UX heredada del viejo POS).
import ExitAccountModal from './components/ExitAccountModal.jsx';
// F4.5.2 — Gestor de Caja (Fase 4). Estaba construido pero HUÉRFANO: sin este
// montaje, RN-49 impide cobrar (no hay forma de abrir el turno de caja).
import GestorDeCaja from './GestorDeCaja.jsx';
// F4.5.3 — Guarda de cobro: la pantalla consulta el turno de caja para avisar
// ANTES de intentar cobrar (en vez de dejar que el backend devuelva un 400).
import * as caja from './services/cashService.js';
// F9.1.3 — Pagos mixtos: el checkout devuelve N abonos y aquí se construye el
// `payment_details` canónico (valida RN-94 en la frontera; nunca lanza).
import { construirPaymentDetails } from './services/checkoutService.js';

/**
 * F7.7d — LA TERMINAL ES UN PROP, NO UNA CONSTANTE.
 *
 * HALLAZGO 4: esta pantalla declaraba `function RetailVisionPOS()` — SIN props.
 * `App.jsx` le pasaba `terminalId={selectedTerminal}`, pero el prop se
 * descartaba en silencio y la pantalla caía al `CONFIG.TERMINAL_ID` hardcodeado
 * (`'TERM-01'`). Resultado: entrabas a la Terminal 3 y la pantalla operaba
 * contra la Terminal 1 — o contra ninguna, si la sesión vivía en otra terminal.
 *
 * Ahora la pantalla RECIBE la terminal elegida en el selector y la usa en todo
 * su cableado (sesión, ticket, candado, header, ticket impreso). El
 * `CONFIG.TERMINAL_ID` queda solo como último recurso para los tests que montan
 * la pantalla sin props.
 *
 * @param {object} props
 * @param {string} [props.terminalId] - Terminal elegida en el selector (F7.7d).
 * @param {object} [props.currentUser] - Usuario del ERP (identidad + permisos).
 * @param {Function} [props.onBackToTerminals] - Volver al selector de terminales.
 */
export default function RetailVisionPOS({
  terminalId,
  currentUser,
  onBackToTerminals,
}) {
  // F7.7d — La terminal efectiva: el prop manda; el CONFIG es solo el fallback
  // de los tests que montan la pantalla sin props.
  const terminalEfectiva = terminalId || CONFIG.TERMINAL_ID;
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
  // F7.5/F7.6 — Visibilidad de los paneles de IA.
  //   - Tema: overlay nuevo (no existía en el viejo POS).
  //   - Voz: overlay abierto desde el header, con gate de disponibilidad.
  //   - Visión: NO es un overlay; es un MODO DE VISTA (`viewMode`) que
  //     reemplaza el cuerpo (grid ↔ visor), como en el viejo POS (F7.6.2).
  const [temaAbierto, setTemaAbierto] = useState(false);
  const [vozAbierta, setVozAbierta] = useState(false);
  const [viewMode, setViewMode] = useState('GRID'); // 'GRID' | 'CAMERA'
  // F7.5.6 — Modal de programación de pedido (puente POS → Pedidos).
  const [pedidoAbierto, setPedidoAbierto] = useState(false);
  // Bloque `order_*` capturado por el modal; se adjunta al crear el ticket.
  const [bloquePedido, setBloquePedido] = useState(null);
  // F8.6 — CRM (identificación del cliente) + Notificaciones (entrega del ticket).
  //   - `clienteAbierto`: visibilidad del panel de identificación (overlay).
  //   - `cliente`: el cliente identificado (CRM), o null. Se usa para PRECARGAR
  //     el contacto en el paso de entrega (RN-92) y para resaltar el botón.
  //   - `entregaAbierta`: visibilidad del paso post-cobro de entrega. Aparece
  //     SOLO después de que `cobrar()` resolvió con éxito.
  const [clienteAbierto, setClienteAbierto] = useState(false);
  const [cliente, setCliente] = useState(null);
  const [entregaAbierta, setEntregaAbierta] = useState(false);
  // F9.0.1 — Salvaguarda de salida: si el operador intenta salir con una cuenta
  // abierta, se muestra `ExitAccountModal` en vez de salir en silencio.
  const [salidaAbierta, setSalidaAbierta] = useState(false);
  // F4.5.2 — Visibilidad del Gestor de Caja (overlay). Es el punto de entrada
  // al turno de caja: sin turno abierto, RN-49 impide cobrar.
  const [cajaAbierta, setCajaAbierta] = useState(false);
  // F4.5.3 — El turno de caja activo (o null). La pantalla lo consulta para
  // AVISAR antes de cobrar si no hay turno abierto (RN-49), en vez de dejar
  // que el backend devuelva un 400 críptico.
  const [turnoCaja, setTurnoCaja] = useState(null);
  // F4.5.3 — Aviso proactivo: se enciende cuando el operador intenta cobrar sin
  // turno de caja abierto. No bloquea (el backend sigue siendo la autoridad
  // vía RN-49); solo explica el porqué y ofrece abrir el gestor.
  const [avisoCaja, setAvisoCaja] = useState(false);

  // (D-12) Ticket OPEN en el servidor. Nace al agregar el PRIMER ítem y se
  // cablea a `useCart`, de modo que la persistencia atómica por ítem opere
  // de verdad en la pantalla real (contratos 18–20).
  const [ticketId, setTicketId] = useState(null);

  // ── Hooks del POS (Fase 3.3) ───────────────────────────────────────────────
  const carrito = useCart({ api, ticketId, version: 0 });
  const acciones = useTicketActions({
    api,
    terminalId: terminalEfectiva,
    channel: CONFIG.CANAL,
  });
  const locking = useTerminalLocking({
    api,
    terminalId: terminalEfectiva,
    usuarioId: sesion?.employee_id || null,
  });

  // ── Hooks de IA (F7.5) ─────────────────────────────────────────────────────
  // Los tres consumen contratos (17/24/25) y degradan con elegancia: si el
  // Centro de IA no responde, el POS sigue vendiendo en modo manual (DT-07).
  // NINGUNO toca el carrito: la IA propone, el operador confirma (H-5).
  const tema = useTheme();
  const voz = useVoiceCart(productos);
  const vision = useVision(productos);

  // ── Carga inicial: catálogo + sesión activa ────────────────────────────────
  useEffect(() => {
    let activo = true;
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const [catalogo, sesionActiva] = await Promise.all([
          api.getCatalogo(CONFIG.CANAL),
          api.getSesionActiva(terminalEfectiva),
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

  // ── F4.5.3 — Turno de caja activo (para la guarda de cobro) ────────────────
  // Se consulta al montar y cada vez que el gestor de caja se cierra (por si
  // el operador abrió o cerró el turno). Si el API no responde, se deja en
  // `null`: la guarda es un AVISO, no un bloqueo duro (el backend sigue siendo
  // la autoridad final vía RN-49).
  const refrescarTurnoCaja = useCallback(async () => {
    const r = await caja.obtenerTurnoActivo();
    if (r.outcome === 'ok') {
      setTurnoCaja(r.data && r.data.cash_session_id ? r.data : null);
    }
  }, []);

  useEffect(() => {
    refrescarTurnoCaja();
  }, [refrescarTurnoCaja]);

  // ── Filtro por categoría ───────────────────────────────────────────────────
  const productosVisibles = useMemo(() => {
    if (categoriaActiva === null) return productos;
    return productos.filter((p) => p.category_id === categoriaActiva);
  }, [productos, categoriaActiva]);

  // ── (D-12) Asegura que exista un ticket OPEN antes de persistir un ítem ────
  // El ticket nace al agregar el PRIMER ítem. Devuelve el `id` del ticket
  // (creado ahora o ya existente) o `null` si la creación falló.
  //
  // Devuelve el ID (no un booleano) porque `setTicketId` es asíncrono: el
  // `ticketId` de React todavía NO se propagó a `useCart` en el mismo tick.
  // El llamador DEBE pasar ese id a `anadirLinea({ ticket_id })` para que el
  // PRIMER ítem se persista de verdad (contrato 18). Sin esto, el primer ítem
  // se quedaría solo en memoria local.
  const ticketIdRef = useRef(ticketId);
  ticketIdRef.current = ticketId;

  // F7.5.6 — `bloquePedido` (opcional): los campos `order_*` que el modal de
  // programación capturó. Se adjuntan SOLO al crear el ticket (contrato 3).
  const asegurarTicket = useCallback(
    async (bloque = null) => {
      if (ticketIdRef.current) return ticketIdRef.current;

      const creado = await acciones.crearTicket([], bloque);
      if (creado.outcome !== 'ok' || !creado.data?.id) {
        setError(creado.reason || 'No se pudo abrir el ticket');
        return null;
      }
      setTicketId(creado.data.id);
      ticketIdRef.current = creado.data.id;
      return creado.data.id;
    },
    [acciones]
  );

  // ── RN-17: un producto aparece una sola vez; agregarlo incrementa ──────────
  const agregarProducto = useCallback(
    async (producto) => {
      const idTicket = await asegurarTicket();
      if (!idTicket) return;
      carrito.anadirLinea({
        ticket_id: idTicket,
        product_id: producto.id,
        name: producto.name,
        quantity: 1,
        unit_price: Number(producto.price),
      });
    },
    [asegurarTicket, carrito]
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
    async (codigo) => {
      const producto = productosRef.current.find(
        (p) => p.sku === codigo || p.barcode === codigo
      );
      if (!producto) {
        setBanner({ tipo: 'error', mensaje: `Código no encontrado: ${codigo}` });
        return;
      }
      setBanner(null);
      const idTicket = await asegurarTicket();
      if (!idTicket) return;
      carrito.anadirLinea({
        ticket_id: idTicket,
        product_id: producto.id,
        name: producto.name,
        quantity: 1,
        unit_price: Number(producto.price),
      });
    },
    [asegurarTicket, carrito]
  );

  useBarcodeScanner({ alEscanear });

  // ── Cobro: paga el ticket OPEN ya existente (RN-14..RN-27, RN-62/63) ───────
  // (D-12) El ticket nace al primer ítem y sus líneas ya están persistidas por
  // los contratos 18–20. El cobro NO reenvía los ítems: solo paga. Si por
  // alguna razón no hay ticket (defensivo), se crea con las líneas actuales.
  const confirmarCobro = useCallback(
    async (pago) => {
      setError(null);
      setBanner(null);

      // F4.5.3 — Guarda de cobro (RN-49). Sin turno de caja abierto el backend
      // rechaza el cobro con un 400 críptico. Aquí se AVISA antes: se cierra el
      // checkout, se enciende el aviso y se ofrece abrir el gestor. No se cobra.
      if (!turnoCaja) {
        setCheckoutAbierto(false);
        setAvisoCaja(true);
        return;
      }

      if (!ticketIdRef.current) {
        const items = carrito.lineas.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
        }));
        const creado = await acciones.crearTicket(items);
        if (creado.outcome !== 'ok' || !creado.data?.id) {
          setError(creado.reason || 'Error al crear el ticket');
          return;
        }
        setTicketId(creado.data.id);
        ticketIdRef.current = creado.data.id;
      }

      // F9.1.3 — El checkout puede devolver DOS formas:
      //   - `{ abonos: [...] }`  → cobro MIXTO (N pagos). Se construye el
      //     `payment_details` canónico con el servicio (valida RN-94 en la
      //     frontera; nunca lanza).
      //   - `{ metodo, recibido, cambio }` → cobro de UN solo pago (regresión).
      let paymentDetails;
      if (Array.isArray(pago?.abonos)) {
        const construido = construirPaymentDetails({
          abonos: pago.abonos,
          total: carrito.total,
        });
        if (construido.outcome !== 'ok') {
          setError(construido.reason || 'Los pagos no cuadran con el total');
          return;
        }
        paymentDetails = construido.data;
      } else {
        paymentDetails = {
          metodo: pago.metodo,
          recibido: pago.recibido,
          cambio: pago.cambio,
        };
      }

      const pagado = await acciones.cobrar(paymentDetails);
      if (pagado.outcome !== 'ok') {
        setError(pagado.reason || 'Error al cobrar el ticket');
        return;
      }

      // Cobro verificado: limpieza del carrito (prohibición #2).
      await carrito.clearCart();
      setCheckoutAbierto(false);
      // F8.6 — Paso post-cobro de entrega del ticket (F8.5). Aparece SOLO
      // cuando el cobro ya resolvió con éxito: si el cobro falla, se retorna
      // antes y este paso NUNCA se abre (punto delicado del plan §3.7).
      setEntregaAbierta(true);
    },
    [acciones, carrito, turnoCaja]
  );

  // ── F7.5.6 — Programación de pedido (puente POS → Pedidos) ─────────────────
  // El modal captura los datos y devuelve el bloque `order_*`. Si el ticket aún
  // no existe, se crea CON el bloque (el backend proyecta el pedido en la misma
  // transacción, contrato 15). Si ya existe, el bloque se guarda para el
  // siguiente ticket (el pedido se programa ANTES de abrir la cuenta).
  const guardarPedido = useCallback(
    async (bloque) => {
      setPedidoAbierto(false);
      setBloquePedido(bloque);
      if (!ticketIdRef.current) {
        const listo = await asegurarTicket(bloque);
        if (!listo) return;
      }
    },
    [asegurarTicket]
  );

  // ── F9.0.1 — Salvaguarda de salida con cuenta abierta ──────────────────────
  // UX heredada del viejo POS (§6.8): si hay ítems en la cuenta, salir NO es
  // silencioso. Se intercepta el intento y se ofrece el modal de 3 caminos.
  // Con la cuenta vacía, se sale directo (sin fricción innecesaria).
  const intentarSalir = useCallback(() => {
    if (carrito.lineas.length > 0) {
      setSalidaAbierta(true);
      return;
    }
    onBackToTerminals?.();
  }, [carrito.lineas.length, onBackToTerminals]);

  // "Enviar al Pizarrón y salir": la cuenta YA está persistida por la
  // persistencia atómica por ítem (contratos 18–20). Solo se sale; NO se borra.
  const salirEnviandoAlPizarron = useCallback(() => {
    setSalidaAbierta(false);
    onBackToTerminals?.();
  }, [onBackToTerminals]);

  // "Salir sin enviar — perder cuenta": acción destructiva. Se descarta la
  // cuenta (clearCart) y se sale.
  const salirSinEnviar = useCallback(async () => {
    setSalidaAbierta(false);
    try {
      await carrito.clearCart();
    } catch {
      // Si el descarte falla, se sale igual: la intención del operador es salir.
    }
    onBackToTerminals?.();
  }, [carrito, onBackToTerminals]);

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
        terminalId={terminalEfectiva}
        estado={estadoCuenta}
        tipoVenta={CONFIG.CANAL}
        sesionAbierta={Boolean(sesion)}
        enLinea={enLinea}
        modo={modo}
        onCambiarEstacion={intentarSalir}
        onAbrirTema={() => setTemaAbierto(true)}
        onAbrirVoz={() => setVozAbierta(true)}
        vozDisponible={voz.disponible}
        onAbrirPedido={() => setPedidoAbierto(true)}
        pedidoProgramado={Boolean(bloquePedido)}
        onAbrirCliente={() => setClienteAbierto(true)}
        clienteIdentificado={Boolean(cliente)}
        onAbrirCaja={() => setCajaAbierta(true)}
        cajaAbierta={cajaAbierta}
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
            viewMode={viewMode}
            onCambiarVista={setViewMode}
          />
          {cargando ? (
            <div className="w-full flex items-center justify-center py-16 text-crema-ticket/50">
              Cargando catálogo…
            </div>
          ) : viewMode === 'CAMERA' ? (
            /* F7.6.2 — UX heredada del viejo POS: la visión es un MODO DE VISTA
               que reemplaza el cuerpo. El visor se monta aquí (no como overlay
               suelto); su propio `fixed inset-0` lo cubre. */
            <VisionVisor
              activo={vision.activo}
              analizando={vision.analizando}
              sugerencias={vision.sugerencias}
              disponible={vision.disponible}
              error={vision.error}
              umbral={vision.umbral}
              videoRef={vision.videoRef}
              canvasRef={vision.canvasRef}
              onToggle={vision.alternar}
              onAgregar={async (s) => {
                // La IA sugiere; el operador decide. Solo aquí se toca el carrito.
                if (!s?.resuelto || !s.producto) return;
                const idTicket = await asegurarTicket();
                if (!idTicket) return;
                carrito.anadirLinea({
                  ticket_id: idTicket,
                  product_id: s.producto.id,
                  name: s.producto.name,
                  quantity: 1,
                  unit_price: Number(s.producto.price),
                });
              }}
              onLimpiar={vision.limpiarSugerencias}
              onCerrar={() => {
                vision.detener();
                setViewMode('GRID');
              }}
            />
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
            terminalId={terminalEfectiva}
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
              terminalId={terminalEfectiva}
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

      {/* F9.0.3 — Aviso fijo de red caída (cicatriz v6.1 $453). Solo estado de
          red: el nuevo POS no tiene cola local, así que no hay conteo. */}
      <OfflineBanner visible={!enLinea} />

      <OverlayExito
        ticket={acciones.ticket && acciones.ticket.status === 'PAID' ? acciones.ticket : null}
        onNuevaVenta={() => {
          setError(null);
          setBanner(null);
        }}
      />

      <OverlayError
        mensaje={error}
        onCerrar={() => setError(null)}
      />

      {/* F9.0.1 — Salvaguarda de salida con cuenta abierta (UX heredada §6.8). */}
      <ExitAccountModal
        visible={salidaAbierta}
        cantidadItems={carrito.lineas.length}
        onEnviarYSalir={salirEnviandoAlPizarron}
        onSalirSinEnviar={salirSinEnviar}
        onCancelar={() => setSalidaAbierta(false)}
      />

      {/* ── Paneles de IA (F7.5) ──────────────────────────────────────────────
          La IA propone; el operador confirma. Solo el callback explícito del
          operador (onApply / onAgregar) toca el carrito, y lo hace por el MISMO
          camino que el grid de productos (`carrito.anadirLinea`), de modo que la
          persistencia atómica por ítem (contratos 18–20) siga operando igual. */}

      {/* Tema (F7.5.1) */}
      {temaAbierto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Selector de tema"
        >
          <div className="bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white">
              🎨 Tema
            </h2>
            <ThemeSelector
              tema={tema.tema}
              temas={tema.temas}
              ofreceSelector={tema.ofreceSelector}
              onCambiarTema={tema.cambiarTema}
            />
            <button
              type="button"
              onClick={() => setTemaAbierto(false)}
              className="w-full min-h-tactil bg-fondo-panel text-crema-ticket rounded-xl"
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}

      {/* Voz (F7.5.2) */}
      {vozAbierta ? (
        <VoiceCartPanel
          grabando={voz.grabando}
          transcribiendo={voz.transcribiendo}
          texto={voz.texto}
          propuesta={voz.propuesta}
          disponible={voz.disponible}
          error={voz.error}
          fase={voz.fase}
          nivel={voz.nivel}
          productos={productos}
          onToggleRecording={voz.alternar}
          onEditLine={voz.editarLinea}
          onRemoveLine={voz.quitarLinea}
          onToggleConfirm={voz.alternarConfirmacion}
          onApply={async () => {
            // La IA propone; el operador confirma. Solo aquí se toca el carrito.
            const lineas = voz.propuesta?.lineas || [];
            const validas = lineas.filter((l) => l.resuelto && l.producto);
            if (validas.length > 0) {
              const idTicket = await asegurarTicket();
              if (!idTicket) return;
              validas.forEach((l) => {
                carrito.anadirLinea({
                  ticket_id: idTicket,
                  product_id: l.producto.id,
                  name: l.producto.name,
                  quantity: l.cantidad || 1,
                  unit_price: Number(l.producto.price),
                });
              });
            }
            voz.reset();
            setVozAbierta(false);
          }}
          onCancel={() => {
            voz.reset();
            setVozAbierta(false);
          }}
        />
      ) : null}

      {/* Programación de pedido (F7.5.5) — UX heredada del viejo POS (§6.8).
          El modal NO toca el carrito ni la API: solo construye el bloque de
          pedido y lo entrega a `guardarPedido`, que lo persiste por el MISMO
          camino que la venta directa (POST /pos/tickets → proyección). */}
      {pedidoAbierto ? (
        <OrderProgrammingModal
          lineas={carrito.lineas}
          numeroCuenta={ticketId || null}
          datosIniciales={bloquePedido}
          onGuardar={guardarPedido}
          onCerrar={() => setPedidoAbierto(false)}
        />
      ) : null}

      {/* ── F8.6 — CRM + Notificaciones (lado POS) ────────────────────────────
          El POS CONSUME los contratos #26 (beneficios) y #27 (encolar ticket).
          NUNCA escribe en `customers` ni en `notification_outbox` (A-02). */}

      {/* Identificación del cliente (F8.4). El panel llama al contrato #26 por
          el hook `useCustomerIdentification`; al identificar, entrega el cliente
          a la pantalla para precargar el contacto del paso de entrega (RN-92). */}
      {clienteAbierto ? (
        <CustomerIdentificationPanel
          items={carrito.lineas.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
          }))}
          onIdentificado={(identificado) => {
            setCliente(identificado);
            setClienteAbierto(false);
          }}
          onCerrar={() => setClienteAbierto(false)}
        />
      ) : null}

      {/* Entrega del ticket (F8.5). Es un overlay del screen, hermano de
          `OverlayExito`: aparece DESPUÉS del cobro, no dentro del modal de pago.
          Imprimir SIEMPRE está disponible (RN-87); WhatsApp/Email encolan por el
          contrato #27 (RN-86) y, si la cola está caída, la venta NO se revierte
          (DT-07). El contacto se precarga desde el CRM (RN-92). */}
      {entregaAbierta && acciones.ticket ? (
        <TicketDeliveryPanel
          ticket={acciones.ticket}
          cliente={cliente}
          onOmitir={() => setEntregaAbierta(false)}
          onEnviado={() => setEntregaAbierta(false)}
        />
      ) : null}

      {/* NOTA (F7.6.2): la visión ya NO se monta aquí como overlay suelto.
          Es un MODO DE VISTA (`viewMode === 'CAMERA'`) que reemplaza el cuerpo,
          como en el viejo POS. Ver el bloque del cuerpo más arriba. */}

      {/* F4.5.2 — Gestor de Caja (overlay). Punto de entrada al turno de caja:
          sin turno ABIERTO, RN-49 impide cobrar. Se monta con la terminal
          efectiva y el usuario de la sesión (o null si aún no hay sesión). */}
      {cajaAbierta ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Gestor de caja"
        >
          <div className="bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <GestorDeCaja
              terminalId={terminalEfectiva}
              usuarioId={sesion?.employee_id || null}
              // F10.5 — paridad de datos: el viejo POS persistía el NOMBRE del
              // cajero (`employee_name`). Se hereda del usuario autenticado.
              usuarioNombre={currentUser?.name || null}
              onCerrar={() => {
                setCajaAbierta(false);
                // F4.5.3 — Al cerrar el gestor, se relee el turno: si el operador
                // acaba de abrirlo, la guarda de cobro deja de avisar.
                refrescarTurnoCaja();
              }}
            />
          </div>
        </div>
      ) : null}

      {/* F4.5.3 — Aviso proactivo de caja (RN-49). Se enciende cuando el
          operador intenta cobrar sin turno abierto. NO bloquea el cobro de
          forma definitiva: el backend sigue siendo la autoridad final. Solo
          explica el porqué y ofrece abrir el gestor en un clic. */}
      {avisoCaja ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          role="alertdialog"
          aria-modal="true"
          aria-label="Caja cerrada"
        >
          <div className="bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-6 text-center">
            <div className="text-5xl mb-3" aria-hidden="true">💰</div>
            <h2 className="text-xl font-bold text-white mb-2">
              Abre la caja antes de cobrar
            </h2>
            <p className="text-sm text-zinc-400 mb-6">
              No hay un turno de caja abierto en esta terminal. Para cobrar
              necesitas abrir la caja primero (RN-49).
            </p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setAvisoCaja(false);
                  setCajaAbierta(true);
                }}
                className="min-h-tactil rounded-2xl bg-acento px-5 py-3 font-semibold text-white hover:opacity-90"
              >
                Abrir caja
              </button>
              <button
                type="button"
                onClick={() => setAvisoCaja(false)}
                className="min-h-tactil rounded-2xl border border-white/15 px-5 py-3 font-semibold text-zinc-300 hover:bg-white/5"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
