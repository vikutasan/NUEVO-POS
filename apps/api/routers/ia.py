"""Router de IA — Extractor de Estética Visual (Fase 1.5).

Endpoints:
  POST /ia/extraer-estetica  — recibe imagen, devuelve 11 tokens + contraste
  POST /ia/guardar-tema      — guarda un tema extraído y lo asigna a un módulo
  GET  /ia/temas-generados   — lista los temas generados por IA

El extractor usa el gateway de IA (AI_HABILITADA + AI_LOCAL_URL) para
analizar la imagen. Si la IA no está disponible → 503.

Regla dura: este router NUNCA toca el ERP.
Ubicación temporal: vive aquí mientras el módulo de IA no exista (ver §0.3).

28 Sep 2026.
"""

from __future__ import annotations

import base64
import json
import os
import re
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter(prefix="/ia", tags=["ia"])

# ---------------------------------------------------------------------------
# Configuración del gateway de IA
# ---------------------------------------------------------------------------
AI_HABILITADA = os.getenv("AI_HABILITADA", "false").lower() == "true"
AI_LOCAL_URL = os.getenv("AI_LOCAL_URL", "http://localhost:11434")
AI_LOCAL_MODELO = os.getenv("AI_LOCAL_MODELO", "llava")
AI_LOCAL_TIMEOUT = int(os.getenv("AI_LOCAL_TIMEOUT", "60"))

# ---------------------------------------------------------------------------
# El prompt estructurado — basado en BRIEF_DE_EXTRACCION_VISUAL.md §5.
# ---------------------------------------------------------------------------
PROMPT_EXTRACCION = """Analiza esta imagen de interfaz de usuario (UI) y extrae los siguientes valores visuales.
Responde SOLO con JSON válido, sin explicaciones adicionales.

Extrae:
1. "acento": el color principal de acento (botones, precios, elementos activos). Formato hex (#RRGGBB).
2. "fondo_profundo": el color de fondo más oscuro/predominante. Formato hex.
3. "fondo_profundo_alt": un segundo tono de fondo (para scrollbar, bordes). Formato hex.
4. "fondo_panel": el color de las tarjetas/paneles sobre el fondo. Formato hex.
5. "crema_ticket": el color del texto principal (claro si fondo oscuro, oscuro si fondo claro). Formato hex.
6. "peligro": el color para alertas/errores/eliminar. Formato hex. Si no hay uno visible, usa #ef4444.
7. "radio_pequeno": el radio de borde más pequeño visible (en px). Ej: "12px".
8. "radio_medio": el radio medio. Ej: "20px".
9. "radio_grande": el radio más grande (botones grandes, paneles). Ej: "35px".
10. "fuente_ui": el nombre de la fuente que más se parece a la de la UI. Elige UNA de: Inter, Roboto, Montserrat, Nunito, Poppins.
11. "fuente_ticket": siempre "ui-monospace".

Además:
12. "sombras": "suaves" | "pronunciadas" | "sin sombras"
13. "bordes": "con bordes" | "sin bordes visibles" | "bordes sutiles"
14. "densidad": "compacta" | "cómoda" | "espaciosa"
15. "iconos": "línea" | "sólido" | "mixto"
16. "adjetivos": 3 adjetivos que describan la sensación visual, en español.

Para cada color (1-6), incluye un campo "confianza" (0-100) indicando qué tan seguro estás del valor.

Responde con este formato JSON exacto:
{
  "tokens": {
    "acento": {"hex": "#...", "confianza": 85},
    "fondo_profundo": {"hex": "#...", "confianza": 90},
    "fondo_profundo_alt": {"hex": "#...", "confianza": 70},
    "fondo_panel": {"hex": "#...", "confianza": 80},
    "crema_ticket": {"hex": "#...", "confianza": 90},
    "peligro": {"hex": "#...", "confianza": 60}
  },
  "forma": {
    "radio_pequeno": "..px",
    "radio_medio": "..px",
    "radio_grande": "..px"
  },
  "tipografia": {
    "fuente_ui": "...",
    "fuente_ticket": "ui-monospace"
  },
  "extras": {
    "sombras": "...",
    "bordes": "...",
    "densidad": "...",
    "iconos": "...",
    "adjetivos": ["...", "...", "..."]
  }
}"""


