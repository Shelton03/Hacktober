"""Lender demo API tests — role gate, banner, and the four GET endpoints.

DEMO — sample data only. Run: .venv/bin/python manage.py test lender -v 1
"""
from datetime import datetime, timezone as dt_timezone
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from lender.models import FraudAlert, LenderSme, LoanApplication

User = get_user_model()

BANNER = "DEMO — sample data"


class LenderTestBase(TestCase):
    """Two users: one with is_lender=True, one without. Global demo records."""

    @classmethod
    def setUpTestData(cls):
        cls.lender_user = User.objects.create_user(
            username="lender@test.com", email="lender@test.com", password="demo1234",
            is_lender=True,
        )
        cls.plain_user = User.objects.create_user(
            username="plain@test.com", email="plain@test.com", password="demo1234",
        )
        cls.sme = LenderSme.objects.create(
            ref_id="SME-001",
            name="Tendai Tuckshop",
            sector="Retail",
            location="Harare",
            health_score=82,
            risk_band="B",
            monthly_revenue_trend=[
                {"month": "2026-05", "revenue": "1250.00"},
                {"month": "2026-06", "revenue": "1380.00"},
            ],
            compliance_history=[
                {"month": "2026-05", "score": 88},
                {"month": "2026-06", "score": 91},
            ],
            credit_score=712,
            credit_reasons=[
                "6 months of verified fiscal sales",
                "Consistent VAT filing history",
                "QPD payments on schedule",
                "Low expense volatility",
                "No prior defaults",
                "Extra reason beyond top-5",  # must be cut to 5
            ],
            consent_status="granted",
        )
        cls.alert = FraudAlert.objects.create(
            sme=cls.sme,
            kind="sim_swap_before_loan_request",
            severity="critical",
            explanation="SIM swap detected 2 days before loan request.",
            suggested_action="Verify identity via in-person branch visit.",
            detected_at=datetime(2026, 10, 20, 9, 30, tzinfo=dt_timezone.utc),
        )
        cls.application = LoanApplication.objects.create(
            sme=cls.sme,
            amount=Decimal("5000.00"),
            currency="USD",
            purpose="Stock purchase for festive season",
            suggested="recommend",
            reasons=["Verified sales trend rising", "Compliance score above 85"],
            submitted_at=datetime(2026, 10, 21, 12, 0, tzinfo=dt_timezone.utc),
        )

    def setUp(self):
        self.client = APIClient()

    def api(self, path, *, user, method="get"):
        self.client.force_authenticate(user=user)
        return getattr(self.client, method)(f"/api/lender/{path}")


class RoleGateTests(LenderTestBase):
    """403 for non-lenders and anonymous users on every /api/lender/* route."""

    def test_anonymous_gets_403(self):
        paths = ["portfolio/", "alerts/", "applications/", f"smes/{self.sme.id}/"]
        for p in paths:
            response = self.client.get(f"/api/lender/{p}")
            self.assertEqual(response.status_code, 403, msg=p)

    def test_non_lender_user_gets_403(self):
        paths = ["portfolio/", "alerts/", "applications/", f"smes/{self.sme.id}/"]
        for p in paths:
            response = self.api(p, user=self.plain_user)
            self.assertEqual(response.status_code, 403, msg=p)
            self.assertIn("detail", response.data)

    def test_lender_user_gets_200(self):
        paths = ["portfolio/", "alerts/", "applications/", f"smes/{self.sme.id}/"]
        for p in paths:
            response = self.api(p, user=self.lender_user)
            self.assertEqual(response.status_code, 200, msg=p)


class BannerTests(LenderTestBase):
    """Every response payload includes banner: 'DEMO — sample data'."""

    def test_banner_on_all_endpoints(self):
        paths = ["portfolio/", "alerts/", "applications/", f"smes/{self.sme.id}/"]
        for p in paths:
            response = self.api(p, user=self.lender_user)
            self.assertEqual(response.data.get("banner"), BANNER, msg=p)


class PortfolioTests(LenderTestBase):
    """GET /api/lender/portfolio/ — list of sample SMEs."""

    def test_portfolio_lists_smes(self):
        response = self.api("portfolio/", user=self.lender_user)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        sme = response.data["smes"][0]
        self.assertEqual(sme["id"], self.sme.id)
        self.assertEqual(sme["ref_id"], "SME-001")
        self.assertEqual(sme["risk_band"], "B")
        self.assertEqual(sme["health_score"], 82)
        self.assertEqual(sme["revenue_trend"][0]["month"], "2026-05")


