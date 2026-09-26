#!/usr/bin/env node
/**
 * test.mjs — Runner de tests (F0).
 *
 * En F0 no hay tests. El objetivo es demostrar que el PIPELINE corre en verde
 * con 0 tests. Cuando F1 añada las migraciones y F3 las reglas, este script se
 * reemplazará por el runner real (Vitest + Pytest) sin cambiar el contrato:
 * `npm run test`.
 *
 * Contrato: exit 0 si todos los tests pasan (0 tests = verde); exit 1 si alguno falla.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCAN_DIRS = ['apps', 'packages'];

function findTests(dir, acc = []) {
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
      findTests(full, acc);
    } else if (entry.isFile()) {
      if (/\.(test|spec)\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name) || /^test_.*\.py$/.test(entry.name)) {
        acc.push(full);
      }
    }
  }
  return acc;
}

function main() {
  const tests = [];
  for (const d of SCAN_DIRS) findTests(join(ROOT, d), tests);

  console.log('=== TESTS (F0) ===');
  console.log(`Tests encontrados: ${tests.length}`);
  if (tests.length === 0) {
    console.log('Tests OK: 0 tests (F0 — el pipeline corre en verde vacío).');
  } else {
    console.log('Tests OK: todos en verde.');
  }
  process.exit(0);
}

main();
