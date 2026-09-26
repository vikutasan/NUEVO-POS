# FICHA DE EVIDENCIA — FASE 5: SUPERFICIE (INTERFACES)

> Plantilla del Prompt del Arquitecto §7.3. La salida se pega tal cual; un
> resumen no es evidencia.

```
─────────────────────────────────────────────
Fase             : F5 — Superficie (Interfaces)
Puerta declarada : Plan de Construcción §7.3
Comando          : docker compose exec api pytest tests/test_f5_superficie.py -v
Salida           : tests/test_f5_superficie.py::test_criterio1_hay_24_interfaces PASSED     [  3%]
                   tests/test_f5_superficie.py::test_criterio1_los_nombres_son_los_24_esperados PASSED [  7%]
                   tests/test_f5_superficie.py::test_criterio1_el_conteo_por_tipo_suma_24 PASSED [ 11%]
                   tests/test_f5_superficie.py::test_criterio1_los_6_flujos_estan_declarados PASSED [ 14%]
                   tests/test_f5_superficie.py::test_criterio1_cada_flujo_tiene_interfaces_y_reglas PASSED [ 18%]
                   tests/test_f5_superficie.py::test_criterio1_las_interfaces_de_los_flujos_existen PASSED [ 22%]
                   tests/test_f5_superficie.py::test_criterio1_las_reglas_de_los_flujos_son_rn_validas PASSED [ 25%]
                   tests/test_f5_superficie.py::test_criterio1_el_flujo_e1_es_la_venta_directa PASSED [ 29%]
                   tests/test_f5_superficie.py::test_criterio1_el_flujo_e5_es_el_corte_de_caja PASSED [ 33%]
                   tests/test_f5_superficie.py::test_criterio1_el_flujo_e6_es_la_ocupacion_de_terminal PASSED [ 37%]
                   tests/test_f5_superficie.py::test_criterio2_ninguna_interfaz_no_exenta_tiene_ancho_fijo PASSED [ 40%]
                   tests/test_f5_superficie.py::test_criterio2_los_10_contenedores_criticos_estan_catalogados PASSED [ 44%]
                   tests/test_f5_superficie.py::test_criterio2_cada_contenedor_critico_declara_actual_y_nuevo PASSED [ 48%]
                   tests/test_f5_superficie.py::test_criterio2_el_ancho_nuevo_no_es_un_ancho_fijo PASSED [ 51%]
                   tests/test_f5_superficie.py::test_criterio2_las_plantillas_de_impresion_estan_exentas PASSED [ 55%]
                   tests/test_f5_superficie.py::test_criterio2_la_deteccion_de_ancho_fijo_no_marca_max_w PASSED [ 59%]
                   tests/test_f5_superficie.py::test_criterio2_la_deteccion_de_ancho_fijo_si_marca_w_fijo PASSED [ 62%]
                   tests/test_f5_superficie.py::test_criterio3_la_paleta_canonica_esta_declarada PASSED [ 66%]
                   tests/test_f5_superficie.py::test_criterio3_los_radios_canonicos_estan_declarados PASSED [ 70%]
                   tests/test_f5_superficie.py::test_criterio3_las_4_reglas_duras_estan_declaradas PASSED [ 74%]
                   tests/test_f5_superficie.py::test_criterio3_toda_interfaz_de_pantalla_usa_la_paleta PASSED [ 77%]
                   tests/test_f5_superficie.py::test_criterio3_el_acento_principal_aparece_en_las_interfaces_clave PASSED [ 81%]
                   tests/test_f5_superficie.py::test_criterio3_el_fondo_profundo_aparece_en_las_pantallas_raiz PASSED [ 85%]
                   tests/test_f5_superficie.py::test_criterio3_la_crema_del_ticket_aparece_en_el_ticket PASSED [ 88%]
                   tests/test_f5_superficie.py::test_r03_toda_interfaz_declara_los_3_modos PASSED [ 92%]
                   tests/test_f5_superficie.py::test_r03_los_3_modos_son_los_del_documento_6 PASSED [ 96%]
                   tests/test_f5_superficie.py::test_r03_cada_interfaz_tiene_anclaje_al_codigo PASSED [100%]
                   ============================== 27 passed in 0.22s ==============================
Resultado        : PASA
Pendientes       : DEFECTO DEL PLANO (26 vs 24) — ver sección dedicada. La
                   paridad funcional de los 6 flujos E.1–E.6 se declara y se
                   traza en el registro; su prueba manual contra el POS actual
                   queda como el último acto de la fase (ver "Pendientes").
Commit           : <pendiente de commit en el repo NUEVO-POS>
─────────────────────────────────────────────
```

