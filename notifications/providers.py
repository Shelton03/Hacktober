"""Notification providers: in-app + email real; SMS/WhatsApp stubs.

All providers implement: send(user, title, body, link) -> SendLog row.
"""
from __future__ import annotations

import logging

from notifications.models import Notification, SendLog

logger = logging.getLogger(__name__)


class InAppProvider:
    name = "in_app"

    def send(self, business, user, kind, title, body, link=""):
        n = Notification.objects.create(
            business=business, user=user, kind=kind, title=title, body=body, link=link)
        SendLog.objects.create(notification=n, provider=self.name,
                               recipient=user.email if user else "",
                               status="sent")
        return n


class EmailProvider:
    """Real provider via Django's console/email backend (dev: printed)."""
    name = "email"

    def send(self, business, user, kind, title, body, link=""):
        from django.conf import settings
        from django.core.mail import send_mail

        status = "sent"
        detail = ""
        try:
            if user and user.email:
                send_mail(
                    subject=f"[Pfuma Mbiri] {title}",
                    message=f"{body}\n\n{link}" if link else body,
                    from_email=settings.DEFAULT_FROM_EMAIL
                    if hasattr(settings, "DEFAULT_FROM_EMAIL") else "no-reply@pfumambiri.example",
                    recipient_list=[user.email],
                    fail_silently=False,
                )
            else:
                status, detail = "failed", "no email on user"
        except Exception as exc:  # dev without SMTP → console backend raises nothing
            status, detail = "failed", str(exc)[:200]
        SendLog.objects.create(provider=self.name,
                               recipient=user.email if user else "",
                               status=status, detail=detail)
        return status == "sent"


class SmsProvider:
    """STUB — logs the send, never hits a network. Real provider plugs in later."""
    name = "sms"

    def send(self, business, user, kind, title, body, link=""):
        recipient = (user.phone if user else "") or ""
        SendLog.objects.create(provider=self.name, recipient=recipient,
                                status="stubbed", detail="SMS stub — not sent")
        return True


class WhatsAppProvider:
    """STUB — logs the send, never hits a network."""
    name = "whatsapp"

    def send(self, business, user, kind, title, body, link=""):
        recipient = (user.phone if user else "") or ""
        SendLog.objects.create(provider=self.name, recipient=recipient,
                                status="stubbed", detail="WhatsApp stub — not sent")
        return True


class NotificationService:
    """Single interface: dispatch by user settings + quiet hours."""

    def __init__(self):
        self.providers = {
            "in_app": InAppProvider(),
            "email": EmailProvider(),
            "sms": SmsProvider(),
            "whatsapp": WhatsAppProvider(),
        }

    def _in_quiet_hours(self, setting, now=None) -> bool:
        if not setting or not setting.quiet_start or not setting.quiet_end:
            return False
        from django.utils import timezone as dj_tz

        now = now or dj_tz.localtime()
        t = now.time()
        start, end = setting.quiet_start, setting.quiet_end
        if start <= end:
            return start <= t <= end
        return t >= start or t <= end  # overnight window

    def send(self, business, user, kind, title, body="", link="") -> bool:
        """Always in-app; email/sms/whatsapp per user settings + quiet hours."""
        from notifications.models import NotificationSetting

        self.providers["in_app"].send(business, user, kind, title, body, link)
        try:
            setting = NotificationSetting.objects.get(user=user)
        except NotificationSetting.DoesNotExist:
            setting = None
        except Exception:
            setting = None
        channels = (setting.channels if setting and isinstance(setting.channels, dict) else {}) or {}
        if self._in_quiet_hours(setting):
            return False
        ok = True
        if channels.get("email"):
            ok = self.providers["email"].send(business, user, kind, title, body, link) and ok
        if channels.get("sms"):
            self.providers["sms"].send(business, user, kind, title, body, link)
        if channels.get("whatsapp"):
            self.providers["whatsapp"].send(business, user, kind, title, body, link)
        return ok
