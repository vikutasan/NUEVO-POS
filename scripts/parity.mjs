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
 * ANCLA BIDIRECCIONAL (R2 — cierra el riesgo "compuerta que verifica la compuerta")
 * ────────────────────────────────────────────────────────────────────────────
 * Que el archivo de compuerta EXISTA no basta: podría existir y probar OTRA
 * cosa (verde falso). Para cerrar ese hueco, la relación manifiesto ↔ test es
 * BIDIRECCIONAL y verificable:
 *
 *   1. Cada test de compuerta declara en su encabezado:
 *        // @paridad: <ruta relativa a apps/pos/src/>
 *        // @operacion: <texto de la operación>
 *   2. El manifiesto apunta a ese test en su columna `Compuerta`.
 *
 * El guard verifica AMBAS direcciones:
 *   - Manifiesto → test: la compuerta existe Y declara `@paridad:` con la MISMA
 *     ruta que el manifiesto le asigna.
 *   - Test → manifiesto: todo test con `@paridad:` aparece en el manifiesto.
 *
 * Si un test se renombra o se reasigna sin actualizar el manifiesto (o al
 * revés), la puerta FALLA. La disciplina humana deja de ser el eslabón débil.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CONTRATO
 * ────────────────────────────────────────────────────────────────────────────
 *   exit 0 → toda operación `portada` tiene su compuerta en disco Y el ancla
 *            bidireccional manifiesto ↔ test es consistente.
 *   exit 1 → alguna operación `portada` apunta a una compuerta inexistente,
 *            el ancla bidireccional está rota, o el manifiesto no se pudo leer.
 *
 * Referencia: cierre de las 3 deudas estructurales (11 Oct 2026) +
 *             PLAN_DE_CIERRE_DE_RIESGOS_ESTRUCTURALES.md §Riesgo 2.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
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

// Marcadores del ancla bidireccional que cada test de compuerta declara.
const RE_PARIDAD = /@paridad:\s*(\S+)/;
const RE_OPERACION = /@operacion:\s*(.+)/;

/**
 * Recorre `apps/pos/src/` y devuelve todos los archivos de test.
 */
function walkTests(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walkTests(full, acc);
    } else if (entry.isFile() && /\.(test|spec)\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Lee el ancla `@paridad:` / `@operacion:` de un archivo de test.
 * Devuelve { paridad, operacion } o null si el test no declara ancla.
 */
function leerAncla(rutaAbsoluta) {
  let contenido;
  try {
    contenido = readFileSync(rutaAbsoluta, 'utf8');
  } catch {
    return null;
  }
  const mParidad = contenido.match(RE_PARIDAD);
  if (!mParidad) return null;
  const mOperacion = contenido.match(RE_OPERACION);
  return {
    paridad: mParidad[1].trim(),
    operacion: mOperacion ? mOperacion[1].trim() : null,
  };
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

  // ── Dirección 1: manifiesto → test ────────────────────────────────────────
  // Cada operación `portada` debe apuntar a una compuerta que EXISTA y que
  // declare `@paridad:` con la MISMA ruta que el manifiesto le asigna.
  console.log('--- Dirección 1: manifiesto → test ---');
  const rutasDeclaradas = new Set();
  for (const fila of portadas) {
    if (!fila.compuerta) {
      console.log(`[FAIL] "${fila.operacion}" está portada pero NO declara compuerta.`);
      fallo = true;
      continue;
    }
    rutasDeclaradas.add(fila.compuerta);
    const ruta = join(SRC_POS, fila.compuerta);
    if (!existsSync(ruta)) {
      console.log(`[FAIL] "${fila.operacion}" → compuerta inexistente: ${fila.compuerta}`);
      fallo = true;
      continue;
    }
    const ancla = leerAncla(ruta);
    if (!ancla) {
      console.log(
        `[FAIL] "${fila.operacion}" → ${fila.compuerta} NO declara ancla (@paridad:).`,
      );
      fallo = true;
      continue;
    }
    if (ancla.paridad !== fila.compuerta) {
      console.log(
        `[FAIL] "${fila.operacion}" → el manifiesto apunta a ${fila.compuerta} ` +
          `pero el test declara @paridad: ${ancla.paridad}`,
      );
      fallo = true;
      continue;
    }
    console.log(`[OK  ] "${fila.operacion}" → ${fila.compuerta}`);
  }

  // ── Dirección 2: test → manifiesto ────────────────────────────────────────
  // Todo test que declare `@paridad:` DEBE aparecer en el manifiesto. Si un
  // test se renombra o se reasigna sin actualizar el manifiesto, la puerta
  // FALLA (cierra el verde falso del eslabón humano).
  console.log('');
  console.log('--- Dirección 2: test → manifiesto ---');
  const testsConAncla = [];
  for (const rutaAbs of walkTests(SRC_POS)) {
    const ancla = leerAncla(rutaAbs);
    if (!ancla) continue;
    const rel = relative(SRC_POS, rutaAbs).split('\\').join('/');
    testsConAncla.push({ rel, operacion: ancla.operacion });
    if (!rutasDeclaradas.has(rel)) {
      console.log(
        `[FAIL] ${rel} declara @paridad: ${ancla.paridad} pero NO aparece en el manifiesto.`,
      );
      fallo = true;
    } else {
      console.log(`[OK  ] ${rel} ↔ manifiesto`);
    }
  }

  if (testsConAncla.length === 0) {
    console.log(
      '[FAIL] Ningún test declara ancla (@paridad:). El ancla bidireccional no está cableada.',
    );
    fallo = true;
  }

  console.log('');
  if (fallo) {
    console.error('PARIDAD EN ROJO: el ancla bidireccional manifiesto ↔ test está rota.');
    process.exit(1);
  }
  console.log(
    `PARIDAD EN VERDE: ${portadas.length} operaciones portadas con compuerta en disco ` +
      `y ancla bidireccional consistente (${testsConAncla.length} tests anclados).`,
  );
  if (pendientes.length > 0) {
    console.log(`(Deuda declarada: ${pendientes.length} operaciones pendientes de portar.)`);
  }
}

main();
