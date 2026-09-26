# 05 — Plan de Construcción

> **Fase:** Transversal (gobierna todas las fases).
> **Fuente:** [`PLAN_DE_CONSTRUCCION_DEL_NUEVO_POS.md`](../../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/05-plan-de-construccion/PLAN_DE_CONSTRUCCION_DEL_NUEVO_POS.md:1)

Este documento gobierna el orden de la obra. Las 7 fases y sus puertas:

| Fase | Nombre | Puerta de salida |
|------|--------|------------------|
| **F0** | **Andamiaje** | CI en verde con 0 tests + 5 greps activos |
| F1 | Cimiento de datos | Migraciones aplican y revierten limpias |
| F2 | Frontera (contratos) | Test de arquitectura: 0 imports ajenos |
| F3 | Comportamiento (reglas) | Matriz `regla → test` completa |
| F4 | Guardianes | CI falla si se viola una regla crítica |
| F5 | Superficie (interfaces) | Paridad funcional con el POS actual |
| F6 | Consolidación (central) | Sync de cierre de día verificada |

## Regla de avance

Ninguna fase empieza sin que la **puerta** de la anterior esté en verde.
Si una puerta falla, se corrige la fase actual; no se avanza "dejando pendiente".
