"""Security check: rule-based scoring + AI coaching + a practice library.

The score, gaps and fixes are deterministic (weights below). Gemma only
phrases a short coaching note from those computed facts and answers
free-form security questions; any failure falls back to template text.
"""
from __future__ import annotations

import logging
import re

from django.conf import settings

logger = logging.getLogger(__name__)

TOPICS = {
    "phone": "Phone & SIM",
    "mobile_money": "Mobile money",
    "passwords": "Passwords & accounts",
    "backups": "Backups",
    "data": "Customer data",
    "access": "Staff access",
    "scams": "Scams & phishing",
    "network": "Wi-Fi & networks",
    "incident": "Lost phone plan",
}

# id/options/weights are stable; stored SecurityAssessment.answers refer to them.
QUESTIONS = [
    {"id": "1", "topic": "phone", "q": "Is your phone/SIM protected with a PIN and SIM-lock?",
     "options": [{"v": "a", "t": "Yes, both", "w": 10}, {"v": "b", "t": "Only phone PIN", "w": 6},
                 {"v": "c", "t": "No", "w": 0}],
     "fix": "Turn on SIM lock (Settings → Security → SIM card lock) and set a phone PIN.",
     "why": "A SIM lock stops a thief from moving your SIM into another phone and receiving your mobile money codes."},
    {"id": "2", "topic": "mobile_money", "q": "Have you enabled two-step verification on your EcoCash/mobile money line?",
     "options": [{"v": "a", "t": "Yes", "w": 10}, {"v": "b", "t": "No", "w": 0}, {"v": "c", "t": "Not sure", "w": 3}],
     "fix": "Ask your mobile money provider to enable every extra security option on your line, and never share your PIN.",
     "why": "Your mobile money line is where your takings live. One stolen PIN can empty it in minutes."},
    {"id": "3", "topic": "phone", "q": "Do you use a phone lock (PIN/pattern/fingerprint) on your business phone?",
     "options": [{"v": "a", "t": "Yes", "w": 8}, {"v": "b", "t": "No", "w": 0}],
     "fix": "Set a 6-digit PIN or fingerprint lock and auto-lock after 1 minute.",
     "why": "An unlocked phone gives anyone your WhatsApp, email, banking apps and customer list."},
    {"id": "4", "topic": "passwords", "q": "Do you share your business passwords with staff or family?",
     "options": [{"v": "a", "t": "No, never", "w": 10}, {"v": "b", "t": "Sometimes", "w": 4}, {"v": "c", "t": "Yes", "w": 0}],
     "fix": "Stop sharing passwords. Give each person their own login and change any password you've shared.",
     "why": "Shared passwords can't be taken back, and you can't tell who did what when something goes wrong."},
    {"id": "5", "topic": "backups", "q": "Do you back up your business records (book, phone, or cloud)?",
     "options": [{"v": "a", "t": "Regularly", "w": 10}, {"v": "b", "t": "Rarely", "w": 5}, {"v": "c", "t": "Never", "w": 0}],
     "fix": "Export your reports monthly and keep a copy somewhere other than your phone.",
     "why": "A broken, lost or stolen phone shouldn't take your sales history and tax records with it."},
    {"id": "6", "topic": "data", "q": "Where do you store customer data?",
     "options": [{"v": "a", "t": "In Pfuma Mbiri only", "w": 10}, {"v": "b", "t": "Notebook + app", "w": 7},
                 {"v": "c", "t": "Anywhere/random", "w": 0}],
     "fix": "Keep customer details in one protected place and stop writing them on loose paper or chats.",
     "why": "Customer phone numbers and TINs are personal data, and Zimbabwe's Cyber and Data Protection Act expects you to protect them."},
    {"id": "7", "topic": "access", "q": "Do staff have their own logins with limited access?",
     "options": [{"v": "a", "t": "Yes", "w": 10}, {"v": "b", "t": "They use mine", "w": 0}],
     "fix": "Invite staff with the Staff role so they can sell but not see reports or change settings.",
     "why": "Separate logins limit the damage from mistakes and make it easy to remove someone who leaves."},
    {"id": "8", "topic": "scams", "q": "Can you spot a phishing SMS/email asking for your PIN?",
     "options": [{"v": "a", "t": "Yes, always delete them", "w": 10}, {"v": "b", "t": "Sometimes", "w": 5},
                 {"v": "c", "t": "Not sure", "w": 2}],
     "fix": "Treat any message asking for a PIN, OTP or 'verification' as a scam. No real provider asks for these.",
     "why": "Most mobile money theft starts with someone tricking the owner into reading out a code."},
    {"id": "9", "topic": "passwords", "q": "Is your WhatsApp/email account protected with two-step verification?",
     "options": [{"v": "a", "t": "Yes", "w": 8}, {"v": "b", "t": "No", "w": 0}],
     "fix": "Turn on WhatsApp two-step verification (Settings → Account → Two-step verification) and 2FA on your email.",
     "why": "Hijacked WhatsApp accounts are used to message your customers asking them to 'send money urgently'."},
    {"id": "10", "topic": "mobile_money", "q": "Do you check your mobile money statement for unknown transactions?",
     "options": [{"v": "a", "t": "Weekly or more", "w": 8}, {"v": "b", "t": "Rarely", "w": 3}, {"v": "c", "t": "Never", "w": 0}],
     "fix": "Check your mobile money statement every week and report anything you don't recognise the same day.",
     "why": "The faster you report a fraudulent transaction, the better the chance it can be stopped."},
    {"id": "11", "topic": "network", "q": "Is your Wi-Fi router password protected and changed from default?",
     "options": [{"v": "a", "t": "Yes", "w": 8}, {"v": "b", "t": "Default password", "w": 2}, {"v": "c", "t": "No Wi-Fi", "w": 8}],
     "fix": "Change the router's admin and Wi-Fi passwords from the defaults printed on the sticker.",
     "why": "Default router passwords are published online, so anyone nearby can join and snoop on your devices."},
    {"id": "12", "topic": "incident", "q": "Do you have a plan if your phone is lost or stolen?",
     "options": [{"v": "a", "t": "Yes, written down", "w": 8}, {"v": "b", "t": "Rough idea", "w": 4}, {"v": "c", "t": "No", "w": 0}],
     "fix": "Write down who to call (network, mobile money, bank) and keep it somewhere other than the phone.",
     "why": "In the first hour after a theft, knowing exactly who to call is what protects your money."},
]

