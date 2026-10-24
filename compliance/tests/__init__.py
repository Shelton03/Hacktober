"""Compliance app tests: tax config seeding, VAT summary, QPD, compliance
score/issues, exports and API endpoints (tenant-isolated).

Run: .venv/bin/python manage.py test compliance -v 1
"""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Business, Membership
from compliance.models import ComplianceIssue, TaxConfig, TaxEstimate
from compliance.seed_values import seed_tax_config
from compliance.services import (
    compliance_score,
    estimated_taxable_income,
    export_csv,
    export_pdf,
    parse_period,
    qpd_schedule,
    scan_issues,
    vat_summary,
)
from expenses.models import Expense, PurchaseInvoice, Supplier
from inventory.models import Product
from sales.models import Customer, FiscalDay, FiscalDevice, FiscalReceipt, Sale

User = get_user_model()


class ComplianceTestBase(TestCase):
    """Common fixtures: a user, a business, a member user of another business."""

    @classmethod
    def setUpTestData(cls):
        seed_tax_config()
        cls.user = User.objects.create_user(
            username="owner@test.com", email="owner@test.com", password="demo1234"
        )
        cls.business = Business.objects.create(
            name="Tendai Tuckshop",
            vat_registered=True,
            tin="123456789",
            default_currency="USD",
        )
        Membership.objects.create(user=cls.user, business=cls.business, role="OWNER")

        # a second business owned by someone else — for tenant isolation tests
        cls.other_user = User.objects.create_user(
            username="other@test.com", email="other@test.com", password="demo1234"
        )
        cls.other_business = Business.objects.create(name="Other Biz", tin="999")
        Membership.objects.create(user=cls.other_user, business=cls.other_business, role="OWNER")

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_BUSINESS_ID=str(self.business.id))


# ─────────────────────────────────────────────────────────────
# TaxConfig seeding
# ─────────────────────────────────────────────────────────────

class SeedTaxConfigTests(ComplianceTestBase):
    def test_seeds_upsert_without_duplicates(self):
        first_count = TaxConfig.objects.count()
        self.assertGreaterEqual(first_count, 13)
        seed_tax_config()  # idempotent
        seed_tax_config()
        self.assertEqual(TaxConfig.objects.count(), first_count)

    def test_seeded_values(self):
        def val(key):
            return TaxConfig.objects.get(key=key).value

        self.assertEqual(val("standard_rate"), "15.5")
        self.assertEqual(val("zero_rate"), "0")
        self.assertEqual(val("q1_percent"), "10")
        self.assertEqual(val("q2_percent"), "25")
        self.assertEqual(val("q3_percent"), "30")
        self.assertEqual(val("q4_percent"), "35")
        self.assertEqual(val("tax_rate"), "25")
        self.assertIn("ZIMRA", val("disclaimer"))

    def test_last_verified_populated(self):
        for row in TaxConfig.objects.all():
            self.assertIsInstance(row.last_verified, date)

    def test_qpd_due_dates(self):
        self.assertEqual(TaxConfig.objects.get(key="q1_due").value, "2026-03-25")
        self.assertEqual(TaxConfig.objects.get(key="q2_due").value, "2026-06-25")
        self.assertEqual(TaxConfig.objects.get(key="q3_due").value, "2026-09-25")
        self.assertEqual(TaxConfig.objects.get(key="q4_due").value, "2026-12-20")


# ─────────────────────────────────────────────────────────────
# VAT summary
# ─────────────────────────────────────────────────────────────

