"""Advisor API: insights, security check, loan readiness, consent, templates."""
from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from advisor import services
from advisor.models import ConsentRecord, Insight, SecurityAssessment
from advisor.templates_text import CONSENT_NOTICE, DATA_POLICY
from core.api_tenancy import get_business_or_403


class InsightListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        qs = Insight.objects.filter(business=business).order_by("severity", "-updated_at")
        return Response([services.insight_json(i) for i in qs])


class InsightRefreshView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        business = get_business_or_403(request)
        created = services.refresh_insights(business)
        return Response({"ok": True, "insights": len(created)})


class InsightDismissView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        business = get_business_or_403(request)
        i = Insight.objects.filter(pk=pk, business=business).first()
        if not i:
            return Response({"detail": "Not found"}, status=404)
        i.status = "dismissed"
        i.save(update_fields=["status"])
        return Response({"ok": True})


class InsightDoneView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        business = get_business_or_403(request)
        i = Insight.objects.filter(pk=pk, business=business).first()
        if not i:
            return Response({"detail": "Not found"}, status=404)
        i.status = "done"
        i.save(update_fields=["status"])
        return Response({"ok": True})


class SecurityQuestionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(services.security_questions())


class SecurityAssessmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        business = get_business_or_403(request)
        answers = request.data.get("answers", {})
        result = services.score_security(answers)
        SecurityAssessment.objects.create(
            business=business, user=request.user, answers=answers,
            score=result["score"], fixes=result["fixes"])
        return Response(result)


class SecurityTemplateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, which):
        text = CONSENT_NOTICE if which == "consent-notice" else DATA_POLICY
        return HttpResponse(text, content_type="text/plain")


class LoanHealthView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        return Response(services.loan_health(business))


class ConsentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        return Response([services.consent_json(c) for c in business.consents.all()])

    def post(self, request):
        business = get_business_or_403(request)
        c = ConsentRecord.objects.create(
            business=business, lender_name=request.data.get("lender", "Selected lenders"),
            data_scope=request.data.get("data_scope", ["sales", "compliance", "identity"]),
            granted_by=request.user,
            expires_at=request.data.get("expires_at") or None)
        return Response(services.consent_json(c), status=201)


class ConsentRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        business = get_business_or_403(request)
        c = ConsentRecord.objects.filter(pk=pk, business=business).first()
        if not c:
            return Response({"detail": "Not found"}, status=404)
        from django.utils import timezone as dj_tz

        c.revoked_at = dj_tz.now()
        c.save(update_fields=["revoked_at"])
        return Response({"ok": True})
