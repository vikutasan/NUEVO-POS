# FICHA — DEUDA-B: Compuerta de contrato de la paleta de post-its

**Fecha:** 10 Oct 2026
**Origen:** deuda (b) registrada en `DECISIONES_ARQUITECTONICAS_DEL_NUEVO_POS.md` §7
**Estado:** ✅ CERRADA

---

## 1. El problema (la deuda)

La paleta de colores de los post-its del pizarrón vive **duplicada** en dos
lugares:

| Lado | Archivo | Rol |
|------|---------|-----|
| Frontend | `apps/pos/src/constants/paletaPostIts.js` | **Fuente de verdad.** El gestor de terminales ofrece estos 21 tonos. |
| Backend | `apps/api/routers/terminals.py` (`PALETA_POST_ITS`) | **Espejo.** `guardar_config` valida que el color recibido pertenezca a esta tupla. |

El propio comentario del backend lo admitía:

> *"Si se cambia la paleta, hay que cambiar AMBOS lados."*

Eso es un **acoplamiento manual**. El día que alguien agregue un tono solo en el
frontend, el gestor lo ofrecerá, el usuario lo elegirá, y el backend responderá
**400** con un mensaje confuso (*"el color no pertenece a la paleta"*) — un
síntoma que no apunta a la causa real (la desincronización).

No era un parche: era una **fragilidad conocida y aceptada**. Esta ficha la
cierra con una compuerta que la vuelve imposible de ignorar.

---

## 2. Por qué la compuerta es de FRONTEND (y no de pytest)

**Restricción dura de infraestructura:** el servicio `api` en
`docker-compose.yml` monta **únicamente** `./apps/api:/app`. El archivo del
frontend **no existe** dentro del contenedor, así que un test de pytest **no
puede leerlo**.

El test de vitest, en cambio, corre en `apps/pos` con acceso completo al
sistema de archivos de Node, y **sí puede leer** el `.py` del backend. Por eso
la compuerta vive en el frontend y lee el backend — no al revés.

```
apps/pos/src/constants/paletaPostIts.contrato.test.jsx
   ├── importa PALETA_POST_ITS  ←  ./paletaPostIts.js        (fuente de verdad)
   └── lee y parsea             ←  ../api/routers/terminals.py (espejo)
```

---

## 3. Qué verifica la compuerta

El archivo `paletaPostIts.contrato.test.jsx` extrae la tupla del backend con
una expresión regular:

```js
/PALETA_POST_ITS\s*:\s*tuple\[str,\s*\.\.\.\]\s*=\s*\(([\s\S]*?)\)/
```

…y luego recolecta todos los literales `"bg-..."`. Con eso afirma **4 cosas**:

1. **Misma cantidad** de colores en ambos lados.
2. **Exactamente los mismos colores, en el mismo orden** (`toEqual`).
3. **Sin duplicados** en ninguno de los dos lados.
4. **21 tonos** — el tamaño acordado con el diseño.

Si la constante se renombra o se mueve, el test **no falla en silencio**: lanza
un error explícito que dice dónde buscar y qué actualizar.

---

## 4. Prueba de que la compuerta es bidireccional

Una compuerta que nunca puede fallar no sirve. Se verificó **en ambos sentidos**:

| Escenario | Resultado |
|-----------|-----------|
| Paletas sincronizadas | ✅ 4/4 pasan |
| Se corrompe el backend (`bg-emerald-300` → `bg-emerald-999`) | ❌ Falla con el diff exacto: `- "bg-emerald-300"` / `+ "bg-emerald-999"` |
| Se restaura el backend | ✅ 4/4 pasan de nuevo |

El mensaje de fallo muestra **los dos arreglos completos**, así que se ve de
inmediato qué color sobra o falta.

---

## 5. Resultado

- **Suite frontend:** 75 archivos, **812 tests** ✅ (antes 808; +4 de esta compuerta).
- **Sin regresiones.**
- La deuda (b) del ADR §7 queda **cerrada**: la duplicación sigue existiendo
  (es inevitable sin un generador de código), pero ya **no puede divergir en
  silencio**.

---

## 6. Lo que NO se hizo (y por qué)

- **No se eliminó la duplicación.** Unificar la paleta en un solo lugar exigiría
  un paso de generación de código o exponerla por un endpoint; el costo supera
  el beneficio para 21 constantes estables. La compuerta es la solución
  proporcionada.
- **No se tocaron las deudas (a) y (c).** El usuario aceptó la recomendación de
  arreglar solo (b). La deuda (a) (nomenclatura de BUG-02/03) y la (c)
  (`_es_admin()` por convención) permanecen registradas en el ADR §7.
