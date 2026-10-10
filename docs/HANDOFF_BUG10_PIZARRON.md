# HANDOFF — BUG-10 (pizarrón de cuentas abiertas): scroll lateral ausente + post-its "mordidos"

> **Estado:** ABIERTO. Cuatro intentos de corrección (BUG-10, 10b, 10c, 10d) NO resolvieron
> el síntoma reportado por el usuario. Se delega a Gemini con este expediente.
>
> **Fecha:** 10 Oct 2026
> **Repos:** `../NUEVO-POS` (código) y `../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS` (docs)
> **Último commit de código:** `06d9a36` (BUG-10d) — pusheado.
> **Último commit de docs:** `3f2aec6` (LECCIONES §8) — pusheado.

---

## 1. SÍNTOMA REPORTADO POR EL USUARIO (textual, con typos)

Reporte 1 (tras BUG-10c):
> "refresque navegador y la barra de desplazamiento aun no aparece y los post its salen con
> la cantidad mordida, veo que ereparar esto te esrta costando trabajo, que opinas si se lo
> delego a geminy?"

Reporte 2 (tras BUG-10d):
> "aun no aparece la barra de desplazamiento y aun sale mordida la cantidad, se lo delego a geminy?"

Interpretación:
- **"no aparece la barra de desplazamiento"** — cuando el pizarrón tiene MUCHAS cuentas, no
  aparece la barra de scroll lateral (el usuario la quiere, como en el POS viejo).
- **"sale mordida la cantidad"** — el total (`$X.XX`) del post-it queda recortado/cortado
  ("mordido") en la parte inferior del post-it o del tablero.

---

## 2. QUÉ SE HA INTENTADO (4 intentos, todos fallidos según el usuario)

| Intento | Commit | Cambio | Resultado |
|---|---|---|---|
| BUG-10 | `8358f48` | Tablero `max-h-[85vh] overflow-hidden flex flex-col`; grid `flex-1 overflow-y-auto custom-scrollbar`; `<style>` con `::-webkit-scrollbar` | Falló |
| BUG-10b | `cfaca7e` | Mover el scroll a un WRAPPER (`flex-1 overflow-y-auto custom-scrollbar`); grid interno `content-start` sin `flex-1`; gaps `gap-10`/`lg:gap-12` | Falló |
| BUG-10c | `8f0db43` | Post-it: quitar `min-h-[11rem]`/`lg:min-h-[13rem]`; usar `aspect-square` (paridad con POS viejo) | Falló |
| BUG-10d | `06d9a36` | Tablero `max-h-[85vh]` → `h-[85vh]` (altura DEFINIDA); wrapper `+ min-h-0` | Falló |

Docs asociadas: `LECCIONES_DE_UI.md` §8 (cuatro vueltas: `3b075b4`, `f5e6dbe`, `a575061`,
`3f2aec6`) y `DECISIONES_ARQUITECTONICAS_DEL_NUEVO_POS.md` §7 (filas BUG-10..BUG-10d:
`fb15cdd`, `11c3320`, `69a9acf`, `104e704`).

---

## 3. ESTADO ACTUAL DEL CÓDIGO (verificado)

Archivo: `apps/pos/src/components/OpenAccountsCorkboard.jsx` (451 líneas).

### 3.1 Estructura del render (líneas ~227-448)

```jsx
<div className="w-full max-w-[1100px] mx-auto p-4">            {/* wrapper externo, SIN altura */}
  <div
    className="flex h-[85vh] flex-col overflow-hidden rounded-[40px] border-[20px] border-madera-veta bg-madera-panel p-4 sm:p-6 lg:p-8 shadow-2xl"
    style={{ backgroundImage: '...', backgroundSize: '...' }}
  >                                                            {/* EL TABLERO: h-[85vh] DEFINIDA */}
    <div className="mb-6 flex flex-col sm:flex-row items-start justify-between gap-4">
      {/* encabezado: h2 + leyenda + botones refrescar/cerrar */}
    </div>
    {error && <div role="alert" ...>...</div>}
    {cargando && <p ...>Cargando cuentas…</p>}
    {!cargando && !error && cuentas.length === 0 && <div ...>VACÍO</div>}
    {!cargando && cuentas.length > 0 && (
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-2">   {/* WRAPPER DE SCROLL */}
        <ul className="grid content-start grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12 xl:grid-cols-4">
          {cuentas.map((cuenta, indice) => (
            <li
              key={cuenta.id}
              className={`group relative flex aspect-square flex-col justify-between rounded-sm p-4 shadow-[...] hover:shadow-[...] hover:-translate-y-2 hover:rotate-0 transition-all cursor-pointer lg:p-6 ${colorDe(cuenta.terminal_id, coloresPorTerminal)} ${rotacionDe(indice)}`}
              onClick={() => manejarRecuperar(cuenta)}
              role="button"
              tabIndex={0}
              onKeyDown={...}
            >
              {/* pin, folio+terminal, tipo pedido+cliente, capturista+hora, total+label, esquina doblada */}
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
  <style>{`
    .custom-scrollbar::-webkit-scrollbar { width: 8px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.05); border-radius: 10px; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.18); border-radius: 10px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.3); }
  `}</style>
</div>
```