# ---------------------------------------------------------------------------
# Utilidades de conversión (espejo del theme-engine en Python)
# ---------------------------------------------------------------------------
def hex_a_canales_rgb(hex_color: str) -> str:
    """Convierte #RRGGBB a 'R G B'. Ej: '#c1d72e' → '193 215 46'."""
    limpio = hex_color.lstrip("#")
    if len(limpio) == 3:
        limpio = limpio[0] * 2 + limpio[1] * 2 + limpio[2] * 2
    if len(limpio) == 8:
        limpio = limpio[:6]
    r, g, b = int(limpio[0:2], 16), int(limpio[2:4], 16), int(limpio[4:6], 16)
    return f"{r} {g} {b}"


def luminancia_relativa(canales: str) -> float:
    """Luminancia relativa WCAG 2.1."""
    r, g, b = [int(x) for x in canales.split()]

    def lin(c: int) -> float:
        s = c / 255
        return s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4

    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def ratio_contraste(a: str, b: str) -> float:
    """Ratio de contraste entre dos colores (canales RGB)."""
    la, lb = luminancia_relativa(a), luminancia_relativa(b)
    claro, oscuro = max(la, lb), min(la, lb)
    return (claro + 0.05) / (oscuro + 0.05)


def validar_contraste_tema(tokens: dict) -> dict:
    """Valida los 5 pares de contraste WCAG AA."""
    resultados = []
    problemas = []

    pares = [
        ("texto/fondo-profundo", tokens["crema_ticket"], tokens["fondo_profundo"], 4.5),
        ("texto/fondo-panel", tokens["crema_ticket"], tokens["fondo_panel"], 4.5),
        ("acento/fondo-profundo", tokens["acento"], tokens["fondo_profundo"], 3.0),
        ("acento/fondo-panel", tokens["acento"], tokens["fondo_panel"], 3.0),
        ("peligro/acento", tokens["peligro"], tokens["acento"], 1.5),
    ]

    for nombre, color_a, color_b, minimo in pares:
        ratio = ratio_contraste(color_a, color_b)
        pasa = ratio >= minimo
        resultados.append({"par": nombre, "ratio": round(ratio, 2), "minimo": minimo, "pasa": pasa})
        if not pasa:
            problemas.append(f"{nombre}: {ratio:.2f}:1 (mínimo {minimo}:1)")

    return {"valido": len(problemas) == 0, "resultados": resultados, "problemas": problemas}


# ---------------------------------------------------------------------------
# Modelos de respuesta
# ---------------------------------------------------------------------------
class TokenExtraido(BaseModel):
    valor: str  # canales RGB: "193 215 46"
    hex: str  # "#c1d72e"
    confianza: int  # 0-100


class ContrasteResultado(BaseModel):
    par: str
    ratio: float
    minimo: float
    pasa: bool


class ExtraccionRespuesta(BaseModel):
    tokens: dict[str, TokenExtraido]
    forma: dict[str, str]
    tipografia: dict[str, dict]
    contraste: dict
    extras: dict
    advertencias: list[dict]


class GuardarTemaRequest(BaseModel):
    nombre: str
    modulo_destino: str
    tokens: dict[str, str]  # canales RGB
    forma: Optional[dict] = None
    tipografia: Optional[dict] = None
    extras: Optional[dict] = None
    asignado_como: Optional[str] = None  # "default" | "opcion_1" | "opcion_2" | null


# ---------------------------------------------------------------------------
# Almacén en memoria (temporal hasta que la tabla temas_generados exista)
# ---------------------------------------------------------------------------
_temas_generados: list[dict] = []

CATALOGO_FUENTES = ["Inter", "Roboto", "Montserrat", "Nunito", "Poppins"]
MODULOS_CONOCIDOS = ["pos", "estadisticas", "almacenes", "heladeria", "vista_general"]


