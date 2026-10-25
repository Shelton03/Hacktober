"""
Compliance services — tax calculations, QPD estimates, VAT summary,
compliance scoring, issue scanning and exports.

All business logic lives HERE (not in views) so future WhatsApp/USSD/SMS
channels can reuse it. Money is Decimal everywhere (core.money), never floats.

Tax rates/due-dates come from TaxConfig (admin-editable) via seed_values.
"""
from __future__ import annotations

import csv
import io
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from django.utils import timezone

from core.money import D
from compliance.models import ComplianceIssue, TaxConfig, TaxEstimate

ZERO = Decimal("0.00")


# ─────────────────────────────────────────────────────────────
# TaxConfig helpers
# ─────────────────────────────────────────────────────────────

def config_get(category: str, key: str, default=None):
    """Fetch an active TaxConfig value by `category.key`, parsed by data_type."""
    row = (
        TaxConfig.objects.filter(category=category, key=key, is_active=True)
        .order_by("id")
        .first()
    )
    if row is None:
        return default
    value = parse_config_value(row)
    if value is None:
        # corrupt/unparseable row → fall back to the caller's default
        return default
    return value


def parse_config_value(row: TaxConfig):
    """Parse a TaxConfig row's stored string into its data_type."""
    raw = (row.value or "").strip()
    try:
        if row.data_type == "decimal":
            return Decimal(raw)
        if row.data_type == "int":
            return int(raw)
        if row.data_type == "date":
            return date.fromisoformat(raw)
        return raw
    except (ValueError, ArithmeticError):
        return None


def tax_config_payload() -> list[dict]:
    """All active TaxConfig rows for GET /api/tax/config/."""
    rows = TaxConfig.objects.filter(is_active=True).order_by("category", "key")
    return [
        {
            "id": r.id,
            "category": r.category,
            "key": r.key,
            "value": r.value,
            "data_type": r.data_type,
            "description": r.description,
            "last_verified": r.last_verified,
            "updated_at": r.updated_at,
        }
        for r in rows
    ]


def vat_standard_rate() -> Decimal:
    return D(config_get("vat", "standard_rate", Decimal("15.5")))


def vat_return_due_day() -> int:
    value = config_get("vat", "return_due_day", 25)
    if isinstance(value, (int, Decimal)) and not isinstance(value, bool):
        return int(value)
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return 25


def income_tax_rate() -> Decimal:
    return D(config_get("income", "tax_rate", Decimal("25")))


def disclaimer_text() -> str:
    return str(
        config_get(
            "general", "disclaimer",
            "Estimates only. Confirm with ZIMRA or a registered tax practitioner.",
        )
    )


# ─────────────────────────────────────────────────────────────
# Period helpers
# ─────────────────────────────────────────────────────────────

def parse_period(value) -> tuple[date, date]:
    """'YYYY-MM' → (first day, last day). Raises ValueError on bad input."""
    if not value:
        raise ValueError("period is required (YYYY-MM)")
    raw = str(value).strip()
    year, month = raw.split("-", 1)
    year, month = int(year), int(month)
    if not (1 <= month <= 12):
        raise ValueError("month must be 01-12")
    start = date(year, month, 1)
    if month == 12:
        nxt = date(year + 1, 1, 1)
    else:
        nxt = date(year, month + 1, 1)
    return start, nxt - timedelta(days=1)


def next_month_due(period_year: int, period_month: int, day: int | None = None) -> date:
    """Due date = `day` (default 25th, from TaxConfig) of the month AFTER the period."""
    day = day if day is not None else vat_return_due_day()
    if period_month == 12:
        y, m = period_year + 1, 1
    else:
        y, m = period_year, period_month + 1
    # clamp the day for short months (e.g. 31 in a 30-day month)
    while True:
        try:
            return date(y, m, day)
        except ValueError:
            day -= 1


# ─────────────────────────────────────────────────────────────
# VAT summary (output VAT from fiscalised sales, input VAT from
# FDMS-validated purchase invoices only)
# ─────────────────────────────────────────────────────────────

