"""Tax config (admin-editable, never hard-coded), estimates and compliance issues."""
from django.db import models


class TaxConfig(models.Model):
    """Every rate / threshold / percentage / due date lives HERE, editable by admin.

    Keys (seeded, with last_verified dates):
      vat.standard_rate           15.5
      vat.zero_rate               0
      qpd.q1_percent              10   due 25 March
      qpd.q2_percent              25   due 25 June
      qpd.q3_percent              30   due 25 September
      qpd.q4_percent              35   due 20 December
      vat.return_due_day          25th of following month (example)
      ... (README flags anything uncertain)
    """

    category = models.CharField(max_length=20, db_index=True)  # vat | qpd | income | general
    key = models.CharField(max_length=40, unique=True)
    value = models.CharField(max_length=60)  # parsed by the service layer
    data_type = models.CharField(
        max_length=10, default="decimal", choices=[("decimal", "Decimal"), ("date", "Date"), ("int", "Integer"), ("str", "String")]
    )
    description = models.CharField(max_length=200, blank=True)
    last_verified = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.category}.{self.key} = {self.value}"


class ComplianceIssue(models.Model):
    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="compliance_issues"
    )
    code = models.CharField(max_length=40, db_index=True)
    title = models.CharField(max_length=200)
    severity = models.CharField(
        max_length=10,
        choices=[("info", "Info"), ("warning", "Warning"), ("critical", "Critical")],
        default="warning",
    )
    suggested_fix = models.TextField(blank=True)
    status = models.CharField(
        max_length=10,
        choices=[("active", "Active"), ("dismissed", "Dismissed"), ("resolved", "Resolved")],
        default="active",
    )
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-severity", "-created_at"]

    def __str__(self):
        return f"[{self.severity}] {self.title}"


class TaxEstimate(models.Model):
    """Stored tax estimates (VAT periods, QPD instalments)."""

    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="tax_estimates"
    )
    kind = models.CharField(max_length=10, choices=[("vat", "VAT"), ("qpd", "QPD")])
    period = models.CharField(max_length=10, db_index=True)  # "2026-10" or "2026-Q3"
    estimated_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    due_date = models.DateField()
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["business", "kind", "period"], name="uniq_estimate_per_period"
            )
        ]

    def __str__(self):
        return f"{self.kind} {self.period}: {self.estimated_amount} (due {self.due_date})"
