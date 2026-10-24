"""Leads service layer: kanban, conversion, reports."""
from __future__ import annotations

from datetime import date

from django.utils import timezone as dj_tz

from leads.models import Lead, LeadActivity

STAGES = ["new", "contacted", "quoted", "won", "lost"]


def kanban(business) -> list:
    columns = []
    for stage in STAGES:
        leads = business.leads.filter(stage=stage).order_by("-created_at")
        columns.append({
            "stage": stage,
            "leads": [_lead_json(l) for l in leads],
        })
    return columns


def _lead_json(l):
    return {
        "id": l.id, "name": l.name, "phone": l.phone, "source": l.source,
        "interest": l.interest, "estimated_value": str(l.estimated_value),
        "currency": l.currency, "stage": l.stage,
        "next_followup": str(l.next_followup) if l.next_followup else None,
        "followup_note": l.followup_note,
        "assigned_to": l.assigned_to_id,
        "due_today": bool(l.next_followup and l.next_followup <= dj_tz.localdate()),
        "converted_sale": l.converted_sale_id,
    }


def move_stage(business, lead: Lead, stage: str) -> Lead:
    if stage not in STAGES:
        raise ValueError(f"Invalid stage: {stage}")
    lead.stage = stage
    lead.save(update_fields=["stage"])
    return lead


def add_activity(business, lead: Lead, actor, kind: str, note: str) -> LeadActivity:
    return LeadActivity.objects.create(lead=lead, actor=actor, kind=kind, note=note)


def convert_to_invoice(business, actor, lead: Lead, payload: dict | None = None):
    """Lead → invoice (via sales service), link converted_sale."""
    from sales.services import create_invoice

    payload = payload or {}
    if lead.converted_sale_id:
        raise ValueError("Lead already converted")
    # use the lead's interest as the invoice note; caller may pass lines
    lines = payload.get("lines") or [
        {"name": lead.interest or "Service", "qty": 1,
         "unit_price": str(lead.estimated_value or 0), "tax_type": "standard"}
    ]
    due = payload.get("due_date")
    invoice = create_invoice(
        business, actor,
        {"lines": lines, "due_date": due, "notes": f"From lead {lead.name} ({lead.source})"})
    lead.converted_sale = invoice
    lead.stage = Lead.Stage.WON
    lead.save(update_fields=["converted_sale", "stage"])
    LeadActivity.objects.create(lead=lead, actor=actor, kind="note",
                                note=f"Converted to invoice #{invoice.id}")
    return invoice


def due_followups(business) -> list:
    today = dj_tz.localdate()
    qs = business.leads.filter(next_followup__lte=today).exclude(
        stage__in=[Lead.Stage.WON, Lead.Stage.LOST])
    return [_lead_json(l) for l in qs]


def reports(business) -> dict:
    total = business.leads.count()
    won = business.leads.filter(stage=Lead.Stage.WON).count()
    by_source = []
    for src, label in Lead.Source.choices:
        qs = business.leads.filter(source=src)
        cnt = qs.count()
        won_s = qs.filter(stage=Lead.Stage.WON).count()
        value = sum((l.estimated_value for l in qs.filter(stage=Lead.Stage.WON)), 0)
        by_source.append({"source": src, "label": label, "count": cnt,
                          "won": won_s, "value": str(value)})
    return {
        "conversion_rate": round(won / total * 100, 1) if total else 0.0,
        "total_leads": total, "won": won,
        "by_source": by_source,
        "followups_due": due_followups(business),
    }
