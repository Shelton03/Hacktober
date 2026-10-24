"""Notification triggers + service facade."""
from __future__ import annotations

import logging

from notifications.providers import NotificationService

logger = logging.getLogger(__name__)

_service = NotificationService()


def _members(business):
    from accounts.models import Membership

    return [m.user for m in Membership.objects.filter(business=business).select_related("user")]


def notify_all(business, kind, title, body="", link=""):
    for user in _members(business):
        try:
            _service.send(business, user, kind, title, body, link)
        except Exception:
            logger.exception("notification send failed for %s", user)


def notify_tax_deadline(business, tax_kind, amount, due_date, days_before):
    title = f"{tax_kind} of {amount} due on {due_date} ({days_before} day(s) left)"
    body = (f"Heads-up: your {tax_kind} estimate is {amount}, due {due_date}. "
            "Open the Tax page for the breakdown.")
    notify_all(business, "tax_deadline", title, body, "/tax")


def notify_fiscal_day_open(business, day_no):
    notify_all(business, "fiscal_day",
               f"Fiscal day {day_no} opened",
               "Today's fiscal day is open — sales will be fiscalised.",
               "/fiscal")


def notify_fiscal_day_not_closed(business, day_no, day_date):
    notify_all(business, "fiscal_day",
               f"Fiscal day {day_no} ({day_date}) wasn't closed",
               "Close the fiscal day so ZIMRA counters stay correct.",
               "/fiscal")


def notify_overdue_invoice(business, sale, to_customer=False):
    title = f"Invoice #{sale.id} overdue ({sale.total} {sale.currency})"
    body = (f"Invoice #{sale.id} for {sale.customer.name if sale.customer else 'customer'} "
            f"({sale.total} {sale.currency}) is past due ({sale.due_date}).")
    notify_all(business, "overdue_invoice", title, body, "/invoices")


def notify_lead_followup(business, lead):
    title = f"Follow up: {lead.name}"
    body = lead.followup_note or f"Call {lead.name} about {lead.interest or 'their quote'}."
    notify_all(business, "lead_followup", title, body, "/leads")


def notify_low_stock(business, product):
    title = f"Low stock: {product.name}"
    body = f"{product.name} is down to {product.stock_qty} (threshold {product.low_stock_threshold})."
    notify_all(business, "low_stock", title, body, "/products")


def notify_advisor_digest(business, insights):
    if not insights:
        return
    title = f"AI business advisor: {len(insights)} new insight(s)"
    body = "; ".join(i.title for i in insights[:3])
    notify_all(business, "advisor_digest", title, body, "/advisor")