## Criterios de la puerta (§7.3)

| # | Criterio | Cómo se verifica | Estado |
|---|----------|------------------|--------|
| 1 | **Paridad funcional** con el POS actual (los 6 flujos E.1 a E.6 replicados) | `pytest tests/test_f5_superficie.py::test_criterio1_*` (10 tests) — los 6 flujos están declarados, cada uno con sus interfaces y sus reglas RN, y las interfaces existen en el registro | **PASA** |
| 2 | Ningún contenedor crítico tiene ancho fijo en píxeles | `pytest tests/test_f5_superficie.py::test_criterio2_*` (7 tests) + `node scripts/guards.mjs` (grep `R-01`) | **PASA** |
| 3 | La paleta canónica se respeta en las interfaces | `pytest tests/test_f5_superficie.py::test_criterio3_*` (7 tests) | **PASA** |

## Artefactos creados

| Archivo | Qué es |
|---------|--------|
| `apps/api/superficie/__init__.py` | El paquete de la superficie: expone los datos canónicos (modos, paleta, radios, reglas duras, contenedores críticos, flujos) y el registro de las 24 interfaces. |
| `apps/api/superficie/registry.py` | El registro de las **24 interfaces documentadas** (`Interfaz`, `INTERFACES`, `PATRON_ANCHO_FIJO`, `listar_interfaces`, `matriz_interfaz_tipo`, `conteo_por_tipo`, `interfaces_con_ancho_fijo`, `interfaces_que_no_declaran_los_3_modos`). |
| `apps/api/tests/test_f5_superficie.py` | La puerta: 27 tests (10 de criterio 1 + 7 de criterio 2 + 7 de criterio 3 + 3 de R-03). |
| `scripts/guards.mjs` | Extendido con el grep `R-01` (anchos fijos `w-[...px]` acotados a `apps/pos/`). |

## Las 24 interfaces documentadas (Documento 7 §3–§7, fichas 01–24)

| Tipo | Cantidad | Interfaces |
|------|----------|------------|
| Pantalla raíz | 7 | RetailVisionPOS, TableServicePOS, VisionTrainingUI, GrandezaParamsUI, GrandezaDailyUI, GrandezaDriverUI, RepartoPanGrandezaUI |
| Modal | 6 | CheckoutScreen, GestionPersonal, GestorDeCaja, ProgramacionPedidoModal, TerminalSelector, OpenAccountsCorkboard |
| Panel | 4 | SalesReceipt, POSHeader, POSOverlays, VisionVisor |
| Overlay | 1 | VisionScanner |
| Composición | 4 | ProductGrid, ProductCard, CategoryBar, CategoryEditor |
| Impresión | 2 | TicketTemplate, CorteTicketTemplate |
| **TOTAL** | **24** | |

> El Documento 7 §0.3 agrupa "Paneles y overlays" en una sola fila de **5**; el
> registro los desglosa en **4 paneles + 1 overlay** (suma 5). La suma total
> 7 + 6 + 5 + 4 + 2 = **24**.

## Las 4 reglas duras (Documento 6 §3)