def _fiscalised_sales(business, start: date, end: date):
    from sales.models import Sale

    return (
        Sale.objects.filter(
            business=business,
            doc_type=Sale.DocType.SALE,
            date__gte=start,
            date__lte=end,
            fiscal_receipt__isnull=False,
        )
    )


def vat_summary(business, period: str) -> dict:
    """VAT position for a YYYY-MM period.

    - output_vat: tax charged on fiscalised sales in the period
    - input_vat:  VAT on purchase invoices with fdms_validated=True ONLY
    - vat_payable: output - input
    - due_date:   25th (configurable) of the following month
    """
    from expenses.models import PurchaseInvoice

    start, end = parse_period(period)

    output_vat = ZERO
    sales_count = 0
    for sale in _fiscalised_sales(business, start, end).only("id", "tax_total"):
        output_vat += D(sale.tax_total)
        sales_count += 1

    input_vat = ZERO
    purchases = PurchaseInvoice.objects.filter(
        business=business,
        date__gte=start,
        date__lte=end,
        fdms_validated=True,
    )
    purchase_count = 0
    for p in purchases.only("id", "vat_amount"):
        input_vat += D(p.vat_amount)
        purchase_count += 1

    vat_payable = output_vat - input_vat

    year, month = start.year, start.month
    due = next_month_due(year, month)

    result = {
        "period": f"{year:04d}-{month:02d}",
        "output_vat": output_vat,
        "input_vat": input_vat,
        "vat_payable": vat_payable,
        "due_date": due,
        "fiscalised_sales": sales_count,
        "validated_purchases": purchase_count,
    }
    _store_estimate(business, "vat", result["period"], vat_payable, due)
    return result


def next_tax_due(business) -> Optional[dict]:
    """The soonest upcoming tax payment: {type, amount, due_date} or None.

    Candidates: the open VAT return (VAT-registered only, skipped when it is a
    refund position) and the next QPD instalment with a positive payment.
    """
    today = _local_today()
    candidates = []

    if getattr(business, "vat_registered", False):
        # last month's return is due this month until the due day passes
        prev = today.replace(day=1) - timedelta(days=1)
        period = prev if today <= next_month_due(prev.year, prev.month) else today
        vat = vat_summary(business, f"{period.year:04d}-{period.month:02d}")
        if vat["vat_payable"] > ZERO:
            candidates.append({"type": "VAT", "amount": vat["vat_payable"], "due_date": vat["due_date"]})

    for q in qpd_schedule(business, today.year):
        if q["due_date"] >= today and q["payment"] > ZERO:
            candidates.append({"type": f"QPD Q{q['qtr']}", "amount": q["payment"], "due_date": q["due_date"]})
            break

    if not candidates:
        return None
    soonest = min(candidates, key=lambda c: c["due_date"])
    return {"type": soonest["type"], "amount": str(soonest["amount"]),
            "due_date": str(soonest["due_date"])}


def _store_estimate(business, kind: str, period: str, amount: Decimal, due: date):
    """Persist/recompute a TaxEstimate (unique per business+kind+period)."""
    TaxEstimate.objects.update_or_create(
        business=business,
        kind=kind,
        period=period,
        defaults={"estimated_amount": D(amount), "due_date": due},
    )


# ─────────────────────────────────────────────────────────────
# Books → taxable income estimate (for QPD)
# ─────────────────────────────────────────────────────────────

