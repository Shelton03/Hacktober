"""Security check: deterministic scoring, lessons, AI fallbacks and the API."""
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Business, Membership
from advisor import security

User = get_user_model()

ALL_BEST = {q["id"]: max(q["options"], key=lambda o: o["w"])["v"] for q in security.QUESTIONS}
ALL_WORST = {q["id"]: min(q["options"], key=lambda o: o["w"])["v"] for q in security.QUESTIONS}


class EvaluateTests(TestCase):
    def test_best_answers_score_100_with_no_fixes(self):
        r = security.evaluate(ALL_BEST)
        self.assertEqual(r["score"], 100)
        self.assertEqual(r["band"], "strong")
        self.assertEqual(r["fixes"], [])
        self.assertTrue(r["strengths"])

    def test_worst_answers_give_actionable_fixes_high_first(self):
        r = security.evaluate(ALL_WORST)
        self.assertLess(r["score"], 20)
        self.assertTrue(r["fixes"])
        self.assertEqual(r["fixes"][0]["priority"], "high")
        for f in r["fixes"]:
            self.assertFalse(f["action"].lower().startswith("fix:"))
            self.assertTrue(f["why"])

    def test_lessons_lead_with_weakest_topic(self):
        answers = dict(ALL_BEST, **{"2": "b", "10": "c"})  # both mobile money questions failed
        r = security.evaluate(answers)
        self.assertEqual(r["lessons"][0]["topic"], "mobile_money")
        self.assertEqual(len(r["lessons"]), len(security.LESSONS))

    def test_unanswered_questions_are_skipped_not_penalised(self):
        r = security.evaluate({"1": "a"})
        self.assertEqual(r["score"], 100)
        self.assertEqual(r["unanswered"], len(security.QUESTIONS) - 1)


class CoachingTests(TestCase):
    def test_template_used_when_llm_off(self):
        r = security.evaluate(ALL_WORST)
        text, ai = security.coaching(r, use_llm=False)
        self.assertFalse(ai)
        self.assertIn(str(r["score"]), text)
        self.assertIn(r["fixes"][0]["action"], text)

    @override_settings(INTELLIGENCE_ENABLED=True, INTELLIGENCE_LLM_PHRASING=True)
    def test_llm_text_used_and_markdown_stripped(self):
        fake = mock.Mock(success=True, text="**Great start.** Lock your SIM first — today")
        with mock.patch("intelligence.gemma_client.GemmaVertexClient.suggest", return_value=fake), \
                mock.patch("intelligence.gemma_client.GemmaVertexClient.configured", new=True):
            text, ai = security.coaching(security.evaluate(ALL_WORST))
        self.assertTrue(ai)
        self.assertEqual(text, "Great start. Lock your SIM first, today")

    @override_settings(INTELLIGENCE_ENABLED=False)
    def test_coach_falls_back_to_matching_lessons(self):
        out = security.ask_coach("Someone says they sent EcoCash to me by mistake")
        self.assertFalse(out["ai_generated"])
        self.assertEqual(out["related"][0]["id"], "wrong-send")


class SecurityApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="o@test.com", email="o@test.com", password="x")
        cls.biz = Business.objects.create(name="Test Shop")
        Membership.objects.create(user=cls.user, business=cls.biz, role="OWNER")

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    @override_settings(INTELLIGENCE_LLM_PHRASING=False)
    def test_assessment_roundtrip(self):
        self.assertEqual(self.client.get("/api/security/assessment/").status_code, 204)
        r = self.client.post("/api/security/assessment/", {"answers": ALL_WORST}, format="json").json()
        self.assertIn("coaching", r)
        self.assertIn("lessons", r)
        latest = self.client.get("/api/security/assessment/").json()
        self.assertEqual(latest["score"], r["score"])
        self.assertIn("taken_at", latest)

    @override_settings(INTELLIGENCE_LLM_PHRASING=False)
    def test_coaching_endpoint_template_fallback(self):
        r = self.client.post("/api/security/coaching/", {"answers": ALL_WORST}, format="json").json()
        self.assertFalse(r["ai_generated"])
        self.assertIn("out of 100", r["coaching"])

    def test_lessons_library(self):
        lessons = self.client.get("/api/security/lessons/").json()
        self.assertEqual(len(lessons), len(security.LESSONS))
        self.assertNotIn("keywords", lessons[0])

    def test_questions_hide_answers_text(self):
        qs = self.client.get("/api/security/questions/").json()
        self.assertEqual(len(qs), 12)
        self.assertNotIn("fix", qs[0])
        self.assertIn("topic_label", qs[0])


class LoanHealthTests(TestCase):
    def test_score_is_weighted_average_of_components(self):
        from advisor.services import LOAN_WEIGHTS, loan_health

        biz = Business.objects.create(name="Empty Shop")
        h = loan_health(biz)
        for v in h["components"].values():
            self.assertTrue(0 <= v <= 100)
        expected = round(sum(h["components"][k] * w for k, w in LOAN_WEIGHTS.items()) / 100)
        self.assertEqual(h["score"], expected)
        self.assertEqual(h["components"]["compliance"], 100)  # no open issues
