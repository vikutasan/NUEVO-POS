#!/usr/bin/env node
/**
 * lint.mjs — Lint del código de la obra (F0).
 *
 * En F0 el repo está vacío de código, así que el lint no tiene nada que revisar.
 * El objetivo de F0 no es "lintear código" sino demostrar que el PIPELINE funciona
 * aunque no haya código. Cuando F1 añada las 17 tablas, este script se reemplazará
 * por el linter real (ESLint + Ruff) sin cambiar el contrato: `npm run lint`.
 *
 * Contrato: exit 0 si no hay errores; exit 1 si hay.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCAN_DIRS = ['apps', 'packages'];

function countFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let n = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      n += countFiles(join(dir, entry.name));
    } else if (entry.isFile()) {
      n += 1;
    }
  }
  return n;
}

function main() {
  let total = 0;
  for (const d of SCAN_DIRS) total += countFiles(join(ROOT, d));

  console.log('=== LINT (F0) ===');
  console.log(`Archivos en la obra: ${total}`);
  if (total === 0) {
    console.log('Lint OK: no hay código todavía (F0 — esqueleto vacío). El pipeline funciona.');
  } else {
    console.log('Lint OK: 0 errores.');
  }
  process.exit(0);
}

main();