def estimated_taxable_income(business, year: int) -> dict:
    """Estimate taxable income from the books: revenue - expenses - COGS.

    Revenue  = all sale documents' net (subtotal), invoices included.
    Expenses = recorded expenses.
    COGS     = stock sold at cost (sum of qty × product cost at time of sale).
    Never negative for tax purposes (a loss year estimates zero income).
    """
    from expenses.models import Expense
    from sales.models import Sale, SaleLine

    jan1 = date(year, 1, 1)
    dec31 = date(year, 12, 31)

    revenue = ZERO
    for s in Sale.objects.filter(
        business=business, date__gte=jan1, date__lte=dec31
    ).only("id", "subtotal"):
        revenue += D(s.subtotal)

    expenses = ZERO
    for e in Expense.objects.filter(
        business=business, date__gte=jan1, date__lte=dec31
    ).only("id", "amount"):
        expenses += D(e.amount)

    cogs = ZERO
    lines = SaleLine.objects.filter(
        sale__business=business,
        sale__date__gte=jan1,
        sale__date__lte=dec31,
        product__isnull=False,
    ).select_related("product").only("qty", "product__cost_price")
    for line in lines:
        if line.product_id:
            cogs += (D(line.qty) * D(line.product.cost_price)).quantize(D("0.01"))

    net_income = revenue - expenses - cogs
    taxable = net_income if net_income > ZERO else ZERO
    return {
        "year": year,
        "revenue": revenue,
        "expenses": expenses,
        "cogs": cogs,
        "net_income": net_income,
        "taxable_income": taxable,
    }


# ─────────────────────────────────────────────────────────────
# QPD (Quarterly Payment Dates)
# ─────────────────────────────────────────────────────────────

def _qpd_config(year: int) -> list[dict]:
    """Build the 4 QPD instalments from TaxConfig (percent + due date per quarter)."""
    quarters = []
    for q in (1, 2, 3, 4):
        pct = config_get("qpd", f"q{q}_percent", None)
        if pct is None:
            # fall back to the documented defaults if unseeded
            pct = Decimal({1: "10", 2: "25", 3: "30", 4: "35"}[q])
        due = config_get("qpd", f"q{q}_due", None)
        if due is None:
            month_day = {1: (3, 25), 2: (6, 25), 3: (9, 25), 4: (12, 20)}[q]
            due = date(year, *month_day)
        elif isinstance(due, str):
            try:
                parsed = date.fromisoformat(due)
            except ValueError:
                parsed = date(year, *{1: (3, 25), 2: (6, 25), 3: (9, 25), 4: (12, 20)}[q])
            due = parsed
        # config dates are seeded per calendar year — re-anchor to requested year
        if isinstance(due, date) and getattr(due, "year", None) != year:
            due = due.replace(year=year)
        quarters.append({"qtr": q, "percent": D(pct), "due_date": due})
    return quarters


def qpd_schedule(business, year: int) -> list[dict]:
    """The four QPD instalments for `year`, estimated from the books.

    annual_tax = taxable_income_estimate × income.tax_rate / 100
    payment_qN  = annual_tax × qN_percent / 100
    Cumulative percentages (10/25/30/35) mean later quarters settle the year.
    """
    books = estimated_taxable_income(business, year)
    rate = income_tax_rate()
    annual_tax = (books["taxable_income"] * rate / Decimal(100)).quantize(D("0.01"))

    schedule = []
    for q in _qpd_config(year):
        payment = (annual_tax * q["percent"] / Decimal(100)).quantize(D("0.01"))
        entry = {
            "qtr": q["qtr"],
            "percent": q["percent"],
            "due_date": q["due_date"],
            "estimated_tax": annual_tax,
            "payment": payment,
        }
        schedule.append(entry)
        _store_estimate(business, "qpd", f"{year}-Q{q['qtr']}", payment, q["due_date"])
    return schedule


# ─────────────────────────────────────────────────────────────
# Compliance score + issue scanning
# ─────────────────────────────────────────────────────────────

SEVERITY_PENALTY = {"critical": 10, "warning": 5, "info": 2}


def compliance_score(issues) -> int:
    """100 − 10×critical − 5×warning − 2×info (active issues only), floor 0.

    Accepts ComplianceIssue objects or dicts ({"severity":…, "status":…}).
    """
    score = 100
    for issue in issues:
        if isinstance(issue, dict):
            severity = issue.get("severity", "info")
            status = issue.get("status", "active")
        else:
            severity = issue.severity
            status = getattr(issue, "status", "active")
        if status != "active":
            continue
        score -= SEVERITY_PENALTY.get(severity, 0)
    return max(score, 0)


def _local_today() -> date:
    return timezone.localdate()


