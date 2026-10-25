"""Advisor services: refresh insights (+ optional Gemma phrasing), security, loan."""
from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.utils import timezone as dj_tz

from advisor.models import ConsentRecord, Insight, SecurityAssessment
from advisor import rules

logger = logging.getLogger(__name__)


def _llm_phrase(insight_data: dict, template_explanation: str) -> tuple[str, bool]:
    """Optional Gemma phrasing: rewrite the COMPUTED facts in friendlier English.

    The LLM receives ONLY the computed facts and must not add numbers. Any
    failure → keep the deterministic template text.
    """
    if not getattr(settings, "INTELLIGENCE_LLM_PHRASING", False):
        return template_explanation, False
    try:
        from intelligence.gemma_client import get_advisor_client

        client = get_advisor_client()
        if not client.configured:
            return template_explanation, False
        prompt = (
            "You are rewriting a business-insight message for a Zimbabwean SME owner. "
            "Rewrite the message below in friendly, simple English. Maximum 3 sentences. "
            "Use ONLY the numbers given — do NOT add, change or invent any numbers. "
            "Keep the recommended action. Do not use em dashes.\n\n"
            f"Title: {insight_data.get('title', '')}\n"
            f"Message: {template_explanation}\n"
            f"Action: {insight_data.get('recommended_action', '')}"
        )
        result = client.suggest(prompt)
        if result.success and result.text and len(result.text) < 1200:
            return result.text.strip(), True
    except Exception:
        logger.exception("LLM phrasing failed — template fallback")
    return template_explanation, False


def refresh_insights(business, use_llm: bool | None = None) -> list:
    """Recompute all rules → upsert Insights. Never invents numbers."""
    if use_llm is None:
        use_llm = bool(getattr(settings, "INTELLIGENCE_LLM_PHRASING", False))
    created = []
    seen_codes = set()
    for rule in rules.ALL_RULES:
        try:
            finding = rule(business)
        except Exception:
            logger.exception("rule %s failed", rule.__name__)
            continue
        if not finding:
            continue
        code = finding["code"]
        seen_codes.add(code)
        explanation = finding["explanation"]
        llm_phrased = False
        if use_llm:
            explanation, llm_phrased = _llm_phrase(finding, explanation)
        insight, _ = Insight.objects.update_or_create(
            business=business, code=code,
            defaults={
                "title": finding["title"],
                "explanation": explanation,
                "recommended_action": finding.get("recommended_action", ""),
                "severity": finding.get("severity", "info"),
                "data": finding.get("data", {}),
                "llm_phrased": llm_phrased,
            },
        )
        created.append(insight)
    return created


def insight_json(i) -> dict:
    return {
        "id": i.id, "code": i.code, "title": i.title,
        "explanation": i.explanation,
        "recommended_action": i.recommended_action,
        "severity": i.severity, "status": i.status,
        "llm_phrased": i.llm_phrased,
        "created_at": i.created_at.isoformat(),
    }


# ── security self-assessment ───────────────────────────────

def security_questions() -> list:
    """12 questions, options with weights. Content lives in advisor.security."""
    from advisor import security

    return security.public_questions()


def score_security(answers: dict, use_llm: bool | None = None) -> dict:
    """Deterministic score + fixes + lessons, plus a (optionally AI) coaching note."""
    from advisor import security

    result = security.evaluate(answers)
    result["coaching"], result["ai_generated"] = security.coaching(result, use_llm=use_llm)
    return result


# ── loan readiness ─────────────────────────────────────────

LOAN_WEIGHTS = {
    "data_completeness": 25,
    "fiscalisation_consistency": 35,
    "sales_stability": 20,
    "compliance": 20,
}


def loan_health(business) -> dict:
    """Business health from the books. Each component is 0-100; the score is
    their weighted average (LOAN_WEIGHTS) so the parts always explain the whole."""
    from compliance.models import ComplianceIssue
    from compliance.services import compliance_score
    from sales.models import FiscalReceipt

    today = dj_tz.localdate()
    # data completeness: the records a lender expects to see
    completeness = (
        (30 if business.products.filter(is_active=True).exists() else 0)
        + (30 if business.customers.exists() else 0)
        + (30 if business.expenses.exists() else 0)
        + (10 if Insight.objects.filter(business=business).exists() else 0)
    )
    # fiscalisation consistency: share of sales carrying a fiscal receipt
    total_sales = business.sales.count()
    fiscalised = FiscalReceipt.objects.filter(device__business=business).count()
    consistency = round(min(1, fiscalised / total_sales) * 100) if total_sales else 0
    # sales stability: monthly coefficient of variation over 6 months (lower = steadier)
    months = {}
    for s in business.sales.filter(date__gte=today - timedelta(days=180)):
        key = s.date.strftime("%Y-%m")
        months[key] = months.get(key, Decimal(0)) + s.total
    stability = 0
    if len(months) >= 3:
        vals = [float(v) for v in months.values()]
        mean = sum(vals) / len(vals)
        if mean > 0:
            var = sum((v - mean) ** 2 for v in vals) / len(vals)
            cv = (var ** 0.5) / mean
            stability = round((1 - min(cv, 1)) * 100)
    # compliance: the same score the Compliance page shows
    comp = compliance_score(ComplianceIssue.objects.filter(business=business, status="active"))

    components = {
        "data_completeness": completeness,
        "fiscalisation_consistency": consistency,
        "sales_stability": stability,
        "compliance": comp,
    }
    score = round(sum(components[k] * w for k, w in LOAN_WEIGHTS.items()) / 100)
    band = "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 55 else "D" if score >= 40 else "E"
    return {
        "score": score, "band": band,
        "components": components,
        "weights": LOAN_WEIGHTS,
        "note": "Demo scoring from your books only — lenders see this only with your consent.",
    }


def consent_json(c: ConsentRecord) -> dict:
    return {
        "id": c.id, "lender": c.lender_name, "scope": c.data_scope,
        "granted_at": c.granted_at.isoformat(), "expires_at": str(c.expires_at) if c.expires_at else None,
        "revoked_at": c.revoked_at.isoformat() if c.revoked_at else None,
    }
