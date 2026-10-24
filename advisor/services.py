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
            "Keep the recommended action.\n\n"
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
    """12 questions, options with weights. Scores 0-100."""
    return [
        {"id": "1", "q": "Is your phone/SIM protected with a PIN and SIM-lock?",
         "options": [{"v": "a", "t": "Yes, both", "w": 10}, {"v": "b", "t": "Only phone PIN", "w": 6},
                     {"v": "c", "t": "No", "w": 0}]},
        {"id": "2", "q": "Have you enabled two-step verification on your EcoCash/mobile money line?",
         "options": [{"v": "a", "t": "Yes", "w": 10}, {"v": "b", "t": "No", "w": 0},
                     {"v": "c", "t": "Not sure", "w": 3}]},
        {"id": "3", "q": "Do you use a phone lock (PIN/pattern/fingerprint) on your business phone?",
         "options": [{"v": "a", "t": "Yes", "w": 8}, {"v": "b", "t": "No", "w": 0}]},
        {"id": "4", "q": "Do you share your business passwords with staff or family?",
         "options": [{"v": "a", "t": "No, never", "w": 10}, {"v": "b", "t": "Sometimes", "w": 4},
                     {"v": "c", "t": "Yes", "w": 0}]},
        {"id": "5", "q": "Do you back up your business records (book, phone, or cloud)?",
         "options": [{"v": "a", "t": "Regularly", "w": 10}, {"v": "b", "t": "Rarely", "w": 5},
                     {"v": "c", "t": "Never", "w": 0}]},
        {"id": "6", "q": "Where do you store customer data?",
         "options": [{"v": "a", "t": "In Pfuma Mbiri only", "w": 10},
                     {"v": "b", "t": "Notebook + app", "w": 7},
                     {"v": "c", "t": "Anywhere/random", "w": 0}]},
        {"id": "7", "q": "Do staff have their own logins with limited access?",
         "options": [{"v": "a", "t": "Yes", "w": 10}, {"v": "b", "t": "They use mine", "w": 0}]},
        {"id": "8", "q": "Can you spot a phishing SMS/email asking for your PIN?",
         "options": [{"v": "a", "t": "Yes, always delete them", "w": 10},
                     {"v": "b", "t": "Sometimes", "w": 5}, {"v": "c", "t": "Not sure", "w": 2}]},
        {"id": "9", "q": "Is your WhatsApp/email account protected with two-step verification?",
         "options": [{"v": "a", "t": "Yes", "w": 8}, {"v": "b", "t": "No", "w": 0}]},
        {"id": "10", "q": "Do you check your mobile money statement for unknown transactions?",
         "options": [{"v": "a", "t": "Weekly or more", "w": 8}, {"v": "b", "t": "Rarely", "w": 3},
                     {"v": "c", "t": "Never", "w": 0}]},
        {"id": "11", "q": "Is your Wi-Fi router password protected and changed from default?",
         "options": [{"v": "a", "t": "Yes", "w": 8}, {"v": "b", "t": "Default password", "w": 2},
                     {"v": "c", "t": "No Wi-Fi", "w": 8}]},
        {"id": "12", "q": "Do you have a plan if your phone is lost or stolen?",
         "options": [{"v": "a", "t": "Yes, written down", "w": 8},
                     {"v": "b", "t": "Rough idea", "w": 4}, {"v": "c", "t": "No", "w": 0}]},
    ]


def score_security(answers: dict) -> dict:
    questions = security_questions()
    total_weight = 0
    score = 0
    misses = []
    for q in questions:
        opts = {o["v"]: o for o in q["options"]}
        chosen = opts.get(answers.get(q["id"], ""))
        if not chosen:
            misses.append(q["q"])
            continue
        total_weight += max(o["w"] for o in q["options"])
        score += chosen["w"]
    final = round(score / total_weight * 100) if total_weight else 0
    fixes = []
    for q in questions:
        opts = {o["v"]: o for o in q["options"]}
        chosen = opts.get(answers.get(q["id"], ""))
        if chosen and chosen["w"] < max(o["w"] for o in q["options"]) / 2:
            fixes.append({"priority": "high" if chosen["w"] == 0 else "medium",
                          "action": f"Fix: {q['q'].lower()}"})
    return {"score": final, "fixes": fixes}


# ── loan readiness ─────────────────────────────────────────

def loan_health(business) -> dict:
    """Business health: data completeness, fiscalisation, sales stability, compliance."""
    from sales.models import FiscalReceipt, Sale

    today = dj_tz.localdate()
    # data completeness
    has_products = business.products.filter(is_active=True).count()
    has_customers = business.customers.count()
    has_insights = Insight.objects.filter(business=business).count()
    completeness = min(100, (10 if has_products else 0) + (10 if has_customers else 0)
                      + (5 if has_insights else 0) + 25)
    # fiscalisation consistency
    total_sales = business.sales.count()
    fiscalised = FiscalReceipt.objects.filter(device__business=business).count()
    fiscal_share = fiscalised / total_sales if total_sales else 0
    consistency = round(fiscal_share * 40)
    # sales stability: monthly sales coefficient of variation (lower = stable)
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
            stability = max(0, round((1 - min(cv, 1)) * 20))
    # compliance
    comp = 0
    try:
        from compliance.services import compliance_score

        cs = compliance_score(business)
        comp = round((cs if cs is not None else 0) / 100 * 15)
    except Exception:
        pass
    score = completeness + consistency + stability + comp
    band = "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 55 else "D" if score >= 40 else "E"
    return {
        "score": min(score, 100), "band": band,
        "components": {
            "data_completeness": completeness,
            "fiscalisation_consistency": consistency,
            "sales_stability": stability,
            "compliance": comp,
        },
        "note": "Demo scoring from your books only — lenders see this only with your consent.",
    }


def consent_json(c: ConsentRecord) -> dict:
    return {
        "id": c.id, "lender": c.lender_name, "scope": c.data_scope,
        "granted_at": c.granted_at.isoformat(), "expires_at": str(c.expires_at) if c.expires_at else None,
        "revoked_at": c.revoked_at.isoformat() if c.revoked_at else None,
    }