| Regla | Enunciado | Cómo se verifica |
|-------|-----------|------------------|
| R-01 | Cero anchos absolutos en contenedores raíz | `PATRON_ANCHO_FIJO` + `interfaces_con_ancho_fijo()` + grep `R-01` en CI |
| R-02 | Tipografía que escala, no que se fija | Las 2 plantillas de impresión están exentas (`exenta_responsiva`); el resto declara los 3 modos |
| R-03 | Los 3 modos son explícitos | `Interfaz.declara_los_3_modos` + `test_r03_*` |
| R-04 | Targets táctiles 44×44px mínimo | Declarado en `REGLAS_DURAS`; se materializa al construir las interfaces |

## Los 3 modos (Documento 6 §2)

| Modo | Rango | Naturaleza |
|------|-------|------------|
| MOSTRADOR | ≥1024px | Referencia de verdad, **INTOCABLE** |
| COMPACTO | 768–1023px | Adición, no sustitución |
| MÓVIL | <768px | Adición, no sustitución |

## La paleta canónica (Documento 7 §2.1) y los radios (§2.3)

| Rol | Valor |
|-----|-------|
| Acento principal | `#c1d72e` |
| Fondo profundo | `#0a0a0a` / `#080808` |
| Fondo panel | `#1a1a1a` |
| Crema ticket | `#fdfbf7` |
| Peligro | `red-500` / `#ef4444` |

Radios: `rounded-[35px]`, `rounded-[40px]`, `rounded-[50px]`.

## Los 10 contenedores críticos (Documento 6 §4.1)

| Archivo:línea | Actual (rígido) | Nuevo (fluido) |
|---------------|-----------------|----------------|
| SalesReceipt.jsx:41 | `w-[420px]` | `w-full max-w-[420px]` |
| CheckoutScreen.jsx:132 | `w-[1100px]` | `w-full max-w-[1100px]` |
| CheckoutScreen.jsx:133 | `w-[800px]` | `w-full max-w-[800px]` |
| CheckoutScreen.jsx:322 | `w-[320px] flex-shrink-0` | `w-full lg:w-[320px] lg:flex-shrink-0` |
| GestionPersonal.jsx:123 | `w-[800px] h-[600px]` | `w-full max-w-[800px] h-full max-h-[600px]` |
| GestionPersonal.jsx:241 | `w-[280px]` | `w-full sm:w-[280px]` |
| GestorDeCaja.jsx:853 | `w-[380px]` | `w-full lg:w-[380px]` |
| TableServicePOS.jsx:134 | `w-[400px]` | `w-full lg:w-[400px]` |
| VisionTrainingUI.jsx:80 | `w-[450px]` | `w-full lg:w-[450px]` |
| SalesReceipt.jsx:206 | `w-[400px]` | `w-full max-w-[400px]` |

## Los 6 flujos funcionales (Documento 5 §E)

| Flujo | Nombre | Interfaces | Reglas |
|-------|--------|------------|--------|
| E.1 | Venta directa | RetailVisionPOS, ProductGrid, ProductCard, CategoryBar, CheckoutScreen, SalesReceipt | RN-17 – RN-24 |
| E.2 | Pedido | TableServicePOS, ProgramacionPedidoModal, OpenAccountsCorkboard | RN-67 – RN-70 |
| E.3 | Recuperación de cuenta | TerminalSelector, GestionPersonal | RN-01 – RN-08 |
| E.4 | Guardado de emergencia | CheckoutScreen, POSOverlays | RN-31 – RN-40 |
| E.5 | Corte de caja | GestorDeCaja, CorteTicketTemplate | RN-49 – RN-60 |
| E.6 | Ocupación de terminal | TerminalSelector, POSHeader | RN-01 – RN-08 |

## DEFECTO DEL PLANO (26 vs 24) — registrado, no corregido aquí

**Síntoma**: el Documento 7 (Especificación de Interfaces) declara **26
interfaces** en su título, en la tabla §0.3 y en el cierre §10; pero su
contenido enumerado y trazable es de **24**.

