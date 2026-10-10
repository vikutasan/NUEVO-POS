# Lecciones de UI — Elementos transversales y ramas de retorno

> **Fase:** Etapa 3 (estructura de módulos) — documento de lecciones.
> **Origen:** BUG-05 (el botón «Guardar cambios» del gestor parecía muerto).
> **Ficha asociada:** [`FICHA_FIX_BUG05_CAJA_NO_ES_TERMINAL.md`](../05-plan-de-construccion/FICHA_FIX_BUG05_CAJA_NO_ES_TERMINAL.md)
> **Arquitectura relacionada:** [`ARQUITECTURA_TERMINALES_Y_CAJA.md`](../01-logica-del-negocio/ARQUITECTURA_TERMINALES_Y_CAJA.md)

Este documento recoge las lecciones de UI aprendidas durante la construcción del
nuevo POS. No son opiniones: cada una nace de un defecto real que llegó a
producción y se corrigió. Se escriben para **no repetirlos**.

---

## 1. La lección central: un `return` temprano puede dejar fuera lo transversal

### 1.1. El síntoma

El usuario reportó que, en el **Gestor de Terminales**, pulsar «Guardar cambios»
**parecía no reaccionar**: no aparecía ningún aviso de éxito ni de error.

### 1.2. La causa

`TerminalSelector.jsx` tiene **dos ramas de retorno**:

```jsx
if (showManager) {
  return ( /* … el gestor … */ );   // rama A
}

return ( /* … el selector principal … */ );  // rama B
```

El bloque del toast (`{toast && (…)}`) vivía **sólo en la rama B**. Al pulsar el
botón dentro del gestor (rama A), `showToast()` **sí** actualizaba el estado, pero
**el toast no existía en el árbol JSX de la rama A**, así que nunca se pintaba.

El handler funcionaba. El backend respondía. El estado se actualizaba. **Lo único
que faltaba era el nodo que muestra el aviso.**

### 1.3. La corrección

Replicar el bloque del toast **en ambas ramas**. El aviso debe vivir donde se
pulsa el botón, no donde sea más cómodo escribirlo.

### 1.4. La regla

> **Todo elemento transversal (toast, modal, banner, overlay, spinner global)
> debe renderizarse en TODAS las ramas de retorno del componente, o extraerse a
> un componente contenedor que envuelva a todas.**

---

## 2. Cómo diagnosticar «un aviso no aparece»

Cuando un aviso (toast/modal/banner) no aparece, **el orden de sospecha** es:

1. **¿En qué rama de retorno vive el aviso?** — Si el componente tiene varios
   `return`, comprobar que el aviso está en la rama activa. *(Ésta era la causa
   de BUG-05.)*
2. **¿El estado del aviso cambió?** — Añadir una aserción de diagnóstico
   (`expect(handler).toHaveBeenCalled()`) para separar «el handler no corre» de
   «el handler corre pero el aviso no se pinta».
3. **¿El handler es asíncrono y el test no espera?** — Envolver el disparo en
   `await act(async () => { fireEvent.click(…) })` para vaciar la actualización
   de estado.
4. **¿El backend devolvió error y el frontend lo descartó?** — Propagar siempre
   el `detail`/`message` real; nunca mostrar sólo un genérico.

> **Moraleja:** antes de sospechar del handler o del backend, **comprobar dónde
> vive el nodo que muestra el aviso.**

---

## 3. Propagar el error real, nunca tragárselo

Un `catch` que devuelve un mensaje genérico **oculta la causa**. El backend ya
explica *por qué* falla (color fuera de la paleta, color repetido, etc.); el
frontend debe **propagar ese mensaje** hasta el usuario.

```js
// ❌ Mal: el usuario nunca sabe por qué falló
catch (err) {
  return { success: false };
}

// ✅ Bien: se conserva el mensaje del backend
catch (err) {
  return { success: false, message: err.message };
}
```

Y en el handler que muestra el aviso:

```js
showToast(`❌ ${result.message || 'Error al guardar'}`, 'error');
```

---

## 4. Trampas de los tests de UI (vitest + testing-library)

