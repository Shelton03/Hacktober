"""Sales service layer — quick sale, invoices, payments, notes, dashboard."""
from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone as dj_tz

from core.money import D, vat_from_gross
from core.models import log_action
from sales.fiscal_workflow import (
    FiscalError,
    fiscalise_sale,
)
from sales.models import Customer, FiscalReceipt, Payment, Sale, SaleLine
from sales.fiscal_workflow import percent_for_tax_type

logger = logging.getLogger(__name__)

TAX_PERCENT = {"standard": Decimal("15.5"), "zero": Decimal("0"),
               "exempt": Decimal("0"), "withholding": Decimal("5")}


def _resolve_tax(business, spec: dict) -> tuple[str, Decimal]:
    """Return (tax_type, percent) from a line spec — product ref wins."""
    tt = spec.get("tax_type")
    if spec.get("product"):
        from inventory.models import Product

        try:
            p = Product.objects.get(pk=spec["product"], business=business)
            return p.tax_type, TAX_PERCENT.get(p.tax_type, Decimal("0"))
        except Product.DoesNotExist:
            pass
    tt = tt if tt in TAX_PERCENT else "standard"
    return tt, TAX_PERCENT[tt]


def _line_amounts(business, spec: dict) -> dict:
    qty = D(spec.get("qty", 1))
    unit_price = D(spec.get("unit_price", 0))
    tax_type, pct = _resolve_tax(business, spec)
    gross = (qty * unit_price).quantize(Decimal("0.01"))
    vat = vat_from_gross(gross, pct) if business.tax_inclusive_pricing else (gross * pct / Decimal(100)).quantize(Decimal("0.01"))
    net = gross - vat if business.tax_inclusive_pricing else gross
    total = gross if business.tax_inclusive_pricing else gross + vat
    return {"qty": qty, "unit_price": unit_price, "tax_type": tax_type,
            "tax_percent": pct, "line_total": gross if business.tax_inclusive_pricing else net + vat,
            "net": net, "vat": vat, "gross": total}


def _create_doc(business, actor, *, doc_type, lines, customer=None,
                currency="USD", date_=None, due_date=None, notes="",
                receipt_notes="", status=None) -> Sale:
    if not lines:
        raise ValueError("At least one line item is required.")
    date_ = date_ or dj_tz.localdate()
    subtotal = Decimal("0.00")
    tax_total = Decimal("0.00")
    total = Decimal("0.00")
    computed = []
    for spec in lines:
        a = _line_amounts(business, spec)
        subtotal += a["net"]
        tax_total += a["vat"]
        total += a["gross"]
        computed.append((spec, a))

    sale = Sale.objects.create(
        business=business, doc_type=doc_type, customer=customer,
        buyer_data=_buyer_data(customer), currency=currency,
        subtotal=subtotal, tax_total=tax_total, total=total,
        date=date_, due_date=due_date, notes=notes,
        receipt_notes=receipt_notes,
        status=status or (Sale.Status.COMPLETED if doc_type == Sale.DocType.SALE else Sale.Status.DRAFT),
    )
    from inventory.models import Product
    from inventory.services import adjust_stock

    for spec, a in computed:
        product = None
        if spec.get("product"):
            try:
                product = Product.objects.get(pk=spec["product"], business=business)
            except Product.DoesNotExist:
                product = None
        name = spec.get("name") or (product.name if product else "Item")
        SaleLine.objects.create(
            sale=sale, product=product, name=name, qty=a["qty"],
            unit_price=a["unit_price"], tax_type=a["tax_type"],
            tax_percent=a["tax_percent"], line_total=a["gross"],
        )
        if product:
            try:
                adjust_stock(business, product, -int(a["qty"]), "sale", f"sale:{sale.id}")
            except Exception:
                logger.exception("stock adjust failed")
    log_action(business, actor, "sales.create", {"sale": sale.id, "type": doc_type, "total": str(total)})
    return sale


def _buyer_data(customer) -> dict:
    if customer is None:
        return {}
    return {"buyerName": customer.name, "buyerAddress": customer.address or "",
            "buyerContact": customer.phone or customer.email or "",
            "buyerTIN": customer.tin or "", "buyerVATNumber": customer.vat_number or ""}


def create_quick_sale(business, actor, payload: dict) -> Sale:
    """Sale + payment + fiscalisation in one go. Offline FDMS → pending sync."""
    customer = None
    if payload.get("customer"):
        customer = Customer.objects.get(pk=payload["customer"], business=business)
    with transaction.atomic():
        sale = _create_doc(business, actor, doc_type=Sale.DocType.SALE,
                           lines=payload.get("lines", []), customer=customer,
                           currency=payload.get("currency", "USD"))
        pay = payload.get("payment", {}) or {}
        Payment.objects.create(
            sale=sale, method=pay.get("method", "cash"),
            amount=D(pay.get("amount") or sale.total),
            currency=sale.currency, date=sale.date,
        )
    try:
        fiscalise_sale(business, sale, actor)
    except FiscalError as exc:
        logger.warning("fiscalisation failed (kept as pending): %s", exc)
    return sale


def create_invoice(business, actor, payload: dict) -> Sale:
    customer = None
    if payload.get("customer"):
        customer = Customer.objects.get(pk=payload["customer"], business=business)
    return _create_doc(business, actor, doc_type=Sale.DocType.INVOICE,
                       lines=payload.get("lines", []), customer=customer,
                       currency=payload.get("currency", "USD"),
                       due_date=payload.get("due_date"),
                       notes=payload.get("notes", ""))