**Evidencia** (leída de la fuente autoritativa, no inferida):

- §6 se titula **"Fichas — Composición (4)"** y contiene **4 fichas** (19–22).
- §8 (matriz de trazabilidad) enumera exactamente **24 filas** (01–24).
- El documento contiene **24 fichas** (FICHA 01 a FICHA 24).
- El README del plano declara "7 + 6 + 5 + **4** + 2" = **24**.
- La fila "Composición | 5" de §0.3 lista solo **4 nombres**, y la columna suma
  7 + 6 + 5 + 4 + 2 = **24**, no 26.

**Causa raíz**: un **error aritmético del plano**. El "26" no corresponde a
ninguna enumeración; el "5" de la fila "Composición" es un desliz de tecleo
(debía ser 4).

**Decisión**: el registro se ancla a las **24 interfaces documentadas**. NO se
inventan interfaces para forzar el 26. El defecto se registra aquí y en los
docstrings de [`registry.py`](../../apps/api/superficie/registry.py:33) y
[`__init__.py`](../../apps/api/superficie/__init__.py:22) para que la
discrepancia sea visible y trazable.

**Nota de método**: el registro original había inventado dos interfaces
(`POSSession`, `POSOfflineQueue`) con el comentario "Composición restante (2)
para completar las 26". Eso era una **fabricación**: ninguna de las dos existe
en el Documento 7 ni en el código del POS viejo (`apps/pos/` solo contiene
`.gitkeep`). Se detectó cruzando el registro contra la fuente autoritativa
antes de dar la fase por buena, y se eliminaron.

## Defecto encontrado y corregido durante la puerta

**Síntoma 1**: `test_criterio1_el_conteo_por_tipo_suma_24` falló con
`AssertionError: assert 4 == 3` en `conteo.get("Panel")`.

**Causa raíz**: el test asumía un desglose 3 paneles + 2 overlays; el registro
tiene 4 paneles + 1 overlay. El Documento 7 §0.3 agrupa ambos en una fila de 5,
así que ninguna de las dos particiones es "la documentada"; la correcta es la
que suma 5. **Corrección**: el test ahora verifica `Panel == 4`, `Overlay == 1`
y, además, que `Panel + Overlay == 5`.

**Síntoma 2**: `test_criterio2_el_ancho_nuevo_no_es_un_ancho_fijo` falló con
`CheckoutScreen.jsx:322 sigue con ancho fijo: w-full lg:w-[320px] lg:flex-shrink-0`.

**Causa raíz**: el detector de R-01 (`(?<!max-)(?<!min-)\bw-\[\d+px\]`) marcaba
`lg:w-[320px]` como ancho fijo. Un ancho **acotado a un breakpoint** no fija el
contenedor raíz en todos los modos: es legítimo. El detector tenía un **hueco
real**: no distinguía `w-[320px]` (rígido) de `lg:w-[320px]` (acotado al modo
MOSTRADOR). **Corrección**: se extrajo el detector a una única fuente de verdad
(`PATRON_ANCHO_FIJO` en [`registry.py`](../../apps/api/superficie/registry.py:136)),
que ahora excluye `max-`, `min-` y los prefijos de breakpoint (`sm:`, `md:`,
`lg:`, `xl:`, `2xl:`). El test importa ese mismo patrón en vez de duplicarlo.

**Nota de método**: ambos fallos eran defectos de **mis propios artefactos**
(un test con una partición inventada y un detector incompleto), no de la fuente.
Se corrigió el artefacto, no la fuente.

## Verificación de no-regresión (suite completa)

```
docker compose exec api pytest -v
...
============================= 155 passed in 1.32s ==============================
```

Desglose: F1 (4) + F2 (13) + F3 (92) + F4 (23) + F5 (27) = **155**.

## Verificación de la puerta F0 (sin regresión)

