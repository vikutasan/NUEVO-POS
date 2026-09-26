# 03 — Modelo de Datos

> **Fase:** F1 (Cimiento de datos).
> **Fuente:** [`MODELO_DE_DATOS_DEL_NUEVO_POS.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/MODELO_DE_DATOS_DEL_NUEVO_POS.md:1)

Aquí vivirá el modelo de las **17 tablas** del nuevo POS.

## Las 4 correcciones (C-01 a C-04)

- **C-01** — PK entero → **UUID** en todas las tablas.
- **C-02** — `DateTime` naive → **`DateTime(timezone=True)` UTC**.
- **C-03** — dinero en **`Numeric(12,2)`** (nunca `Float`).
- **C-04** — columna `version` para **bloqueo optimista**.

## Regla de la fase

El **ledger de inventario** es inmutable: el stock se deriva, no se sobrescribe.
La puerta de F1: las migraciones aplican y revierten limpias; ninguna columna de dinero es
`Float`; ningún `DateTime` es naive; el ledger rechaza un `UPDATE` directo.
