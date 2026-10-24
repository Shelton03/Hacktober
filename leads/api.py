"""Leads API: CRUD, kanban, convert, reports."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api_tenancy import get_business_or_403
from leads.models import Lead, LeadActivity
from leads.services import _lead_json, add_activity, convert_to_invoice, kanban, reports


class LeadListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        stage = request.query_params.get("stage")
        qs = business.leads.all().order_by("-created_at")
        if stage:
            qs = qs.filter(stage=stage)
        return Response([_lead_json(l) for l in qs])

    def post(self, request):
        business = get_business_or_403(request)
        d = request.data
        if not d.get("name"):
            return Response({"detail": "Name is required"}, status=400)
        lead = Lead.objects.create(
            business=business, name=d["name"], phone=d.get("phone", ""),
            source=d.get("source", "walk_in"), interest=d.get("interest", ""),
            estimated_value=d.get("estimated_value", 0),
            next_followup=d.get("next_followup") or None,
            followup_note=d.get("followup_note", ""), assigned_to=request.user)
        return Response(_lead_json(lead), status=201)


class LeadDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        business = get_business_or_403(request)
        lead = business.leads.filter(pk=pk).first()
        if not lead:
            return Response({"detail": "Not found"}, status=404)
        data = _lead_json(lead)
        data["activities"] = [
            {"id": a.id, "kind": a.kind, "note": a.note,
             "actor": a.actor_id, "created_at": a.created_at.isoformat()}
            for a in lead.activities.all()[:50]
        ]
        return Response(data)

    def patch(self, request, pk):
        business = get_business_or_403(request)
        lead = business.leads.filter(pk=pk).first()
        if not lead:
            return Response({"detail": "Not found"}, status=404)
        d = request.data
        if "stage" in d:
            if d["stage"] not in [s for s, _ in Lead.Stage.choices]:
                return Response({"detail": "Invalid stage"}, status=400)
            lead.stage = d["stage"]
        for f in ("name", "phone", "interest", "estimated_value",
                  "next_followup", "followup_note"):
            if f in d:
                setattr(lead, f, d[f] or None if f == "next_followup" else d[f])
        lead.save()
        return Response(_lead_json(lead))

    def delete(self, request, pk):
        business = get_business_or_403(request)
        if business.leads.filter(pk=pk).delete()[0]:
            return Response({"ok": True})
        return Response({"detail": "Not found"}, status=404)


class LeadActivityView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        business = get_business_or_403(request)
        lead = business.leads.filter(pk=pk).first()
        if not lead:
            return Response({"detail": "Not found"}, status=404)
        a = add_activity(business, lead, request.user,
                        request.data.get("kind", "note"),
                        request.data.get("note", ""))
        return Response({"id": a.id}, status=201)


class LeadConvertView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        business = get_business_or_403(request)
        lead = business.leads.filter(pk=pk).first()
        if not lead:
            return Response({"detail": "Not found"}, status=404)
        try:
            invoice = convert_to_invoice(business, request.user, lead, request.data)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response({"ok": True, "invoice_id": invoice.id}, status=201)


class KanbanView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        return Response({"columns": kanban(business)})


class LeadReportsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        return Response(reports(business))
