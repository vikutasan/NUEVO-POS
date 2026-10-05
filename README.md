# NUEVO POS — ERP R de Rico

> **FASE 0 — ANDAMIAJE.** Este repositorio es la **obra** del nuevo POS.
> El repositorio [`PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS`](../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/README.md:1)
> es el **plano**. Este repositorio es donde el plano se construye.

---

## REGLA DURA (INVIOLABLE)

> **NO SE TOCA EL ERP INSTALADO Y CORRIENDO.**
> **NO SE TOCA NINGUNO DE SUS MÓDULOS.**
> **NO SE MODIFICA NI UNA LÍNEA DEL POS ACTUAL.**

El ERP vive en `../ERP-R-DE-RICO` y permanece intacto y operando.
Este repositorio es **separado** y **nuevo**. No importa, no referencia y no depende
del ERP actual. Si algo de este repositorio necesita un dato del ERP, lo pide **por contrato**,
nunca leyendo su código ni su base de datos.

---

## Anclaje

| Concepto | Valor |
|---|---|
| **Plano** | [`PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS`](../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/README.md:1) |
| **Commit del ERP (V23)** | `5802f45` |
| **Ingeniería inversa sobre** | `fe9f6ed` (tag `v22-estable-fe9f6ed`) |
| **Ancla dual (IA)** | `c0c66fe` (v26.1) — ver [`ACTA_DE_RECONCILIACION_IA.md`](../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/07-ia-local/ACTA_DE_RECONCILIACION_IA.md:1) |
| **Fase actual** | **F0 — Andamiaje** |
| **Auditoría de brechas** | [`HALLAZGOS_AUDITORIA_BRECHAS_POS.md`](../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/HALLAZGOS_AUDITORIA_BRECHAS_POS.md:1) — **LECTURA OBLIGATORIA** antes de "rescatar" funcionalidad del viejo POS |

Cualquier divergencia posterior del ERP es una decisión consciente, no un accidente.

---

## Las 7 fases de construcción

El orden es **de adentro hacia afuera**. Ninguna fase empieza sin que la **puerta** de la
anterior esté en verde. Ver [`PLAN_DE_CONSTRUCCION_DEL_NUEVO_POS.md`](../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_CONSTRUCCION_DEL_NUEVO_POS.md:46).

| Fase | Nombre | Salida | Puerta de salida |
|------|--------|--------|------------------|
| **F0** | **Andamiaje** | Repo nuevo, CI, esqueleto de carpetas | CI en verde con 0 tests + **5 greps activos** |
| F1 | Cimiento de datos | 17 tablas con UUID/UTC/ledger | Migraciones aplican y revierten limpias |
| F2 | Frontera (contratos) | 17 contratos entre módulos | Test de arquitectura: 0 imports ajenos |
| F3 | Comportamiento (reglas) | 81 reglas portadas **con sus tests** | Matriz `regla → test` completa |
| F4 | Guardianes | Test guardián por regla crítica | CI falla si se viola una regla crítica |
| F5 | Superficie (interfaces) | 26 interfaces del POS | Paridad funcional con el POS actual |
| F6 | Consolidación (central) | Outbox + contrato de consolidación | Sync de cierre de día verificada |

---

## Estructura del repositorio

```
NUEVO-POS/
├── README.md                          # Este archivo (regla dura + anclaje)
├── package.json                       # Scripts de CI (lint, test, guards)
├── .github/workflows/ci.yml           # Pipeline de CI (F0)
├── scripts/
│   └── guards.sh                      # Los 5 greps de estándares (§7.4)
├── apps/                              # La obra (código de producción)
│   ├── pos/                           # El POS (frontend)
│   ├── api/                           # El API del POS (backend)
│   └── shared/                        # Utilidades compartidas (timezone, money)
├── packages/                          # Paquetes internos
│   ├── database/                      # Esquema y migraciones
│   └── vision/                        # Visión por computadora
└── docs/                              # Espejo local del plano (referencia)
    ├── 01-logica-del-negocio/         # Las reglas (RN-01 a RN-73)
    ├── 02-contratos/                  # Los 17 contratos
    ├── 03-modelo-de-datos/            # Las 17 tablas
    ├── 04-estructura-de-modulos/      # La estructura de módulos
    └── 05-plan-de-construccion/       # El plan de construcción
```

> **Nota de conteo.** El plano fundacional ([`PLANO ARQUITECTONICO PARA EL NUEVO POS.md`](../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/PLANO%20ARQUITECTONICO%20PARA%20EL%20NUEVO%20POS.md:838))
> declara **73 reglas (RN-01 a RN-73)**. El plan de construcción declara **81 reglas (RN-01 a RN-81)**.
> Esta discrepancia entre documentos fuente está **registrada** y se resolverá en F3 (Comportamiento),
> cuando se haga la matriz `regla → test`. No se asume ninguna cifra hasta entonces.

---

## Los 5 greps de estándares (activos desde F0)

Un estándar que no se ejecuta es una opinión. Estos greps convierten los estándares en
**puertas de máquina**. Ver [`PROMPT_DEL_ARQUITECTO_DEL_NUEVO_POS.md`](../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/06-prompt-del-arquitecto/PROMPT_DEL_ARQUITECTO_DEL_NUEVO_POS.md:308) §7.4.

| Grep | Estándar | Detecta |
|------|----------|---------|
| `except.*pass` | E-05 | Silencios en ruta crítica |
| `console\.log` | E-15 | Logs olvidados |
| `TODO` sin formato | E-15 | TODOs sin formato declarado |
| `Float` en `models.py` | E-09 | Dinero en Float |
| `DateTime()` en `models.py` | E-10 | Tiempo naive |

Se ejecutan con `npm run guards`. Si un grep no puede correr en F0, la fase **no cierra**.

---

## Cómo se verifica F0

```bash
npm run lint     # Lint del código (0 errores)
npm run test     # Tests (0 tests en F0 — el pipeline funciona vacío)
npm run guards   # Los 5 greps de estándares (0 coincidencias)
```

La puerta de F0 está en verde cuando los tres comandos pasan y el repo del ERP sigue
con `git status` limpio en HEAD `5802f45`.

---

*Nuevo POS — FASE 0 (Andamiaje). Anclado al commit `5802f45` (V23) del ERP.*