| Trampa | Síntoma | Solución |
|---|---|---|
| `vi.restoreAllMocks()` en `afterEach` | Un `vi.fn(async () => …)` de módulo vuelve a devolver `undefined` | Re-sembrar el mock en `beforeEach` (`mockResolvedValue`) |
| Handler asíncrono sin `act` | El estado no se refleja antes de la aserción | `await act(async () => { fireEvent.click(…) })` |
| Aserción de diagnóstico ausente | No se sabe si falla el handler o el render | Añadir `expect(mock).toHaveBeenCalled()` primero |
| Mock de módulo con `vi.mock` | El import real no se usa | Importar el mock **después** de `vi.mock` |

---

## 5. Checklist antes de dar por bueno un componente con varias ramas

- [ ] ¿Cuántos `return` tiene el componente? (contarlos explícitamente)
- [ ] ¿Los toasts/modales/banners están en **todas** las ramas?
- [ ] ¿Los handlers asíncronos propagan el mensaje de error real?
- [ ] ¿Hay un test que pulse el botón **en cada rama** y afirme que el aviso aparece?
- [ ] ¿El test usa `await act(async () => …)` para handlers asíncronos?

---

## 6. Resumen en una frase

**Un `return` temprano por rama de UI puede dejar fuera elementos transversales.**
Si un aviso «no aparece», comprobar **en qué rama de retorno vive** antes de
sospechar del handler o del backend.

---

## 7. Cambiar la FORMA de retorno de un servicio rompe a sus consumidores en silencio

**Caso real (BUG-09, 10 Oct 2026).** Al persistir el orden de terminales en el
backend, `fetchTerminalConfig()` pasó de devolver una **lista** (`[...]`) a un
**objeto** (`{ terminals, orden }`). Un consumidor hacía:

    for (const t of config || []) { ... }   // ← itera un OBJETO

Iterar un objeto con `for...of` lanza `TypeError: config is not iterable`. El
`catch {}` que envolvía la lectura lo **silenciaba**: el mapa de colores quedaba
vacío y **todos los post-its salían amarillos**. El usuario lo vivió como «puse
el color y no se aplica» — un síntoma de UI causado por un cambio de contrato de
datos.

**Regla:** cuando cambias la forma de retorno de una función compartida,
**audita TODOS sus consumidores** (`findstr /s /i "fetchTerminalConfig"`). Un
`catch` vacío convierte un error de tipo en un fallo **silencioso** de UI.

**Mitigación aplicada:** la lectura se centralizó en un helper tolerante a AMBOS
formatos (`construirColoresPorTerminal`), con test de regresión que fija el
contrato nuevo **y** el viejo.

| Trampa | Síntoma | Solución |
|---|---|---|
| Cambiar lista → objeto en un servicio | El consumidor itera el objeto y lanza `TypeError` | Auditar consumidores; helper tolerante a ambos formatos |
| `catch {}` vacío alrededor de una lectura | El error se traga y la UI cae a un valor por defecto | Registrar o, mejor, no silenciar errores de tipo |
| Color de post-it «no se aplica» | Todos amarillos (`COLOR_SIN_ASIGNAR`) | Revisar el MAPA `coloresPorTerminal`, no el backend (el color SÍ se persistía) |

---

## 8. Un contenedor que crece sin límite deja el scroll «invisible» (y `flex-1` en el grid encima los post-its)

**Caso real (BUG-10, 10 Oct 2026).** Con muchas cuentas, el pizarrón se
desbordaba pero **no aparecía barra de desplazamiento lateral**, a diferencia
del POS viejo. La causa: el tablero **crecía con el contenido** y el scroll
quedaba en el modal exterior (`overflow-y-auto` en el overlay), no en el
tablero. El POS viejo, en cambio, acota la altura del tablero y hace que el
**grid interno** sea el que se desplaza.

**Regla:** si quieres una barra de scroll **visible y contenida** (como el POS
viejo), el contenedor con scroll debe ser un elemento **con altura acotada**
(`max-h-[85vh]` + `flex flex-col` + `overflow-hidden` en el marco) y el hijo
que desborda lleva `flex-1 overflow-y-auto`. Dejar que el contenedor raíz crezca
delega el scroll al ancestro y la barra desaparece de la vista.

