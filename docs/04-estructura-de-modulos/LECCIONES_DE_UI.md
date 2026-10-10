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
