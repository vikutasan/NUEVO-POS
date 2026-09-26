#!/usr/bin/env node
/**
 * guards.mjs — Los greps de estándares (§7.4 del Prompt del Arquitecto + A-04).
 *
 * Un estándar que no se ejecuta es una opinión. Estos greps convierten los
 * estándares en PUERTAS DE MÁQUINA. Se activan en F0, no después.
 *
 * Referencia:
 *   ../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/06-prompt-del-arquitecto/PROMPT_DEL_ARQUITECTO_DEL_NUEVO_POS.md §7.4
 *   ../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_CONSTRUCCION_DEL_NUEVO_POS.md §6.2 (A-04)
 *
 * Greps:
 *   F0 (5): E-05 except...pass · E-15 console.log · E-15 TODO sin "TODO:" ·
 *           E-09 Float en models.py · E-10 DateTime() en models.py
 *   F4 (1): A-04 except...pass acotado a la ruta crítica (guards/)
 *   F5 (1): R-01 ancho fijo (w-[...px]) en el contenedor raíz de la superficie
 *
 * Regla: si un grep encuentra 1+ coincidencia, la puerta FALLA (exit 1).
 * En F0 el repo está vacío de código, así que los 5 greps deben dar 0 coincidencias.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Carpetas que se escanean (la obra). docs/ y scripts/ quedan fuera.
const SCAN_DIRS = ['apps', 'packages'];

// Extensiones de código que se escanean.
const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py']);

/**
 * Recorre un directorio recursivamente y devuelve las rutas de archivos de código.
 */
function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc; // El directorio no existe todavía (F0: esqueleto vacío).
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full, acc);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      const ext = dot >= 0 ? entry.name.slice(dot) : '';
      if (CODE_EXT.has(ext)) acc.push(full);
    }
  }
  return acc;
}

/**
 * Recolecta todos los archivos de código de la obra.
 */
function collectFiles() {
  const files = [];
  for (const d of SCAN_DIRS) {
    walk(join(ROOT, d), files);
  }
  return files;
}

/**
 * Definición de los 5 greps. Cada uno declara:
 *   - id:      el estándar (E-05, E-15, E-09, E-10)
 *   - label:   descripción humana
 *   - test:    (linea, archivo) => boolean
 *   - onlyModels: si solo aplica a models.py (E-09, E-10)
 */
const GREPS = [
  {
    id: 'E-05',
    label: 'Silencios en ruta crítica (except ... pass)',
    onlyModels: false,
    test: (line) => /except[^\n]*:\s*pass\b/.test(line) || /except\s+.*:\s*pass\b/.test(line),
  },
  {
    // A-04 (F4): la ruta crítica (guards/) NO puede silenciar excepciones.
    // Es el mismo patrón que E-05, pero acotado a la ruta crítica para que
    // el estándar quede trazable a la deuda A-04 del Plan §6.2.
    id: 'A-04',
    label: 'Silencios en la ruta crítica de guardianes (guards/ except ... pass)',
    onlyModels: false,
    onlyPath: 'guards/',
    test: (line) => /except[^\n]*:\s*pass\b/.test(line) || /except\s+.*:\s*pass\b/.test(line),
  },
  {
    id: 'E-15',
    label: 'Logs olvidados (console.log)',
    onlyModels: false,
    test: (line) => /console\.log\s*\(/.test(line),
  },
  {
    id: 'E-15',
    label: 'TODOs sin formato declarado (TODO sin "TODO:")',
    onlyModels: false,
    test: (line) => /\bTODO\b/.test(line) && !/\bTODO:/.test(line),
  },
  {
    // R-01 (F5): la superficie NO puede tener anchos absolutos en píxeles.
    // Se prohíbe `w-[<n>px]` pero se permite `max-w-[...]` y `min-w-[...]`
    // (fluidos / tablas con scroll). Acotado a la superficie del POS.
    id: 'R-01',
    label: 'Ancho fijo en la superficie (w-[...px] sin max-/min-)',
    onlyModels: false,
    onlyPath: 'apps/pos/',
    test: (line) => /(?<!max-)(?<!min-)\bw-\[\d+px\]/.test(line),
  },
  {
    id: 'E-09',
    label: 'Dinero en Float (Float en models.py)',
    onlyModels: true,
    test: (line) => /\bFloat\b/.test(line),
  },
  {
    id: 'E-10',
    label: 'Tiempo naive (DateTime() en models.py)',
    onlyModels: true,
    test: (line) => /DateTime\(\s*\)/.test(line),
  },
];

/**
 * Ejecuta un grep sobre los archivos recolectados.
 */
function runGrep(grep, files) {
  const hits = [];
  for (const file of files) {
    if (grep.onlyModels && !file.endsWith('models.py')) continue;
    if (grep.onlyPath && !relative(ROOT, file).replace(/\\/g, '/').includes(grep.onlyPath)) continue;
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (grep.test(lines[i])) {
        hits.push({ file: relative(ROOT, file), line: i + 1, text: lines[i].trim() });
      }
    }
  }
  return hits;
}

function main() {
  const files = collectFiles();
  console.log('=== GUARDIANES DE ESTÁNDARES (F0 + F4/A-04) ===');
  console.log(`Archivos de código escaneados: ${files.length}`);
  console.log('');

  let failed = false;

  for (const grep of GREPS) {
    const hits = runGrep(grep, files);
    const status = hits.length === 0 ? 'OK  ' : 'FAIL';
    console.log(`[${status}] ${grep.id} — ${grep.label} → ${hits.length} coincidencia(s)`);
    if (hits.length > 0) {
      failed = true;
      for (const h of hits.slice(0, 10)) {
        console.log(`         ${h.file}:${h.line}  ${h.text}`);
      }
      if (hits.length > 10) {
        console.log(`         ... y ${hits.length - 10} más`);
      }
    }
  }

  console.log('');
  if (failed) {
    console.error('PUERTA F0 EN ROJO: hay violaciones de estándares.');
    process.exit(1);
  }
  console.log('PUERTA F0 EN VERDE: los greps de estándares están activos y limpios.');
  console.log('PUERTA F4/A-04 EN VERDE: 0 silencios en la ruta crítica (guards/).');
  console.log('PUERTA F5/R-01 EN VERDE: 0 anchos fijos en la superficie (apps/pos/).');
}

main();
