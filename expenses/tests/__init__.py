"""Tests for the expenses API: suppliers, expenses, FDMS-validated purchase invoices."""
import io
from datetime import date
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from PIL import Image

from accounts.models import Business, Membership
from expenses.models import Expense, PurchaseInvoice, Supplier
from expenses import services
from sales.mock_fiscal import MockFiscalService
from sales.models import FiscalDevice

User = get_user_model()

PASSWORD = "testpass123"


def png_bytes() -> bytes:
    """A tiny valid PNG for receipt photo uploads (Pillow installed)."""
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), "white").save(buf, format="PNG")
    return buf.getvalue()


class BaseAPITest(TestCase):
    """Session-authenticated + business-scoped API client."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="owner@test.com", email="owner@test.com",
            password=PASSWORD, first_name="Owner",
        )
        self.business = Business.objects.create(name="Test Hardware", default_currency="USD")
        self.membership = Membership.objects.create(
            user=self.user, business=self.business, role=Membership.Role.OWNER,
        )
        self.other_business = Business.objects.create(name="Other Business")
        self.other_user = User.objects.create_user(
            username="other@test.com", email="other@test.com", password=PASSWORD,
        )
        Membership.objects.create(
            user=self.other_user, business=self.other_business, role=Membership.Role.OWNER,
        )
        self.client.login(email="owner@test.com", password=PASSWORD)

    def api(self, method, url_name, data=None, business_id=None, **kwargs):
        """Call an API endpoint with X-Business-Id header."""
        url = reverse(f"expenses:{url_name}", args=kwargs.pop("args", None))
        headers = kwargs.pop("headers", {})
        if business_id is not None:
            headers["X-Business-Id"] = str(business_id)
        fn = getattr(self.client, method)
        return fn(url, data=data, headers=headers, **kwargs)

    def make_device(self, business=None):
        return FiscalDevice.objects.create(
            business=(business or self.business),
            device_id="DEV-001",
            serial_no="SN-001",
            taxpayer_name="Test Hardware",
            taxpayer_tin="1234567890",
        )


class SupplierAPITests(BaseAPITest):
    def test_create_and_list_suppliers(self):
        resp = self.api("post", "api-suppliers-list", {
            "name": "Zim Cables",
            "tin": "1122334455",
            "phone": "+263771234567",
            "email": "sales@zimcables.co.zw",
        }, business_id=self.business.id)
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(resp.json()["name"], "Zim Cables")
        self.assertTrue(Supplier.objects.filter(business=self.business, name="Zim Cables").exists())

        resp = self.api("get", "api-suppliers-list", business_id=self.business.id)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)

    def test_supplier_requires_name(self):
        resp = self.api("post", "api-suppliers-list", {"tin": "1"}, business_id=self.business.id)
        self.assertEqual(resp.status_code, 400)

    def test_suppliers_isolated_per_business(self):
        services.create_supplier(self.other_business, name="Secret Supplier")
        resp = self.api("get", "api-suppliers-list", business_id=self.business.id)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])

    def test_other_tenant_supplier_returns_404(self):
        supplier = services.create_supplier(self.other_business, name="Other Co")
        resp = self.api("get", "api-suppliers-detail", args=[supplier.id], business_id=self.business.id)
        self.assertEqual(resp.status_code, 404)


class ExpenseAPITests(BaseAPITest):
    def test_create_expense(self):
        resp = self.api("post", "api-expenses-list", {
            "date": "2026-10-24",
            "category": "utilities",
            "description": "October electricity",
            "amount": "125.50",
            "currency": "USD",
        }, business_id=self.business.id)
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()
        self.assertEqual(body["amount"], "125.50")
        self.assertEqual(body["category"], "utilities")
        expense = Expense.objects.get(pk=body["id"])
        self.assertEqual(expense.business, self.business)
        self.assertEqual(expense.amount, Decimal("125.50"))

    def test_create_expense_with_receipt_photo_upload(self):
        photo = SimpleUploadedFile("receipt.png", png_bytes(), content_type="image/png")
        resp = self.api("post", "api-expenses-list", {
            "date": "2026-10-24",
            "category": "transport",
            "amount": "20.00",
            "receipt_photo": photo,
        }, business_id=self.business.id)
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()
        self.assertTrue(body["receipt_photo"], body)
        expense = Expense.objects.get(pk=body["id"])
        self.assertTrue(expense.receipt_photo)
        self.assertTrue(expense.receipt_photo.name.startswith("expense_receipts/"))

    def test_expense_amount_must_be_positive(self):
        resp = self.api("post", "api-expenses-list", {
            "date": "2026-10-24", "category": "other", "amount": "-5.00",
        }, business_id=self.business.id)
        self.assertEqual(resp.status_code, 400)

    def test_expense_amount_more_than_2dp_rejected(self):
        resp = self.api("post", "api-expenses-list", {
            "date": "2026-10-24", "category": "rent", "amount": "99.999",
        }, business_id=self.business.id)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("amount", resp.json()["detail"])

    def test_expense_amount_decimal_string_preserved(self):
        resp = self.api("post", "api-expenses-list", {
            "date": "2026-10-24", "category": "rent", "amount": "99.99",
        }, business_id=self.business.id)
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(resp.json()["amount"], "99.99")
        expense = Expense.objects.get(pk=resp.json()["id"])
        self.assertEqual(expense.amount, Decimal("99.99"))
        self.assertIsInstance(expense.amount, Decimal)

    def test_expenses_isolated_per_business(self):
        Expense.objects.create(
            business=self.other_business, category="rent",
            amount=Decimal("50.00"), currency="USD", date=date(2026, 10, 1),
        )
        resp = self.api("get", "api-expenses-list", business_id=self.business.id)
        self.assertEqual(resp.json(), [])

    def test_expense_categories_endpoint(self):
        resp = self.api("get", "api-expense-categories", business_id=self.business.id)
        self.assertEqual(resp.status_code, 200)
        cats = resp.json()["categories"]
        self.assertIn("utilities", cats)
        self.assertIn("stock_purchase", cats)

    def test_expense_requires_authentication(self):
        self.client.logout()
        resp = self.client.get(reverse("expenses:api-expenses-list"))
        # DRF SessionAuthentication: anonymous → 403 Permission Denied
        self.assertEqual(resp.status_code, 403)

    def test_expense_for_other_business_returns_404(self):
        # header points at a business the user is NOT a member of
        resp = self.api("get", "api-expenses-list", business_id=self.other_business.id)
        self.assertEqual(resp.status_code, 404)

        # and the other tenant's data never leaks through list endpoints
        Expense.objects.create(
            business=self.other_business, category="rent",
            amount=Decimal("50.00"), currency="USD", date=date(2026, 10, 1),
        )
        resp = self.api("get", "api-expenses-list", business_id=self.business.id)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])


class PurchaseInvoiceAPITests(BaseAPITest):
    def invoice_payload(self, **overrides):
        payload = {
            "supplier_invoice_no": "INV-998",
            "fiscal_invoice_no": "FI-00123",
            "description": "Stock purchase",
            "date": "2026-10-24",
            "amount": "500.00",
            "vat_amount": "75.00",
            "currency": "USD",
        }
        payload.update(overrides)
        return payload

    def test_create_invoice_with_fdms_validation(self):
        self.make_device()
        resp = self.api(
            "post", "api-purchase-invoices-list", self.invoice_payload(),
            business_id=self.business.id,
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()
        self.assertTrue(body["fdms_validated"], body)
        self.assertTrue(body["validation_ref"].startswith("MOCKVAL-"))
        self.assertIsNotNone(body["validated_at"])
        invoice = PurchaseInvoice.objects.get(pk=body["id"])
        self.assertTrue(invoice.fdms_validated)
        self.assertTrue(invoice.validation_ref)
        self.assertIsNotNone(invoice.validated_at)
        self.assertEqual(invoice.amount, Decimal("500.00"))
        self.assertEqual(invoice.vat_amount, Decimal("75.00"))

    def test_validation_ref_is_deterministic_hash(self):
        """MockFiscalService ref = sha256(fiscal_no:amount)[:16]."""
        import hashlib

        self.make_device()
        resp = self.api(
            "post", "api-purchase-invoices-list", self.invoice_payload(),
            business_id=self.business.id,
        )
        expected = "MOCKVAL-" + hashlib.sha256(
            b"FI-00123:500.00"
        ).hexdigest()[:16].upper()
        self.assertEqual(resp.json()["validation_ref"], expected)

    def test_create_invoice_without_device_leaves_unvalidated(self):
        # no FiscalDevice for this business
        resp = self.api(
            "post", "api-purchase-invoices-list", self.invoice_payload(),
            business_id=self.business.id,
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()
        self.assertFalse(body["fdms_validated"], body)
        self.assertEqual(body["validation_ref"], "")
        invoice = PurchaseInvoice.objects.get(pk=body["id"])
        self.assertFalse(invoice.fdms_validated)
        self.assertIsNone(invoice.validated_at)

    def test_create_invoice_without_fiscal_number_leaves_unvalidated(self):
        self.make_device()
        resp = self.api(
            "post", "api-purchase-invoices-list",
            self.invoice_payload(fiscal_invoice_no=""),
            business_id=self.business.id,
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()
        self.assertFalse(body["fdms_validated"], body)

    def test_inactive_device_does_not_validate(self):
        device = self.make_device()
        device.is_active = False
        device.save()
        resp = self.api(
            "post", "api-purchase-invoices-list", self.invoice_payload(),
            business_id=self.business.id,
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertFalse(resp.json()["fdms_validated"])

    def test_invoice_with_supplier_links_same_business(self):
        supplier = services.create_supplier(self.business, name="Cables Ltd")
        self.make_device()
        resp = self.api(
            "post", "api-purchase-invoices-list",
            self.invoice_payload(supplier=supplier.id),
            business_id=self.business.id,
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        invoice = PurchaseInvoice.objects.get(pk=resp.json()["id"])
        self.assertEqual(invoice.supplier, supplier)
        self.assertEqual(resp.json()["supplier_name"], "Cables Ltd")

    def test_invoice_rejects_other_business_supplier(self):
        other_supplier = services.create_supplier(self.other_business, name="Other Co")
        self.make_device()
        resp = self.api(
            "post", "api-purchase-invoices-list",
            self.invoice_payload(supplier=other_supplier.id),
            business_id=self.business.id,
        )
        self.assertEqual(resp.status_code, 400)

    def test_device_of_other_business_does_not_validate(self):
        # device registered to the OTHER business; invoice for ours stays unvalidated
        self.make_device(self.other_business)
        resp = self.api(
            "post", "api-purchase-invoices-list", self.invoice_payload(),
            business_id=self.business.id,
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertFalse(resp.json()["fdms_validated"])

    def test_list_invoices_isolated_per_business(self):
        PurchaseInvoice.objects.create(
            business=self.other_business, amount=Decimal("10.00"),
            date=date(2026, 10, 1),
        )
        resp = self.api(
            "get", "api-purchase-invoices-list", business_id=self.business.id,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])

    def test_fdms_service_failure_keeps_invoice_unvalidated(self):
        device = self.make_device()
        failing = mock.Mock()
        failing.ok = False
        failing.error = "FDMS unreachable"
        with mock.patch.object(
            MockFiscalService, "validate_purchase_invoice", return_value=failing
        ):
            resp = self.api(
                "post", "api-purchase-invoices-list", self.invoice_payload(),
                business_id=self.business.id,
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()
        self.assertFalse(body["fdms_validated"], body)
        invoice = PurchaseInvoice.objects.get(pk=body["id"])
        self.assertFalse(invoice.fdms_validated)
        self.assertEqual(invoice.validation_ref, "")


class ServiceTests(BaseAPITest):
    """Direct service-layer tests (channel-agnostic business logic)."""

    def test_create_purchase_invoice_validated_sets_all_fields(self):
        device = self.make_device()
        invoice = services.create_purchase_invoice(
            self.business,
            supplier=None,
            supplier_invoice_no="SI-1",
            fiscal_invoice_no="FI-777",
            amount=Decimal("250.25"),
            vat_amount=Decimal("30.00"),
            date=date(2026, 9, 30),
        )
        self.assertTrue(invoice.fdms_validated)
        self.assertTrue(invoice.validation_ref.startswith("MOCKVAL-"))
        self.assertIsNotNone(invoice.validated_at)

    def test_validated_input_vat_only_counts_validated_invoices(self):
        services.create_purchase_invoice(
            self.business, fiscal_invoice_no="FI-1",
            amount=Decimal("100.00"), vat_amount=Decimal("15.00"),
            date=date(2026, 10, 1), validate=False,
        )
        unvalidated = services.create_purchase_invoice(
            self.business, fiscal_invoice_no="",
            amount=Decimal("200.00"), vat_amount=Decimal("30.00"),
            date=date(2026, 10, 2),
        )
        self.assertFalse(unvalidated.fdms_validated)
        # no device → nothing validated → input VAT 0
        self.assertEqual(services.validated_input_vat(self.business), Decimal("0.00"))

        self.make_device()
        services.create_purchase_invoice(
            self.business, fiscal_invoice_no="FI-2",
            amount=Decimal("300.00"), vat_amount=Decimal("45.00"),
            date=date(2026, 10, 3),
        )
        self.assertEqual(
            services.validated_input_vat(self.business), Decimal("45.00")
        )

    def test_expense_totals_decimal(self):
        services.create_expense(
            self.business, date=date(2026, 10, 1),
            category="rent", amount=Decimal("100.10"),
        )
        services.create_expense(
            self.business, date=date(2026, 10, 2),
            category="utilities", amount=Decimal("50.00"),
        )
        totals = services.expense_totals(self.business)
        self.assertEqual(totals["total"], Decimal("150.10"))
        self.assertIsInstance(totals["total"], Decimal)

    def test_categories_seeded(self):
        cats = services.list_categories()
        self.assertIn("rent", cats)
        self.assertIn("other", cats)
        self.assertEqual(len(cats), len(set(cats)))