def record_payment(business, actor, sale: Sale, amount, method="cash",
                   date_=None, reference="") -> Payment:
    payment = Payment.objects.create(
        sale=sale, method=method, amount=D(amount), currency=sale.currency,
        date=date_ or dj_tz.localdate(), reference=reference,
    )
    paid = sum(p.amount for p in sale.payments.all())
    if paid >= sale.total:
        sale.status = Sale.Status.PAID
    elif paid > 0:
        sale.status = Sale.Status.PART_PAID
    sale.save(update_fields=["status"])
    log_action(business, actor, "sales.payment", {"sale": sale.id, "amount": str(amount)})
    return payment


def mark_sent(business, actor, sale: Sale) -> Sale:
    sale.status = Sale.Status.SENT
    sale.save(update_fields=["status"])
    log_action(business, actor, "sales.invoice_sent", {"sale": sale.id})
    return sale


def refresh_overdue(business):
    """Mark sent/part-paid invoices past due as overdue."""
    today = dj_tz.localdate()
    qs = business.sales.filter(doc_type=Sale.DocType.INVOICE, due_date__lt=today).exclude(
        status__in=[Sale.Status.PAID, Sale.Status.OVERDUE, Sale.Status.DRAFT])
    return qs.update(status=Sale.Status.OVERDUE)


def create_credit_note(business, actor, original: Sale, payload: dict) -> Sale:
    note = _create_doc(business, actor, doc_type=Sale.DocType.CREDIT_NOTE,
                       lines=payload.get("lines", []), customer=original.customer,
                       currency=original.currency, date_=dj_tz.localdate(),
                       receipt_notes=payload.get("reason", "Credit note"),
                       status=Sale.Status.COMPLETED)
    note.original = original
    note.save(update_fields=["original"])
    try:
        fiscalise_sale(business, note, actor)
    except FiscalError:
        pass
    return note


def create_debit_note(business, actor, original: Sale, payload: dict) -> Sale:
    note = _create_doc(business, actor, doc_type=Sale.DocType.DEBIT_NOTE,
                       lines=payload.get("lines", []), customer=original.customer,
                       currency=original.currency, date_=dj_tz.localdate(),
                       receipt_notes=payload.get("reason", "Debit note"),
                       status=Sale.Status.COMPLETED)
    note.original = original
    note.save(update_fields=["original"])
    try:
        fiscalise_sale(business, note, actor)
    except FiscalError:
        pass
    return note


def wa_link(sale: Sale) -> str:
    base = "http://localhost:8000"
    pdf_url = f"{base}/api/sales/{sale.id}/pdf/"
    msg = f"Hello {sale.customer.name if sale.customer else ''}, here is your invoice from {sale.business.name}: {pdf_url}"
    import urllib.parse

    return f"https://wa.me/?text={urllib.parse.quote(msg)}"


def dashboard(business) -> dict:
    """The dashboard aggregate (contract: /api/dashboard/)."""
    from compliance.services import compliance_score
    from leads.models import Lead
    from sales.reports import sales_trend

    today = dj_tz.localdate()
    refresh_overdue(business)
    month_start = today.replace(day=1)
    today_sales = sum((s.total for s in business.sales.filter(date=today, doc_type=Sale.DocType.SALE)), Decimal("0.00"))
    cash_in = sum((p.amount for p in Payment.objects.filter(sale__business=business, date__gte=month_start)), Decimal("0.00"))
    expenses_month = Decimal("0.00")
    try:
        from expenses.models import Expense
        expenses_month = sum((e.amount for e in Expense.objects.filter(business=business, date__gte=month_start)), Decimal("0.00"))
    except Exception:
        pass
    receivables = sum(
        (s.total - sum(p.amount for p in s.payments.all())
         for s in business.sales.filter(doc_type=Sale.DocType.INVOICE).exclude(status=Sale.Status.PAID)),
        Decimal("0.00"))
    cogs = Decimal("0.00")
    for line in SaleLine.objects.filter(sale__business=business, sale__date__gte=month_start, product__isnull=False).select_related("product"):
        cogs += line.product.cost_price * line.qty
    month_revenue = sum((s.total for s in business.sales.filter(date__gte=month_start)), Decimal("0.00"))
    month_profit = month_revenue - cogs - expenses_month
    try:
        from compliance.models import ComplianceIssue

        score = compliance_score(ComplianceIssue.objects.filter(business=business, status="active"))
    except Exception:
        logger.exception("dashboard: compliance score failed")
        score = None
    open_leads = Lead.objects.filter(business=business).exclude(stage__in=["won", "lost"]).count()
    next_tax = None
    try:
        from compliance.services import next_tax_due
        next_tax = next_tax_due(business)
    except Exception:
        logger.exception("dashboard: next tax due failed")
    top_insights = []
    try:
        from advisor.models import Insight
        top_insights = [
            {"id": i.id, "code": i.code, "title": i.title, "severity": i.severity,
             "explanation": i.explanation, "recommended_action": i.recommended_action}
            for i in Insight.objects.filter(business=business, status="active").order_by("severity")[:3]
        ]
    except Exception:
        pass
    return {
        "today_sales": str(today_sales),
        "month_profit": str(month_profit),
        "cash_position": str(cash_in - expenses_month),
        "receivables": str(receivables),
        "next_tax": next_tax,
        "compliance_score": score,
        "open_leads": open_leads,
        "top_insights": top_insights,
        "sales_trend": sales_trend(business),
        "currency": "USD",
    }