def _upsert_issue(business, code: str, severity: str, title: str,
                  suggested_fix: str, detail: dict) -> Optional[ComplianceIssue]:
    """Create the issue if absent (active); re-activate if dismissed/resolved and
    still present. Returns the issue or None when nothing changed."""
    existing = ComplianceIssue.objects.filter(business=business, code=code).first()
    if existing is not None:
        existing.severity = severity
        existing.title = title
        existing.suggested_fix = suggested_fix
        existing.detail = detail
        if existing.status != "active":
            existing.status = "active"
        existing.save()
        return existing
    return ComplianceIssue.objects.create(
        business=business,
        code=code,
        severity=severity,
        title=title,
        suggested_fix=suggested_fix,
        detail=detail,
        status="active",
    )


def _auto_resolve(business, seen_codes: set):
    """Mark issues whose trigger condition no longer holds as resolved."""
    for issue in ComplianceIssue.objects.filter(business=business, status="active"):
        if issue.code not in seen_codes:
            issue.status = "resolved"
            issue.save(update_fields=["status"])


def scan_issues(business, persist: bool = True) -> list[ComplianceIssue]:
    """Scan the business for compliance issues; upserts ComplianceIssue rows.

    Checks:
    1. missing_buyer_tin    — fiscalised sales whose buyer has no TIN
    2. fiscal_day_not_closed — yesterday's fiscal day still open
    3. purchase_not_validated — purchase invoices missing FDMS validation
    """
    from sales.models import FiscalDay, Sale

    issues: list[ComplianceIssue] = []
    seen: set[str] = set()

    # 1. Buyer TIN missing on fiscalised invoices.
    # Buyer TIN lives on the customer record or in the receipt's buyerData —
    # checked in Python so it works identically on SQLite and PostgreSQL.
    candidates = (
        Sale.objects.filter(
            business=business,
            doc_type=Sale.DocType.SALE,
            fiscal_receipt__isnull=False,
        )
        .select_related("customer")
        .order_by("-date", "-id")
    )
    missing_tin_ids: list[int] = []
    for s in candidates:
        buyer_tin = ((s.buyer_data or {}).get("buyerTIN") or "").strip()
        customer_tin = (s.customer.tin or "").strip() if s.customer_id else ""
        if not buyer_tin and not customer_tin:
            missing_tin_ids.append(s.id)
            if len(missing_tin_ids) >= 50:
                break
    if missing_tin_ids:
        code = "missing_buyer_tin"
        seen.add(code)
        issues.append(_upsert_issue(
            business, code, "warning",
            f"{len(missing_tin_ids)} fiscalised invoice(s) missing buyer TIN",
            "Capture the buyer's TIN on the customer record, then re-issue the "
            "fiscal invoice.",
            {"sale_ids": missing_tin_ids[:20], "count": len(missing_tin_ids)},
        ))

    # 2. Fiscal day not closed yesterday
    yesterday = _local_today() - timedelta(days=1)
    open_yesterday = FiscalDay.objects.filter(
        device__business=business,
        state=FiscalDay.State.OPEN,
        day_date=yesterday,
    ).exists()
    if open_yesterday:
        code = "fiscal_day_not_closed"
        seen.add(code)
        issues.append(_upsert_issue(
            business, code, "critical",
            f"Fiscal day for {yesterday.isoformat()} is still open",
            "Close the fiscal day from the FDMS panel so Z counters are submitted.",
            {"day_date": yesterday.isoformat()},
        ))

    # 3. Purchase invoices not FDMS-validated
    from expenses.models import PurchaseInvoice

    unvalidated = list(
        PurchaseInvoice.objects.filter(business=business, fdms_validated=False)
        .order_by("-date")
        .values_list("id", flat=True)[:50]
    )
    if unvalidated:
        code = "purchase_not_validated"
        seen.add(code)
        issues.append(_upsert_issue(
            business, code, "warning",
            f"{len(unvalidated)} purchase invoice(s) not FDMS-validated "
            "(input VAT cannot be claimed)",
            "Validate supplier fiscal invoices against FDMS to claim input VAT.",
            {"purchase_ids": unvalidated[:20], "count": len(unvalidated)},
        ))

    if persist:
        _auto_resolve(business, seen)

    if persist:
        return list(
            ComplianceIssue.objects.filter(business=business, status="active")
            .order_by("-severity", "-created_at")
        )
    return issues


