/**
 * `ticketGenerator` — generador de HTML térmico autosuficiente (FASE 6.0).
 *
 * Porta el patrón del POS viejo (`apps/pos/utils/ticketGenerator.js`, 266 líneas)
 * y lo UNIFICA: tanto el ticket de venta como el corte de caja se generan como
 * strings HTML autosuficientes (con su `<style>` embebido, sin CDN, sin DOM).
 *
 * DECISIÓN ARQUITECTÓNICA (Plan de Fase 6 §4, corrige D-6):
 *   El POS viejo imprimía el ticket con un string HTML pero el corte tomando
 *   `innerHTML` de un componente React + Tailwind por CDN. Esa asimetría es un
 *   DEFECTO (el corte se imprimía sin estilos si no había internet). El POS
 *   nuevo NO copia el defecto: ambos documentos son strings puros.
 *
 * PRINCIPIOS:
 *   - Funciones PURAS: reciben datos, devuelven un string. Testeables sin navegador.
 *   - CERO dependencias externas: ningún `http://` ni `https://` (autosuficiencia).
 *   - CERO DOM: no usan `document` ni `window`.
 *   - Ninguna función supera 20 líneas ni 3 niveles de anidación (E-16).
 *
 * @see PLAN_DE_ABORDAJE_FASE_6_POR_PARTES.md §6 (Sub-fase 6.0)
 * @see apps/pos/utils/ticketGenerator.js (POS viejo — referencia portada)
 */

/** Ancho físico del rollo térmico. Es ancho de PAPEL, no responsivo (exento R-01). */
const ANCHO_TERMICO = '80mm';

/** Formatea un valor como moneda con 2 decimales. Nunca lanza. */
function moneda(valor) {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return '$0.00';
  return `$${numero.toFixed(2)}`;
}

/** Formatea un instante ISO a fecha/hora local legible. Nunca lanza. */
function fechaHora(instante) {
  const fecha = instante ? new Date(instante) : new Date();
  if (Number.isNaN(fecha.getTime())) return '—';
  const dia = fecha.toLocaleDateString('es-MX');
  const hora = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return `${dia} ${hora}`;
}

/**
 * Hoja de estilo embebida compartida por ambos documentos.
 * Autosuficiente: no referencia ninguna CDN ni fuente externa.
 */
function estilosTermicos() {
  return `
    @page { size: ${ANCHO_TERMICO} auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      font-family: 'Courier New', Courier, monospace;
      width: 76mm; padding: 0mm 1mm; font-size: 8pt; line-height: 1.15;
      color: #000; background: #fff; font-weight: bold;
    }
    .line { border-top: 1px dashed #000; margin: 2px 0; }
    .row { display: flex; justify-content: space-between; align-items: center; }
    .col { display: flex; flex-direction: column; }
    .bold { font-weight: bold; }
    .upper { text-transform: uppercase; }
    .center { text-align: center; }
    .small { font-size: 7pt; }
    .xsmall { font-size: 6.5pt; }
    table { width: 100%; border-collapse: collapse; font-size: 8pt; font-weight: bold; }
    td { padding: 1px 0; vertical-align: top; }
    .audit { font-size: 7pt; text-transform: uppercase; margin-top: 3px; padding-top: 2px; border-top: 1px dashed #000; }
  `;
}

/** Envuelve un cuerpo HTML en un documento térmico completo y autosuficiente. */
function documentoTermico(cuerpo) {
  return `<html><head><meta charset="UTF-8"><style>${estilosTermicos()}</style></head><body>${cuerpo}</body></html>`;
}

/** Encabezado común: logo + nombre del negocio. */
function encabezadoNegocio() {
  return `
    <div class="row center" style="justify-content: center; gap: 6px; margin-bottom: 2px;">
      <img src="/assets/logo.png" alt="Logo" style="width: 32px; height: 32px; object-fit: contain; image-rendering: pixelated;" />
      <div class="bold upper" style="font-size: 12pt; letter-spacing: 0.5px;">R DE RICO</div>
    </div>
  `;
}

/** Una línea de producto del ticket (cantidad, nombre, precio unitario, importe). */
function lineaProducto(linea) {
  const nombre = linea.nombre || linea.name || 'Artículo';
  const cantidad = Number(linea.cantidad ?? linea.quantity ?? 1);
  const precio = Number(linea.precio_unitario ?? linea.unit_price ?? linea.price ?? 0);
  return `
    <tr>
      <td style="width: 28px;">${cantidad}x</td>
      <td style="max-width: 44mm;">
        <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${nombre}</div>
        <div>${moneda(precio)} c/u</div>
      </td>
      <td style="text-align: right; white-space: nowrap;">${moneda(precio * cantidad)}</td>
    </tr>
  `;
}

/** Bloque de líneas del ticket, o un aviso si no hay ninguna. */
function bloqueLineas(lineas) {
  if (!lineas || lineas.length === 0) {
    return `<div class="center small" style="margin: 4px 0;">— sin líneas —</div>`;
  }
  const filas = lineas.map(lineaProducto).join('');
  return `<table style="margin: 2px 0;"><tbody>${filas}</tbody></table>`;
}

/** Suma la cantidad total de artículos del ticket. */
function totalArticulos(lineas) {
  if (!lineas || lineas.length === 0) return 0;
  return lineas.reduce((acc, l) => acc + Number(l.cantidad ?? l.quantity ?? 1), 0);
}