# ---------------------------------------------------------------------------
# POST /ia/extraer-estetica
# ---------------------------------------------------------------------------
@router.post("/extraer-estetica", response_model=ExtraccionRespuesta)
async def extraer_estetica(
    imagen: UploadFile = File(..., description="Imagen JPG/PNG de referencia (≤5 MB)"),
    modulo_destino: str = Form(..., description="Módulo destino: pos, estadisticas, etc."),
):
    """Extrae los 11 tokens de estética visual de una imagen usando IA.

    Reglas del extractor (EX-01 a EX-05):
    - EX-01: La IA da dirección, no valores exactos.
    - EX-02: Las tipografías se mapean al catálogo cerrado.
    - EX-04: Ningún tema se aplica sin pasar validarContraste().
    - EX-05: Requiere AI_HABILITADA = true.
    """
    # ── Validaciones ──
    if not AI_HABILITADA:
        raise HTTPException(
            status_code=503,
            detail="La IA no está habilitada. Configure AI_HABILITADA=true.",
        )

    if modulo_destino not in MODULOS_CONOCIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Módulo '{modulo_destino}' no reconocido. Opciones: {MODULOS_CONOCIDOS}",
        )

    contenido = await imagen.read()
    if len(contenido) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="La imagen excede 5 MB.")

    if not imagen.content_type or not imagen.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen (JPG/PNG).")

    # ── Llamada a la IA ──
    imagen_b64 = base64.b64encode(contenido).decode("utf-8")

    try:
        resultado_ia = await _llamar_ia_vision(imagen_b64, imagen.content_type)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error al comunicarse con la IA: {str(e)}")

    # ── Procesar resultado ──
    advertencias = []

    # Normalizar colores a canales RGB
    tokens_rgb = {}
    for nombre_token in ["acento", "fondo_profundo", "fondo_profundo_alt", "fondo_panel", "crema_ticket", "peligro"]:
        info = resultado_ia.get("tokens", {}).get(nombre_token, {})
        hex_val = info.get("hex", "#888888")
        confianza = info.get("confianza", 50)

        canales = hex_a_canales_rgb(hex_val)
        tokens_rgb[nombre_token] = TokenExtraido(valor=canales, hex=hex_val, confianza=confianza)

        if confianza < 70:
            advertencias.append({
                "campo": nombre_token,
                "tipo": "baja_confianza",
                "mensaje": f"Confianza {confianza}%. El valor {hex_val} es aproximado.",
            })

    # Validar contraste WCAG
    tokens_para_contraste = {k: v.valor for k, v in tokens_rgb.items()}
    contraste_resultado = validar_contraste_tema(tokens_para_contraste)

    # Mapear tipografía al catálogo cerrado (EX-02)
    fuente_sugerida = resultado_ia.get("tipografia", {}).get("fuente_ui", "Inter")
    fuente_mapeada = _mapear_fuente(fuente_sugerida)

    if fuente_mapeada["confianza"] < 100:
        advertencias.append({
            "campo": "fuente_ui",
            "tipo": "aproximacion",
            "mensaje": f"No se puede confirmar la fuente desde una imagen. Se sugiere {fuente_mapeada['nombre']}.",
        })

    return ExtraccionRespuesta(
        tokens=tokens_rgb,
        forma=resultado_ia.get("forma", {
            "radio_pequeno": "20px",
            "radio_medio": "28px",
            "radio_grande": "36px",
        }),
        tipografia={
            "fuente_ui": {
                "sugerida": fuente_mapeada["nombre"],
                "confianza": fuente_mapeada["confianza"],
                "catalogo": CATALOGO_FUENTES,
            },
            "fuente_ticket": {
                "sugerida": "ui-monospace",
                "confianza": 100,
                "catalogo": ["ui-monospace"],
            },
        },
        contraste=contraste_resultado,
        extras=resultado_ia.get("extras", {
            "sombras": "suaves",
            "bordes": "sin bordes visibles",
            "densidad": "cómoda",
            "iconos": "línea",
            "adjetivos": ["moderno", "limpio", "profesional"],
        }),
        advertencias=advertencias,
    )


# ---------------------------------------------------------------------------
# POST /ia/guardar-tema
# ---------------------------------------------------------------------------
@router.post("/guardar-tema")
async def guardar_tema(req: GuardarTemaRequest):
    """Guarda un tema extraído por IA y opcionalmente lo asigna a un módulo.

    Regla EX-03: el módulo sigue ofreciendo máximo 3 temas.
    El extractor permite crear; el admin elige cuáles 3 asignar.
    """
    if req.modulo_destino not in MODULOS_CONOCIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Módulo '{req.modulo_destino}' no reconocido.",
        )

    if req.asignado_como and req.asignado_como not in ("default", "opcion_1", "opcion_2"):
        raise HTTPException(
            status_code=400,
            detail="asignado_como debe ser 'default', 'opcion_1', 'opcion_2' o null.",
        )

    # Validar contraste antes de guardar (EX-04)
    contraste = validar_contraste_tema(req.tokens)
    if not contraste["valido"]:
        raise HTTPException(
            status_code=400,
            detail=f"El tema no pasa contraste WCAG AA: {'; '.join(contraste['problemas'])}",
        )

    tema = {
        "id": len(_temas_generados) + 1,
        "nombre": req.nombre,
        "modulo_destino": req.modulo_destino,
        "tokens": req.tokens,
        "forma": req.forma,
        "tipografia": req.tipografia,
        "extras": req.extras,
        "asignado_como": req.asignado_como,
        "contraste": contraste,
    }
    _temas_generados.append(tema)

    return {"mensaje": f"Tema '{req.nombre}' guardado.", "tema": tema}


