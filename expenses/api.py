"""Expenses API — DRF viewsets, business-scoped via core.api_tenancy.

Every queryset filters by the business resolved from X-Business-Id/session;
another tenant's data is never visible (404). Money is Decimal only.
"""
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api_tenancy import get_business_or_403

from . import services
from .models import Expense, PurchaseInvoice, Supplier
from .serializers import (
    ExpenseSerializer,
    PurchaseInvoiceSerializer,
    SupplierSerializer,
)


class BusinessScopedViewSet(viewsets.ModelViewSet):
    """Base viewset: resolve business, expose it to serializer context."""

    model = None

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["business"] = getattr(self.request, "business", None)
        return context

    def initial(self, request, *args, **kwargs):
        # auth + permission checks first (401 for anonymous), then tenancy:
        # resolve via X-Business-Id/session — 404 for other tenants' data.
        super().initial(request, *args, **kwargs)
        request.business = get_business_or_403(request)

    def get_queryset(self):
        business = self.request.business
        return self.model.objects.filter(business=business)

    def perform_create(self, serializer):
        business = self.request.business
        serializer.save(business=business)


class SupplierViewSet(BusinessScopedViewSet):
    serializer_class = SupplierSerializer
    model = Supplier


class ExpenseViewSet(BusinessScopedViewSet):
    serializer_class = ExpenseSerializer
    model = Expense

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        expense = services.create_expense(
            request.business,
            actor=request.user,
            date=serializer.validated_data["date"],
            category=serializer.validated_data["category"],
            amount=serializer.validated_data["amount"],
            currency=serializer.validated_data.get("currency", "USD"),
            description=serializer.validated_data.get("description", ""),
            receipt_photo=serializer.validated_data.get("receipt_photo"),
        )
        out = ExpenseSerializer(expense, context=self.get_serializer_context())
        return Response(out.data, status=status.HTTP_201_CREATED)


class PurchaseInvoiceViewSet(BusinessScopedViewSet):
    serializer_class = PurchaseInvoiceSerializer
    model = PurchaseInvoice

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        invoice = services.create_purchase_invoice(
            request.business,
            actor=request.user,
            supplier=data.get("supplier"),
            supplier_invoice_no=data.get("supplier_invoice_no", ""),
            fiscal_invoice_no=data.get("fiscal_invoice_no", ""),
            description=data.get("description", ""),
            amount=data["amount"],
            vat_amount=data.get("vat_amount") or 0,
            currency=data.get("currency", "USD"),
            date=data["date"],
        )
        out = PurchaseInvoiceSerializer(invoice, context=self.get_serializer_context())
        return Response(out.data, status=status.HTTP_201_CREATED)


class ExpenseCategoriesView(APIView):
    """GET /api/expenses/categories/ — seeded category list."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        get_business_or_403(request)  # membership check only
        return Response({"categories": services.list_categories()})
