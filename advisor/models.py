"""Advisor insights, security self-assessments and lender consent records."""
from django.db import models


class Insight(models.Model):
    """A rule-based advisor insight. ALL numbers come from the ledger.

    The optional LLM (Gemma) may rewrite `explanation` into friendlier
    English — it receives only the computed facts in `data` and must not add
    numbers. Template fallback always available.
    """

    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="insights"
    )
    code = models.CharField(max_length=40, db_index=True)
    title = models.CharField(max_length=200)
    explanation = models.TextField()
    recommended_action = models.TextField(blank=True)
    severity = models.CharField(
        max_length=10,
        choices=[("info", "Info"), ("warning", "Warning"), ("critical", "Critical")],
        default="info",
    )
    status = models.CharField(
        max_length=10,
        choices=[("active", "Active"), ("dismissed", "Dismissed"), ("done", "Done")],
        default="active",
    )
    data = models.JSONField(default=dict, blank=True, help_text="Computed facts behind this insight")
    llm_phrased = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-severity", "-updated_at"]

    def __str__(self):
        return f"[{self.severity}] {self.title}"


class SecurityAssessment(models.Model):
    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="security_assessments"
    )
    user = models.ForeignKey(
        "accounts.User", null=True, on_delete=models.SET_NULL, related_name="security_assessments"
    )
    answers = models.JSONField(default=dict)
    score = models.IntegerField(default=0)
    fixes = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.business.name}: {self.score}/100"


class ConsentRecord(models.Model):
    """Consent to share a business profile with a lender. Revocable, with expiry."""

    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="consents"
    )
    lender_name = models.CharField(max_length=120)
    data_scope = models.JSONField(
        default=list, blank=True, help_text="e.g. ['sales','compliance','identity']"
    )
    granted_by = models.ForeignKey(
        "accounts.User", null=True, on_delete=models.SET_NULL, related_name="consents_granted"
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.business.name} → {self.lender_name}"