class VatSummaryTests(ComplianceTestBase):
    PERIOD = "2026-10"

    def _mk_sale(self, *, tax_total="155.00", day_date=None, fiscalised=True,
                 customer=None, doc_type="sale", buyer_data=None):
        sale = Sale.objects.create(
            business=self.business,
            doc_type=doc_type,
            customer=customer,
            tax_total=tax_total,
            subtotal="1000.00",
            total="1155.00",
            date=day_date or date(2026, 10, 10),
            buyer_data=buyer_data or {},
        )
        if fiscalised:
            device = FiscalDevice.objects.filter(business=self.business).first() or \
                FiscalDevice.objects.create(business=self.business, device_id="DEV1", serial_no="SN1")
            day = FiscalDay.objects.create(
                device=device, fiscal_day_no=sale.id + 1, day_date=sale.date,
                state="closed",
            )
            FiscalReceipt.objects.create(sale=sale, device=device, fiscal_day=day,
                                         receipt_counter=1, receipt_global_no=sale.id)
        return sale

    def test_vat_summary_math(self):
        self._mk_sale(tax_total="155.00")
        self._mk_sale(tax_total="50.00", day_date=date(2026, 10, 12))
        # non-fiscalised sale must NOT count
        self._mk_sale(tax_total="999.00", fiscalised=False)
        # out-of-period sale must not count
        self._mk_sale(tax_total="77.00", day_date=date(2026, 9, 30))

        supplier = Supplier.objects.create(business=self.business, name="Supp")
        # validated purchase: counts as input VAT
        PurchaseInvoice.objects.create(
            business=self.business, supplier=supplier, amount="200.00",
            vat_amount="31.00", date=date(2026, 10, 5), fdms_validated=True,
        )
        # non-validated purchase: must NOT count
        PurchaseInvoice.objects.create(
            business=self.business, supplier=supplier, amount="100.00",
            vat_amount="15.50", date=date(2026, 10, 6), fdms_validated=False,
        )
        # validated but out of period: must not count
        PurchaseInvoice.objects.create(
            business=self.business, supplier=supplier, amount="10.00",
            vat_amount="1.55", date=date(2026, 9, 1), fdms_validated=True,
        )

        summary = vat_summary(self.business, self.PERIOD)
        self.assertEqual(summary["output_vat"], Decimal("205.00"))
        self.assertEqual(summary["input_vat"], Decimal("31.00"))
        self.assertEqual(summary["vat_payable"], Decimal("174.00"))
        # due 25th of following month
        self.assertEqual(summary["due_date"], date(2026, 11, 25))

    def test_vat_estimate_stored(self):
        self._mk_sale(tax_total="155.00")
        vat_summary(self.business, self.PERIOD)
        est = TaxEstimate.objects.get(business=self.business, kind="vat", period=self.PERIOD)
        self.assertEqual(est.estimated_amount, Decimal("155.00"))
        self.assertEqual(est.due_date, date(2026, 11, 25))
        # recompute → upsert, no duplicate
        vat_summary(self.business, self.PERIOD)
        self.assertEqual(
            TaxEstimate.objects.filter(business=self.business, kind="vat",
                                       period=self.PERIOD).count(),
            1,
        )

    def test_empty_period(self):
        summary = vat_summary(self.business, "2026-02")
        self.assertEqual(summary["output_vat"], Decimal("0.00"))
        self.assertEqual(summary["vat_payable"], Decimal("0.00"))
        self.assertEqual(summary["due_date"], date(2026, 3, 25))

    def test_bad_period_raises(self):
        with self.assertRaises(ValueError):
            vat_summary(self.business, "not-a-period")
        with self.assertRaises(ValueError):
            vat_summary(self.business, "2026-13")


# ─────────────────────────────────────────────────────────────
# QPD
# ─────────────────────────────────────────────────────────────