/**
 * Genera el HTML térmico de un ticket de venta.
 * @param {Object} ticket - Datos del ticket (account_num, total, lineas, terminal_id, ...).
 * @returns {string} Documento HTML autosuficiente listo para imprimir.
 */
export function generarTicketHTML(ticket = {}) {
  const lineas = ticket.lineas || ticket.items || [];
  const cuenta = ticket.account_num || ticket.folio || '---';
  const terminal = ticket.terminal_id || 'T1';
  const capturo = ticket.captured_by_name || 'SISTEMA';
  const cobro = ticket.cashed_by_name || 'SISTEMA/AUTO';

  const cuerpo = `
    ${encabezadoNegocio()}
    <div class="col bold center" style="margin-bottom: 2px;">
      <div>CTA: ${cuenta}</div>
      <div style="margin-top: 1px;">${fechaHora(ticket.created_at)}</div>
    </div>
    <div class="line"></div>
    ${bloqueLineas(lineas)}
    <div class="line"></div>
    <div class="row bold" style="margin: 2px 0;">
      <span>TOTAL DE ARTICULOS:</span><span>${totalArticulos(lineas)}</span>
    </div>
    <div class="line"></div>
    <div class="row bold" style="font-size: 10pt; margin: 2px 0;">
      <span>TOTAL</span><span>${moneda(ticket.total)}</span>
    </div>
    <div class="audit">
      <div class="row bold"><span>CAPTURÓ:</span><span>${capturo}</span></div>
      <div class="row bold"><span>COBRÓ:</span><span>${cobro}</span></div>
      <div class="row xsmall"><span>Terminal:</span><span>${terminal}</span></div>
    </div>
    <div class="center xsmall" style="margin-top: 4px; padding-top: 2px; border-top: 1px solid #ccc;">
      Cuenta con 3 días a partir de la fecha de compra para realizar cualquier aclaración
    </div>
    <div class="center xsmall" style="margin-top: 2px;">¡¡¡Gracias por su compra, disfrute su pan!!!</div>
  `;
  return documentoTermico(cuerpo);
}

/** Una fila etiqueta/valor del corte. */
function filaCorte(etiqueta, valor) {
  return `<div class="row"><span class="small upper">${etiqueta}</span><span class="bold">${valor}</span></div>`;
}

/** Bloque de movimientos del turno, o un aviso si no hay ninguno. */
function bloqueMovimientos(movimientos) {
  if (!movimientos || movimientos.length === 0) {
    return `<div class="small upper" style="margin: 2px 0;">Sin movimientos.</div>`;
  }
  return movimientos
    .map((m) => {
      const signo = m.tipo === 'ENTRADA' ? '↑' : '↓';
      const motivo = m.motivo || m.concepto || m.tipo || 'Movimiento';
      return filaCorte(`${signo} ${motivo}`, moneda(m.monto));
    })
    .join('');
}

/**
 * Genera el HTML térmico de un corte de caja.
 * NUEVA en el POS nuevo (no existía como string en el POS viejo). Replica la
 * estructura visual de `CorteTicketTemplate.jsx` (F4.4) pero como string puro.
 * @param {Object} corte - Datos del corte (terminalId, cajero, abiertaEn, cerradaEn,
 *   esperado, contado, credito, debito, movimientos).
 * @returns {string} Documento HTML autosuficiente listo para imprimir.
 */
export function generarCorteHTML(corte = {}) {
  const esperado = Number(corte.esperado || 0);
  const contado = Number(corte.contado || 0);
  const descuadre = contado - esperado;
  const cuadra = descuadre === 0;
  const estado = cuadra ? '✓ Caja cuadrada' : descuadre < 0 ? '✗ Faltante' : '✗ Sobrante';

  const cuerpo = `
    ${encabezadoNegocio()}
    <div class="col bold center" style="margin-bottom: 2px;">
      <div class="upper">Corte de Caja</div>
      <div style="margin-top: 1px;">Term ${corte.terminalId || '01'} · ${fechaHora(corte.cerradaEn)}</div>
    </div>
    <div class="line"></div>
    ${filaCorte('Cajero', corte.cajero || '—')}
    ${filaCorte('Apertura', fechaHora(corte.abiertaEn))}
    ${filaCorte('Cierre', fechaHora(corte.cerradaEn))}
    <div class="line"></div>
    <div class="small upper">Arqueo</div>
    ${filaCorte('Esperado', moneda(esperado))}
    ${filaCorte('Contado', moneda(contado))}
    ${filaCorte('Diferencia', moneda(descuadre))}
    <div class="center small upper" style="margin: 2px 0;">${estado}</div>
    <div class="line"></div>
    <div class="small upper">Desglose por método</div>
    ${filaCorte('Efectivo', moneda(contado))}
    ${filaCorte('Crédito', moneda(corte.credito))}
    ${filaCorte('Débito', moneda(corte.debito))}
    <div class="line"></div>
    <div class="small upper">Movimientos</div>
    ${bloqueMovimientos(corte.movimientos)}
    <div class="line"></div>
    <div class="center small" style="margin-top: 6px;">_____________________________</div>
    <div class="center xsmall upper">Firma del cajero</div>
    <div class="center xsmall upper" style="margin-top: 4px;">Documento interno · No es comprobante fiscal</div>
  `;
  return documentoTermico(cuerpo);
}

export default { generarTicketHTML, generarCorteHTML };