# Further practices the questionnaire doesn't cover, taught alongside the score.
LESSONS = [
    {"id": "wrong-send", "topic": "mobile_money", "title": "\"I sent you money by mistake\"",
     "body": "A caller says they sent you money in error and asks you to send it back. Often nothing was sent and the 'confirmation' is a fake SMS.",
     "steps": ["Check your real balance or statement, not the SMS.",
               "Never reverse a transfer yourself. Tell them to contact the provider.",
               "Block numbers that pressure you."],
     "keywords": ["mistake", "reverse", "wrong", "sent", "refund", "ecocash", "mobile money"]},
    {"id": "fake-payment", "topic": "mobile_money", "title": "Fake payment confirmations",
     "body": "Scammers show or forward a convincing payment SMS and leave with the goods before you notice no money arrived.",
     "steps": ["Confirm the payment in your own wallet before releasing goods.",
               "Be extra careful with large or rushed orders.",
               "Record the payment reference on the sale."],
     "keywords": ["payment", "confirmation", "sms", "goods", "customer paid", "proof"]},
    {"id": "fake-zimra", "topic": "scams", "title": "Fake ZIMRA and 'tax officer' messages",
     "body": "Messages threatening penalties unless you pay immediately to a personal number are a common scam aimed at businesses.",
     "steps": ["ZIMRA will not ask for your PIN or for payment to a personal phone number.",
               "Verify any notice through ZIMRA's official website or a ZIMRA office.",
               "Pay tax only through official channels and keep the receipt."],
     "keywords": ["zimra", "tax", "penalty", "officer", "fine", "audit"]},
    {"id": "supplier-bank", "topic": "scams", "title": "Supplier 'new bank details' fraud",
     "body": "A message that looks like it's from your supplier says their account changed. Your next payment goes to a fraudster.",
     "steps": ["Confirm any bank-detail change by calling the supplier on a number you already have.",
               "Be suspicious of urgency and changes sent only by WhatsApp or email.",
               "Send a small test amount first for new accounts."],
     "keywords": ["supplier", "bank", "account", "details", "invoice", "transfer"]},
    {"id": "sim-swap", "topic": "phone", "title": "Warning signs of a SIM swap",
     "body": "If your phone suddenly shows 'No service' in an area that normally has signal, someone may have moved your number to a new SIM.",
     "steps": ["Contact your network immediately from another phone.",
               "Call your mobile money provider and bank to freeze transactions.",
               "Never give your ID number or SIM details to unsolicited callers."],
     "keywords": ["sim", "swap", "signal", "no service", "network", "number"]},
    {"id": "updates", "topic": "phone", "title": "Keep your phone and apps updated",
     "body": "Updates fix security holes that criminals actively use. Old apps from outside the official store are a common way malware gets in.",
     "steps": ["Install system updates when offered.",
               "Only install apps from the official app store.",
               "Delete apps you no longer use."],
     "keywords": ["update", "app", "virus", "malware", "install", "android"]},
    {"id": "passphrases", "topic": "passwords", "title": "Passwords that are hard to guess, easy to remember",
     "body": "Short or reused passwords are cracked quickly. A passphrase of three or four random words is far stronger.",
     "steps": ["Use a different password for email, banking and business apps.",
               "Try a passphrase like 'mango-taxi-river-42'.",
               "Change passwords anyone else has seen."],
     "keywords": ["password", "pin", "login", "account", "hacked", "passphrase"]},
    {"id": "backup-rule", "topic": "backups", "title": "A simple backup routine",
     "body": "Keep at least two copies of important records, one of them away from your shop or phone.",
     "steps": ["Export reports and tax summaries monthly.",
               "Store a copy in cloud storage or with a trusted person.",
               "Check once a quarter that you can actually open the backup."],
     "keywords": ["backup", "records", "lost", "data", "cloud", "copy"]},
    {"id": "leavers", "topic": "access", "title": "When a staff member leaves",
     "body": "Former staff with working logins or shared PINs are one of the most common causes of small-business fraud.",
     "steps": ["Remove their login the same day.",
               "Change any PIN or password they knew.",
               "Collect business phones and SIMs."],
     "keywords": ["staff", "employee", "leave", "fired", "access", "worker"]},
    {"id": "customer-privacy", "topic": "data", "title": "Collect only the customer data you need",
     "body": "The less personal data you hold, the less there is to lose. Ask customers before you use their number for marketing.",
     "steps": ["Collect a phone number and TIN only when needed for invoicing.",
               "Don't share customer lists in group chats.",
               "Delete details you no longer need."],
     "keywords": ["customer", "privacy", "data", "personal", "consent", "marketing"]},
    {"id": "public-wifi", "topic": "network", "title": "Public Wi-Fi and shared computers",
     "body": "Free Wi-Fi and internet-café computers can be watched. Avoid logging in to money apps on them.",
     "steps": ["Use mobile data for banking and mobile money.",
               "Always log out on shared computers.",
               "Don't let browsers save passwords on shared machines."],
     "keywords": ["wifi", "wi-fi", "internet", "cafe", "public", "computer"]},
    {"id": "lost-phone", "topic": "incident", "title": "Your phone is lost or stolen: the first hour",
     "body": "Speed matters more than anything else.",
     "steps": ["Call your network to block the SIM.",
               "Call your mobile money provider and bank to freeze accounts.",
               "Change your email and WhatsApp passwords from another device.",
               "Use Find My Device to lock or erase the phone."],
     "keywords": ["lost", "stolen", "theft", "robbed", "phone", "missing"]},
]


