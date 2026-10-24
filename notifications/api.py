"""Notifications API: list, read, unread count, settings."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api_tenancy import get_business_or_403
from notifications.models import Notification, NotificationSetting


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        qs = Notification.objects.filter(business=business).order_by("-created_at")[:100]
        return Response([
            {"id": n.id, "kind": n.kind, "title": n.title, "body": n.body,
             "link": n.link, "read": n.is_read,
             "created_at": n.created_at.isoformat()}
            for n in qs
        ])


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        business = get_business_or_403(request)
        n = Notification.objects.filter(pk=pk, business=business).first()
        if not n:
            return Response({"detail": "Not found"}, status=404)
        n.is_read = True
        n.save(update_fields=["is_read"])
        return Response({"ok": True})


class UnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        n = Notification.objects.filter(business=business, is_read=False).count()
        return Response({"unread": n})


class SettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request):
        setting, _ = NotificationSetting.objects.get_or_create(user=request.user)
        return setting

    def get(self, request):
        s = self._get(request)
        return Response({
            "channels": s.channels or {"in_app": True, "email": True, "sms": False, "whatsapp": False},
            "quiet_start": str(s.quiet_start) if s.quiet_start else None,
            "quiet_end": str(s.quiet_end) if s.quiet_end else None,
            "tax_reminders": s.tax_reminders,
            "invoice_reminders": s.invoice_reminders,
            "lead_reminders": s.lead_reminders,
            "stock_alerts": s.stock_alerts,
            "advisor_digest": s.advisor_digest,
        })

    def post(self, request):
        s = self._get(request)
        d = request.data
        if "channels" in d:
            s.channels = d["channels"]
        for f in ("tax_reminders", "invoice_reminders", "lead_reminders",
                  "stock_alerts", "advisor_digest"):
            if f in d:
                setattr(s, f, bool(d[f]))
        for f in ("quiet_start", "quiet_end"):
            if f in d:
                setattr(s, f, d[f] or None)
        s.save()
        return Response({"ok": True})
