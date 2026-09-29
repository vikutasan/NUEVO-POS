#!/usr/bin/env node
/**
 * test.mjs — Runner de tests REAL (Fase 3.0).
 *
 * Reemplaza el stub de F0. El stub solo CONTABA archivos y siempre hacía
 * `exit 0`; este runner los EJECUTA y falla si alguno falla.
 *
 * Contrato (invariante, no cambia): `npm run test`
 *   exit 0  → todos los tests pasaron
 *   exit 1  → al menos un test falló (o el runner no pudo ejecutarse)
 *
 * Qué ejecuta:
 *   1. Tests de Node (frontend + packages): cada `*.test.js` / `*.test.mjs` /
 *      `*.test.cjs` se corre como subproceso `node <archivo>`. El archivo debe
 *      hacer `process.exit(1)` si falla (los tests existentes ya lo hacen).
 *      Los `*.test.jsx` NO se ejecutan aquí: Node no entiende JSX. Esos van
 *      al bloque de Vitest (punto 2).
 *   2. Tests de componentes React (Vitest): `npm run test` dentro de
 *      `apps/pos` si existe al menos un `*.test.jsx`.
 *   3. Tests de la API (Python): `docker compose exec -T api pytest` si el
 *      contenedor está arriba. Si Docker no está disponible, se reporta como
 *      OMITIDO (no como verde) para no mentir sobre la cobertura.
 *
 * Prueba negativa: si un test falla, este runner DEBE salir con código 1.
 * Un runner que siempre pasa es exactamente el defecto que se corrige aquí.
 *
 * Referencia: PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md §4 FASE 3.0.
 */

import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCAN_DIRS = ['apps', 'packages'];

// Extensiones de test de Node que este runner ejecuta como subproceso.
// OJO: `.jsx` NO entra aquí — Node no entiende JSX. Esos los corre Vitest.
const NODE_TEST_RE = /\.(test|spec)\.(js|mjs|cjs)$/;

/**
 * Recorre un directorio recursivamente y devuelve las rutas de tests de Node.
 */
