# 02 — Contratos

> **Fase:** F2 (Frontera).
> **Fuente:** [`CONTRATOS_ENTRE_MODULOS_DEL_NUEVO_POS.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/CONTRATOS_ENTRE_MODULOS_DEL_NUEVO_POS.md:1)

Aquí vivirán los **17 contratos** entre módulos (más los 2 nuevos #18 y #19 de la
propuesta CRM + Notificaciones).

## Los 3 principios

- **P-01** — El dueño de la tabla es el único que la escribe.
- **P-02** — El consumidor pide por operación, no por tabla.
- **P-03** — El contrato es estable; la tabla es libre.

## Regla de la fase

El POS **no lee tablas ajenas**. Solo contratos. La puerta de F2 es el test de arquitectura:
**0 imports** del POS a modelos ajenos.
