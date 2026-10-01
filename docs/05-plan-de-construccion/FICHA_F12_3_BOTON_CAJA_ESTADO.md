# FICHA F12.3 — Botón CAJA con rótulo y estado (● Activa / ○ Habilitar)

> **Fase:** F12 — Portar funcionalidades puntuales del POS viejo (una por una).
> **Sub-fase:** F12.3 — Botón CAJA con texto + estado.
> **Estado:** ✅ CERRADA.
> **Fecha:** 01 Oct 2026.
> **Commit:** _(pendiente — se registra en el commit de seguimiento)_
> **Repositorio:** NUEVO-POS.

---

## 1. El pedido del usuario

> *"En el POS viejo el botón CAJA tenía también la función de mostrar
> habilitar o habilitada y me agradaba su estética y su funcionalidad. Sin
> embargo, en el nuevo POS fue reemplazado por un icono de bolsa de dinero
> que no me dice nada."*

---

## 2. El ciclo de 6 pasos (F12)

### 2.1 Detectar

El viejo POS tiene un botón de Caja que muestra **dos cosas**:

| Elemento | Valor |
|----------|-------|
| Rótulo | **"Caja"** |
| Estado (sin turno) | **"○ Habilitar"** |
| Estado (con turno) | **"● Activa"** |

El nuevo POS lo había reemplazado por un botón que solo mostraba el icono
**💰**, sin rótulo ni estado.

### 2.2 Verificar (contra los archivos reales — REGLA DURA 2 / E-19)

**El ORACLE (viejo POS):**
[`apps/pos/components/POSHeader.jsx`](../../../apps/pos/components/POSHeader.jsx:159)
— el botón de Caja:

```jsx
<button
    onClick={onOpenGestorCaja}
    className="bg-black/60 border border-[#c1d72e]/40 px-6 py-2 rounded-xl flex items-center hover:bg-[#c1d72e]/20 hover:border-[#c1d72e] transition-all shadow-xl"
    title={isCashEnabled ? 'Gestionar Caja (Activa)' : 'Habilitar como Caja'}
>
    <div className="text-left">
        <p className="text-[18px] font-black uppercase text-white tracking-widest leading-none mb-1">Caja</p>
        <p className={`text-[14px] font-black uppercase tracking-tighter leading-none ${isCashEnabled ? 'text-[#c1d72e]' : 'text-[#c1d72e]/60'}`}>
            {isCashEnabled ? '● Activa' : '○ Habilitar'}
        </p>
    </div>
</button>
```

**El nuevo POS (antes de F12.3):**
[`apps/pos/src/components/POSHeader.jsx`](../apps/pos/src/components/POSHeader.jsx:187)
— el botón de Caja solo mostraba el icono:

```jsx
<button
  type="button"
  onClick={() => onAbrirCaja?.()}
  className={`min-h-tactil min-w-tactil border rounded-xl px-3 flex items-center justify-center transition-all ${
    cajaAbierta ? 'bg-acento text-fondo-profundo border-acento' : 'bg-fondo-profundo border-white/5 hover:bg-fondo-panel'
  }`}
  title={cajaAbierta ? 'Caja abierta' : 'Abrir caja'}
  aria-label="Gestor de caja"
>
  <span aria-hidden="true">💰</span>
</button>
```

### 2.3 Clasificar

**OMITIDA (parcial)** — la 11ª instancia de la clase de fallo §10.6
(*"el inventario de componentes no ve la PARIDAD DE OPERACIÓN"*).

El botón **existía** y **funcionaba** (abría el Gestor de Caja), pero su
**operación de señalización** —mostrar el rótulo y el estado del turno— se
perdió en la traducción. El usuario no podía saber, de un vistazo, si la caja
estaba habilitada.

### 2.4 Adaptar

**`apps/pos/src/components/POSHeader.jsx`** — se restaura la estética del viejo
POS (rótulo + estado), conservando los tokens del nuevo POS:

