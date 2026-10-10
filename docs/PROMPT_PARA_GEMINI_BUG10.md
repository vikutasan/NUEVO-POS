# PROMPT PARA GEMINI — BUG-10 (pizarrón de cuentas abiertas)

> Copia y pega TODO el bloque de la sección "PROMPT" en Gemini.
> Las rutas de la sección "RUTAS" son para que tú (o Gemini) sepan dónde está cada cosa.

---

## PROMPT (copiar desde aquí)

```
CONTEXTO
Eres un ingeniero senior de frontend. Trabajas sobre el POS NUEVO de la panadería "R de Rico",
que debe alcanzar paridad funcional y de UX con el POS VIEJO (que sí funciona). El POS nuevo
vive en el repo `../NUEVO-POS` (React 18 + Vite 5 + Tailwind 3, tests con Vitest + jsdom).
El POS viejo vive en el repo `ERP-R-DE-RICO` (workspace actual) y es la REFERENCIA de cómo
debe verse/comportarse.

TAREA
Resolver el BUG-10: en el PIZARRÓN DE CUENTAS ABIERTAS (corkboard), cuando hay MUCHAS cuentas:
  1. NO aparece la barra de desplazamiento lateral (el usuario la quiere, como en el POS viejo).
  2. El total del post-it ("la cantidad") sale "MORDIDO" (recortado/cortado en la parte inferior).

Ya hubo CUATRO intentos de corrección (BUG-10, 10b, 10c, 10d) y NINGUNO resolvió el síntoma.
Tu trabajo es encontrar la CAUSA RAÍZ real y corregirla, NO hacer un quinto parche a ciegas.

LEE PRIMERO (obligatorio, en este orden)
  1. `../NUEVO-POS/docs/HANDOFF_BUG10_PIZARRON.md`  ← EXPEDIENTE COMPLETO. Léelo entero.
     Contiene: síntoma textual, los 4 intentos fallidos, estado del código, referencia del POS
     viejo, hechos verificados, 5 hipótesis vivas ordenadas por probabilidad, cómo reproducir,
     y el hueco de la compuerta de tests.
  2. `../NUEVO-POS/apps/pos/src/components/OpenAccountsCorkboard.jsx`  ← AQUÍ está el bug.
  3. `../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx` (líneas ~1358-1377)  ← el modal padre.
  4. `../NUEVO-POS/apps/pos/src/index.css` (líneas 61-84)  ← regla global `[role='button']` y
     estilos de scrollbar.
  5. `../NUEVO-POS/apps/pos/OpenAccountsCorkboard.jsx`  ← POS VIEJO de referencia (SÍ funciona).
  6. `../NUEVO-POS/apps/pos/src/components/OpenAccountsCorkboard.f5_3.test.jsx`  ← compuerta
     actual (criterios 8, 9, 10).

DATO ANÓMALO CLAVE (el más importante)
El dev server de Vite (puerto 5100) SÍ sirve el código nuevo —verificado con `curl`— pero el
navegador del usuario NO lo ejecuta: se agregó un `console.log` de diagnóstico y NO apareció en
la consola, ni con Ctrl+Shift+R. Esto apunta a una capa de caché (Service Worker o pestaña
antigua) que hay que descartar ANTES de tocar el layout. Ver hipótesis H1 del expediente.

QUÉ SE TE PIDE
  1. Determinar por qué el navegador del usuario no ejecuta el código servido (H1). Sugerencia:
     abrir ventana de incógnito, revisar DevTools → Application → Service Workers → Unregister,
     y Network para confirmar que `OpenAccountsCorkboard.jsx` se descarga con el código nuevo.
  2. Reproducir el LAYOUT REAL con un navegador headless (Playwright o Puppeteer) y MEDIR:
     - `clientHeight` vs `scrollHeight` del tablero y del wrapper de scroll.
     - `getBoundingClientRect()` del post-it y de su total (para ver si el total se sale).
     - `getComputedStyle()` de `height`, `max-height`, `min-height`, `overflow` en cada nivel.
  3. Corregir la CAUSA RAÍZ (probablemente H2 —el modal padre captura el scroll— y/o H3 —el
     post-it se desborda por contenido—). Compara con el POS viejo: tablero `aspect-[16/9]`
     (altura definida) + el GRID mismo lleva `flex-1 overflow-y-auto custom-scrollbar`; el modal
     viejo NO tiene `overflow-y-auto` y usa `items-center`.
  4. AGREGAR UNA COMPUERTA QUE VERIFIQUE EL LAYOUT RENDERIZADO, no solo las clases en el JSX.
     Ese es el hueco actual: los tests pasan aunque el síntoma persista. Usa jsdom + medición
     (o un test de layout con Playwright si el entorno lo permite).
  5. Documentar en `../NUEVO-POS/docs/LECCIONES_DE_UI.md` §8 (quinta vuelta) y en
     `../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/DECISIONES_ARQUITECTONICAS_DEL_NUEVO_POS.md` §7
     (fila BUG-10e).

RESTRICCIONES DEL ENTORNO (respétalas)
  - Docker: el servicio `api` monta SOLO `./apps/api:/app`. Un pytest NO puede leer el frontend.
    Las compuertas del frontend DEBEN ser Vitest.
  - Vitest: corre desde `../NUEVO-POS/apps/pos`, `environment: 'jsdom'`, include
    `src/**/*.test.{jsx,tsx}`. Comando: `npx vitest run`.
  - Backend tests (si los tocas): desde `../NUEVO-POS`,
    `docker compose run --rm --entrypoint sh api -c "pip install --quiet --no-cache-dir -r requirements.txt && pytest -q"`.
  - Conteos actuales: backend 378 passing; frontend 837 passing (79 archivos). NO los rompas.
  - Dos repos: `../NUEVO-POS` (código) y `../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS` (docs).
  - Deudas que NO se tocan: (a) naming BUG-02/03; (c) `_es_admin()`.
  - Dev server: Vite en el puerto 5100 (`strictPort`, `host: true`), comando `npm run dev`
    desde `../NUEVO-POS/apps/pos`.
  - Vite reporta en cada HMR: `Could not Fast Refresh ("colorDe" export is incompatible)`.
    El módulo exporta `colorDe` (función no-componente) junto con el default, lo que impide Fast
    Refresh. Tenlo en cuenta al depurar.

ENTREGABLE
  - Causa raíz identificada y explicada.
  - Corrección aplicada en `OpenAccountsCorkboard.jsx` (y/o el modal en `RetailVisionPOS.jsx`).
  - Compuerta nueva que valide el layout renderizado (y que falle con el código actual).
  - Tests verdes (frontend 837+ y backend 378).
  - Docs actualizadas (LECCIONES §8 quinta vuelta + ADR §7 fila BUG-10e).
  - Commits en ambos repos, pusheados.
```

