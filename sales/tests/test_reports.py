"""Reports API: P&L arithmetic, mixes, cash flow series, range parsing."""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Business, Membership
from expenses.models import Expense
from inventory.models import Product
from sales.models import Payment, Sale, SaleLine

User = get_user_model()


class ReportsApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="r@test.com", email="r@test.com", password="x")
        cls.biz = Business.objects.create(name="Report Shop")
        Membership.objects.create(user=cls.user, business=cls.biz, role="OWNER")
        cls.today = timezone.localdate()
        product = Product.objects.create(business=cls.biz, name="Sugar 2kg", cost_price=Decimal("2.00"),
                                         selling_price=Decimal("3.00"))
        sale = Sale.objects.create(business=cls.biz, doc_type="sale", date=cls.today,
                                   subtotal=Decimal("10.00"), tax_total=Decimal("1.55"), total=Decimal("11.55"))
        SaleLine.objects.create(sale=sale, product=product, name="Sugar 2kg", qty=3,
                                unit_price=Decimal("3.85"), line_total=Decimal("11.55"))
        Sale.objects.create(business=cls.biz, doc_type="credit_note", date=cls.today,
                            subtotal=Decimal("-1.00"), tax_total=Decimal("0"), total=Decimal("-1.00"))
        Payment.objects.create(sale=sale, amount=Decimal("11.55"), date=cls.today)
        Expense.objects.create(business=cls.biz, category="rent", amount=Decimal("4.00"), date=cls.today)
        # outside the default 30-day window
        Expense.objects.create(business=cls.biz, category="rent", amount=Decimal("99.00"),
                               date=cls.today - timedelta(days=60))

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_pnl(self):
        r = self.client.get("/api/reports/pnl/").json()
        self.assertEqual(r["sales"], "9.00")         # 10 net − 1 credit note
        self.assertEqual(r["cogs"], "6.00")          # 3 × 2.00
        self.assertEqual(r["gross_profit"], "3.00")
        self.assertEqual(r["expenses"], "4.00")
        self.assertEqual(r["net_profit"], "-1.00")

    def test_mixes_and_cashflow(self):
        self.assertEqual(self.client.get("/api/reports/sales-by-product/").json()[0]["label"], "Sugar 2kg")
        self.assertEqual(self.client.get("/api/reports/sales-by-customer/").json()[0]["label"], "Walk-in")
        self.assertEqual(self.client.get("/api/reports/expenses-by-category/").json(),
                         [{"label": "Rent", "value": 4.0}])
        cf = self.client.get("/api/reports/cashflow/", {"from": str(self.today), "to": str(self.today)}).json()
        self.assertEqual(cf["cash_in"], [11.55])
        self.assertEqual(cf["values"], [7.55])

    def test_bad_range_and_unknown_report(self):
        self.assertEqual(self.client.get("/api/reports/pnl/", {"from": "nope"}).status_code, 400)
        self.assertEqual(self.client.get("/api/reports/nope/").status_code, 404)

    def test_dashboard_has_score_and_trend(self):
        d = self.client.get("/api/dashboard/").json()
        self.assertIsInstance(d["compliance_score"], int)
        self.assertEqual(len(d["sales_trend"]["values"]), 14)