```jsx
<button
  type="button"
  onClick={() => onAbrirCaja?.()}
  className={`min-h-tactil border rounded-xl px-4 flex items-center transition-all ${
    cajaAbierta
      ? 'bg-acento text-fondo-profundo border-acento'
      : 'bg-fondo-profundo border-white/5 hover:bg-fondo-panel'
  }`}
  title={cajaAbierta ? 'Gestionar Caja (Activa)' : 'Habilitar como Caja'}
  aria-label="Gestor de caja"
>
  <div className="text-left">
    <p className="text-[18px] font-black uppercase tracking-widest leading-none mb-1">
      Caja
    </p>
    <p
      className={`text-[14px] font-black uppercase tracking-tighter leading-none ${
        cajaAbierta ? 'text-fondo-profundo' : 'text-acento/60'
      }`}
    >
      {cajaAbierta ? '● Activa' : '○ Habilitar'}
    </p>
  </div>
</button>
```

**Decisiones de traducción (§6.8 — la implementación se reescribe):**

- El rótulo y el estado se heredan **literales** del viejo POS.
- Los colores se traducen a los tokens del nuevo POS: `bg-acento` /
  `text-fondo-profundo` cuando está activa; `text-acento/60` cuando no.
- Se conserva `min-h-tactil` (R-04) y `aria-label="Gestor de caja"`.
- El `title` se alinea con el del viejo POS ("Gestionar Caja (Activa)" /
  "Habilitar como Caja").

### 2.5 Probar

**Compuerta nueva:** `apps/pos/src/components/POSHeader.f12_3.test.jsx` — **8 tests**.

| # | Criterio |
|---|----------|
| 1 | El botón muestra el rótulo "Caja" (no un icono mudo). |
| 2 | Sin turno abierto muestra "○ Habilitar". |
| 3 | Con turno abierto muestra "● Activa". |
| 4 | El estado cambia al alternar `cajaAbierta`. |
| 5 | Ya NO usa el icono 💰 como única señal. |
| 6 | Invoca `onAbrirCaja` al pulsarlo (sigue siendo el punto de entrada). |
| 7 | El `title` describe la acción según el estado. |
| 8 | R-04: el botón respeta el target táctil (`min-h-tactil`). |

**Resultado:**

- Compuerta F12.3: **8/8 en verde**.
- CI completo (`npm run ci`): lint OK (278 archivos, 0 errores), tests Node +
  Vitest + pytest OK, guardianes F0 / F4-A-04 / F5-R-01 OK.

### 2.6 Ficha + commit

Esta ficha. El hash real se registra en un commit de seguimiento (patrón
ficha-hash).

---

## 3. La lección (11ª instancia de §10.6)

> **"El inventario de componentes no ve la PARIDAD DE OPERACIÓN."**

El botón de Caja existía y pasaba su test de integración (abría el Gestor de
Caja). Pero su **operación de señalización** —comunicar el estado del turno—
se perdió al reescribir la implementación. Un icono 💰 es un componente, no una
operación.

**Regla derivada:** cuando un control heredado **comunica un estado** (no solo
dispara una acción), la compuerta debe probar **el estado visible**, no solo el
callback.

---

## 4. Archivos tocados

| Archivo | Cambio |
|---------|--------|
| `apps/pos/src/components/POSHeader.jsx` | Botón CAJA: rótulo "Caja" + estado "● Activa / ○ Habilitar" + `title` alineado. |
| `apps/pos/src/components/POSHeader.f12_3.test.jsx` | **Nuevo** — compuerta F12.3 (8 tests). |
| `docs/05-plan-de-construccion/FICHA_F12_3_BOTON_CAJA_ESTADO.md` | **Nuevo** — esta ficha. |

---

## 5. Trazabilidad

- **§6.8** — la UX heredada del viejo POS: la INTEGRACIÓN se hereda, la
  IMPLEMENTACIÓN se reescribe.
- **§10.6.5** — heredar la integración no basta; hay que heredar la **operación**.
- **REGLA DURA 2 / E-19** — "Verificar, no asumir".
- **R-04** — el botón respeta el target táctil de 44×44px (`min-h-tactil`).
- **RN-49** — sin turno de caja abierto, el POS no puede cobrar; por eso el
  estado del botón es información crítica, no decorativa.
