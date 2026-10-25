"""Reports — P&L, sales mix, expense mix and cash flow for a date range.

Revenue is net of VAT (Sale.subtotal): quick sales + invoices + debit notes,
less credit notes. Cost of sales uses each product's current cost price.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import F, Sum
from django.utils import timezone as dj_tz

from sales.models import Payment, Sale, SaleLine

ZERO = Decimal("0.00")
REVENUE_TYPES = (Sale.DocType.SALE, Sale.DocType.INVOICE, Sale.DocType.DEBIT_NOTE)


def parse_range(params) -> tuple[date, date]:
    """?from=YYYY-MM-DD&to=YYYY-MM-DD, defaulting to the last 30 days."""
    today = dj_tz.localdate()
    try:
        end = date.fromisoformat(params.get("to")) if params.get("to") else today
        start = date.fromisoformat(params.get("from")) if params.get("from") else end - timedelta(days=29)
    except ValueError as exc:
        raise ValueError("from/to must be YYYY-MM-DD") from exc
    if start > end:
        start, end = end, start
    return start, end


def _sales(business, start, end):
    return business.sales.filter(date__gte=start, date__lte=end)


def _expenses(business, start, end):
    from expenses.models import Expense

    return Expense.objects.filter(business=business, date__gte=start, date__lte=end)


def _sum(qs, field) -> Decimal:
    return qs.aggregate(v=Sum(field))["v"] or ZERO


def pnl(business, start, end) -> dict:
    sales = _sales(business, start, end)
    revenue = _sum(sales.filter(doc_type__in=REVENUE_TYPES), "subtotal")
    credits = _sum(sales.filter(doc_type=Sale.DocType.CREDIT_NOTE), "subtotal")
    net_sales = revenue - abs(credits)

    cogs = _sum(
        SaleLine.objects.filter(sale__in=sales.filter(doc_type__in=REVENUE_TYPES), product__isnull=False),
        F("qty") * F("product__cost_price"),
    )
    expenses = _sum(_expenses(business, start, end), "amount")
    gross = net_sales - cogs
    net = gross - expenses
    return {
        "from": str(start),
        "to": str(end),
        "sales": str(net_sales.quantize(ZERO)),
        "cogs": str(Decimal(cogs).quantize(ZERO)),
        "gross_profit": str(gross.quantize(ZERO)),
        "expenses": str(expenses.quantize(ZERO)),
        "net_profit": str(net.quantize(ZERO)),
        "gross_margin": float(round(gross / net_sales * 100, 1)) if net_sales else None,
    }


def sales_by_product(business, start, end, limit=8) -> list[dict]:
    rows = (
        SaleLine.objects.filter(sale__in=_sales(business, start, end).filter(doc_type__in=REVENUE_TYPES))
        .values("name")
        .annotate(total=Sum("line_total"), qty=Sum("qty"))
        .order_by("-total")[:limit]
    )
    return [{"label": r["name"], "value": float(r["total"] or 0), "qty": float(r["qty"] or 0)} for r in rows]


def sales_by_customer(business, start, end, limit=8) -> list[dict]:
    rows = (
        _sales(business, start, end)
        .filter(doc_type__in=REVENUE_TYPES)
        .values("customer__name")
        .annotate(total=Sum("total"))
        .order_by("-total")[:limit]
    )
    return [{"label": r["customer__name"] or "Walk-in", "value": float(r["total"] or 0)} for r in rows]


def expenses_by_category(business, start, end) -> list[dict]:
    rows = _expenses(business, start, end).values("category").annotate(total=Sum("amount")).order_by("-total")
    return [{"label": r["category"].replace("_", " ").title(), "value": float(r["total"] or 0)} for r in rows]


def daily_series(business, start, end) -> dict:
    """Per-day cash in (payments), cash out (expenses) and net."""
    cash_in = defaultdict(lambda: ZERO)
    for r in Payment.objects.filter(sale__business=business, date__gte=start, date__lte=end) \
            .values("date").annotate(total=Sum("amount")):
        cash_in[r["date"]] = r["total"]
    cash_out = defaultdict(lambda: ZERO)
    for r in _expenses(business, start, end).values("date").annotate(total=Sum("amount")):
        cash_out[r["date"]] = r["total"]

    labels, ins, outs, net = [], [], [], []
    day = start
    while day <= end:
        labels.append(str(day))
        ins.append(float(cash_in[day]))
        outs.append(float(cash_out[day]))
        net.append(float(cash_in[day] - cash_out[day]))
        day += timedelta(days=1)
    return {"labels": labels, "cash_in": ins, "cash_out": outs, "values": net}


def sales_trend(business, days=14) -> dict:
    """Daily gross sales (sales + invoices) for the dashboard sparkline."""
    end = dj_tz.localdate()
    start = end - timedelta(days=days - 1)
    totals = defaultdict(lambda: ZERO)
    for r in _sales(business, start, end).filter(doc_type__in=REVENUE_TYPES) \
            .values("date").annotate(total=Sum("total")):
        totals[r["date"]] = r["total"]
    labels = [str(start + timedelta(days=i)) for i in range(days)]
    return {"labels": labels, "values": [float(totals[date.fromisoformat(d)]) for d in labels]}
