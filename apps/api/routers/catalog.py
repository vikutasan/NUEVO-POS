"""Router de catálogo — P2.7 (cierre de la puerta P2).

Materializa el Contrato 1 (`catalogo.productos_para_venta`):

    GET /catalog/products-for-sale?channel=PANADERIA&include_hidden=false

Garantías del contrato (FASE 2):
  - Es una PROYECCIÓN, no la fila completa: solo lo que la pantalla necesita.
  - Solo productos VISIBLES (active = True) salvo `include_hidden=true`.
  - El precio viene RESUELTO (Decimal, C-03).
  - 400 si el canal es inválido.

Reglas que aplica:
  - RN-13  el canal por defecto es PANADERIA.
  - RN-22  un producto inactivo no se ofrece a la venta.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import Category, Product
from schemas import CatalogoParaVenta, CategoriaParaVenta, ProductoParaVenta

router = APIRouter(prefix="/catalog", tags=["catálogo"])

# Canales válidos del POS. Un canal fuera de esta lista es un error del cliente
# (400), tal como declara el contrato 1.
CANALES_VALIDOS: frozenset[str] = frozenset({"PANADERIA", "HELADERIA"})


@router.get("/products-for-sale", response_model=CatalogoParaVenta)
async def products_for_sale(
    channel: str = Query(default="PANADERIA", description="Canal del POS (RN-13)"),
    include_hidden: bool = Query(default=False, description="Incluir productos inactivos"),
    db: AsyncSession = Depends(get_db),
) -> CatalogoParaVenta:
    """Devuelve el catálogo visible del canal: `{productos, categorias}`."""
    canal = (channel or "PANADERIA").upper()
    if canal not in CANALES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Canal inválido: {channel}. Válidos: {sorted(CANALES_VALIDOS)}",
        )

    # Productos: solo activos salvo que el cliente pida lo contrario (RN-22).
    consulta = select(Product).order_by(Product.position, Product.name)
    if not include_hidden:
        consulta = consulta.where(Product.active.is_(True))
    productos = (await db.execute(consulta)).scalars().all()

    # Categorías: las que el POS muestra en su barra superior, en orden.
    categorias = (
        await db.execute(select(Category).order_by(Category.position, Category.name))
    ).scalars().all()

    return CatalogoParaVenta(
        productos=[ProductoParaVenta.model_validate(p) for p in productos],
        categorias=[CategoriaParaVenta.model_validate(c) for c in categorias],
    )
