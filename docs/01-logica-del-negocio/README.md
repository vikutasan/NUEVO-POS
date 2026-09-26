# 01 — Lógica del Negocio

> **Fase:** F3 (Comportamiento).
> **Fuente:** [`PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/01-logica-del-negocio/`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/README.md:239)

Aquí vivirán las **reglas de negocio** portadas del POS actual, cada una **con su test**.

## Contenido previsto

- `reglas-de-negocio.md` — las reglas (RN-01 a RN-73 según el PLANO; RN-01 a RN-81 según el
  plan de construcción — discrepancia registrada, se resuelve en F3).
- `deudas-conocidas.md` — las 5 deudas (DEUDA-01 a DEUDA-05).

## Regla de la fase

La unidad de migración **no es la regla: es regla + test**. No se acepta una regla sin prueba.
La puerta de F3 es la matriz `regla → test` completa.