**Segunda vuelta (BUG-10b, 10 Oct 2026).** El primer arreglo puso
`flex-1 overflow-y-auto` **directamente en el `<ul>` del grid**. Resultado: en
vez de aparecer la barra, **los post-its se encimaron parcialmente unos sobre
otros**. Por qué: `flex-1` obliga al grid a **estirarse a la altura del
tablero**; como cada post-it conserva `aspect-square` (alto = ancho de columna),
las **filas se comprimen** y cada tarjeta se desborda de su fila y pisa a la de
abajo. Además el `gap` era demasiado estrecho (`gap-6`) para la rotación (±3°).

**Regla (corolario):** el scroll va en un **wrapper** de altura acotada
(`flex-1 overflow-y-auto`), y el **grid dentro** debe tener **alto automático**
(`content-start`, **sin** `flex-1` ni `overflow-y-auto`). Un grid con
`aspect-square` + `flex-1` es una trampa: comprime filas y encima tarjetas.
Deja separación amplia (`gap-10`/`lg:gap-12`, como el `gap-12` del POS viejo)
para que la rotación no toque al vecino.

**Mitigación aplicada:** el tablero usa `max-h-[85vh] flex-col overflow-hidden`;
un **wrapper** `flex-1 overflow-y-auto custom-scrollbar` es el que se desplaza;
el `<ul>` interno es `grid content-start` con alto automático. La barra
estilizada (`::-webkit-scrollbar`) es la misma del POS viejo.

**Tercera vuelta (BUG-10c, 10 Oct 2026).** Con el scroll ya resuelto, el post-it
se veía **demasiado largo**: un PEDIDO con poco texto quedaba estirado y el
total se iba al fondo, dejando un **hueco vacío enorme en medio**. La causa: el
post-it usaba `min-h-[11rem]` / `lg:min-h-[13rem]` + `justify-between`. El
`min-h` fija una altura **independiente del ancho de la columna**, y
`justify-between` empuja el total al fondo; con poco contenido, el espacio
sobrante queda en el centro. El POS viejo, en cambio, usa `aspect-square`
(alto = ancho de columna): el cuadrado se ajusta solo al ancho y reparte el
contenido sin huecos artificiales.

**Regla (segundo corolario):** para una tarjeta tipo post-it, usa
`aspect-square` (alto = ancho de columna), **no** un `min-h` fijo. Un `min-h`
desacopla el alto del ancho de la columna y, combinado con `justify-between`,
produce huecos vacíos cuando el contenido es escaso. `aspect-square` mantiene
la proporción cuadrada y el contenido se reparte de forma natural.

**Cuarta vuelta (BUG-10d, 10 Oct 2026) — la causa raíz de las tres anteriores.**
Tras BUG-10/10b/10c, el usuario reportó que **la barra seguía sin aparecer** y
que los post-its salían **«mordidos»** (recortados por abajo). La causa raíz,
que los tres intentos previos no tocaron: **`flex-1` + `overflow-y-auto` solo
producen scroll si el padre flex tiene una ALTURA DEFINIDA.** El tablero usaba
`max-h-[85vh]`, que es un **máximo**, no una altura definida: `flex-1` resolvía
a `auto`, el wrapper crecía con el contenido y la barra **nunca** aparecía.
Peor: como el tablero tiene `overflow-hidden`, al desbordar `85vh` **recortaba
las filas de abajo** — de ahí los post-its «mordidos». El POS viejo no sufre
esto porque su tablero es `aspect-[16/9]` (altura **definida**).

**Regla (tercer corolario):** para que un hijo `flex-1 overflow-y-auto` se
desplace, el padre flex debe tener **altura definida** (`h-[85vh]`, `aspect-*`,
`h-full` con ancestro acotado), **no** un `max-h`. Y el hijo con scroll necesita
`min-h-0`: por defecto un hijo flex tiene `min-height: auto` y **no puede
encogerse** por debajo de su contenido, así que el `overflow-y-auto` no desplaza.

**Mitigación aplicada (definitiva):** el tablero usa `h-[85vh] flex-col
overflow-hidden` (altura **definida**); el wrapper de scroll es `min-h-0 flex-1
overflow-y-auto custom-scrollbar`; el `<ul>` interno es `grid content-start`.

