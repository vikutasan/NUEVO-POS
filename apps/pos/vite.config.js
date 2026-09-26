import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuración de Vite del POS nuevo — P2.1.
//
// El puerto 5100 es el declarado por el plan de prueba en paralelo. No colisiona
// con el ERP (5000/5001/5433). `strictPort` evita que Vite salte a otro puerto
// en silencio: si 5100 está ocupado, falla en vez de mentir.
//
// El proxy `/api` reenvía al API del POS nuevo. En desarrollo el API corre en el
// contenedor `nuevo_pos_api` (sin puerto publicado), así que el proxy apunta al
// host donde se publica el API para el navegador. Se configura con VITE_API_URL.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5100,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 5100,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
