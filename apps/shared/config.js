/**
 * Configuración compartida del POS nuevo — P2.5.
 *
 * `CONFIG.API_BASE_URL` es PROPIO del POS nuevo. NO se reutiliza el del ERP:
 * el POS nuevo tiene su API y su base de datos separadas (regla dura del plan
 * de prueba en paralelo).
 *
 * El valor se resuelve en este orden:
 *   1. `import.meta.env.VITE_API_URL` (inyectado por Vite en build/dev).
 *   2. El valor por defecto de desarrollo: `http://localhost:5101`.
 *
 * El puerto 5101 es el declarado por el plan para el API del POS nuevo. No
 * colisiona con el ERP (5000/5001/5433). El frontend vive en 5100.
 */

const DEFAULT_API_BASE_URL = 'http://localhost:5101';

function resolveApiBaseUrl() {
  // `import.meta.env` solo existe bajo Vite. Se accede con guarda para que el
  // módulo también pueda importarse desde Node (tests) sin romper.
  const fromEnv =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_API_URL
      : undefined;
  return fromEnv && String(fromEnv).length > 0 ? String(fromEnv) : DEFAULT_API_BASE_URL;
}

export const CONFIG = Object.freeze({
  /** URL base del API del POS nuevo (propia, no la del ERP). */
  API_BASE_URL: resolveApiBaseUrl(),
  /** Puerto del frontend del POS nuevo (declarado por el plan). */
  FRONTEND_PORT: 5100,
  /** Puerto del API del POS nuevo (declarado por el plan). */
  API_PORT: 5101,
  /** Terminal por defecto sembrada por `seed_demo.py`. */
  TERMINAL_ID: 'TERM-01',
  /** Canal por defecto (RN-13). */
  CANAL: 'PANADERIA',
  /** Los 3 modos de layout (R-03), con sus rangos en píxeles. */
  MODOS: Object.freeze({
    MOSTRADOR: { min: 1024, max: Infinity },
    COMPACTO: { min: 768, max: 1023 },
    MOVIL: { min: 0, max: 767 },
  }),
});

export default CONFIG;