def public_questions() -> list[dict]:
    """Questions for the client: no fix/why text (shown after scoring)."""
    return [
        {"id": q["id"], "q": q["q"], "topic": q["topic"], "topic_label": TOPICS[q["topic"]],
         "options": q["options"]}
        for q in QUESTIONS
    ]


def all_lessons() -> list[dict]:
    return [_lesson_json(l) for l in LESSONS]


def _lesson_json(lesson: dict) -> dict:
    return {k: lesson[k] for k in ("id", "topic", "title", "body", "steps")} | {
        "topic_label": TOPICS[lesson["topic"]]}


def evaluate(answers: dict) -> dict:
    """Deterministic score, prioritised fixes, strengths and relevant lessons."""
    answers = {str(k): v for k, v in (answers or {}).items()}
    total_weight = score = 0
    fixes, strengths, unanswered = [], [], 0
    topic_gap: dict[str, int] = {}
    for q in QUESTIONS:
        best = max(o["w"] for o in q["options"])
        chosen = next((o for o in q["options"] if o["v"] == answers.get(q["id"])), None)
        if not chosen:
            unanswered += 1
            continue
        total_weight += best
        score += chosen["w"]
        topic_gap[q["topic"]] = topic_gap.get(q["topic"], 0) + (best - chosen["w"])
        if chosen["w"] < best / 2:
            fixes.append({"question_id": q["id"], "topic": q["topic"], "topic_label": TOPICS[q["topic"]],
                          "priority": "high" if chosen["w"] == 0 else "medium",
                          "action": q["fix"], "why": q["why"], "question": q["q"]})
        elif chosen["w"] == best and TOPICS[q["topic"]] not in strengths:
            strengths.append(TOPICS[q["topic"]])
    final = round(score / total_weight * 100) if total_weight else 0
    fixes.sort(key=lambda f: f["priority"] != "high")

    # weakest topics first, then everything else; every lesson is still offered
    weak = sorted(topic_gap, key=lambda t: -topic_gap[t])
    order = {t: i for i, t in enumerate(weak)}
    lessons = sorted(LESSONS, key=lambda l: order.get(l["topic"], len(order)))
    return {
        "score": final,
        "band": "strong" if final >= 80 else "fair" if final >= 50 else "weak",
        "fixes": fixes,
        "strengths": strengths,
        "unanswered": unanswered,
        "lessons": [_lesson_json(l) for l in lessons],
    }


