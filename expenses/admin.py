"""Django admin for the expenses app."""
from django.contrib import admin

from .models import Expense, PurchaseInvoice, Supplier


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "tin", "phone", "email", "created_at")
    search_fields = ("name", "tin", "phone", "email")
    list_filter = ("business",)


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ("date", "category", "amount", "currency", "description", "business")
    search_fields = ("category", "description")
    list_filter = ("category", "currency", "date")
    date_hierarchy = "date"


@admin.register(PurchaseInvoice)
class PurchaseInvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "date", "supplier", "supplier_invoice_no", "fiscal_invoice_no",
        "amount", "vat_amount", "fdms_validated", "validation_ref",
    )
    search_fields = ("supplier_invoice_no", "fiscal_invoice_no", "description")
    list_filter = ("fdms_validated", "currency", "date")
    date_hierarchy = "date"
