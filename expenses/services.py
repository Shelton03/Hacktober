"""Services for expenses, suppliers and FDMS-validated purchase invoices.

All business logic lives here (API views stay thin) so future
WhatsApp/USSD/SMS channels can reuse it. Money is Decimal only.
"""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

from django.db.models import Sum

from core.models import log_action
from core.money import D

from .models import Expense, PurchaseInvoice, Supplier

logger = logging.getLogger(__name__)

# Seeded expense categories (GET /api/expenses/categories/)
EXPENSE_CATEGORIES = [
    "stock_purchase",
    "rent",
    "utilities",
    "salaries",
    "transport",
    "marketing",
    "office_supplies",
    "equipment",
    "professional_fees",
    "taxes_licences",
    "repairs",
    "other",
]


def list_categories() -> list[str]:
    """Seeded expense category list (API_CONTRACT: GET /api/expenses/categories/)."""
    return list(EXPENSE_CATEGORIES)


# ─────────────────────────────────────────────────────────────
# Suppliers
# ─────────────────────────────────────────────────────────────

def create_supplier(business, actor=None, *, name: str, tin: str = "",
                    phone: str = "", email: str = "") -> Supplier:
    supplier = Supplier.objects.create(
        business=business, name=name, tin=tin, phone=phone, email=email,
    )
    log_action(business, actor, "expenses.supplier_created", {"supplier_id": supplier.id, "name": name})
    return supplier


# ─────────────────────────────────────────────────────────────
# Expenses
# ─────────────────────────────────────────────────────────────

def create_expense(business, actor=None, *, date: date, category: str,
                   amount: Decimal, currency: str = "USD",
                   description: str = "", receipt_photo=None) -> Expense:
    expense = Expense(
        business=business,
        date=date,
        category=category,
        description=description or "",
        amount=D(amount),
        currency=currency or "USD",
    )
    if receipt_photo is not None:
        expense.receipt_photo = receipt_photo
    expense.save()
    log_action(business, actor, "expenses.expense_created", {
        "expense_id": expense.id,
        "category": expense.category,
        "amount": str(expense.amount),
        "currency": expense.currency,
    })
    return expense


def expense_totals(business, *, since: date | None = None) -> dict:
    """Sum of expenses (Decimal, 2dp) optionally since a date."""
    qs = business.expenses.all()
    if since is not None:
        qs = qs.filter(date__gte=since)
    total = qs.aggregate(total=Sum("amount"))["total"]
    return {"total": D(total or 0)}


# ─────────────────────────────────────────────────────────────
# Purchase invoices (input VAT — only claimable once FDMS-validated)
# ─────────────────────────────────────────────────────────────

def active_fiscal_device(business):
    """The business's active FiscalDevice (sales.models.FiscalDevice) or None."""
    from sales.models import FiscalDevice

    return (
        FiscalDevice.objects.filter(business=business, is_active=True)
        .order_by("-id")
        .first()
    )


def create_purchase_invoice(business, actor=None, *, supplier=None,
                           supplier_invoice_no: str = "", fiscal_invoice_no: str = "",
                           description: str = "", amount: Decimal,
                           vat_amount: Decimal = 0, currency: str = "USD",
                           date: date, validate: bool = True) -> PurchaseInvoice:
    """Create a purchase invoice; FDMS-validate it when possible.

    - Active fiscal device + fiscal_invoice_no → MockFiscalService
      .validate_purchase_invoice() → fdms_validated=True, validation_ref set.
    - No device (or no fiscal number) → invoice saved, fdms_validated stays False
      (input VAT NOT claimable until validated).
    """
    invoice = PurchaseInvoice(
        business=business,
        supplier=supplier,
        supplier_invoice_no=supplier_invoice_no or "",
        fiscal_invoice_no=fiscal_invoice_no or "",
        description=description or "",
        amount=D(amount),
        vat_amount=D(vat_amount or 0),
        currency=currency or "USD",
        date=date,
    )

    device = active_fiscal_device(business) if validate else None
    if device is None:
        invoice.fdms_validated = False
        invoice.save()
        log_action(business, actor, "expenses.purchase_invoice_created", {
            "invoice_id": invoice.id,
            "amount": str(invoice.amount),
            "fdms_validated": False,
            "reason": "no_active_fiscal_device",
        })
        return invoice

    result = _validate_with_fdms(device, invoice.fiscal_invoice_no, invoice.amount)
    if result is None:  # no fiscal number supplied → cannot validate
        invoice.fdms_validated = False
        invoice.save()
        log_action(business, actor, "expenses.purchase_invoice_created", {
            "invoice_id": invoice.id,
            "amount": str(invoice.amount),
            "fdms_validated": False,
            "reason": "missing_fiscal_invoice_no",
        })
        return invoice

    ok, ref, error = result
    if ok:
        invoice.fdms_validated = True
        invoice.validation_ref = ref
        from django.utils import timezone as dj_tz

        invoice.validated_at = dj_tz.now()
    invoice.save()
    log_action(business, actor, "expenses.purchase_invoice_created", {
        "invoice_id": invoice.id,
        "amount": str(invoice.amount),
        "fdms_validated": invoice.fdms_validated,
        "validation_ref": invoice.validation_ref,
        "error": error or "",
    })
    return invoice


def _validate_with_fdms(device, fiscal_invoice_no: str, amount: Decimal):
    """Call MockFiscalService.validate_purchase_invoice().

    Returns (ok, validation_ref, error) or None when a fiscal number is missing.
    """
    if not fiscal_invoice_no:
        return None
    from sales.mock_fiscal import MockFiscalService

    result = MockFiscalService().validate_purchase_invoice(device, fiscal_invoice_no, amount)
    if not result.ok:
        logger.warning("FDMS purchase-invoice validation failed: %s", result.error)
        return (False, "", result.error)
    ref = str(result.data.get("validation_ref", "") or "")
    return (True, ref, "")


def validated_input_vat(business, *, since: date | None = None,
                        until: date | None = None) -> Decimal:
    """Input VAT claimable in a period — ONLY from FDMS-validated invoices."""
    qs = business.purchase_invoices.filter(fdms_validated=True)
    if since is not None:
        qs = qs.filter(date__gte=since)
    if until is not None:
        qs = qs.filter(date__lte=until)
    total = qs.aggregate(total=Sum("vat_amount"))["total"]
    return D(total or 0)
