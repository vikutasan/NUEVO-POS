/**
 * Tailwind del POS nuevo — P2.1 / P2.6.
 *
 * La paleta canónica viene de `PALETA_CANONICA` en
 * `apps/api/superficie/registry.py` (Documento 7 §2.1). Aquí se materializa como
 * tokens de Tailwind para que las interfaces la usen por nombre y no por hex
 * suelto. Los radios canónicos (Documento 7 §2.3) también se declaran.
 *
 * Los 3 modos (R-03) son explícitos: MÓVIL es la base, `md:` es COMPACTO
 * (768–1023px) y `lg:` es MOSTRADOR (≥1024px). No se inventan breakpoints.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta canónica (PALETA_CANONICA).
        acento: '#c1d72e',
        'fondo-profundo': '#0a0a0a',
        'fondo-profundo-alt': '#080808',
        'fondo-panel': '#1a1a1a',
        'crema-ticket': '#fdfbf7',
        peligro: '#ef4444',
      },
      borderRadius: {
        // Radios canónicos (RADIOS_CANONICOS).
        canon35: '35px',
        canon40: '40px',
        canon50: '50px',
      },
      fontFamily: {
        // Tipografía que escala (R-02): se usan tamaños relativos, no px fijos.
        pos: ['Inter', 'system-ui', 'sans-serif'],
        ticket: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      minHeight: {
        // R-04: target táctil mínimo de 44×44px.
        tactil: '44px',
      },
      minWidth: {
        tactil: '44px',
      },
    },
  },
  plugins: [],
};