## (copiar hasta aquí)

---

## RUTAS — dónde está todo lo que debe revisar

### Repo de CÓDIGO: `../NUEVO-POS`

| Ruta | Qué es | Por qué importa |
|---|---|---|
| `../NUEVO-POS/docs/HANDOFF_BUG10_PIZARRON.md` | **Expediente completo del bug** (294 líneas) | Punto de entrada. Síntoma, 4 intentos, hechos, 5 hipótesis, cómo reproducir |
| `../NUEVO-POS/apps/pos/src/components/OpenAccountsCorkboard.jsx` | **El pizarrón (451 líneas)** | AQUÍ está el bug. Tablero `h-[85vh]`, wrapper de scroll `min-h-0 flex-1`, post-it `aspect-square` |
| `../NUEVO-POS/apps/pos/src/RetailVisionPOS.jsx` (1358-1377) | **El modal que monta el pizarrón** | `fixed inset-0 ... flex items-start justify-center p-4 overflow-y-auto` — sospechoso H2 |
| `../NUEVO-POS/apps/pos/src/index.css` (61-84) | Regla global `[role='button'] { min-height:44px }` + scrollbar global | Sospechoso H4 |
| `../NUEVO-POS/apps/pos/tailwind.config.js` | Config de Tailwind | `content: ['./index.html', './src/**/*.{js,jsx}']` |
| `../NUEVO-POS/apps/pos/src/components/OpenAccountsCorkboard.f5_3.test.jsx` | **Compuerta actual** (criterios 8, 9, 10) | Verifica CLASES en el JSX, NO el layout → hueco de la compuerta |
| `../NUEVO-POS/apps/pos/src/hooks/useOpenAccounts.js` | Hook que alimenta el pizarrón | Datos de las cuentas |
| `../NUEVO-POS/apps/pos/src/constants/paletaPostIts.js` | Paleta de colores de post-its | Colores por terminal |
| `../NUEVO-POS/docs/05-plan-de-construccion/FICHA_F5_3_PIZARRON.md` | Ficha de la fase del pizarrón | Contrato original |
| `../NUEVO-POS/docs/LECCIONES_DE_UI.md` §8 | Cuatro vueltas de este bug | Historial de intentos |
| `../NUEVO-POS/apps/pos/package.json` | Scripts y deps del frontend | `npm run dev`, `npx vitest run` |