### 3.2 Dónde se monta (modal padre)

Archivo: `apps/pos/src/RetailVisionPOS.jsx` (líneas 1358-1377):

```jsx
{pizarronAbierto ? (
  <div
    className="fixed inset-0 z-50 bg-fondo-profundo/80 flex items-start justify-center p-4 overflow-y-auto"
    role="dialog" aria-modal="true" aria-label="Cuentas abiertas"
  >
    <OpenAccountsCorkboard
      terminalId={terminalEfectiva}
      cajaHabilitada={Boolean(turnoCaja)}
      coloresPorTerminal={coloresPorTerminal}
      refrescarSenal={refrescarSenal}
      onRecuperar={recuperarCuentaAlCarrito}
      onCerrar={() => { setPizarronAbierto(false); refrescarConteoCuentas(); }}
    />
  </div>
) : null}
```

---

## 4. REFERENCIA: EL POS VIEJO (SÍ funciona)

Archivo: `apps/pos/OpenAccountsCorkboard.jsx` (repo ERP-R-DE-RICO, workspace actual).

```jsx
<div className="fixed inset-0 z-[100] flex items-center justify-center p-10">
  <div className="absolute inset-0 bg-black/90" onClick={onClose} />
  <div className="relative w-full max-w-6xl aspect-[16/9] rounded-[40px] shadow-[...] border-[20px] border-[#3d2b1f] overflow-hidden flex flex-col">
    {/* textura de corcho (absolute inset-0) */}
    <div className="relative z-10 p-8 border-b border-black/10 flex justify-between items-center bg-black/5">
      {/* encabezado */}
    </div>
    <div className="relative z-10 flex-1 p-12 overflow-y-auto custom-scrollbar grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-12 content-start">
      {sortedAccounts.map((acc, index) => (
        <div className={`group relative p-6 aspect-square ${getPostItColor(acc.terminal)} ${getRandomRotation(index)} shadow-[...] hover:shadow-[...] hover:-translate-y-2 transition-all cursor-pointer flex flex-col justify-between`}>
          {/* pin, contenido, total */}
        </div>
      ))}
    </div>
  </div>
  <style>{`.custom-scrollbar::-webkit-scrollbar { width: 6px; } ...`}</style>
</div>
```

**Diferencias clave POS viejo vs nuevo:**
1. **Altura del tablero:** viejo = `aspect-[16/9]` (altura DEFINIDA por relación de aspecto);
   nuevo = `h-[85vh]` (altura DEFINIDA por viewport). **Ambas son definidas.**
2. **Scroll:** viejo = el GRID mismo lleva `flex-1 overflow-y-auto custom-scrollbar` (el grid ES
   el contenedor de scroll); nuevo = un WRAPPER lleva el scroll y el grid va dentro.
3. **Modal padre:** viejo = `flex items-center justify-center p-10` (SIN `overflow-y-auto`);
   nuevo = `flex items-start justify-center p-4 overflow-y-auto` (CON `overflow-y-auto`).
4. **Post-it:** ambos usan `aspect-square` + `flex flex-col justify-between`.

---

## 5. HECHOS VERIFICADOS (no son hipótesis)

1. **El CSS servido por el dev server (puerto 5100) SÍ contiene las clases correctas.**
   Verificado con `curl -s http://localhost:5100/src/index.css`:
   - `.h-\[85vh\] { height: 85vh; }` ✅ presente
   - `.min-h-0 { min-height: 0px; }` ✅ presente
   - `.aspect-square { aspect-ratio: 1 / 1; }` ✅ presente
   - `.max-h-\[85vh\] { max-height: 85vh; }` ✅ presente (de otros componentes)
   - Las clases viejas `.lg\:min-h-\[13rem\]` y `.min-h-\[11rem\]` YA NO están (fueron removidas).