class SmeDetailTests(LenderTestBase):
    """GET /api/lender/smes/<id>/ — profile, compliance, credit, consent."""

    def test_sme_detail_shape(self):
        response = self.api(f"smes/{self.sme.id}/", user=self.lender_user)
        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertEqual(data["name"], "Tendai Tuckshop")
        self.assertEqual(data["verified_sales_trend"][1]["revenue"], "1380.00")
        self.assertEqual(data["compliance_history"][0]["score"], 88)
        self.assertEqual(data["credit_score"], 712)
        self.assertEqual(len(data["credit_reasons"]), 5)  # top-5 only
        self.assertNotIn("Extra reason beyond top-5", data["credit_reasons"])
        self.assertEqual(data["consent_status"], "granted")

    def test_sme_detail_404_for_missing(self):
        response = self.api("smes/99999/", user=self.lender_user)
        self.assertEqual(response.status_code, 404)
        self.assertIn("detail", response.data)


class AlertsTests(LenderTestBase):
    """GET /api/lender/alerts/ — fraud alert feed."""

    def test_alerts_feed(self):
        response = self.api("alerts/", user=self.lender_user)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        alert = response.data["alerts"][0]
        self.assertEqual(alert["kind"], "sim_swap_before_loan_request")
        self.assertEqual(alert["severity"], "critical")
        self.assertEqual(alert["sme"]["name"], "Tendai Tuckshop")
        self.assertIn("explanation", alert)
        self.assertIn("suggested_action", alert)
        self.assertTrue(alert["detected_at"].startswith("2026-10-20"))

    def test_alert_with_no_sme_serialises_none(self):
        FraudAlert.objects.create(
            sme=None,
            kind="duplicate_device_fingerprint",
            severity="info",
            explanation="Two accounts shared a device fingerprint (sample).",
            detected_at=datetime(2026, 10, 22, 8, 0, tzinfo=dt_timezone.utc),
        )
        response = self.api("alerts/", user=self.lender_user)
        self.assertEqual(response.data["count"], 2)
        orphan = next(a for a in response.data["alerts"] if a["sme"] is None)
        self.assertEqual(orphan["kind"], "duplicate_device_fingerprint")


class ApplicationsTests(LenderTestBase):
    """GET /api/lender/applications/ — queue with suggest + reasons."""

    def test_applications_queue(self):
        response = self.api("applications/", user=self.lender_user)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        app = response.data["applications"][0]
        self.assertEqual(app["amount"], "5000.00")  # 2dp string money
        self.assertEqual(app["currency"], "USD")
        self.assertIn(app["suggested"], ("recommend", "review", "decline"))
        self.assertEqual(app["suggested"], "recommend")
        self.assertEqual(app["reasons"][0], "Verified sales trend rising")
        self.assertEqual(app["sme"]["name"], "Tendai Tuckshop")
        self.assertTrue(app["submitted_at"].startswith("2026-10-21"))

    def test_applications_newest_first(self):
        other = LenderSme.objects.create(
            ref_id="SME-002", name="Chipo Catering", sector="Food",
            location="Bulawayo", health_score=41, risk_band="E",
            credit_score=430, consent_status="none",
        )
        LoanApplication.objects.create(
            sme=other, amount=Decimal("800.00"), currency="USD",
            purpose="Equipment repair", suggested="decline",
            reasons=["No verified sales history"],
            submitted_at=datetime(2026, 10, 23, 10, 0, tzinfo=dt_timezone.utc),
        )
        response = self.api("applications/", user=self.lender_user)
        names = [a["sme"]["name"] for a in response.data["applications"]]
        self.assertEqual(names, ["Chipo Catering", "Tendai Tuckshop"])


class ReadOnlyTests(LenderTestBase):
    """No write endpoints: POST/PUT/DELETE are rejected on every route."""

    def test_post_put_delete_rejected(self):
        paths = ["portfolio/", "alerts/", "applications/"]
        for p in paths:
            self.assertEqual(
                self.api(p, user=self.lender_user, method="post").status_code,
                405, msg=f"POST {p}")
            self.assertEqual(
                self.api(p, user=self.lender_user, method="put").status_code,
                405, msg=f"PUT {p}")
            self.assertEqual(
                self.api(p, user=self.lender_user, method="delete").status_code,
                405, msg=f"DELETE {p}")