### Repo de REFERENCIA (POS VIEJO, SÍ funciona): `ERP-R-DE-RICO` (workspace actual)

| Ruta | Qué es | Por qué importa |
|---|---|---|
| `apps/pos/OpenAccountsCorkboard.jsx` | **POS viejo del pizarrón** | Referencia de cómo SÍ funciona: tablero `aspect-[16/9]` (altura definida), el GRID lleva `flex-1 overflow-y-auto custom-scrollbar`, modal `items-center` SIN `overflow-y-auto` |

### Repo de DOCS: `../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS`

| Ruta | Qué es | Por qué importa |
|---|---|---|
| `../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/DECISIONES_ARQUITECTONICAS_DEL_NUEVO_POS.md` §7 | ADR — filas BUG-10..BUG-10d | Aquí va la fila BUG-10e al cerrar |

---

## Comandos rápidos de verificación

```bash
# 1. Levantar el dev server del POS nuevo (puerto 5100)
cd ../NUEVO-POS/apps/pos && npm run dev

# 2. Verificar que el CSS servido tiene las clases
curl -s http://localhost:5100/src/index.css | findstr /C:"85vh" /C:"min-h-0" /C:"aspect-square"

# 3. Verificar que el JS servido tiene el código nuevo
curl -s http://localhost:5100/src/components/OpenAccountsCorkboard.jsx | findstr /C:"h-[85vh]" /C:"min-h-0"

# 4. Correr los tests del frontend
cd ../NUEVO-POS/apps/pos && npx vitest run

# 5. Sembrar cuentas abiertas para forzar el desborde
docker compose exec -T db psql -U pos -d nuevo_pos -c "SELECT id, account_num, status FROM tickets WHERE status='OPEN';"
```

---

## Commits relevantes (para que Gemini vea el historial)

**NUEVO-POS:**
- `caa0648` — docs(BUG-10): handoff a Gemini (este expediente)
- `3f2aec6` — docs(BUG-10d): LECCIONES §8 cuarta vuelta
- `06d9a36` — fix(BUG-10d): altura DEFINIDA `h-[85vh]` + wrapper `min-h-0`
- `a575061` — docs(BUG-10c): el post-it cuadrado (`aspect-square`)
- `8f0db43` — fix(BUG-10c): post-it cuadrado en vez de caja de alto fijo
- `f5e6dbe` — docs(BUG-10b): mover el scroll a un wrapper
- `cfaca7e` — fix(BUG-10b): scroll en wrapper, grid `content-start`
- `3b075b4` — docs(BUG-10): replicar el patrón del POS viejo
- `8358f48` — fix(BUG-10): tablero `max-h-[85vh]` + grid scrollable

**PLANOS:**
- `104e704` — ADR §7 fila BUG-10d
- `69a9acf` — ADR §7 fila BUG-10c
- `11c3320` — ADR §7 fila BUG-10b
- `fb15cdd` — ADR §7 fila BUG-10
