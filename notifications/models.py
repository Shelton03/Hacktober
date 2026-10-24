"""Notifications, per-user settings, and the provider-agnostic send log."""
from django.db import models


class Notification(models.Model):
    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="notifications"
    )
    user = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.CASCADE, related_name="notifications"
    )
    kind = models.CharField(max_length=30, db_index=True)  # tax_deadline, overdue_invoice, low_stock...
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    link = models.CharField(max_length=200, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class NotificationSetting(models.Model):
    """Per-user channel and quiet-hour preferences."""

    user = models.OneToOneField(
        "accounts.User", on_delete=models.CASCADE, related_name="notification_settings"
    )
    channels = models.JSONField(
        default=dict, help_text="e.g. {in_app: true, email: true, sms: false, whatsapp: false}"
    )
    quiet_start = models.TimeField(null=True, blank=True)
    quiet_end = models.TimeField(null=True, blank=True)
    tax_reminders = models.BooleanField(default=True)
    invoice_reminders = models.BooleanField(default=True)
    lead_reminders = models.BooleanField(default=True)
    stock_alerts = models.BooleanField(default=True)
    advisor_digest = models.BooleanField(default=True)

    def __str__(self):
        return f"Notification settings for {self.user.email}"


class SendLog(models.Model):
    """What the NotificationService actually sent, through which provider."""

    notification = models.ForeignKey(
        "notifications.Notification", null=True, on_delete=models.SET_NULL, related_name="sends"
    )
    provider = models.CharField(max_length=20)  # in_app | email | sms | whatsapp
    recipient = models.CharField(max_length=120)
    status = models.CharField(max_length=12, default="sent")  # sent | stubbed | failed
    detail = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.provider} → {self.recipient}: {self.status}"
