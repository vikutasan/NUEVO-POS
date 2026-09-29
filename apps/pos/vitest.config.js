import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Configuración de Vitest para el frontend del POS — Fase 3.0.
 *
 * Contexto: los tests existentes (`theme.test.js`, `theme-engine.test.js`) son
 * scripts de Node "a mano" (usan su propio `test()`/`assert()` y `process.exit`),
 * NO son tests de Vitest. El runner raíz (`scripts/test.mjs`) los ejecuta como
 * subprocesos. Vitest es la vía para los tests NUEVOS de componentes React
 * (hooks y UI de las sub-fases 3.3 y 3.4), que sí necesitan jsdom.
 *
 * Por eso `include` apunta solo a `*.test.jsx` / `*.test.tsx` (componentes),
 * dejando los `*.test.js` de Node al runner raíz. Así no hay doble ejecución
 * ni falsos positivos.
 *
 * Referencia: PLAN_DE_ABORDAJE_FASE_3_POR_PARTES.md §4 FASE 3.0.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Solo tests de componentes React (jsdom). Los *.test.js de Node los corre
    // scripts/test.mjs como subprocesos.
    include: ['src/**/*.test.{jsx,tsx}'],
    exclude: ['node_modules', 'dist'],
    // Aún no hay tests de componentes (llegan en 3.3/3.4). Sin esto, Vitest
    // sale con código 1 cuando no encuentra archivos, rompiendo el build antes
    // de que existan. Con `true`, "0 tests" es verde; un test que falle sigue
    // fallando (la prueba negativa se conserva).
    passWithNoTests: true,
  },
});
