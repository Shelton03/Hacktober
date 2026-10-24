"""Products and stock. One shared schema — see API_CONTRACT.md."""
from django.db import models


class Product(models.Model):
    class TaxType(models.TextChoices):
        STANDARD = "standard", "Standard rated (15.5%)"
        ZERO = "zero", "Zero-rated (0%)"
        EXEMPT = "exempt", "Exempt"
        WITHHOLDING = "withholding", "Withholding (5%)"

    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="products"
    )
    name = models.CharField(max_length=120)
    sku = models.CharField(max_length=40, blank=True)
    unit = models.CharField(max_length=16, blank=True, default="unit")
    cost_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    selling_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_type = models.CharField(
        max_length=16, choices=TaxType.choices, default=TaxType.STANDARD
    )
    stock_qty = models.IntegerField(default=0)
    low_stock_threshold = models.IntegerField(default=5)
    currency = models.CharField(max_length=3, default="USD")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["business", "sku"], name="uniq_product_sku_per_business",
                condition=~models.Q(sku=""),
            )
        ]
        ordering = ["name"]

    @property
    def is_low_stock(self) -> bool:
        return self.stock_qty <= self.low_stock_threshold

    def __str__(self):
        return f"{self.name} ({self.business.name})"


class StockMovement(models.Model):
    """Every stock change, for auditability and reports."""

    class Reason(models.TextChoices):
        SALE = "sale", "Sale"
        RESTOCK = "restock", "Restock"
        ADJUSTMENT = "adjustment", "Manual adjustment"
        CREDIT_NOTE = "credit_note", "Credit note return"

    product = models.ForeignKey(
        "inventory.Product", on_delete=models.CASCADE, related_name="movements"
    )
    qty_change = models.IntegerField()  # negative = out
    reason = models.CharField(max_length=16, choices=Reason.choices)
    ref = models.CharField(max_length=40, blank=True, help_text="e.g. sale id")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.product.name} {self.qty_change:+d} ({self.reason})"