2. **El JS servido por el dev server SÍ contiene el código nuevo.**
   Verificado con `curl -s http://localhost:5100/src/components/OpenAccountsCorkboard.jsx`:
   - `className: "flex h-[85vh] flex-col overflow-hidden ..."` ✅
   - `className: "custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-2"` ✅

3. **El dev server corre en el puerto 5100** (Vite v5.4.21, `strictPort`, `host: true`).
   Es el ÚNICO puerto de dev escuchando (verificado con `Get-NetTCPConnection`). El POS viejo
   (`rderico-erp`) NO está corriendo.

4. **Se agregó un diagnóstico temporal** (`console.log('[BUG-10e] board'/'wrapper', {...})` con
   `boardRef`/`scrollRef` y `getComputedStyle`) y **el usuario reportó que las líneas NO
   aparecen en la consola, ni tras Ctrl+Shift+R.** El diagnóstico YA FUE REVERTIDO (árbol de
   git limpio). Este es el dato más importante y desconcertante: el dev server sirve el código
   con el `console.log`, pero el navegador del usuario no lo ejecuta.

5. **Vite reporta en cada HMR:** `Could not Fast Refresh ("colorDe" export is incompatible)`.
   El módulo `OpenAccountsCorkboard.jsx` exporta `colorDe` (una función no-componente) junto
   con el componente default, lo que impide Fast Refresh y fuerza invalidación completa.

---

## 6. HIPÓTESIS VIVAS (ordenadas por probabilidad)

### H1 — El navegador del usuario ejecuta un bundle/módulo CACHEADO (más probable)
El dev server sirve el código nuevo, pero el navegador no lo ejecuta (el `console.log` no
aparece). Posibles causas:
- Service Worker cacheando el bundle (revisar `navigator.serviceWorker` en DevTools).
- Caché HTTP agresiva del módulo ES (Vite sirve con `Cache-Control` en dev; un hard reload
  debería bastar, pero un SW lo anula).
- El usuario tiene abierta una pestaña ANTIGUA del POS (de antes de reiniciar el server) y el
  HMR no reconectó.
**Acción sugerida:** abrir una ventana de incógnito, ir a `http://localhost:5100`, abrir el
pizarrón, y verificar en DevTools → Network que `OpenAccountsCorkboard.jsx` se descarga con el
`console.log`. Revisar Application → Service Workers y "Unregister".

### H2 — El modal padre captura el scroll (`overflow-y-auto` + `items-start`)
El modal `fixed inset-0 ... flex items-start justify-center p-4 overflow-y-auto` tiene su
PROPIO `overflow-y-auto`. Si el tablero (`h-[85vh]`) + padding del modal excede el viewport en
el equipo del usuario (p. ej. zoom del navegador, o barra de tareas), el modal scrollea en vez
del wrapper interno, y la barra que aparece es la del modal (o ninguna, si el contenido cabe).
**Acción sugerida:** quitar `overflow-y-auto` del modal y usar `items-center`; o dar al modal
`h-screen` y al tablero `max-h-full`.

### H3 — El post-it se desborda por contenido (la "cantidad mordida")
El post-it es `aspect-square` (alto = ancho de columna). Con 4 columnas en `max-w-[1100px]`,
cada columna mide ~250px → el post-it es 250×250. El contenido (folio `text-3xl lg:text-5xl`,
badge, nombre, capturista, hora) + el total puede exceder 250px, y como el tablero tiene
`overflow-hidden`, la parte de abajo (el total) se RECORTA → "mordida".
**Acción sugerida:** en el POS viejo el tablero es `max-w-6xl` (1152px) y `aspect-[16/9]`
(648px de alto) con `p-12`; el nuevo es `max-w-[1100px]` × `85vh`. Comparar el ancho de
columna real. Considerar `min-h` en el post-it o reducir el tamaño de la tipografía del folio.

### H4 — La regla global `[role='button'] { min-height: 44px }` interfiere
`index.css` líneas 61-66 aplican `min-height: 44px; min-width: 44px` a `button, [role='button']`.
El post-it `<li>` tiene `role="button"`. Con `aspect-square` + `min-height`, en algunos
navegadores el `aspect-ratio` puede ceder ante el `min-height`. Poco probable (44px es chico),
pero verificable.

### H5 — El `<style>` con `::-webkit-scrollbar` no aplica en el navegador del usuario
Si el usuario usa Firefox, `::-webkit-scrollbar` no existe y la barra sería la nativa (que
igual se vería). No explica "no aparece la barra". Descartable como causa única.

---

## 7. CÓMO REPRODUCIR / VERIFICAR

