"""Expenses API urls (under /api/)."""
from django.urls import path

from rest_framework.routers import DefaultRouter

from . import api

router = DefaultRouter()
router.register(r"suppliers", api.SupplierViewSet, basename="api-suppliers")
router.register(r"purchase-invoices", api.PurchaseInvoiceViewSet, basename="api-purchase-invoices")
router.register(r"expenses", api.ExpenseViewSet, basename="api-expenses")

urlpatterns = [
    # must come BEFORE the router's expenses/<pk>/ detail route
    path("expenses/categories/", api.ExpenseCategoriesView.as_view(), name="api-expense-categories"),
] + router.urls
