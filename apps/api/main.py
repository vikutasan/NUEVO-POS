"""Punto de entrada HTTP del POS nuevo — P2.7 (cierre de la puerta P2).

Este es el archivo que faltaba: el frontend mínimo (P2.1–P2.6) llamaba a 4
endpoints que no existían. Aquí se montan.

Responsabilidades:
  1. Crear la app FastAPI.
  2. Permitir CORS desde el frontend (puerto 5100) — el POS nuevo es un SPA
     servido por Vite en desarrollo.
  3. Traducir `ReglaViolada` a su código HTTP (400/403/404/409). El dominio
     lanza reglas; la capa HTTP las convierte en respuestas. Así el dominio
     nunca conoce HTTP y la frontera se respeta.
  4. Montar los routers de catálogo y POS.
  5. Exponer `GET /health` para que docker-compose pueda verificar que el
     servidor está vivo.

Regla dura: este servidor NUNCA toca el ERP. Su base de datos es `nuevo_pos`,
aislada. Su único consumidor es el frontend del POS nuevo.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import catalog, pos, ia
from rules import ReglaViolada

app = FastAPI(
    title="Nuevo POS — API",
    description=(
        "Capa HTTP del POS nuevo. Materializa los contratos de la FASE 2 "
        "sobre los modelos de la FASE 1 y las reglas de la FASE 3."
    ),
    version="0.1.0",
)

# ---------------------------------------------------------------------------
# CORS — el frontend vive en otro puerto (5100) durante el desarrollo.
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5100",
        "http://127.0.0.1:5100",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Frontera dominio → HTTP: una `ReglaViolada` conserva su código de error.
# ---------------------------------------------------------------------------
@app.exception_handler(ReglaViolada)
async def _manejador_regla_violada(_: Request, exc: ReglaViolada) -> JSONResponse:
    """Convierte una violación de regla de negocio en su respuesta HTTP."""
    return JSONResponse(
        status_code=exc.codigo,
        content={"detail": exc.mensaje, "regla": exc.regla},
    )


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(catalog.router)
app.include_router(pos.router)
app.include_router(ia.router)


@app.get("/health", tags=["salud"])
async def health() -> dict[str, str]:
    """Sonda de vida para docker-compose y para el frontend."""
    return {"status": "ok", "servicio": "nuevo-pos-api"}
