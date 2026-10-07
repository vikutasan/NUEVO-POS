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
import { aOutcome, esOk } from './utils/outcome.js';
import { useTicketActions } from './hooks/useTicketActions.js';
import { useTerminalLocking } from './hooks/useTerminalLocking.js';
import { useBarcodeScanner } from './hooks/useBarcodeScanner.js';
import { useNetworkHealth } from './hooks/useNetworkHealth.js';
import { useBeforeUnload } from './hooks/useBeforeUnload.js';
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
// F12.10b — `construirBloquePedido` arma el bloque `order_*` (contrato 3) al
// restaurar el contexto de un PEDIDO recuperado del pizarrón. Es la MISMA
// función pura que usa el modal, para no duplicar la forma del bloque.
import { construirBloquePedido } from './hooks/useOrderProgramming.js';
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
// F12.4 — Carta/catálogo en PDF (F6.3). Estaba construido pero HUÉRFANO: el
// botón "Exportar carta a PDF" de `CategoryBar` solo se pinta si se le pasa
// `onExportarPDF`, y la pantalla nunca lo hacía. Sin este cableado, el dueño
// no puede imprimir la carta desde el POS (12ª instancia de §10.6).
// NOTA: esta función es NUEVA del nuevo POS (no existe en el viejo POS).
import SelectorCategoriasPDF from './components/SelectorCategoriasPDF.jsx';
import { descargarCatalogoPDF } from './components/CatalogoPDF.jsx';
// F12.5 — Pizarrón de cuentas abiertas (F5.3). Estaba construido pero HUÉRFANO:
// `OpenAccountsCorkboard` (F5.3) + `useOpenAccounts` (F5.2) + `openAccountsService`
// (F5.1) existen y pasan sus tests aislados, pero la pantalla NUNCA los montaba
// y `POSHeader` no tenía botón para abrirlos. Sin este cableado, el cajero no
// puede recuperar una cuenta abierta (13ª instancia de §10.6). UX heredada del
// viejo POS (§6.8): el pizarrón se abre desde el header y recupera al carrito.
import OpenAccountsCorkboard from './components/OpenAccountsCorkboard.jsx';
import { listarCuentasAbiertas } from './services/openAccountsService.js';
// P5 — Política de pago mínimo para pedidos (Vista General → POS).
import { getSettingValue } from './api/client.js';

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
  const red = useNetworkHealth();

  // FICHA_FIX_TURNO_CAJA_USUARIO_ID (7 Oct 2026) — IDENTIDAD DEL OPERADOR.
  // El operador es el usuario AUTENTICADO por el ERP (`currentUser`), no la
  // sesión de terminal. `SesionActiva` (contrato 9) NUNCA expone `employee_id`
  // —la tabla `terminal_sessions` no tiene esa columna—, así que
  // `sesion?.employee_id` era SIEMPRE `undefined`. Eso dejaba `usuarioId` en
  // `null` y el backend rechazaba abrir el turno con 422 (`uuid_type`).
  // Se deriva UNA sola vez aquí y se usa en los tres puntos que lo necesitan.
  const usuarioId = currentUser?.id ?? null;

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
  //   - Tema: reubicado a la landing (TerminalSelector) — es preferencia, no acción.
  //   - Voz: overlay abierto desde el header, con gate de disponibilidad.
  //   - Visión: NO es un overlay; es un MODO DE VISTA (`viewMode`) que
  //     reemplaza el cuerpo (grid ↔ visor), como en el viejo POS (F7.6.2).
  const [vozAbierta, setVozAbierta] = useState(false);
  const [viewMode, setViewMode] = useState('GRID'); // 'GRID' | 'CAMERA'
  // F7.5.6 — Modal de programación de pedido (puente POS → Pedidos).
  const [pedidoAbierto, setPedidoAbierto] = useState(false);
  // Bloque `order_*` capturado por el modal; se adjunta al crear el ticket.
  const [bloquePedido, setBloquePedido] = useState(null);
  // F12.1 — Selector VENTA DIRECTA / PEDIDO (UX heredada del viejo POS, §6.8).
  //   Gobierna la aparición del botón 📌 de programación: SOLO se muestra en
  //   modo 'PEDIDO', igual que en `apps/pos/RetailVisionPOS.jsx` (viejo POS,
  //   estado `orderType`). Al volver a 'VENTA_DIRECTA' se limpia el bloque de
  //   pedido ya capturado (equivalente a `onOrderDataClear` del viejo POS).
  const [tipoPedido, setTipoPedido] = useState('VENTA_DIRECTA');
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
  // P1 — Guardia de empaque (Capa 2: modal de advertencia al cobrar).
  // Se enciende cuando el cajero intenta cobrar un PEDIDO con "Vender Empaque"
  // marcado pero sin ningún producto EMPAQUE en el carrito.
  const [avisoEmpaque, setAvisoEmpaque] = useState(false);
  // F12.4 — Carta/catálogo en PDF (F6.3). Visibilidad del selector de categorías
  // y bandera de "generando" para deshabilitar el botón mientras se arma el PDF.
  // Esta función es NUEVA del nuevo POS (no existe en el viejo POS).
  const [selectorPDFAbierto, setSelectorPDFAbierto] = useState(false);
  const [exportandoPDF, setExportandoPDF] = useState(false);
  // P5 — Política de pago mínimo para enviar pedidos a preparación.
  // Se lee UNA vez al montar desde Vista General (key: `order_min_payment_pct`).
  // Default seguro: 100 (pago completo). Si no hay conexión o el setting no
  // existe, se aplica el default. El valor es un número entre 0 y 100.
  const [politicaPagoPedido, setPoliticaPagoPedido] = useState(100);
  // F12.5 — Pizarrón de cuentas abiertas (F5.3). Visibilidad del overlay y el
  // conteo de cuentas abiertas de la terminal (para el badge del botón). El
  // conteo se refresca al abrir/cerrar el pizarrón; el pizarrón es la fuente
  // de verdad de la lista (su hook `useOpenAccounts` la descarga).
  const [pizarronAbierto, setPizarronAbierto] = useState(false);
  const [cuentasAbiertas, setCuentasAbiertas] = useState(0);

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
    usuarioId,
  });

  // ── Hooks de IA (F7.5) ─────────────────────────────────────────────────────
  // Los tres consumen contratos (17/24/25) y degradan con elegancia: si el
  // Centro de IA no responde, el POS sigue vendiendo en modo manual (DT-07).
  // NINGUNO toca el carrito: la IA propone, el operador confirma (H-5).
  const tema = useTheme();
  const voz = useVoiceCart(productos);
  const vision = useVision(productos);

  // ── Protección al cerrar pestaña (B1 — HALLAZGOS_AUDITORIA_BRECHAS_POS.md §3) ──
  //
  // Dos instancias del mismo hook genérico:
  //   1. Emergency save: envía el ticket + carrito por sendBeacon al cerrar.
  //      Muestra el diálogo nativo "¿seguro?" si hay ítems sin persistir.
  //   2. Lock release: libera el candado de terminal para evitar locks huérfanos
  //      (cicatriz OMEGA). El TTL del heartbeat lo limpia igual, pero esto es
  //      una liberación anticipada por cortesía.

  // 1) Emergency save + diálogo nativo de confirmación
  useBeforeUnload({
    url: `${CONFIG.API_BASE_URL}/pos/tickets/emergency-save`,
    confirmar: true,
    activo: carrito.lineas.length > 0,
    obtenerPayload: () => {
      const idTicket = ticketIdRef.current;
      if (!idTicket || carrito.lineas.length === 0) return null;
      return {
        ticket_id: idTicket,
        terminal_id: terminalEfectiva,
        items: carrito.lineas.map(l => ({
          item_id: l.item_id,
          product_id: l.product_id,
          quantity: l.quantity,
        })),
        emergency_save: true,
      };
    },
  });

  // 2) Lock release (anticipada, por cortesía — el TTL limpia igual)
  useBeforeUnload({
    url: `${CONFIG.API_BASE_URL}/pos/terminals/${terminalEfectiva}/unlock`,
    activo: locking.esDueno,
    obtenerPayload: () => {
      if (usuarioId === null || usuarioId === undefined) return null;
      return { occupier_id: String(usuarioId) };
    },
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
          api.getSesionActiva(terminalEfectiva),
        ]);
        if (!activo) return;
        setCategorias(catalogo.categorias || []);
        setProductos(catalogo.productos || []);
        setSesion(sesionActiva || null);

        // P5 — Leer política de pago de pedidos (fail-safe: default 100%).
        const pctRaw = await getSettingValue('order_min_payment_pct');
        if (activo && pctRaw !== null) {
          const pct = Number(pctRaw);
          if (!isNaN(pct) && pct >= 0 && pct <= 100) {
            setPoliticaPagoPedido(pct);
          }
        }
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
    const r = await caja.obtenerTurnoActivo(terminalEfectiva);
    if (r.outcome === 'ok') {
      setTurnoCaja(r.data && r.data.cash_session_id ? r.data : null);
    }
  }, [terminalEfectiva]);

  useEffect(() => {
    refrescarTurnoCaja();
  }, [refrescarTurnoCaja]);

  // ── F12.4 — Exportar la carta a PDF (F6.3) ─────────────────────────────────
  // El selector entrega las categorías marcadas; aquí se genera y descarga el
  // PDF con el catálogo COMPLETO (para hidratar por `category_id`). El servicio
  // devuelve `{outcome, reason}` y NUNCA lanza (contrato del POS): si falla, se
  // avisa por el banner y se cierra el selector igual.
  // ── F12.5 — Pizarrón de cuentas abiertas (F5.3) ────────────────────────────
  // Refresca el CONTEO de cuentas abiertas de la terminal (para el badge del
  // botón del header). Es una lectura ligera por el contrato 23; si falla, se
  // deja el conteo en 0 sin romper la pantalla (el pizarrón es la autoridad).
  const refrescarConteoCuentas = useCallback(async () => {
    const r = await listarCuentasAbiertas(terminalEfectiva);
    if (r.outcome === 'ok') {
      setCuentasAbiertas((r.data?.cuentas ?? []).length);
    }
  }, [terminalEfectiva]);

  useEffect(() => {
    refrescarConteoCuentas();
  }, [refrescarConteoCuentas]);

  // Recupera una cuenta abierta. El pizarrón entrega DOS cosas (F12.10b):
  //   1. `cuenta` — la versión FRESCA del servidor (contrato 21, 5 escalares).
  //   2. `postit` — el objeto RICO del pizarrón (contrato 23), que SÍ trae el
  //      contexto de pedido (`order_type`, `delivery_type`, `customer_name`,
  //      `customer_phone`) y el capturista (`captured_by_name`).
  //
  // F12.10 — HIDRATACIÓN DEL CARRITO (18ª instancia de §10.6): F12.5 adoptaba
  // la identidad pero NO las líneas, porque el contrato 21 devuelve EXACTAMENTE
  // 5 campos escalares (Regla 15). El operador recuperaba la cuenta y veía el
  // carrito VACÍO. La corrección es leer las líneas por el contrato 30
  // (`pos.leer_lineas`, `GET /pos/tickets/{id}/items`) y hidratar el carrito
  // con ellas + la `version` del servidor (RN-25). Si la lectura falla, NO se
  // adopta la cuenta: se avisa y se deja el carrito como estaba (no se inventa
  // estado).
  //
  // F12.10b — PARIDAD CON `handleRecoverAccount` DEL VIEJO POS (19ª instancia
  // de §10.6): el viejo POS hacía SEIS cosas al recuperar; F12.10 hizo tres.
  // Esta corrección cierra los huecos restantes:
  //   (a) GUARDIA DE CUENTA VACÍA: si la cuenta no tiene líneas, NO se adopta
  //       (el viejo POS avisaba "⚠️ Cuenta vacía." y salía sin tocar el carrito).
  //   (b) CONTEXTO DE PEDIDO: si la cuenta es un PEDIDO, se restauran
  //       `bloquePedido` + `tipoPedido` desde el `postit` (contrato 23). Sin
  //       esto, recuperar un pedido perdía su bloque (empaque, política de pago,
  //       datos del cliente) y el operador lo veía como venta directa.
  //
  // NOTA (hueco DESCARTADO, no cableado): el viejo POS adoptaba un "capturador
  // original" (`originalCapturer`). El POS nuevo NO tiene ese estado: el
  // capturador lo resuelve el BACKEND desde la sesión de terminal activa
  // (RN-24) y el pizarrón solo lo MUESTRA (`captured_by_name`, contrato 23).
  // Fabricar un estado de capturador en el cliente violaría A-02 (frontera por
  // contratos). Por eso este hueco se clasifica DESCARTADA, no se cablea.
  const recuperarCuentaAlCarrito = useCallback(
    async (cuenta, postit = null) => {
      if (!cuenta || !cuenta.id) return;

      const resultado = await aOutcome(() => api.leerLineas(cuenta.id));
      if (!esOk(resultado)) {
        setBanner({
          tipo: 'error',
          mensaje: `No se pudo recuperar la cuenta: ${resultado.reason || 'error'}`,
        });
        return;
      }

      const datos = resultado.data || {};
      const lineas = Array.isArray(datos.lineas) ? datos.lineas : [];

      // (a) GUARDIA DE CUENTA VACÍA (paridad con el viejo POS): una cuenta sin
      // líneas NO se adopta. Adoptarla dejaría al operador sobre una cuenta
      // vacía creyendo que recuperó algo. Se avisa y se deja el carrito igual.
      if (lineas.length === 0) {
        setBanner({
          tipo: 'error',
          mensaje: '⚠️ Cuenta vacía.',
        });
        return;
      }

      // DT-02 regla 6: se adopta el total del BACKEND (contrato 30), no se
      // recalcula sumando las líneas en el frontend.
      carrito.hidratarLineas(lineas, datos.version, datos.total);
      setTicketId(cuenta.id);

      // (b) CONTEXTO DE PEDIDO: se restaura desde el `postit` (contrato 23),
      // que es el ÚNICO objeto que trae `order_type`/`delivery_type`/cliente.
      // El contrato 21 (fresco) NO los trae (Regla 15).
      const esPedido = postit && postit.order_type === 'PEDIDO';
      if (esPedido) {
        setTipoPedido('PEDIDO');
        setBloquePedido(
          construirBloquePedido({
            order_type: 'PEDIDO',
            delivery_type: postit.delivery_type,
            customer_name: postit.customer_name,
            customer_phone: postit.customer_phone,
          }),
        );
      } else {
        // Venta directa: se limpia cualquier bloque de pedido previo (paridad
        // con la rama `else` del viejo POS, que hacía `setOrderData(null)`).
        setTipoPedido('VENTA_DIRECTA');
        setBloquePedido(null);
      }

      setPizarronAbierto(false);
      setBanner({
        tipo: 'exito',
        mensaje: `Cuenta ${cuenta.account_num || ''} recuperada`.trim(),
      });
    },
    [carrito],
  );

  const exportarCartaPDF = useCallback(
    (categoriasSeleccionadas) => {
      setExportandoPDF(true);
      const resultado = descargarCatalogoPDF(categoriasSeleccionadas, productos);
      setExportandoPDF(false);
      setSelectorPDFAbierto(false);
      if (resultado.outcome !== 'ok') {
        setBanner({
          tipo: 'error',
          mensaje: `No se pudo generar la carta: ${resultado.reason || 'error'}`,
        });
      }
    },
    [productos],
  );

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
      // F12.13 — Mutex (REGLA 2): si ya hay una creación en curso (doble clic
      // en un producto), NO es un error: se devuelve `null` y el llamador
      // aborta en silencio. El primer clic creará el ticket.
      if (creado.reason === 'accion_en_curso') return null;
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

  // ── P1 — Guardia de empaque (valores computados) ──────────────────────────
  // `empaqueRequerido`: el bloque de pedido marca packaging_type !== 'PROPIO'.
  // `empaqueEnCarrito`: hay al menos un producto con nature === 'EMPAQUE' en el carrito.
  const empaqueRequerido = Boolean(
    bloquePedido &&
    bloquePedido.packaging_type &&
    bloquePedido.packaging_type !== 'PROPIO',
  );
  const empaqueEnCarrito = (carrito.lineas || []).some(
    (l) => l.nature === 'EMPAQUE',
  );

  /**
   * P1 — Abre el checkout CON guardia de empaque (Capa 2).
   * Si se marcó "Vender Empaque" pero no hay empaque en el carrito,
   * se muestra el modal de advertencia en vez de abrir el checkout.
   * El cajero puede elegir continuar sin empaque o volver a agregar uno.
   */
  const abrirCheckoutConGuardia = useCallback(() => {
    if (empaqueRequerido && !empaqueEnCarrito) {
      setAvisoEmpaque(true);
      return;
    }
    setCheckoutAbierto(true);
  }, [empaqueRequerido, empaqueEnCarrito]);

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
      //
      // FIX "confirmar pago no hace nada" (7 Oct 2026): el estado `turnoCaja`
      // puede quedar DESACTUALIZADO (se cargó al montar y solo se refresca al
      // cerrar el gestor). Si el operador abrió la caja por otra vía, un `null`
      // obsoleto rebotaba el cobro en silencio. Antes de avisar, se RELEE el
      // turno real del servidor; solo si de verdad no hay turno se avisa.
      let turnoVigente = turnoCaja;
      if (!turnoVigente) {
        const r = await caja.obtenerTurnoActivo(terminalEfectiva);
        if (r.outcome === 'ok' && r.data && r.data.cash_session_id) {
          turnoVigente = r.data;
          setTurnoCaja(r.data);
        }
      }
      if (!turnoVigente) {
        setCheckoutAbierto(false);
        setAvisoCaja(true);
        return;
      }

      // P5 — Guardia de política de pago para PEDIDOS.
      // Si es un pedido programado, valida que el monto recibido cumpla con
      // el porcentaje mínimo definido en Vista General (`order_min_payment_pct`).
      // A 100% (default seguro), el checkout ya lo garantiza; a < 100%, esta
      // guardia será la frontera cuando se implemente pago parcial de pedidos.
      if (bloquePedido && tipoPedido === 'PEDIDO' && politicaPagoPedido > 0) {
        const totalCuenta = carrito.total || 0;
        const minimoRequerido = totalCuenta * (politicaPagoPedido / 100);
        const montoRecibido = Array.isArray(pago?.abonos)
          ? pago.abonos.reduce((sum, a) => sum + (Number(a.monto) || 0), 0)
          : Number(pago?.recibido) || 0;
        if (montoRecibido < minimoRequerido) {
          setError(
            `Para enviar este pedido a preparación se requiere al menos el ${politicaPagoPedido}% del total ($${minimoRequerido.toFixed(2)}). Monto recibido: $${montoRecibido.toFixed(2)}.`
          );
          return;
        }
      }

      if (!ticketIdRef.current) {
        const items = carrito.lineas.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
        }));
        const creado = await acciones.crearTicket(items);
        // F12.13 — Mutex (REGLA 2): si ya hay una acción de persistencia en
        // curso (doble clic), NO es un error: se ignora silenciosamente. El
        // primer clic sigue su camino y resolverá el cobro.
        if (creado.reason === 'accion_en_curso') return;
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
        // 3ª VUELTA (7 Oct 2026) — El pago único ahora trae `monto` EXPLÍCITO
        // (lo que se aplica al total). Se reenvía tal cual para que el backend
        // NO tenga que reconstruirlo desde el total (evita `suma_no_cuadra`
        // cuando el monto aplicado ≠ total, p. ej. pago parcial de PEDIDO).
        // Si por regresión no viniera `monto`, se omite y el backend cae al
        // default retrocompatible (`monto = total`).
        paymentDetails = {
          metodo: pago.metodo,
          recibido: pago.recibido,
          cambio: pago.cambio,
        };
        if (pago.monto != null) {
          paymentDetails.monto = pago.monto;
        }
      }

      // FIX "confirmar pago no hace nada" (2ª vuelta, 7 Oct 2026) — CAUSA REAL:
      // `acciones.cobrar` leía `ticketRef.current`, que SOLO se puebla cuando
      // `crearTicket`/`cobrar` corren DENTRO de `useTicketActions`. Pero en el
      // flujo real el ticket lo crea `asegurarTicket` (al añadir el 1er ítem) o
      // lo adopta `recuperarCuentaAlCarrito` (pizarrón): ambos escriben el
      // `ticketId` de ESTA pantalla, NO el ref interno del hook. Resultado:
      // `ticketRef.current === null` → `cobrar` devolvía
      // `{outcome:'error', reason:'sin_ticket_o_api'}` → la venta NUNCA cerraba.
      // Se pasa el id y la versión REALES del llamador (la pantalla es la dueña
      // del ticket abierto). El hook cae al ref interno si no vienen (regresión).
      const pagado = await acciones.cobrar(paymentDetails, {
        ticketId: ticketIdRef.current,
        version: carrito.version,
      });

      // F12.13 — Mutex (REGLA 2): si ya hay un cobro en curso (doble clic en
      // CONFIRMAR PAGO), la 2ª llamada se rechaza. NO es un error: el primer
      // cobro sigue su camino. Se ignora silenciosamente para no alarmar.
      if (pagado.reason === 'accion_en_curso') return;

      // F12.12 — AUTO-HEAL de conflicto de versión (409).
      // Otro vendedor modificó la cuenta entre que se abrió el checkout y se
      // cobró. En vez de mostrar un error críptico, se descarga la versión
      // fresca del servidor y se re-hidrata el carrito (REGLA 9: `hidratarLineas`
      // sincroniza los refs ANTES de `setState`). El ticket sigue siendo VÁLIDO:
      // solo estaba desactualizado. Se reabre el checkout para reintentar.
      if (pagado.reason === 'version_conflict') {
        const fresco = await aOutcome(() => api.leerLineas(ticketIdRef.current));
        if (esOk(fresco)) {
          const datos = fresco.data || {};
          // DT-02 regla 6: se adopta el total del BACKEND (contrato 30).
          carrito.hidratarLineas(
            Array.isArray(datos.lineas) ? datos.lineas : [],
            datos.version,
            datos.total,
          );
          setBanner({
            tipo: 'aviso',
            mensaje:
              '⚠️ ¡Atención! Otro vendedor modificó esta cuenta. Totales actualizados.',
          });
          setCheckoutAbierto(true);
        } else {
          setError(
            'Otro vendedor modificó esta cuenta y no se pudo descargar la versión fresca. Reintenta.',
          );
        }
        return;
      }

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

  // ── F12.9 — ENVIAR CUENTA AL PIZARRÓN (sin caja) ───────────────────────────
  // Paridad de operación con el viejo POS (§6.8): el viejo POS tenía DOS botones
  // distintos en el ticket:
  //   1. COBRAR        → `handleCheckout()`    — gateado por `cashEnabled`.
  //   2. ENVIAR CUENTA → `handleHoldAccount()` — NO gateado por `cashEnabled`.
  // El nuevo POS los había CONFLACIONADO en un solo botón, de modo que el gate
  // de caja (F12.8) bloqueaba también el envío al pizarrón. Eso rompía el flujo
  // real: una terminal SIN caja debe poder enviar la cuenta al pizarrón.
  //
  // Esta acción es el camino válido SIN caja. La cuenta YA está persistida por
  // ítem (contratos 18–20); enviarla al pizarrón consiste en:
  //   1. Asegurar que el ticket existe (si no, se crea vacío — defensivo).
  //   2. Limpiar el carrito con verificación (contrato 22): `clearCart` NO borra
  //      si algún ítem no llegó al servidor. Si falla, se avisa y NO se limpia.
  //   3. Resetear el `ticketId` para que la próxima venta abra una cuenta NUEVA
  //      (la cuenta enviada queda OPEN en el pizarrón, RN-31).
  //   4. Refrescar el conteo del pizarrón para que el badge refleje la cuenta.
  const enviarCuentaAlPizarron = useCallback(async () => {
    if (carrito.lineas.length === 0) return;
    setError(null);
    setBanner(null);

    // 1) Asegurar el ticket (la cuenta debe existir en el servidor).
    const idTicket = await asegurarTicket();
    if (!idTicket) return;

    // 2) Limpieza verificada: si algún ítem no está persistido, NO se limpia.
    const limpieza = await carrito.clearCart();
    if (limpieza.outcome !== 'ok') {
      setError(
        limpieza.reason === 'items_no_persistidos'
          ? 'No se pudo enviar: hay productos sin guardar en el servidor. Verifique la conexión WiFi.'
          : 'No se pudo enviar la cuenta al pizarrón. Intente de nuevo.',
      );
      return;
    }

    // 3) Cuenta nueva: la enviada queda OPEN en el pizarrón.
    setTicketId(null);
    ticketIdRef.current = null;

    // 4) Refrescar el conteo del pizarrón (badge del header).
    setCuentasAbiertas((n) => n + 1);
    setBanner({ tipo: 'ok', mensaje: 'Cuenta enviada al pizarrón' });
  }, [asegurarTicket, carrito]);

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
        // F12.19 — PARIDAD DE PRESENTACIÓN con el viejo POS (§6.8): el centro
        // del header muestra `CTA {folio}` en cuanto la cuenta tiene folio, y
        // el badge `📝 BORRADOR` mientras se captura y no se envió al pizarrón.
        //   - `numeroCuenta`: el folio (`account_num`, RN-10) del ticket en curso.
        //   - `cartLength`: líneas del carrito (para el badge BORRADOR).
        numeroCuenta={acciones.ticket?.account_num || null}
        cartLength={carrito.lineas.length}
        tipoVenta={CONFIG.CANAL}
        sesionAbierta={Boolean(sesion)}
        estadoRed={red.estado}
        etiquetaRed={red.etiqueta}
        colorRed={red.color}
        modo={modo}
        onCambiarEstacion={intentarSalir}

        onAbrirVoz={() => setVozAbierta(true)}
        vozDisponible={voz.disponible}
        onAbrirPedido={() => setPedidoAbierto(true)}
        pedidoProgramado={Boolean(bloquePedido)}
        // F12.1 — Selector VENTA DIRECTA / PEDIDO (UX heredada del viejo POS,
        // §6.8). Gobierna la aparición del botón 📌 de programación. Al volver
        // a VENTA_DIRECTA se limpia el bloque de pedido ya capturado.
        tipoPedido={tipoPedido}
        onCambiarTipoPedido={setTipoPedido}
        onLimpiarPedido={() => setBloquePedido(null)}
        onAbrirCliente={() => setClienteAbierto(true)}
        clienteIdentificado={Boolean(cliente)}
        onAbrirCaja={() => setCajaAbierta(true)}
        cajaAbierta={cajaAbierta}
        // F12.5 — Pizarrón de cuentas abiertas (F5.3). Sin este prop, el botón
        // "Pizarrón" del header no se pinta y `OpenAccountsCorkboard` queda
        // inalcanzable (13ª instancia de §10.6). El conteo alimenta el badge.
        onAbrirPizarron={() => setPizarronAbierto(true)}
        cuentasAbiertas={cuentasAbiertas}
        turnoCaja={turnoCaja}
        // P1 — Capa 1: badge de empaque en el header.
        empaqueRequerido={empaqueRequerido}
        empaqueEnCarrito={empaqueEnCarrito}
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
            // F12.4 — Carta/catálogo en PDF (F6.3). Sin este prop, el botón
            // "Exportar carta a PDF" NO se pinta (CategoryBar lo condiciona).
            onExportarPDF={() => setSelectorPDFAbierto(true)}
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
            // DT-02 regla 6: el total viene del BACKEND (`carrito.total`), no se
            // recalcula sumando líneas en el frontend.
            total={carrito.total}
            onIncrementar={incrementar}
            onDecrementar={decrementar}
            onQuitar={quitar}
            onCobrar={abrirCheckoutConGuardia}
            // F12.9 — ENVIAR CUENTA al pizarrón: NO gateado por caja (§6.8).
            // Es el camino válido cuando la terminal no tiene turno de caja.
            onEnviarCuenta={enviarCuentaAlPizarron}
            enviandoCuenta={acciones.enviando}
            cobrando={acciones.enviando}
            terminalId={terminalEfectiva}
            banner={banner}
            // F12.8 — Paridad de operación (§6.8): el cobro solo se habilita con
            // turno de caja abierto. Sin caja, el único camino es enviar al pizarrón.
            cajaHabilitada={Boolean(turnoCaja)}
            // F12.14 — REGLA 13: sin conexión, el botón ENVIAR CUENTA se bloquea.
            // `useNetworkHealth().botonBloqueado` (= `!enLinea`) ya existía pero
            // estaba HUÉRFANO: se expone y nadie lo consumía. Aquí se cablea.
            sinRed={red.botonBloqueado}
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
              // DT-02 regla 6: mismo total del backend que el panel lateral.
              total={carrito.total}
              onIncrementar={incrementar}
              onDecrementar={decrementar}
              onQuitar={quitar}
              onCobrar={() => {
                setTicketAbierto(false);
                abrirCheckoutConGuardia();
              }}
              // F12.9 — ENVIAR CUENTA al pizarrón: NO gateado por caja (§6.8).
              // Mismo camino válido sin caja que el panel lateral.
              onEnviarCuenta={async () => {
                setTicketAbierto(false);
                await enviarCuentaAlPizarron();
              }}
              enviandoCuenta={acciones.enviando}
              cobrando={acciones.enviando}
              terminalId={terminalEfectiva}
              banner={banner}
              // F12.8 — Mismo gate que el panel lateral (paridad de operación).
              cajaHabilitada={Boolean(turnoCaja)}
              // F12.14 — REGLA 13: mismo gate de red que el panel lateral.
              sinRed={red.botonBloqueado}
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
          // P5 — Monto mínimo para pedidos con política parcial.
          // Solo aplica si es un PEDIDO con política < 100%.
          montoMinimo={
            bloquePedido && tipoPedido === 'PEDIDO' && politicaPagoPedido < 100
              ? total * (politicaPagoPedido / 100)
              : undefined
          }
        />
      ) : null}

      {/* F9.0.3 — Aviso fijo de red caída (cicatriz v6.1 $453). Solo estado de
          red: el nuevo POS no tiene cola local, así que no hay conteo. */}
      <OfflineBanner visible={red.bannerVisible} />

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

      {/* Tema (F7.5.1) — reubicado a la landing (TerminalSelector). */}

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
          porcentajePagoMinimo={politicaPagoPedido}
        />
      ) : null}

      {/* F12.4 — Selector de categorías para la carta PDF (F6.3). Se abre desde
          el botón "Exportar carta a PDF" de la CategoryBar. El dueño elige qué
          categorías entran; al confirmar, `exportarCartaPDF` genera y descarga
          el PDF. Esta función es NUEVA del nuevo POS (no existe en el viejo). */}
      {selectorPDFAbierto ? (
        <SelectorCategoriasPDF
          categorias={categorias}
          exportando={exportandoPDF}
          onExportar={exportarCartaPDF}
          onCerrar={() => setSelectorPDFAbierto(false)}
        />
      ) : null}

      {/* F12.5 — Pizarrón de cuentas abiertas (F5.3). Se abre desde el botón
          "Pizarrón" del header. El componente descarga la lista por el contrato
          23 (vía `useOpenAccounts`) y, al recuperar, entrega la versión FRESCA
          de la cuenta (contrato 21) a `recuperarCuentaAlCarrito`. Sin este
          montaje, el pizarrón era inalcanzable (13ª instancia de §10.6). */}
      {pizarronAbierto ? (
        <div
          className="fixed inset-0 z-50 bg-fondo-profundo/80 flex items-start justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Cuentas abiertas"
        >
          <OpenAccountsCorkboard
            terminalId={terminalEfectiva}
            cajaHabilitada={Boolean(turnoCaja)}
            onRecuperar={recuperarCuentaAlCarrito}
            onCerrar={() => {
              setPizarronAbierto(false);
              refrescarConteoCuentas();
            }}
          />
        </div>
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
      {/* P5/Gap2 — Inyectar payment_covered_pct al ticket para que el
          generador de ticket imprima el estado de pago correcto. Se calcula
          como el porcentaje del total que cubren los pagos recibidos. */}
      {entregaAbierta && acciones.ticket ? (() => {
        const t = acciones.ticket;
        const totalTicket = Number(t.total) || 0;
        let pagado = 0;
        if (t.payment_details) {
          const pagos = Array.isArray(t.payment_details.pagos)
            ? t.payment_details.pagos
            : t.payment_details.metodo ? [t.payment_details] : [];
          pagado = pagos.reduce(
            (sum, p) => sum + (Number(p.monto ?? p.recibido) || 0), 0,
          );
        }
        const pctCubierto = totalTicket > 0
          ? Math.min(Math.round((pagado / totalTicket) * 100), 100)
          : 100;
        const ticketConPct = { ...t, payment_covered_pct: pctCubierto };
        return (
          <TicketDeliveryPanel
            ticket={ticketConPct}
            cliente={cliente}
            onOmitir={() => setEntregaAbierta(false)}
            onEnviado={() => setEntregaAbierta(false)}
          />
        );
      })() : null}

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
              usuarioId={usuarioId}
              // F10.5 — paridad de datos: el viejo POS persistía el NOMBRE del
              // cajero (`employee_name`). Se hereda del usuario autenticado.
              usuarioNombre={currentUser?.name || null}
              // FIX "habilitar caja" — paridad con el viejo POS (§6.8). El gestor
              // avisa AL INSTANTE cuando el turno se abre o se cierra, así el
              // botón del header ("● Activa" / "○ Habilitar") y la guarda de
              // cobro reflejan el estado real sin esperar a cerrar el modal.
              onCajaHabilitada={(cashSessionId) => {
                setTurnoCaja({ cash_session_id: cashSessionId });
              }}
              onCajaDeshabilitada={() => {
                setTurnoCaja(null);
              }}
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

      {/* P1 — Capa 2: Modal de advertencia de empaque.
          Se muestra cuando el cajero intenta cobrar un PEDIDO con "Vender Empaque"
          marcado pero sin ningún producto EMPAQUE en el carrito. El cajero puede
          volver a agregar un empaque o continuar sin él. NO bloquea: es una
          advertencia, no una prohibición. */}
      {avisoEmpaque ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          role="alertdialog"
          aria-modal="true"
          aria-label="Sin empaque en la cuenta"
        >
          <div className="bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-6 text-center">
            <div className="text-5xl mb-3" aria-hidden="true">📦</div>
            <h2 className="text-xl font-bold text-peligro mb-2">
              Sin empaque en la cuenta
            </h2>
            <p className="text-sm text-zinc-400 mb-6">
              Marcaste <strong className="text-crema-ticket">"Vender Empaque"</strong> en
              la programación del pedido, pero no hay ningún producto de empaque
              en la cuenta. ¿Quieres agregar uno antes de cobrar?
            </p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setAvisoEmpaque(false)}
                className="min-h-tactil rounded-2xl bg-acento px-5 py-3 font-semibold text-fondo-profundo hover:opacity-90"
              >
                Volver y agregar empaque
              </button>
              <button
                type="button"
                onClick={() => {
                  setAvisoEmpaque(false);
                  setCheckoutAbierto(true);
                }}
                className="min-h-tactil rounded-2xl border border-white/15 px-5 py-3 font-semibold text-zinc-300 hover:bg-white/5"
              >
                Cobrar sin empaque
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