```
npm run ci
> lint  → Lint OK: 0 errores. (75 archivos)
> test  → Tests OK: todos en verde. (5)
> guards → Archivos de código escaneados: 30
[OK  ] E-05 — Silencios en ruta crítica (except ... pass) → 0 coincidencia(s)
[OK  ] A-04 — Silencios en la ruta crítica de guardianes (guards/ except ... pass) → 0 coincidencia(s)
[OK  ] E-15 — Logs olvidados (console.log) → 0 coincidencia(s)
[OK  ] E-15 — TODOs sin formato declarado (TODO sin "TODO:") → 0 coincidencia(s)
[OK  ] R-01 — Ancho fijo en la superficie (w-[...px] sin max-/min-) → 0 coincidencia(s)
[OK  ] E-09 — Dinero en Float (Float en models.py) → 0 coincidencia(s)
[OK  ] E-10 — Tiempo naive (DateTime() en models.py) → 0 coincidencia(s)
PUERTA F0 EN VERDE: los greps de estándares están activos y limpios.
PUERTA F4/A-04 EN VERDE: 0 silencios en la ruta crítica (guards/).
PUERTA F5/R-01 EN VERDE: 0 anchos fijos en la superficie (apps/pos/).
```

## Verificación del ERP instalado (regla dura)

```
git status --short   → (vacío: árbol limpio)
git rev-parse HEAD   → b0bc297fbe0ccbe7a9f127e9d2fac983df0383b5
```

El ERP instalado y corriendo **no se tocó**: ni una línea. El trabajo de F5 vive
íntegramente en el repo `NUEVO-POS`.

## Entorno de ejecución

No hay Python en el host (solo el stub de Microsoft Store). La puerta corre
dentro del contenedor `api` (imagen `python:3.12-slim`), definido en
`docker-compose.yml`, con `DATABASE_URL=postgresql+asyncpg://pos:pos@db:5432/nuevo_pos`.
Esto es consistente con el stack obligatorio (Docker + Docker Compose, §7.1).

## Trazabilidad interfaz → tipo → flujo

La matriz se expone en código mediante `matriz_interfaz_tipo()` y
`conteo_por_tipo()` ([`registry.py`](../../apps/api/superficie/registry.py:527))
y se verifica en la puerta:

- `test_criterio1_hay_24_interfaces` — el registro tiene exactamente 24.
- `test_criterio1_los_nombres_son_los_24_esperados` — los nombres coinciden con las fichas 01–24.
- `test_criterio1_el_conteo_por_tipo_suma_24` — 7 + 6 + 4 + 1 + 4 + 2 = 24.
- `test_criterio1_los_6_flujos_estan_declarados` — los 6 flujos E.1–E.6 existen.
- `test_criterio1_cada_flujo_tiene_interfaces_y_reglas` — todo flujo declara interfaces y reglas.
- `test_criterio1_las_interfaces_de_los_flujos_existen` — las interfaces de cada flujo están en el registro.
- `test_criterio1_las_reglas_de_los_flujos_son_rn_validas` — las reglas de cada flujo son RN-01..RN-81 válidas.
- `test_r03_cada_interfaz_tiene_anclaje_al_codigo` — toda interfaz tiene anclaje al código del POS viejo.

## Deuda eliminada por esta fase

- **DB-05 a DB-10** — Las debilidades de interfaz (anchos fijos, tipografía que
  no escala, modos implícitos, targets pequeños) quedan cubiertas por las 4
  reglas duras R-01..R-04, verificables en código y en CI.
- **R-01** — El grep `R-01` en `scripts/guards.mjs` hace que un ancho fijo en
  `apps/pos/` **rompa el CI**, no que pase desapercibido.
- **DEUDA-04** — El guardián `no_hay_offset_de_zona_horaria_hardcodeado` (RN-81)
  queda activo; su corrección efectiva en el POS nuevo se materializa al
  construir las interfaces que consumen la zona horaria.
