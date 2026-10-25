"""AI business advisor — rule engine. EVERY number computed from the ledger."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone as dj_tz


def _sales(business, days=None, doc_types=("sale", "invoice")):
    from sales.models import Sale

    qs = business.sales.filter(doc_type__in=doc_types)
    if days:
        qs = qs.filter(date__gte=dj_tz.localdate() - timedelta(days=days))
    return qs


def _expenses(business, days=None):
    try:
        from expenses.models import Expense

        qs = Expense.objects.filter(business=business)
        if days:
            qs = qs.filter(date__gte=dj_tz.localdate() - timedelta(days=days))
        return qs
    except Exception:
        return []


def rule_cash_flow_shortfall(business) -> dict | None:
    """Cash received (30d) vs upcoming expenses + tax in the next 30 days."""
    cash_in = sum((p.amount for s in _sales(business, 30) for p in s.payments.all()), Decimal("0.00"))
    upcoming_expenses = sum((e.amount for e in _expenses(business, 30)), Decimal("0.00"))
    tax_due = Decimal("0.00")
    try:
        from compliance.services import next_tax_due

        nt = next_tax_due(business)
        if nt and nt.get("amount"):
            tax_due = Decimal(str(nt["amount"]))
    except Exception:
        pass
    projected = cash_in - upcoming_expenses - tax_due
    if projected < 0:
        return {
            "code": "cash_flow_shortfall",
            "title": "Cash-flow warning: projected shortfall",
            "explanation": (f"Over the next 30 days you expect {cash_in:.2f} USD in, but have "
                            f"{upcoming_expenses:.2f} USD expenses and {tax_due:.2f} USD tax due: "
                            f"a projected shortfall of {abs(projected):.2f} USD."),
            "recommended_action": "Chase overdue invoices now, delay non-essential purchases, or arrange short-term cover.",
            "severity": "critical",
            "data": {"cash_in": str(cash_in), "expenses_30d": str(upcoming_expenses),
                     "tax_due": str(tax_due), "projected": str(projected)},
        }
    return None


def rule_lapsed_customer(business) -> dict | None:
    """Regular customer (>=3 purchases) silent for > 2× their median interval."""
    from sales.models import Sale

    for customer in business.customers.all():
        dates = list(Sale.objects.filter(customer=customer).order_by("date").values_list("date", flat=True))
        if len(dates) < 3:
            continue
        gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        gaps.sort()
        median = gaps[len(gaps) // 2] or 1
        silent_days = (dj_tz.localdate() - dates[-1]).days
        if silent_days > max(median * 2, 7):
            return {
                "code": "lapsed_customer",
                "title": f"Regular customer going quiet: {customer.name}",
                "explanation": (f"{customer.name} bought {len(dates)} times, usually every {median} days, "
                               f"but hasn't purchased in {silent_days} days."),
                "recommended_action": f"Send {customer.name} a friendly follow-up. A small discount or new-stock note works.",
                "severity": "warning",
                "data": {"customer": customer.id, "purchases": len(dates),
                         "median_interval": median, "silent_days": silent_days},
            }
    return None


def rule_margin_squeeze(business) -> dict | None:
    """Product margin dropped > 5 points over 30 days (cost up or price down)."""
    from sales.models import SaleLine

    today = dj_tz.localdate()
    for p in business.products.filter(is_active=True)[:50]:
        if not p.selling_price:
            continue
        margin_now = (p.selling_price - p.cost_price) / p.selling_price * 100
        old = (SaleLine.objects.filter(product=p, sale__date__gte=today - timedelta(days=60),
                                       sale__date__lt=today - timedelta(days=30))
               .order_by("-sale__date").first())
        if not old:
            continue
        then_price = old.unit_price
        if not then_price:
            continue
        margin_then = (then_price - p.cost_price) / then_price * 100
        if margin_now - margin_then < -5:
            return {
                "code": "margin_squeeze",
                "title": f"Margin squeeze on {p.name}",
                "explanation": (f"{p.name}'s margin fell from {margin_then:.1f}% to {margin_now:.1f}% "
                                f"in the last 30 days (cost {p.cost_price:.2f}, price {p.selling_price:.2f})."),
                "recommended_action": "Review your selling price or negotiate the supplier cost before your next order.",
                "severity": "warning",
                "data": {"product": p.id, "margin_now": f"{margin_now:.1f}",
                         "margin_then": f"{margin_then:.1f}"},
            }
    return None


def rule_best_worst_products(business) -> dict | None:
    """Top/bottom 3 by PROFIT (revenue − product cost), 90 days."""
    from sales.models import SaleLine

    since = dj_tz.localdate() - timedelta(days=90)
    stats = {}
    for line in SaleLine.objects.filter(sale__business=business, sale__date__gte=since,
                                        product__isnull=False).select_related("product"):
        s = stats.setdefault(line.product_id, {"name": line.product.name,
                                               "revenue": Decimal(0), "cost": Decimal(0)})
        s["revenue"] += line.line_total
        s["cost"] += line.product.cost_price * line.qty
    if len(stats) < 4:
        return None
    ranked = sorted(stats.items(), key=lambda kv: kv[1]["revenue"] - kv[1]["cost"])
    worst = ranked[:3]
    best = ranked[-3:][::-1]
    def fmt(entries):
        return ", ".join(f"{v['name']} ({(v['revenue'] - v['cost']):.2f} USD profit)" for _, v in entries)
    return {
        "code": "best_worst_products",
        "title": "Best and worst products by profit (90 days)",
        "explanation": f"Best: {fmt(best)}. Worst: {fmt(worst)}.",
        "recommended_action": "Push your best sellers harder; review or reprice the worst three.",
        "severity": "info",
        "data": {"best": [k for k, _ in best], "worst": [k for k, _ in worst]},
    }


def rule_debtor_ageing(business) -> dict | None:
    """Overdue invoices bucketed 1-30 / 31-60 / 60+ days."""
    from sales.models import Sale

    today = dj_tz.localdate()
    buckets = {"1-30": Decimal("0.00"), "31-60": Decimal("0.00"), "60+": Decimal("0.00")}
    count = 0
    for s in business.sales.filter(doc_type=Sale.DocType.INVOICE, status=Sale.Status.OVERDUE):
        days = (today - s.due_date).days
        key = "1-30" if days <= 30 else "31-60" if days <= 60 else "60+"
        buckets[key] += s.total
        count += 1
    if not count:
        return None
    return {
        "code": "debtor_ageing",
        "title": f"{count} overdue invoice(s): {sum(buckets.values()):.2f} USD owed to you",
        "explanation": (f"Overdue by age: 1-30 days {buckets['1-30']:.2f} USD, "
                        f"31-60 days {buckets['31-60']:.2f} USD, over 60 days {buckets['60+']:.2f} USD."),
        "recommended_action": "Send reminders to the oldest buckets first, using the WhatsApp share link on each invoice.",
        "severity": "warning" if buckets["60+"] else "info",
        "data": {k: str(v) for k, v in buckets.items()},
    }


def rule_lead_source_performance(business) -> dict | None:
    """Conversion + won value per lead source."""
    from leads.models import Lead

    rows = []
    for src, label in Lead.Source.choices:
        qs = business.leads.filter(source=src)
        total = qs.count()
        if not total:
            continue
        won = qs.filter(stage=Lead.Stage.WON).count()
        value = sum((l.estimated_value for l in qs.filter(stage=Lead.Stage.WON)), Decimal(0))
        rows.append((src, label, total, won, round(won / total * 100, 1), value))
    if len(rows) < 2:
        return None
    best = max(rows, key=lambda r: r[4])
    return {
        "code": "lead_source_performance",
        "title": f"Best lead source: {best[1]} ({best[4]}% conversion)",
        "explanation": "By source: " + "; ".join(
            f"{label} {won}/{total} ({pct}%, {value:.0f} USD won)" for _, label, total, won, pct, value in rows),
        "recommended_action": f"Spend more effort on {best[1]}. It converts best.",
        "severity": "info",
        "data": {"rows": [[r[0], r[2], r[3], r[4], str(r[5])] for r in rows]},
    }


ALL_RULES = [
    rule_cash_flow_shortfall,
    rule_lapsed_customer,
    rule_margin_squeeze,
    rule_best_worst_products,
    rule_debtor_ageing,
    rule_lead_source_performance,
]
