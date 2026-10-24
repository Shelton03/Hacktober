"""
Intelligence test: prove Gemma-via-Vertex connectivity in one command.

Usage:
    python manage.py test_intelligence            # config check + live call
    python manage.py test_intelligence --full     # also an advisor-style task
    python manage.py test_intelligence --json     # machine-readable output

Exit code 0 = live call succeeded; 1 = failed (e.g. key missing/invalid).
"""
import json

from django.conf import settings
from django.core.management.base import BaseCommand

from intelligence.gemma_client import GemmaVertexClient


class Command(BaseCommand):
    help = "Test the Gemma-via-Vertex-AI intelligence layer (config + live call)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--full", action="store_true",
            help="Also run an advisor-style phrasing task with fact constraints.",
        )
        parser.add_argument(
            "--json", action="store_true",
            help="Print machine-readable JSON output.",
        )

    def handle(self, *args, **options):
        client = GemmaVertexClient()
        report = {
            "configured": client.configured,
            "api_key_present": bool(settings.GOOGLE_API_KEY),
            "model": client.model,
            "endpoint": client.endpoint,
            "intelligence_enabled": settings.INTELLIGENCE_ENABLED,
            "llm_phrasing_enabled": settings.INTELLIGENCE_LLM_PHRASING,
            "project_pinned": bool(client.project),
        }

        def emit(msg):
            if not options["json"]:
                self.stdout.write(msg)

        emit(self.style.MIGRATE_LABEL("Intelligence test — Gemma via Vertex AI"))
        emit(f"  model           : {report['model']}")
        emit(f"  endpoint        : {report['endpoint']}")
        emit(f"  API key         : {'present' if report['api_key_present'] else 'MISSING (set GOOGLE_API_KEY in .env)'}")
        emit(f"  feature flags   : intelligence={report['intelligence_enabled']} llm_phrasing={report['llm_phrasing_enabled']}")

        if not report["configured"]:
            report["live"] = {"success": False, "error": "GOOGLE_API_KEY not set in .env"}
            emit(self.style.WARNING("\nNo API key configured — live call skipped."))
            emit("Paste your Vertex AI API key into GOOGLE_API_KEY in .env and rerun.")
            if options["json"]:
                self.stdout.write(json.dumps(report, indent=2))
            raise SystemExit(1)

        # --- live call 1: basic connectivity ---
        prompt = (
            "Reply with exactly this sentence and nothing else: "
            "Pfuma Mbiri intelligence layer online."
        )
        result = client.suggest(prompt)
        report["live"] = result.to_dict()
        if result.success:
            emit(self.style.SUCCESS(
                f"\n  live call OK    : {result.elapsed_s:.1f}s, {len(result.text)} chars"
            ))
            emit(f"  model said      : {result.text[:160]}")
        else:
            emit(self.style.ERROR(f"\n  live call FAILED: {result.error[:300]}"))

        # --- live call 2: advisor-style, fact-constrained phrasing ---
        if options["full"] and result.success:
            facts = (
                "COMPUTED FACTS (do not change or add any numbers):\n"
                "- insight: cash-flow warning\n"
                "- cash on hand: 340 USD\n"
                "- known upcoming expense: 500 USD rent due in 5 days\n"
                "- projected shortfall: 160 USD\n"
                "- overdue invoices: 2, totalling 220 USD\n"
            )
            task = (
                facts
                + "\nRewrite this as a short, friendly message (max 3 sentences) to a "
                "Zimbabwean small-business owner. Use ONLY the numbers above."
            )
            r2 = client.suggest(task)
            report["advisor_style"] = r2.to_dict()
            if r2.success:
                emit(self.style.SUCCESS(f"\n  advisor-style OK: {r2.elapsed_s:.1f}s"))
                emit(f"  model said      : {r2.text[:300]}")
            else:
                emit(self.style.ERROR(f"\n  advisor-style FAILED: {r2.error[:300]}"))

        if options["json"]:
            self.stdout.write(json.dumps(report, indent=2))

        if not result.success:
            raise SystemExit(1)
        emit(self.style.SUCCESS("\nIntelligence layer: ONLINE"))