class QpdTests(ComplianceTestBase):
    def _mk_books(self, year=2026):
        # revenue 10,000 (subtotal), expenses 2,000, COGS from product cost
        cust = Customer.objects.create(business=self.business, name="C")
        product = Product.objects.create(
            business=self.business, name="Widget", cost_price="5.00",
            selling_price="10.00",
        )
        sale = Sale.objects.create(
            business=self.business, doc_type="sale", customer=cust,
            subtotal="10000.00", tax_total="1550.00", total="11550.00",
            date=date(year, 5, 5),
        )
        from sales.models import SaleLine
        SaleLine.objects.create(
            sale=sale, product=product, name="Widget", qty=Decimal("100"),
            unit_price="100.00", line_total="10000.00",
        )
        Expense.objects.create(
            business=self.business, category="rent", amount="2000.00",
            date=date(year, 6, 1),
        )
        # out-of-year rows must not count
        Expense.objects.create(
            business=self.business, category="old", amount="9999.00",
            date=date(year - 1, 6, 1),
        )
        return sale

    def test_taxable_income_from_books(self):
        self._mk_books()
        books = estimated_taxable_income(self.business, 2026)
        # revenue 10000 - expenses 2000 - COGS (100 × 5.00 = 500) = 7500
        self.assertEqual(books["revenue"], Decimal("10000.00"))
        self.assertEqual(books["expenses"], Decimal("2000.00"))
        self.assertEqual(books["cogs"], Decimal("500.00"))
        self.assertEqual(books["taxable_income"], Decimal("7500.00"))

    def test_qpd_schedule(self):
        self._mk_books()
        schedule = qpd_schedule(self.business, 2026)
        self.assertEqual(len(schedule), 4)
        # annual tax = 7500 × 25% = 1875.00
        annual = Decimal("1875.00")
        expected = [
            (1, Decimal("10"), date(2026, 3, 25), annual * Decimal("0.10")),
            (2, Decimal("25"), date(2026, 6, 25), annual * Decimal("0.25")),
            (3, Decimal("30"), date(2026, 9, 25), annual * Decimal("0.30")),
            (4, Decimal("35"), date(2026, 12, 20), annual * Decimal("0.35")),
        ]
        for entry, (q, pct, due, payment) in zip(schedule, expected):
            self.assertEqual(entry["qtr"], q)
            self.assertEqual(entry["percent"], pct)
            self.assertEqual(entry["due_date"], due)
            self.assertEqual(entry["estimated_tax"], annual)
            self.assertEqual(entry["payment"], payment)

    def test_qpd_estimates_stored(self):
        self._mk_books()
        qpd_schedule(self.business, 2026)
        self.assertEqual(
            TaxEstimate.objects.filter(business=self.business, kind="qpd").count(), 4
        )
        q3 = TaxEstimate.objects.get(business=self.business, kind="qpd", period="2026-Q3")
        self.assertEqual(q3.estimated_amount, Decimal("562.50"))
        self.assertEqual(q3.due_date, date(2026, 9, 25))
        # idempotent recompute
        qpd_schedule(self.business, 2026)
        self.assertEqual(
            TaxEstimate.objects.filter(business=self.business, kind="qpd").count(), 4
        )

    def test_qpd_loss_year_clamps_to_zero(self):
        Expense.objects.create(
            business=self.business, category="huge", amount="99999.00",
            date=date(2026, 2, 2),
        )
        schedule = qpd_schedule(self.business, 2026)
        for entry in schedule:
            self.assertEqual(entry["payment"], Decimal("0.00"))
            self.assertEqual(entry["estimated_tax"], Decimal("0.00"))


# ─────────────────────────────────────────────────────────────
# Compliance score + issue scan
# ─────────────────────────────────────────────────────────────

class ComplianceScoreTests(TestCase):
    def test_score_math(self):
        class I:
            def __init__(self, severity, status="active"):
                self.severity = severity
                self.status = status

        self.assertEqual(compliance_score([]), 100)
        self.assertEqual(compliance_score([I("critical")]), 90)
        self.assertEqual(compliance_score([I("critical"), I("warning")]), 85)
        self.assertEqual(
            compliance_score([I("critical"), I("warning"), I("info")]), 83
        )
        # dismissed/resolved don't count
        self.assertEqual(
            compliance_score([I("critical", "dismissed"), I("info", "resolved")]), 100
        )
        # floor at 0
        many = [I("critical") for _ in range(15)]
        self.assertEqual(compliance_score(many), 0)


