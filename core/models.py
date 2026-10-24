"""Audit log — every fiscal and financial action lands here, immutable."""
from django.db import models


class AuditLog(models.Model):
    """Append-only audit trail scoped to a business.

    Written by the service layer for fiscal and financial actions
    (device setup, open/close day, receipt submit, payments, exports...).
    """

    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="audit_logs"
    )
    actor = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=64, db_index=True)
    # FDMS requests/responses and other payloads, kept as JSON
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.action} — {self.business.name}"


def log_action(business, actor, action: str, detail: dict | None = None):
    """Record an audited action. Returns the created entry."""
    return AuditLog.objects.create(
        business=business, actor=actor, action=action, detail=detail or {}
    )
