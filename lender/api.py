"""Lender DEMO API — read-only views over sample data (DRF, session auth).

DEMO — sample data only. No real scoring, no real fraud models.
Every response carries banner: "DEMO — sample data".

Role gate: ONLY users with user.is_lender=True may access /api/lender/*
(403 otherwise). No business tenancy — records are global demo records.

Endpoints (API_CONTRACT.md):
- GET /api/lender/portfolio/        — 30-50 sample SMEs
- GET /api/lender/smes/<id>/       — one SME profile detail
- GET /api/lender/alerts/          — fraud alert feed
- GET /api/lender/applications/    — loan application queue

Read-only: no POST/PUT/DELETE endpoints exist.
"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from lender.models import FraudAlert, LenderSme, LoanApplication

BANNER = "DEMO — sample data"


class IsLender(IsAuthenticated):
    """Authenticated AND user.is_lender=True — else 403 (API_CONTRACT role gate)."""

    def has_permission(self, request, view):
        return (
            bool(request.user and request.user.is_authenticated)
            and request.user.is_lender
        )


def _sme_payload(sme: LenderSme) -> dict:
    """Shared serialisation for list + detail (money-free sample data)."""
    return {
        "id": sme.id,
        "ref_id": sme.ref_id,
        "name": sme.name,
        "sector": sme.sector,
        "location": sme.location,
        "health_score": sme.health_score,
        "risk_band": sme.risk_band,
        "revenue_trend": sme.monthly_revenue_trend or [],
        "consent_status": sme.consent_status,
    }


class PortfolioView(APIView):
    """GET /api/lender/portfolio/ — the lender's sample SME portfolio."""

    permission_classes = [IsLender]

    def get(self, request):
        smes = LenderSme.objects.all().order_by("id")
        return Response({
            "banner": BANNER,
            "count": smes.count(),
            "smes": [_sme_payload(s) for s in smes],
        })


class SmeDetailView(APIView):
    """GET /api/lender/smes/<id>/ — verified-sales chart, compliance history,
    credit score + top-5 reasons, consent status."""

    permission_classes = [IsLender]

    def get(self, request, sme_id):
        try:
            sme = LenderSme.objects.get(pk=sme_id)
        except LenderSme.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)
        return Response({
            "banner": BANNER,
            **_sme_payload(sme),
            "verified_sales_trend": sme.monthly_revenue_trend or [],
            "compliance_history": sme.compliance_history or [],
            "credit_score": sme.credit_score,
            "credit_reasons": (sme.credit_reasons or [])[:5],
            "consent_status": sme.consent_status,
        })


class AlertsView(APIView):
    """GET /api/lender/alerts/ — sample fraud alert feed (newest first)."""

    permission_classes = [IsLender]

    def get(self, request):
        alerts = FraudAlert.objects.select_related("sme").all()
        return Response({
            "banner": BANNER,
            "count": alerts.count(),
            "alerts": [
                {
                    "id": a.id,
                    "sme": {"id": a.sme_id, "name": a.sme.name} if a.sme else None,
                    "kind": a.kind,
                    "severity": a.severity,
                    "explanation": a.explanation,
                    "suggested_action": a.suggested_action,
                    "detected_at": a.detected_at.isoformat(),
                }
                for a in alerts
            ],
        })


class ApplicationsView(APIView):
    """GET /api/lender/applications/ — sample loan application queue
    (newest first) with recommend/review/decline + reasons."""

    permission_classes = [IsLender]

    def get(self, request):
        apps = LoanApplication.objects.select_related("sme").all()
        return Response({
            "banner": BANNER,
            "count": apps.count(),
            "applications": [
                {
                    "id": app.id,
                    "sme": {
                        "id": app.sme_id,
                        "ref_id": app.sme.ref_id,
                        "name": app.sme.name,
                        "risk_band": app.sme.risk_band,
                    },
                    "amount": f"{app.amount:.2f}",  # money rule: 2dp string
                    "currency": app.currency,
                    "purpose": app.purpose,
                    "suggested": app.suggested,  # recommend|review|decline
                    "reasons": app.reasons or [],
                    "submitted_at": app.submitted_at.isoformat(),
                }
                for app in apps
            ],
        })
