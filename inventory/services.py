"""Inventory service layer: stock adjustments + low stock."""
from __future__ import annotations

import logging

from core.models import log_action
from inventory.models import Product, StockMovement

logger = logging.getLogger(__name__)


def adjust_stock(business, product, qty_change: int, reason: str, ref: str = "") -> StockMovement:
    """Idempotent stock adjust: one movement per (ref, reason) key."""
    if ref and StockMovement.objects.filter(ref=ref, product=product).exists():
        return None
    movement = StockMovement.objects.create(
        product=product, qty_change=qty_change, reason=reason, ref=ref)
    product.stock_qty += qty_change
    product.save(update_fields=["stock_qty"])
    log_action(business, None, "inventory.stock_adjust", {
        "product": product.id, "qty_change": qty_change, "reason": reason, "ref": ref})
    return movement


def deduct_on_sale(sale) -> None:
    """Deduct stock for every product-backed line of a sale (idempotent)."""
    for line in sale.lines.all():
        if line.product_id:
            adjust_stock(sale.business, line.product, -int(line.qty), "sale", f"sale:{sale.id}:line:{line.id}")


def low_stock(business) -> list:
    out = []
    for p in business.products.filter(is_active=True):
        if p.is_low_stock:
            out.append({"id": p.id, "name": p.name, "stock_qty": p.stock_qty,
                        "threshold": p.low_stock_threshold})
    return out