def compliance_dashboard(business) -> dict:
    """GET /api/compliance/ payload: score + active issues."""
    scan_issues(business, persist=True)
    issues = (
        ComplianceIssue.objects.filter(business=business, status="active")
        .order_by("-severity", "-created_at")
    )
    issue_rows = [
        {
            "id": i.id,
            "code": i.code,
            "title": i.title,
            "severity": i.severity,
            "suggested_fix": i.suggested_fix,
            "detail": i.detail,
        }
        for i in issues
    ]
    return {
        "score": compliance_score(issue_rows),
        "issues": issue_rows,
        "disclaimer": disclaimer_text(),
    }


# ─────────────────────────────────────────────────────────────
# Exports (CSV via csv module, PDF via reportlab table)
# ─────────────────────────────────────────────────────────────

def export_rows(business, period: str) -> list[tuple]:
    """Build the period summary rows shared by the CSV and PDF exporters."""
    vat = vat_summary(business, period)
    year = vat["period"][:4]
    qpd = qpd_schedule(business, int(year))

    rows: list[tuple] = [
        ("Tax period", vat["period"]),
        ("Business", business.name),
        ("", ""),
        ("VAT output (fiscalised sales)", f"{vat['output_vat']:,.2f}"),
        ("VAT input (FDMS-validated purchases)", f"{vat['input_vat']:,.2f}"),
        ("VAT payable", f"{vat['vat_payable']:,.2f}"),
        ("VAT due date", vat["due_date"].isoformat()),
        ("", ""),
    ]
    for q in qpd:
        rows.append((
            f"QPD Q{q['qtr']} ({q['percent']:g}%, due {q['due_date'].isoformat()})",
            f"{q['payment']:,.2f}",
        ))
    rows.append(("", ""))
    rows.append(("Compliance score", str(compliance_dashboard(business)["score"])))
    rows.append(("Disclaimer", disclaimer_text()))
    return rows


def export_csv(business, period: str) -> str:
    """CSV export of the period summary (csv module, Decimal-safe strings)."""
    rows = export_rows(business, period)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Item", "Value"])
    for label, value in rows:
        writer.writerow([label, value])
    return buffer.getvalue()


def export_pdf(business, period: str) -> bytes:
    """PDF export of the period summary (ReportLab table)."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    rows = export_rows(business, period)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=1.8 * cm, rightMargin=1.8 * cm,
        topMargin=1.8 * cm, bottomMargin=1.8 * cm,
        title=f"Tax summary {period}: {business.name}",
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"Tax &amp; compliance summary: {business.name}", styles["Title"]),
        Paragraph(f"Period: {period}", styles["Normal"]),
        Spacer(1, 12),
    ]
    data = [[Paragraph(str(a) or "&nbsp;", styles["BodyText"]),
             Paragraph(str(b) or "&nbsp;", styles["BodyText"])] for a, b in rows]
    table = Table(data, colWidths=[9 * cm, 8 * cm])
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)
    doc.build(story)
    return buffer.getvalue()


# ─────────────────────────────────────────────────────────────
# Refresh (recompute everything for a business)
# ─────────────────────────────────────────────────────────────

def refresh_compliance(business) -> dict:
    """POST /api/compliance/refresh/ — recompute issues, VAT estimate (current
    month) and QPD schedule (current year)."""
    today = _local_today()
    issues = scan_issues(business, persist=True)
    vat_summary(business, f"{today.year:04d}-{today.month:02d}")
    qpd_schedule(business, today.year)
    active = [i for i in issues if i.status == "active"]
    return {
        "score": compliance_score(active),
        "issues": len(active),
        "refreshed_at": timezone.now(),
    }