# ---------------------------------------------------------------------------
# GET /ia/temas-generados
# ---------------------------------------------------------------------------
@router.get("/temas-generados")
async def listar_temas_generados(modulo: Optional[str] = None):
    """Lista los temas generados por el extractor."""
    if modulo:
        return [t for t in _temas_generados if t["modulo_destino"] == modulo]
    return _temas_generados


# ---------------------------------------------------------------------------
# Funciones internas
# ---------------------------------------------------------------------------
async def _llamar_ia_vision(imagen_b64: str, content_type: str) -> dict:
    """Llama al motor de IA (local/nube) con el prompt de extracción.

    Soporta:
    - Ollama (local): POST /api/generate con modelo llava
    - OpenAI-compatible: POST /v1/chat/completions con visión
    """
    import httpx

    # Intentar con Ollama (formato local)
    try:
        async with httpx.AsyncClient(timeout=AI_LOCAL_TIMEOUT) as client:
            response = await client.post(
                f"{AI_LOCAL_URL}/api/generate",
                json={
                    "model": AI_LOCAL_MODELO,
                    "prompt": PROMPT_EXTRACCION,
                    "images": [imagen_b64],
                    "stream": False,
                    "format": "json",
                },
            )
            response.raise_for_status()
            data = response.json()
            texto = data.get("response", "{}")
            return _parsear_json_ia(texto)
    except httpx.ConnectError:
        # Si Ollama no está disponible, intentar con OpenAI-compatible
        pass
    except Exception:
        pass

    # Intentar con API OpenAI-compatible
    api_key = os.getenv("AI_API_KEY", "")
    api_url = os.getenv("AI_API_URL", f"{AI_LOCAL_URL}/v1/chat/completions")

    async with httpx.AsyncClient(timeout=AI_LOCAL_TIMEOUT) as client:
        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        response = await client.post(
            api_url,
            headers=headers,
            json={
                "model": AI_LOCAL_MODELO,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": PROMPT_EXTRACCION},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{content_type};base64,{imagen_b64}",
                                },
                            },
                        ],
                    }
                ],
                "max_tokens": 2000,
            },
        )
        response.raise_for_status()
        data = response.json()
        texto = data["choices"][0]["message"]["content"]
        return _parsear_json_ia(texto)


def _parsear_json_ia(texto: str) -> dict:
    """Extrae JSON de la respuesta de la IA (que puede incluir texto extra)."""
    # Buscar bloque JSON en la respuesta
    match = re.search(r"\{[\s\S]*\}", texto)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    # Si no hay JSON válido, devolver estructura por defecto
    return {
        "tokens": {
            "acento": {"hex": "#c1d72e", "confianza": 50},
            "fondo_profundo": {"hex": "#0a0a0a", "confianza": 50},
            "fondo_profundo_alt": {"hex": "#080808", "confianza": 50},
            "fondo_panel": {"hex": "#1a1a1a", "confianza": 50},
            "crema_ticket": {"hex": "#fdfbf7", "confianza": 50},
            "peligro": {"hex": "#ef4444", "confianza": 50},
        },
        "forma": {"radio_pequeno": "20px", "radio_medio": "28px", "radio_grande": "36px"},
        "tipografia": {"fuente_ui": "Inter", "fuente_ticket": "ui-monospace"},
        "extras": {
            "sombras": "suaves",
            "bordes": "sin bordes visibles",
            "densidad": "cómoda",
            "iconos": "línea",
            "adjetivos": ["moderno", "limpio", "profesional"],
        },
    }


def _mapear_fuente(sugerida: str) -> dict:
    """Mapea la fuente sugerida al catálogo cerrado (EX-02)."""
    if not sugerida:
        return {"nombre": "Inter", "confianza": 0}

    normalizada = sugerida.lower().strip()

    # Exacta
    for f in CATALOGO_FUENTES:
        if f.lower() == normalizada:
            return {"nombre": f, "confianza": 100}

    # Parcial
    for f in CATALOGO_FUENTES:
        if normalizada in f.lower() or f.lower() in normalizada:
            return {"nombre": f, "confianza": 80}

    # Sin match → Inter
    return {"nombre": "Inter", "confianza": 0}