**Quinta vuelta (BUG-10e, 10 Oct 2026) — la verdadera barrera.**
A pesar de que las correcciones estructurales de BUG-10d (altura estricta, `min-h-0`)
eran conceptualmente correctas, el síntoma persistía. La barrera no era el layout,
sino **el HMR roto**. Como `OpenAccountsCorkboard.jsx` exportaba mezclados el componente
de React y una función pura (`colorDe`), Vite anulaba el Fast Refresh. El código nunca
llegaba al navegador del usuario; seguían viendo BUG-10 (el `max-h-[85vh]` que guillotinaba
los post-its) atrapados en caché. Además, el modal padre (`RetailVisionPOS.jsx`) aún tenía
`overflow-y-auto`, lo que podía capturar el scroll en pantallas pequeñas.

**Mitigación final:** Se quitó el `export` de `colorDe` (la función permanece en el módulo,
ya no se exporta) para reactivar el Fast Refresh, y se limpió el modal padre para que sea de
centrado puro (`items-center`, **sin** `overflow-y-auto`, idéntico al POS viejo), obligando al
scroll a nacer dentro del tablero.

**Compuerta (corrección de auditoría):** la primera versión del test de BUG-10e era una
**tautología** — simulaba `clientHeight=800`/`scrollHeight=1200` en jsdom y afirmaba
`1200 > 800`, verdadero por construcción: pasaba igual con el código roto y con el sano.
Se reemplazó por una **compuerta de fuente**: el test lee el código de `RetailVisionPOS.jsx`
y de `OpenAccountsCorkboard.jsx` y afirma que el bloque del modal **no** contiene
`overflow-y-auto` (y sí `items-center`/`justify-center`/`role="dialog"`), y que el tablero usa
`h-[85vh]` (no `max-h-[85vh]`) con `min-h-0` en el wrapper de scroll. Se **verificó que falla**
con el código viejo y **pasa** con el arreglo. Lección transversal: *una compuerta que no puede
fallar no es una compuerta*.

| Trampa | Síntoma | Solución |
|---|---|---|
| Contenedor que crece con el contenido | No hay barra de scroll visible; el scroll vive en el ancestro | Dar al marco **altura definida** (`h-[85vh]`) y poner `overflow-y-auto` en el hijo que desborda |
| `max-h` en el marco con `flex-1` dentro | La barra **nunca** aparece: `flex-1` resuelve a `auto` y el hijo crece | Usar **altura definida** (`h-[85vh]`), no `max-h`; `max-h` es un máximo, no una altura |
| `overflow-hidden` en el marco + hijo que crece | Los post-its de abajo salen **«mordidos»** (recortados) | El hijo que desborda debe poder desplazarse (`overflow-y-auto` + `min-h-0`), no recortarse |
| Hijo flex con `overflow-y-auto` sin `min-h-0` | El hijo no se encoge por debajo de su contenido y no desplaza | Añadir `min-h-0` al hijo con scroll (su `min-height` por defecto es `auto`) |
| Scroll delegado al overlay del modal | La barra aparece pegada al borde de la pantalla, no al tablero | El contenedor con scroll debe ser el propio tablero/grid, no el overlay |
| `flex-1` en el grid de tarjetas `aspect-square` | Las filas se comprimen y los post-its se **enciman** | El scroll va en un **wrapper**; el grid queda con alto automático (`content-start`, sin `flex-1`) |
| `gap` estrecho con tarjetas rotadas | Las esquinas rotadas (±3°) tocan al vecino | Separación amplia (`gap-10`/`lg:gap-12`), paridad con el POS viejo |
| `min-h` fijo + `justify-between` en el post-it | El post-it se ve **demasiado largo** y deja un hueco vacío en medio cuando el contenido es escaso | Usar `aspect-square` (alto = ancho de columna), como el POS viejo; **no** un `min-h` fijo |
| Exportar funciones puras junto a componentes en Vite | El **Fast Refresh (HMR) colapsa**. El navegador no actualiza el código y los fixes de layout son invisibles. | No exportar utilidades puras desde el mismo módulo que un componente: extraerlas a un archivo de dominio (ej. `constants/`) o, como mínimo, quitarles el `export`. |
| Compuerta que no puede fallar (tautología) | El test pasa siempre: verde con el código roto y con el sano; da falsa confianza | La compuerta debe poder **fallar**: afirmar sobre el código real (p. ej. leer la fuente y negar el patrón roto), no sobre un mock que se cumple por construcción |
