# 📋 FICHA F10.2 — B-01: "Copiar URL" en el gestor de terminales

**Fase:** 10.2 (Cierre de brechas aprobadas)
**Fecha:** 30 Sep 2026
**Estado:** ✅ CERRADA
**Origen:** Hallazgo del usuario — *"en el gestor de terminales no aparece la opción copiar url que sí aparece en el pos viejo"*

---

## 1. QUÉ ERA LA BRECHA

El viejo POS tenía, en el gestor de terminales, un botón **"📋 Copiar URL"**
que copiaba al portapapeles la URL de acceso directo de cada terminal:

```
http://<host>:<port>/?terminal=<id>
```

El operador la pegaba en el acceso directo de la máquina física, de modo que
esa máquina abriera el POS **directamente en su terminal** (sin pasar por el
selector).

El nuevo POS **había omitido por completo** esa capacidad: ni el botón ni la
lógica. Fue una **OMISIÓN TOTAL**, no un cableado pendiente.

### Evidencia (F10.0)

| POS | Archivo | Línea | Qué había |
|-----|---------|-------|-----------|
| Viejo | `apps/pos/components/TerminalSelector.jsx` | `:63` | `const copyUrl = (tid) => { ... }` |
| Viejo | `apps/pos/components/TerminalSelector.jsx` | `:184` | `<button onClick={() => copyUrl(t.id)}>📋 Copiar URL</button>` |
| Nuevo | `../NUEVO-POS/apps/pos/src/components/TerminalSelector.jsx` | — | **0 coincidencias** de `copyUrl`/`clipboard`/`copiar` |

---

## 2. POR QUÉ IMPORTA (severidad ALTA)

No es una capacidad cosmética. Es **operativa**: sin ella, configurar el acceso
directo de cada máquina obliga a teclear la URL a mano (propensa a errores) o a
inspeccionar el código. El usuario la reportó como una pérdida real.

Es la **tercera instancia** de la misma clase de falla que motivó la Fase 10:

| # | Falla | Fase | Naturaleza |
|---|-------|------|------------|
| 1 | `GestorDeCaja` huérfano | F4.5 | Integración olvidada |
| 2 | `payment_details` no expuesto | F9.1.4a | Dato construido, no expuesto |
| 3 | **"Copiar URL" ausente** | **F10** | **Omisión total** |

---

## 3. QUÉ SE HIZO (F10.2)

### 3.1 La lógica (`copyUrl`)

Se portó la **INTEGRACIÓN** (el botón vive en la tarjeta del gestor, junto a
Editar y Eliminar) y se **reescribió la IMPLEMENTACIÓN** (§6.8):

- **Antes (viejo):** solo `document.execCommand('copy')` con un `<textarea>`
  temporal.
- **Ahora (nuevo):** `navigator.clipboard.writeText()` como camino principal,
  con **fallback** a `execCommand` para contextos sin Clipboard API (http no
  seguro, navegadores viejos). El resultado se comunica con el `showToast`
  existente del componente.

```js
async function copyUrl(tid) {
  const url = `http://${window.location.hostname}:${window.location.port}/?terminal=${tid}`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      // Fallback para contextos sin Clipboard API.
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast(`✅ URL copiada: ${url}`, 'success');
  } catch {
    showToast(`No se pudo copiar. URL: ${url}`, 'error');
  }
}
```

### 3.2 El botón

Se añadió en los controles de cada tarjeta del gestor, entre Editar y Eliminar,
con `data-testid="copiar-url-<id>"` para la puerta:

```jsx
<button onClick={() => copyUrl(t.id)}
        data-testid={`copiar-url-${t.id}`}
        title="Copiar URL"
        style={{ ... }}>
  📋
</button>
```

---

## 4. LA PUERTA (test)

**Archivo:** `../NUEVO-POS/apps/pos/src/components/TerminalSelector.f10_2.test.jsx`
**Resultado:** ✅ 4/4 en verde

| Criterio | Qué verifica |
|----------|--------------|
| 1 | El botón "Copiar URL" existe por cada terminal en el gestor |
| 2 | Al pulsarlo, copia la URL con el `?terminal=<id>` |
| 3 | La URL usa el id REAL (`TERM-0N`), no un índice |
| 4 | Sin Clipboard API, cae al fallback `execCommand` |

---

## 5. COMPUERTA COMPLETA

`npm run ci` desde `../NUEVO-POS`:

```
Lint OK: 0 errores.
Tests de Node      : 3/3 archivo(s) en verde
Tests de componentes: PASA
Tests de API       : PASA
✅ RESULTADO: TODOS LOS TESTS EN VERDE.
PUERTA F0 EN VERDE / F4-A-04 EN VERDE / F5-R-01 EN VERDE
```

---

## 6. LECCIÓN CODIFICADA

Esta brecha confirma la lección que originó la Fase 10:

> *"el componente existe y pasa su test" ≠ "el conjunto está completo"*

El método "de adentro hacia afuera" verifica la **calidad** de cada pieza, pero
no la **COMPLETITUD del conjunto** contra el viejo POS. F10 cierra esa brecha
metodológica con una auditoría de paridad explícita.

---

## 7. TRAZABILIDAD

| Documento | Relación |
|-----------|----------|
| `PLAN_DE_ABORDAJE_FASE_10_PARIDAD.md` §4.2 | B-01 aprobada para portar |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §6.8 | UX heredada — la integración se hereda |
| `PLAN_MAESTRO_DEFINITIVO_POS.md` §10.6.1 | La lección de F4.5 — la integración es una compuerta |
| `FICHA_F4_5_INTEGRACION.md` | Instancia 1 (GestorDeCaja huérfano) |
| `FICHA_F9_1_4_IMPRESION_CIERRE.md` | Instancia 2 (`payment_details`) |
