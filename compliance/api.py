"""Tax & compliance API — thin views over compliance.services (DRF, session auth).

Tenancy: every view resolves the business via core.api_tenancy.get_business_or_403
(X-Business-Id header or session) — 404 for other tenants' data.

Endpoints (API_CONTRACT.md):
- GET  /api/tax/config/
- GET  /api/tax/vat-summary/?period=YYYY-MM
- GET  /api/tax/qpd/?year=YYYY
- GET  /api/compliance/
- POST /api/compliance/refresh/
- POST /api/compliance/<issue_id>/dismiss/
- GET  /api/compliance/export/?period=YYYY-MM&format=csv|pdf
"""
from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BaseRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api_tenancy import get_business_or_403
from compliance import services


class CSVDownloadSafeRenderer(BaseRenderer):
    """Claims text/csv so DRF's ?format=csv negotiation doesn't 404.

    The export view returns plain HttpResponse objects on success, so this
    renderer is only ever asked to render ERROR Response objects — it exists
    so the negotiator's filter_renderers() finds a matching format for
    `?format=csv`, and renders errors as JSON like the default API does.
    """

    media_type = "text/csv"
    format = "csv"
    charset = "utf-8"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        from rest_framework.utils import json

        return json.dumps(data).encode(self.charset)


class PdfDownloadSafeRenderer(CSVDownloadSafeRenderer):
    """Same trick for `?format=pdf`."""

    media_type = "application/pdf"
    format = "pdf"


class JsonDownloadSafeRenderer(CSVDownloadSafeRenderer):
    """Same trick for `?format=json` and plain (no-format) requests."""

    media_type = "application/json"
    format = "json"


def _amount(value) -> str:
    """Serialise a Decimal as a 2dp string (API_CONTRACT money rule)."""
    return f"{services.D(value):.2f}" if value is not None else "0.00"


class TaxConfigView(APIView):
    """GET /api/tax/config/ — admin-editable values with last_verified."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        get_business_or_403(request)  # tenancy check only
        return Response({"config": services.tax_config_payload()})


class VatSummaryView(APIView):
    """GET /api/tax/vat-summary/?period=YYYY-MM.

    → {period, output_vat, input_vat (validated only), vat_payable, due_date}
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        period = request.query_params.get("period") or ""
        try:
            summary = services.vat_summary(business, period)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response({
            "period": summary["period"],
            "output_vat": _amount(summary["output_vat"]),
            "input_vat": _amount(summary["input_vat"]),
            "vat_payable": _amount(summary["vat_payable"]),
            "due_date": summary["due_date"].isoformat(),
            "fiscalised_sales": summary["fiscalised_sales"],
            "validated_purchases": summary["validated_purchases"],
            "disclaimer": services.disclaimer_text(),
        })


class QpdView(APIView):
    """GET /api/tax/qpd/?year=YYYY → the four instalments for the year."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        from django.utils import timezone

        year_raw = request.query_params.get("year") or ""
        if not year_raw:
            year = timezone.localdate().year
        else:
            try:
                year = int(year_raw)
            except (TypeError, ValueError):
                return Response(
                    {"detail": "year must be an integer, e.g. 2026."}, status=400
                )
        schedule = services.qpd_schedule(business, year)
        return Response([
            {
                "qtr": q["qtr"],
                "percent": float(q["percent"]),
                "due_date": q["due_date"].isoformat(),
                "estimated_tax": _amount(q["estimated_tax"]),
                "payment": _amount(q["payment"]),
            }
            for q in schedule
        ])


class ComplianceDashboardView(APIView):
    """GET /api/compliance/ → {score, issues:[{id, code, title, severity, suggested_fix}]}."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        return Response(services.compliance_dashboard(business))


class ComplianceRefreshView(APIView):
    """POST /api/compliance/refresh/ — recompute issues + estimates."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        business = get_business_or_403(request)
        result = services.refresh_compliance(business)
        return Response({
            "score": result["score"],
            "issues": result["issues"],
            "refreshed_at": result["refreshed_at"].isoformat(),
        })


class ComplianceDismissView(APIView):
    """POST /api/compliance/<issue_id>/dismiss/ — user dismisses an issue."""

    permission_classes = [IsAuthenticated]

    def post(self, request, issue_id: int):
        from django.shortcuts import get_object_or_404

        from compliance.models import ComplianceIssue

        business = get_business_or_403(request)
        issue = get_object_or_404(
            ComplianceIssue, id=issue_id, business=business  # tenant isolation
        )
        issue.status = "dismissed"
        issue.save(update_fields=["status"])
        return Response({
            "id": issue.id,
            "code": issue.code,
            "status": issue.status,
            "score": services.compliance_dashboard(business)["score"],
        })


class ComplianceExportView(APIView):
    """GET /api/compliance/export/?period=YYYY-MM&format=csv|pdf.

    CSV via the csv module; PDF via a ReportLab table. Default format: csv.

    NOTE on `format`: DRF's content negotiator treats `?format=` as a renderer
    format override (JSON/BrowsableAPI only) and 404s before our handler runs.
    We accept `fmt` as an alias so the query param works regardless, and also
    register CSV/PDF-compatible renderers so `?format=csv` never explodes.
    """

    permission_classes = [IsAuthenticated]
    # Renderers claiming csv/pdf/json keep DRF's ?format= negotiation from
    # 404-ing before our handler runs; the view returns plain HttpResponse
    # objects, so these renderers never actually render.
    renderer_classes = [
        JsonDownloadSafeRenderer,
        CSVDownloadSafeRenderer,
        PdfDownloadSafeRenderer,
    ]

    def get(self, request):
        business = get_business_or_403(request)
        period = (request.query_params.get("period") or "").strip()
        fmt = (request.query_params.get("format")
               or request.query_params.get("fmt") or "csv").strip().lower()
        if fmt not in ("csv", "pdf"):
            return Response(
                {"detail": "format must be 'csv' or 'pdf'."}, status=400
            )
        try:
            services.parse_period(period)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)

        if fmt == "pdf":
            pdf_bytes = services.export_pdf(business, period)
            response = HttpResponse(pdf_bytes, content_type="application/pdf")
            response["Content-Disposition"] = (
                f'attachment; filename="tax-summary-{period}.pdf"'
            )
            return response

        csv_text = services.export_csv(business, period)
        response = HttpResponse(csv_text, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="tax-summary-{period}.csv"'
        )
        return response
