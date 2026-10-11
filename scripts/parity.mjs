#!/usr/bin/env node
/**
 * parity.mjs — Guard de PARIDAD DE OPERACIÓN (cierra la Deuda 2, §10.6).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA QUE RESUELVE
 * ────────────────────────────────────────────────────────────────────────────
 * El §10.6 describe el patrón "de adentro hacia afuera": un componente existe y
 * pasa su compuerta, pero su OPERACIÓN se perdió en la traducción desde el POS
 * viejo. El inventario de componentes (AUDITORIA_POS_VIEJO_VS_NUEVO.md) ve los
 * ARCHIVOS, no la OPERACIÓN. Nada comparaba el comportamiento viejo vs nuevo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * ────────────────────────────────────────────────────────────────────────────
 * Lee el bloque de tabla de `MANIFIESTO_DE_PARIDAD.md` (entre los marcadores
 * `<!-- PARITY-TABLE-START -->` y `<!-- PARITY-TABLE-END -->`). Cada fila con
 * estado `portada` DEBE tener una `Compuerta` no vacía que EXISTA en disco
 * (bajo `apps/pos/src/`). Si una operación se declara portada pero su compuerta
 * no existe, la puerta FALLA.
 *
 * Las filas `pendiente` NO se verifican: son deuda declarada, no oculta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CONTRATO
 * ────────────────────────────────────────────────────────────────────────────
 *   exit 0 → toda operación `portada` tiene su compuerta en disco.
 *   exit 1 → alguna operación `portada` apunta a una compuerta inexistente,
 *            o el manifiesto no se pudo leer.
 *
 * Referencia: cierre de las 3 deudas estructurales (11 Oct 2026).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// El manifiesto vive en el repo hermano PLANOS.
const MANIFIESTO = join(
  ROOT,
  '..',
  'PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS',
  'MANIFIESTO_DE_PARIDAD.md',
);

// Las compuertas se resuelven relativas a la raíz del código del POS.
const SRC_POS = join(ROOT, 'apps', 'pos', 'src');

const MARCA_INICIO = '<!-- PARITY-TABLE-START -->';
const MARCA_FIN = '<!-- PARITY-TABLE-END -->';

/**
 * Limpia una celda de tabla markdown: quita backticks, negritas y espacios.
 * Las celdas del manifiesto envuelven rutas en backticks (p. ej.
 * `` `hooks/useCart.f12_23b.test.jsx` ``), que NO son parte de la ruta.
 */
function limpiarCelda(valor) {
  return valor
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .trim();
}

/**
 * Extrae las filas de la tabla de paridad del manifiesto.
 * Devuelve un array de objetos { operacion, viejo, nuevo, compuerta, estado }.
 */
function leerFilas() {
  if (!existsSync(MANIFIESTO)) {
    throw new Error(`No se encontró el manifiesto: ${MANIFIESTO}`);
  }
  const contenido = readFileSync(MANIFIESTO, 'utf8');
  const inicio = contenido.indexOf(MARCA_INICIO);
  const fin = contenido.indexOf(MARCA_FIN);
  if (inicio < 0 || fin < 0 || fin < inicio) {
    throw new Error('El manifiesto no tiene los marcadores PARITY-TABLE-START/END.');
  }
  const bloque = contenido.slice(inicio + MARCA_INICIO.length, fin);

  const filas = [];
  for (const linea of bloque.split('\n')) {
    const t = linea.trim();
    // Solo filas de tabla con al menos 5 columnas.
    if (!t.startsWith('|')) continue;
    // Descartar el encabezado y el separador (---).
    if (/^\|\s*Operación\s*\|/i.test(t)) continue;
    if (/^\|[\s\-:|]+\|$/.test(t)) continue;

    const celdas = t
      .split('|')
      .slice(1, -1)
      .map(limpiarCelda);
    if (celdas.length < 5) continue;

    filas.push({
      operacion: celdas[0],
      viejo: celdas[1],
      nuevo: celdas[2],
      compuerta: celdas[3],
      estado: celdas[4].toLowerCase(),
    });
  }
  return filas;
}

function main() {
  console.log('=== GUARD DE PARIDAD DE OPERACIÓN (§10.6) ===');
  console.log(`Manifiesto: ${MANIFIESTO}`);
  console.log('');

  let filas;
  try {
    filas = leerFilas();
  } catch (err) {
    console.error(`[FAIL] ${err.message}`);
    process.exit(1);
  }

  const portadas = filas.filter((f) => f.estado === 'portada');
  const pendientes = filas.filter((f) => f.estado === 'pendiente');

  console.log(`Operaciones declaradas: ${filas.length}`);
  console.log(`  · portadas:   ${portadas.length}`);
  console.log(`  · pendientes: ${pendientes.length}`);
  console.log('');

  let fallo = false;

  for (const fila of portadas) {
    if (!fila.compuerta) {
      console.log(`[FAIL] "${fila.operacion}" está portada pero NO declara compuerta.`);
      fallo = true;
      continue;
    }
    const ruta = join(SRC_POS, fila.compuerta);
    if (!existsSync(ruta)) {
      console.log(`[FAIL] "${fila.operacion}" → compuerta inexistente: ${fila.compuerta}`);
      fallo = true;
    } else {
      console.log(`[OK  ] "${fila.operacion}" → ${fila.compuerta}`);
    }
  }

  console.log('');
  if (fallo) {
    console.error('PARIDAD EN ROJO: hay operaciones portadas sin compuerta válida.');
    process.exit(1);
  }
  console.log(
    `PARIDAD EN VERDE: las ${portadas.length} operaciones portadas tienen su compuerta en disco.`,
  );
  if (pendientes.length > 0) {
    console.log(`(Deuda declarada: ${pendientes.length} operaciones pendientes de portar.)`);
  }
}

main();
