"""Inventory API: products CRUD, movements, low-stock."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api_tenancy import get_business_or_403
from inventory.models import Product, StockMovement
from inventory.services import adjust_stock, low_stock


def _product_json(p, detail=False):
    data = {
        "id": p.id, "name": p.name, "sku": p.sku, "unit": p.unit,
        "cost_price": str(p.cost_price), "selling_price": str(p.selling_price),
        "tax_type": p.tax_type, "stock_qty": p.stock_qty,
        "low_stock_threshold": p.low_stock_threshold,
        "is_low_stock": p.is_low_stock, "currency": p.currency,
    }
    if detail:
        data["movements"] = [
            {"id": m.id, "qty_change": m.qty_change, "reason": m.reason,
             "ref": m.ref, "created_at": m.created_at.isoformat()}
            for m in p.movements.all()[:50]
        ]
    return data


class ProductListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        return Response([_product_json(p) for p in business.products.filter(is_active=True)])

    def post(self, request):
        business = get_business_or_403(request)
        d = request.data
        if not d.get("name"):
            return Response({"detail": "Name is required"}, status=400)
        p = Product.objects.create(
            business=business, name=d["name"], sku=d.get("sku", ""),
            unit=d.get("unit", "unit"),
            cost_price=d.get("cost_price", 0), selling_price=d.get("selling_price", 0),
            tax_type=d.get("tax_type", "standard"),
            stock_qty=d.get("stock_qty", 0),
            low_stock_threshold=d.get("low_stock_threshold", 5),
            currency=d.get("currency", "USD"))
        return Response(_product_json(p), status=201)


class ProductDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        business = get_business_or_403(request)
        p = business.products.filter(pk=pk).first()
        if not p:
            return Response({"detail": "Not found"}, status=404)
        return Response(_product_json(p, detail=True))

    def patch(self, request, pk):
        business = get_business_or_403(request)
        p = business.products.filter(pk=pk).first()
        if not p:
            return Response({"detail": "Not found"}, status=404)
        fields = ("name", "sku", "unit", "cost_price", "selling_price",
                  "tax_type", "stock_qty", "low_stock_threshold", "currency", "is_active")
        for f in fields:
            if f in request.data:
                setattr(p, f, request.data[f])
        p.save()
        return Response(_product_json(p))

    def delete(self, request, pk):
        business = get_business_or_403(request)
        p = business.products.filter(pk=pk).first()
        if not p:
            return Response({"detail": "Not found"}, status=404)
        p.is_active = False
        p.save(update_fields=["is_active"])
        return Response({"ok": True})


class LowStockView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        return Response(low_stock(business))


class RestockView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        business = get_business_or_403(request)
        p = business.products.filter(pk=pk).first()
        if not p:
            return Response({"detail": "Not found"}, status=404)
        qty = int(request.data.get("qty", 0))
        if qty <= 0:
            return Response({"detail": "qty must be positive"}, status=400)
        adjust_stock(business, p, qty, "restock", f"restock:{p.id}:{dj_now()}")
        return Response(_product_json(p))


def dj_now():
    from django.utils import timezone

    return timezone.now().strftime("%Y%m%d%H%M%S%f")