function findNodeTests(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc; // El directorio no existe todavía.
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      findNodeTests(full, acc);
    } else if (entry.isFile() && NODE_TEST_RE.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Ejecuta un test de Node como subproceso y devuelve { ok, salida }.
 */
function runNodeTest(archivo) {
  const rel = relative(ROOT, archivo).replace(/\\/g, '/');
  const res = spawnSync(process.execPath, [archivo], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const salida = `${res.stdout || ''}${res.stderr || ''}`.trim();
  return { ok: res.status === 0, rel, salida, status: res.status };
}

/**
 * Detecta si el contenedor de la API está arriba.
 */
function apiContainerUp() {
  const res = spawnSync('docker', ['compose', 'ps', '-q', 'api'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return res.status === 0 && (res.stdout || '').trim().length > 0;
}

/**
 * Ejecuta los tests de la API dentro del contenedor.
 */
function runApiTests() {
  const res = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'api', 'pytest', '-q'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  const salida = `${res.stdout || ''}${res.stderr || ''}`.trim();
  return { ok: res.status === 0, salida, status: res.status };
}

// Tests de componentes React (jsdom) que corre Vitest, no el subproceso Node.
const VITEST_TEST_RE = /\.(test|spec)\.(jsx|tsx)$/;

/**
 * Detecta si hay tests de componentes React en apps/pos.
 */
function hayTestsDeComponentes() {
  const dir = join(ROOT, 'apps', 'pos', 'src');
  const encontrados = [];
  (function walk(d) {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        walk(full);
      } else if (e.isFile() && VITEST_TEST_RE.test(e.name)) {
        encontrados.push(full);
      }
    }
  })(dir);
  return encontrados.length > 0;
}

/**
 * Ejecuta Vitest (tests de componentes React) en apps/pos.
 * Solo se invoca si hay tests de componentes; si no, se OMITE.
 */
function runVitest() {
  const res = spawnSync('npm', ['run', 'test'], {
    cwd: join(ROOT, 'apps', 'pos'),
    encoding: 'utf8',
    shell: true,
  });
  const salida = `${res.stdout || ''}${res.stderr || ''}`.trim();
  return { ok: res.status === 0, salida, status: res.status };
}

function main() {
  const tests = [];
  for (const d of SCAN_DIRS) findNodeTests(join(ROOT, d), tests);

  console.log('=== TESTS (Fase 3.0 — runner real) ===\n');

  // ── 1. Tests de Node ────────────────────────────────────────────────────────
  console.log(`── Tests de Node (${tests.length} archivo(s)) ──\n`);

  let fallidos = 0;
  let nodeFallidos = 0;
  for (const t of tests) {
    const r = runNodeTest(t);
    if (r.ok) {
      console.log(`  ✅ ${r.rel}`);
    } else {
      fallidos++;
      nodeFallidos++;
      console.log(`  ❌ ${r.rel}  (exit ${r.status})`);
      if (r.salida) {
        console.log(
          r.salida
            .split('\n')
            .map((l) => `       ${l}`)
            .join('\n')
        );
      }
    }
  }

  // ── 2. Tests de componentes React (Vitest, jsdom) ───────────────────────────
  console.log('\n── Tests de componentes React (Vitest) ──\n');

  let vitestEstado;
  if (!hayTestsDeComponentes()) {
    vitestEstado = 'OMITIDO (sin tests .jsx aún)';
    console.log(
      '  ⚠️  OMITIDO — no hay tests de componentes (*.test.jsx) todavía.\n' +
        '       Llegan en las sub-fases 3.3 (hooks) y 3.4 (UI).'
    );
  } else {
    const r = runVitest();
    if (r.ok) {
      vitestEstado = 'PASA';
      console.log('  ✅ vitest — todos los tests de componentes pasaron.');
    } else {
      vitestEstado = 'FALLA';
      fallidos++;
      console.log(`  ❌ vitest falló (exit ${r.status}).`);
      if (r.salida) {
        console.log(
          r.salida
            .split('\n')
            .slice(-20)
            .map((l) => `       ${l}`)
            .join('\n')
        );
      }
    }
  }

  // ── 3. Tests de la API (Python, en Docker) ──────────────────────────────────
  console.log('\n── Tests de la API (pytest en Docker) ──\n');

  let apiEstado;
  if (!apiContainerUp()) {
    apiEstado = 'OMITIDO';
    console.log(
      '  ⚠️  OMITIDO — el contenedor `api` no está arriba.\n' +
        '       Levantarlo con: docker compose up -d\n' +
        '       (OMITIDO ≠ verde: la cobertura de la API no se verificó.)'
    );
  } else {
    const r = runApiTests();
    if (r.ok) {
      apiEstado = 'PASA';
      console.log('  ✅ pytest — todos los tests de la API pasaron.');
      if (r.salida) {
        console.log(
          r.salida
            .split('\n')
            .slice(-3)
            .map((l) => `       ${l}`)
            .join('\n')
        );
      }
    } else {
      apiEstado = 'FALLA';
      fallidos++;
      console.log(`  ❌ pytest falló (exit ${r.status}).`);
      if (r.salida) {
        console.log(
          r.salida
            .split('\n')
            .slice(-20)
            .map((l) => `       ${l}`)
            .join('\n')
        );
      }
    }
  }

  // ── 3. Veredicto ────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(56));
  console.log(`  Tests de Node      : ${tests.length - nodeFallidos}/${tests.length} archivo(s) en verde`);
  console.log(`  Tests de componentes: ${vitestEstado}`);
  console.log(`  Tests de API       : ${apiEstado}`);
  if (fallidos === 0) {
    console.log('  ✅ RESULTADO: TODOS LOS TESTS EN VERDE.');
    console.log('═'.repeat(56) + '\n');
    process.exit(0);
  } else {
    console.log(`  ❌ RESULTADO: ${fallidos} test(s) fallaron.`);
    console.log('═'.repeat(56) + '\n');
    process.exit(1);
  }
}

main();