```bash
# 1. Levantar el dev server del POS nuevo (puerto 5100)
cd ../NUEVO-POS/apps/pos && npm run dev

# 2. Verificar que el CSS servido tiene las clases
curl -s http://localhost:5100/src/index.css | findstr /C:"85vh" /C:"min-h-0" /C:"aspect-square"

# 3. Verificar que el JS servido tiene el código nuevo
curl -s http://localhost:5100/src/components/OpenAccountsCorkboard.jsx | findstr /C:"h-[85vh]" /C:"min-h-0"

# 4. Abrir en el navegador: http://localhost:5100  → botón "Pizarrón"
#    Con MUCHAS cuentas abiertas (sembrar varias en la BD) para forzar el desborde.
```

**Para sembrar cuentas:** crear tickets OPEN vía el POS o directamente en la BD
(`docker compose exec -T db psql -U pos -d nuevo_pos -c "..."`). El pizarrón lista las cuentas
OPEN de la terminal (o TODAS si es CAJA).

**Tests existentes (vitest, desde `apps/pos`):**
- `src/components/OpenAccountsCorkboard.f5_3.test.jsx` — criterio 9 (estructura del scroll) y
  criterio 10 (post-it `aspect-square`). Estos tests verifican CLASES en el JSX, NO el layout
  renderizado, así que pasan aunque el síntoma persista. **Ese es el hueco de la compuerta.**

---

## 8. ARCHIVOS RELEVANTES

| Archivo | Rol |
|---|---|
| `apps/pos/src/components/OpenAccountsCorkboard.jsx` | El pizarrón (451 líneas) — AQUÍ está el bug |
| `apps/pos/src/RetailVisionPOS.jsx` (1358-1377) | El modal que monta el pizarrón |
| `apps/pos/src/index.css` (61-66, 68-84) | Regla global `[role='button']` + scrollbar global |
| `apps/pos/tailwind.config.js` | `content: ['./index.html', './src/**/*.{js,jsx}']` |
| `apps/pos/src/components/OpenAccountsCorkboard.f5_3.test.jsx` | Compuerta (criterios 8, 9, 10) |
| `apps/pos/OpenAccountsCorkboard.jsx` (ERP-R-DE-RICO) | POS viejo de referencia (SÍ funciona) |
| `docs/05-plan-de-construccion/FICHA_F5_3_PIZARRON.md` | Ficha de la fase |
| `docs/LECCIONES_DE_UI.md` §8 | Cuatro vueltas de este bug |
| `../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/DECISIONES_ARQUITECTONICAS_DEL_NUEVO_POS.md` §7 | Filas BUG-10..10d |

---

## 9. LO QUE SE PIDE A GEMINI

1. **Determinar por qué el navegador del usuario no ejecuta el código servido** (H1). Es el
   dato más anómalo: el `console.log` no aparece ni con hard reload.
2. **Reproducir el layout real** (idealmente con un navegador headless: Playwright/Puppeteer)
   y medir `clientHeight`/`scrollHeight` del tablero y del wrapper, y el `getBoundingClientRect`
   del post-it y de su total.
3. **Corregir la causa raíz** (probablemente H2 y/o H3) y **agregar una compuerta que verifique
   el LAYOUT RENDERIZADO**, no solo las clases en el JSX (el hueco actual de la compuerta).
4. **Documentar** en `LECCIONES_DE_UI.md` §8 (quinta vuelta) y en el ADR §7 (fila BUG-10e).

---

## 10. RESTRICCIONES DEL ENTORNO (importantes)

- **Docker:** el servicio `api` monta SOLO `./apps/api:/app`. Un pytest NO puede leer el
  frontend. Las compuertas del frontend DEBEN ser vitest.
- **Vitest:** corre desde `apps/pos`, `environment: 'jsdom'`, include `src/**/*.test.{jsx,tsx}`.
- **Backend tests:** `docker compose run --rm --entrypoint sh api -c "pip install --quiet --no-cache-dir -r requirements.txt && pytest -q"` (desde `../NUEVO-POS`).
- **Frontend tests:** `npx vitest run` desde `../NUEVO-POS/apps/pos`.
- **Conteos actuales:** backend 378 passing; frontend 837 passing (79 archivos).
- **Dos repos:** `../NUEVO-POS` (código) y `../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS` (docs).
- **Deudas que NO se tocan:** (a) naming BUG-02/03; (c) `_es_admin()`.
- **`read_file` en modo indentation** requiere `anchor_line >= 1`.
- **`apply_diff` con fences ``` en el contenido** puede fallar ("Unexpected end of sequence").
- **`execute_command` se interrumpe con frecuencia**; reintentar suele funcionar.
