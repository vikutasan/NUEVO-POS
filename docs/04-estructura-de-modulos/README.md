# 04 — Estructura de Módulos

> **Fase:** Etapa 3 (pendiente en el plano).
> **Fuente:** [`PLANO ARQUITECTONICO PARA EL NUEVO POS.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/PLANO%20ARQUITECTONICO%20PARA%20EL%20NUEVO%20POS.md:849)

Aquí vivirá la estructura de módulos del nuevo POS: qué módulos existen, qué contrato expone
cada uno, y quién es dueño de qué tabla.

## Documentos de lecciones

- [`LECCIONES_DE_UI.md`](./LECCIONES_DE_UI.md) — **elementos transversales y ramas de
  retorno**: por qué un `return` temprano puede dejar fuera un toast/modal/banner, cómo
  diagnosticar «un aviso no aparece» y cómo propagar el error real del backend. Nace de BUG-05.

## Módulos ya decididos (fuera del alcance del POS)

| Módulo | Rol transversal | Estado |
|---|---|---|
| Vista General | Configuración del negocio | ✅ Decidido (DT-06) |
| Auditoría | Rastro de operaciones | ✅ Decidido (DT-05) |
| Almacenes | Ledger de inventario | ✅ Decidido (DT-04) |
| Seguridad / Perfiles | Identidad y permisos | ⏳ Por decidir |
| Estadísticas | Reportería | ⏳ Por decidir |
| Visión | Reconocimiento de imágenes | ⏳ Por decidir |
| **Clientes / CRM** | **Lealtad, promociones, tickets** | 🆕 Propuesto (Documento 13) |
| **Notificaciones** | **WhatsApp / e-mail** | 🆕 Propuesto (Documento 13) |
