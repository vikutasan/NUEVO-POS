#!/usr/bin/env node
/**
 * guards-coverage.mjs — Meta-guard de cobertura de guards (R1).
 *
 * PROBLEMA QUE CIERRA:
 *   `guards.mjs` declara N greps, pero nada garantizaba que TODOS corrieran en
 *   CI. Un guard que existe pero no corre es una opinión, no una puerta. El caso
 *   real: el grep R-01 existía desde F5, pero el código que violaba la regla se
 *   escribió en F12.21 y nadie volvió a correr el guard → CI verde con una
 *   violación viva durante semanas.
 *
 * QUÉ VERIFICA (3 invariantes):
 *   1. `npm run guards` está cableado en `.github/workflows/ci.yml`.
 *   2. El número de greps declarado en el encabezado de `guards.mjs` coincide
 *      con el número real de entradas del array `GREPS` (detecta deriva de doc).
 *   3. Cada `id` de grep es único y no vacío (detecta copia-pega accidental).
 *
 * Contrato (invariante, no cambia):
 *   exit 0 → la cobertura de guards está completa y consistente
 *   exit 1 → hay un guard declarado que no corre en CI, o la doc derivó
 *
 * Referencia: PLAN_DE_CIERRE_DE_RIESGOS_ESTRUCTURALES.md §Riesgo 1.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GREPS } from './guards.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CI_YML = join(ROOT, '.github', 'workflows', 'ci.yml');
const GUARDS_MJS = join(ROOT, 'scripts', 'guards.mjs');

let fallos = 0;

function ok(msg) {
  console.log(`  [OK  ] ${msg}`);
}
function fail(msg) {
  console.log(`  [FAIL] ${msg}`);
  fallos++;
}

console.log('=== META-GUARD DE COBERTURA DE GUARDS (R1) ===\n');

// ── Invariante 1: `npm run guards` cableado en CI ─────────────────────────────
console.log('── Invariante 1: `npm run guards` corre en CI ──');
let ci = '';
try {
  ci = readFileSync(CI_YML, 'utf8');
} catch {
  fail(`no se pudo leer ${CI_YML}`);
}
if (ci) {
  if (/npm run guards\b/.test(ci)) {
    ok('`npm run guards` está cableado en ci.yml');
  } else {
    fail('`npm run guards` NO está cableado en ci.yml (los greps no corren en CI)');
  }
}

// ── Invariante 2: el conteo del encabezado coincide con GREPS.length ──────────
console.log('\n── Invariante 2: el encabezado de guards.mjs no derivó ──');
let guardsSrc = '';
try {
  guardsSrc = readFileSync(GUARDS_MJS, 'utf8');
} catch {
  fail(`no se pudo leer ${GUARDS_MJS}`);
}
if (guardsSrc) {
  // El encabezado declara: "Greps (N en total):"
  const m = guardsSrc.match(/Greps\s*\((\d+)\s+en total\)/);
  if (!m) {
    fail('el encabezado de guards.mjs no declara "Greps (N en total)"');
  } else {
    const declarado = Number(m[1]);
    const real = GREPS.length;
    if (declarado === real) {
      ok(`el encabezado declara ${declarado} greps y el array tiene ${real}`);
    } else {
      fail(`el encabezado declara ${declarado} greps pero el array tiene ${real} (doc derivó)`);
    }
  }
}

// ── Invariante 3: ids únicos y no vacíos ──────────────────────────────────────
console.log('\n── Invariante 3: ids de grep únicos y no vacíos ──');
const vistos = new Map();
for (const g of GREPS) {
  if (!g.id || typeof g.id !== 'string') {
    fail('hay un grep sin `id`');
    continue;
  }
  if (vistos.has(g.id)) {
    // E-15 aparece 2 veces legítimamente (console.log y TODO). Se permite
    // duplicar SOLO si la etiqueta difiere (son dos reglas distintas).
    const prev = vistos.get(g.id);
    if (prev === g.label) {
      fail(`el id "${g.id}" está duplicado con la MISMA etiqueta (copia-pega)`);
    } else {
      ok(`el id "${g.id}" se repite con etiqueta distinta (legítimo)`);
    }
  } else {
    vistos.set(g.id, g.label);
  }
}
if (vistos.size > 0) {
  ok(`${GREPS.length} grep(s) declarados, ${vistos.size} id(s) distinto(s)`);
}

// ── Veredicto ─────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(56));
if (fallos === 0) {
  console.log('  ✅ COBERTURA DE GUARDS EN VERDE: todos los greps corren en CI.');
  console.log('═'.repeat(56) + '\n');
  process.exit(0);
} else {
  console.log(`  ❌ COBERTURA DE GUARDS EN ROJO: ${fallos} problema(s).`);
  console.log('═'.repeat(56) + '\n');
  process.exit(1);
}
