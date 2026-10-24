"""Expenses, suppliers and FDMS-validated purchase invoices."""
from django.db import models


class Supplier(models.Model):
    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="suppliers"
    )
    name = models.CharField(max_length=120)
    tin = models.CharField(max_length=20, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Expense(models.Model):
    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="expenses"
    )
    category = models.CharField(max_length=40, db_index=True)
    description = models.CharField(max_length=200, blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="USD")
    date = models.DateField(db_index=True)
    receipt_photo = models.ImageField(upload_to="expense_receipts/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"{self.category}: {self.amount} {self.currency}"


class PurchaseInvoice(models.Model):
    """Supplier invoice we can claim input VAT from — ONLY once FDMS-validated."""

    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="purchase_invoices"
    )
    supplier = models.ForeignKey(
        "expenses.Supplier",
        null=True, blank=True, on_delete=models.SET_NULL, related_name="invoices",
    )
    supplier_invoice_no = models.CharField(max_length=40, blank=True)
    fiscal_invoice_no = models.CharField(
        max_length=40, blank=True,
        help_text="Supplier's fiscal (FDMS) invoice number",
    )
    description = models.CharField(max_length=200, blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    vat_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="USD")
    date = models.DateField(db_index=True)
    fdms_validated = models.BooleanField(default=False)
    validation_ref = models.CharField(max_length=60, blank=True)
    validated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"Purchase {self.supplier_invoice_no or self.id} ({self.amount})"