class ScanIssuesTests(ComplianceTestBase):
    def _fiscal_setup(self):
        device = FiscalDevice.objects.create(
            business=self.business, device_id="DEV1", serial_no="SN1"
        )
        return device

    def _mk_fiscal_sale(self, device, *, customer=None, buyer_data=None,
                        day_date=None):
        sale = Sale.objects.create(
            business=self.business, doc_type="sale", customer=customer,
            subtotal="100.00", tax_total="15.50", total="115.50",
            date=day_date or date(2026, 10, 20), buyer_data=buyer_data or {},
        )
        day = FiscalDay.objects.create(
            device=device, fiscal_day_no=1, day_date=sale.date, state="closed"
        )
        FiscalReceipt.objects.create(
            sale=sale, device=device, fiscal_day=day,
            receipt_counter=1, receipt_global_no=1,
        )
        return sale

    def test_clean_business_no_issues(self):
        device = self._fiscal_setup()
        # fiscalised sale WITH a TIN
        cust = Customer.objects.create(
            business=self.business, name="Tinned", tin="111222333"
        )
        self._mk_fiscal_sale(device, customer=cust)
        issues = scan_issues(self.business, persist=True)
        self.assertEqual(issues, [])
        self.assertEqual(
            ComplianceIssue.objects.filter(business=self.business).count(), 0
        )

    def test_missing_buyer_tin_issue(self):
        device = self._fiscal_setup()
        no_tin = Customer.objects.create(business=self.business, name="NoTin")
        self._mk_fiscal_sale(device, customer=no_tin)
        issues = scan_issues(self.business, persist=True)
        codes = {i.code for i in issues}
        self.assertIn("missing_buyer_tin", codes)
        issue = next(i for i in issues if i.code == "missing_buyer_tin")
        self.assertEqual(issue.severity, "warning")

    def test_buyer_data_tin_rescues_issue(self):
        device = self._fiscal_setup()
        sale = self._mk_fiscal_sale(
            device,
            buyer_data={"buyerTIN": "000111222"},
        )
        issues = scan_issues(self.business, persist=True)
        self.assertEqual([i.code for i in issues if i.code == "missing_buyer_tin"], [])

    def test_fiscal_day_not_closed_issue(self):
        device = self._fiscal_setup()
        yesterday = date.today() - timedelta(days=1)
        FiscalDay.objects.create(
            device=device, fiscal_day_no=2, day_date=yesterday, state="open"
        )
        issues = scan_issues(self.business, persist=True)
        codes = {i.code for i in issues}
        self.assertIn("fiscal_day_not_closed", codes)
        issue = next(i for i in issues if i.code == "fiscal_day_not_closed")
        self.assertEqual(issue.severity, "critical")

    def test_purchase_not_validated_issue(self):
        supplier = Supplier.objects.create(business=self.business, name="S")
        PurchaseInvoice.objects.create(
            business=self.business, supplier=supplier, amount="50.00",
            vat_amount="7.75", date=date(2026, 10, 1), fdms_validated=False,
        )
        issues = scan_issues(self.business, persist=True)
        codes = {i.code for i in issues}
        self.assertIn("purchase_not_validated", codes)

    def test_resolved_when_condition_disappears(self):
        device = self._fiscal_setup()
        no_tin = Customer.objects.create(business=self.business, name="NoTin")
        sale = self._mk_fiscal_sale(device, customer=no_tin)
        scan_issues(self.business, persist=True)
        self.assertTrue(
            ComplianceIssue.objects.filter(
                business=self.business, code="missing_buyer_tin", status="active"
            ).exists()
        )
        # fix: give the customer a TIN → re-scan auto-resolves
        no_tin.tin = "123123123"
        no_tin.save()
        scan_issues(self.business, persist=True)
        issue = ComplianceIssue.objects.get(
            business=self.business, code="missing_buyer_tin"
        )
        self.assertEqual(issue.status, "resolved")

    def test_reactivate_dismissed_issue(self):
        device = self._fiscal_setup()
        no_tin = Customer.objects.create(business=self.business, name="NoTin")
        self._mk_fiscal_sale(device, customer=no_tin)
        scan_issues(self.business, persist=True)
        issue = ComplianceIssue.objects.get(
            business=self.business, code="missing_buyer_tin"
        )
        issue.status = "dismissed"
        issue.save()
        scan_issues(self.business, persist=True)
        issue.refresh_from_db()
        self.assertEqual(issue.status, "active")


# ─────────────────────────────────────────────────────────────
# API endpoints
# ─────────────────────────────────────────────────────────────