def _client():
    from intelligence.gemma_client import get_advisor_client

    client = get_advisor_client()
    # interactive page: cap the wait (the reasoning model can take ~30s on long answers)
    client.timeout = min(client.timeout or 45, 45)
    return client


def _clean(text: str) -> str:
    """Strip markdown emphasis and em dashes the model sometimes adds."""
    text = re.sub(r"\*\*?|__|^#+\s*", "", text, flags=re.M)
    return re.sub(r"\s*—\s*", ", ", text).strip()


def template_coaching(result: dict) -> str:
    parts = [f"You scored {result['score']} out of 100."]
    fixes = result["fixes"]
    if fixes:
        parts.append(f"Start here: {fixes[0]['action']}")
        if len(fixes) > 1:
            parts.append(f"Then: {fixes[1]['action']}")
    else:
        parts.append("You have no major gaps. Keep these habits and review them every few months.")
    if result["strengths"]:
        parts.append(f"You're already doing well on {', '.join(result['strengths'][:3])}.")
    return " ".join(parts)


def coaching(result: dict, use_llm: bool | None = None) -> tuple[str, bool]:
    """A short personalised coaching note. Returns (text, ai_generated)."""
    fallback = template_coaching(result)
    if use_llm is None:
        use_llm = bool(getattr(settings, "INTELLIGENCE_LLM_PHRASING", False))
    if not use_llm:
        return fallback, False
    try:
        client = _client()
        if not client.configured:
            return fallback, False
        gaps = "\n".join(f"- {f['topic_label']}: {f['action']}" for f in result["fixes"][:4]) or "- none"
        prompt = (
            "You are a friendly digital-security coach for a small business owner in Zimbabwe. "
            "Using ONLY the facts below, write 3-4 short sentences in plain English: acknowledge "
            "the score, tell them the single most important thing to do first and why, and end "
            "with encouragement. Do not invent facts about their business, do not use markdown, "
            "never ask for PINs or passwords, and do not use em dashes.\n\n"
            f"Score: {result['score']}/100 ({result['band']})\n"
            f"Gaps, most urgent first:\n{gaps}\n"
            f"Strengths: {', '.join(result['strengths']) or 'none yet'}"
        )
        res = client.suggest(prompt)
        if res.success and res.text and len(res.text) < 1200:
            return _clean(res.text), True
    except Exception:
        logger.exception("security coaching failed, template fallback")
    return fallback, False


def _match_lessons(question: str, limit: int = 3) -> list[dict]:
    q = question.lower()
    scored = [(sum(k in q for k in l["keywords"]), l) for l in LESSONS]
    return [_lesson_json(l) for s, l in sorted(scored, key=lambda x: -x[0]) if s > 0][:limit]


def ask_coach(question: str) -> dict:
    """Free-form security Q&A, scoped to SME security & fraud. Never raises."""
    question = (question or "").strip()[:500]
    related = _match_lessons(question)
    if not question:
        return {"answer": "Ask me anything about keeping your business, phone or money safe.",
                "ai_generated": False, "related": related}
    try:
        client = _client()
        if getattr(settings, "INTELLIGENCE_ENABLED", False) and client.configured:
            prompt = (
                "You are a digital-security and fraud-prevention coach for small business owners in "
                "Zimbabwe (mobile money, WhatsApp, ZIMRA, suppliers, staff, phones). Answer the "
                "question below in under 120 words of plain English with 2-4 practical steps. If it "
                "is not about security, fraud or protecting business data, politely say you can only "
                "help with security topics. Never ask for or accept PINs, passwords or codes; for "
                "account problems, tell them to contact their provider through official channels. "
                "No markdown headings and no em dashes.\n\n"
                f"Question: {question}"
            )
            res = client.suggest(prompt)
            if res.success and res.text and len(res.text) < 2000:
                return {"answer": _clean(res.text), "ai_generated": True, "related": related}
    except Exception:
        logger.exception("security coach failed, lesson fallback")
    answer = (
        "The AI coach isn't available right now. These guides match your question."
        if related else
        "The AI coach isn't available right now. Browse the guides below, and never share a PIN or code with anyone."
    )
    return {"answer": answer, "ai_generated": False, "related": related or [_lesson_json(l) for l in LESSONS[:3]]}