class ApiTests(ComplianceTestBase):
    def _mk_fiscal_sale(self, day_date=None, customer=None):
        device = FiscalDevice.objects.create(
            business=self.business, device_id="DEV1", serial_no="SN1"
        )
        sale = Sale.objects.create(
            business=self.business, doc_type="sale", customer=customer,
            subtotal="1000.00", tax_total="155.00", total="1155.00",
            date=day_date or date(2026, 10, 10),
        )
        day = FiscalDay.objects.create(
            device=device, fiscal_day_no=1, day_date=sale.date, state="closed"
        )
        FiscalReceipt.objects.create(
            sale=sale, device=device, fiscal_day=day,
            receipt_counter=1, receipt_global_no=1,
        )
        return sale

    def test_tax_config_endpoint(self):
        response = self.client.get("/api/tax/config/")
        self.assertEqual(response.status_code, 200)
        keys = {row["key"] for row in response.json()["config"]}
        self.assertIn("standard_rate", keys)
        self.assertIn("q1_percent", keys)

    def test_vat_summary_endpoint(self):
        self._mk_fiscal_sale()
        response = self.client.get("/api/tax/vat-summary/", {"period": "2026-10"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["output_vat"], "155.00")
        self.assertEqual(body["input_vat"], "0.00")
        self.assertEqual(body["vat_payable"], "155.00")
        self.assertEqual(body["due_date"], "2026-11-25")

    def test_vat_summary_bad_period_400(self):
        response = self.client.get("/api/tax/vat-summary/", {"period": "bogus"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("detail", response.json())

    def test_qpd_endpoint(self):
        response = self.client.get("/api/tax/qpd/", {"year": "2026"})
        self.assertEqual(response.status_code, 200)
        rows = response.json()
        self.assertEqual(len(rows), 4)
        self.assertEqual(rows[0]["qtr"], 1)
        self.assertEqual(rows[0]["percent"], 10.0)
        self.assertEqual(rows[0]["due_date"], "2026-03-25")
        self.assertEqual(rows[3]["due_date"], "2026-12-20")

    def test_compliance_dashboard_endpoint(self):
        response = self.client.get("/api/compliance/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("score", body)
        self.assertIn("issues", body)
        self.assertIn("disclaimer", body)

    def test_refresh_endpoint(self):
        response = self.client.post("/api/compliance/refresh/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("score", body)
        self.assertIn("refreshed_at", body)

    def test_export_csv(self):
        response = self.client.get(
            "/api/compliance/export/", {"period": "2026-10", "format": "csv"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        text = response.content.decode()
        self.assertIn("VAT payable", text)
        self.assertIn("QPD", text)
        # CSV parses cleanly and has a header
        import csv as csv_mod
        import io
        rows = list(csv_mod.reader(io.StringIO(text)))
        self.assertEqual(rows[0], ["Item", "Value"])
        self.assertGreater(len(rows), 8)

    def test_export_pdf(self):
        response = self.client.get(
            "/api/compliance/export/", {"period": "2026-10", "format": "pdf"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))

    def test_export_bad_format_400(self):
        # unknown format: DRF negotiation 404s on ?format=xls before our
        # handler runs (documented DRF behaviour); the `fmt` alias reaches us
        r = self.client.get(
            "/api/compliance/export/", {"period": "2026-10", "format": "xls"}
        )
        self.assertIn(r.status_code, (400, 404))
        r2 = self.client.get(
            "/api/compliance/export/", {"period": "2026-10", "fmt": "xls"}
        )
        self.assertEqual(r2.status_code, 400)
        body = r2.json()
        self.assertEqual(body["detail"], "format must be 'csv' or 'pdf'.")

    def test_export_bad_period_400(self):
        response = self.client.get(
            "/api/compliance/export/", {"period": "2026-XX", "format": "csv"}
        )
        self.assertEqual(response.status_code, 400)

    def test_dismiss_endpoint(self):
        issue = ComplianceIssue.objects.create(
            business=self.business, code="missing_buyer_tin", severity="warning",
            title="Test issue", suggested_fix="Fix it",
        )
        response = self.client.post(f"/api/compliance/{issue.id}/dismiss/")
        self.assertEqual(response.status_code, 200)
        issue.refresh_from_db()
        self.assertEqual(issue.status, "dismissed")
        # score recomputed after dismissal
        self.assertEqual(response.json()["score"], 100)

    def test_dismiss_other_tenants_issue_404(self):
        issue = ComplianceIssue.objects.create(
            business=self.other_business, code="missing_buyer_tin",
            severity="warning", title="Theirs", suggested_fix="",
        )
        response = self.client.post(f"/api/compliance/{issue.id}/dismiss/")
        self.assertEqual(response.status_code, 404)

    def test_tenant_isolation_summary(self):
        # user of business A cannot read business B's VAT summary via header
        self.client.credentials(HTTP_X_BUSINESS_ID=str(self.other_business.id))
        response = self.client.get("/api/tax/vat-summary/", {"period": "2026-10"})
        self.assertEqual(response.status_code, 404)

    def test_unauthenticated_401_or_403(self):
        anon = APIClient()
        response = anon.get("/api/compliance/")
        self.assertIn(response.status_code, (401, 403))


# ─────────────────────────────────────────────────────────────
# Exports (service level)
# ─────────────────────────────────────────────────────────────

class ExportServiceTests(ComplianceTestBase):
    def test_export_csv_contents(self):
        text = export_csv(self.business, "2026-10")
        self.assertIn("VAT payable", text)
        self.assertIn("2026-11-25", text)
        self.assertIn("QPD", text)
        self.assertIn("Estimates only", text)

    def test_export_pdf_bytes(self):
        data = export_pdf(self.business, "2026-10")
        self.assertTrue(data.startswith(b"%PDF"))
        self.assertGreater(len(data), 500)

    def test_parse_period(self):
        self.assertEqual(parse_period("2026-02"), (date(2026, 2, 1), date(2026, 2, 28)))
        self.assertEqual(parse_period("2026-12"), (date(2026, 12, 1), date(2026, 12, 31)))
        self.assertEqual(parse_period("2024-02"), (date(2024, 2, 1), date(2024, 2, 29)))
