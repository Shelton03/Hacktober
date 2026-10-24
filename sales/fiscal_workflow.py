"""
Fiscal workflow — the app-owned FDMS state machine.

Rules (from the zimra library docs / FDMS):
- fiscalDayNo must be greater than the last closed day's number
- receiptCounter resets each day; receiptGlobalNo NEVER resets
- every receipt chains previousReceiptHash from the previous receipt
- closeDay requires the day's running counters (SaleByTax, SaleTaxByTax,
  BalanceByMoneyType) per currency and tax ID; empty list for a no-receipt day
- All counter mutations run inside a DB transaction with a row lock on the
  device, so concurrent sales can never reuse a counter.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from django.db import transaction

from core.models import log_action

logger = logging.getLogger(__name__)

# moneyTypeCode: 0 = cash, 1 = card (documented). Mobile money / bank transfer
# are NOT documented — mapping is configurable here and flagged in the README.
MONEY_TYPE_CODES = {
    "cash": 0,
    "card": 1,
    "mobile_money": None,   # unconfirmed FDMS code
    "bank_transfer": None,  # unconfirmed FDMS code
}


class FiscalError(RuntimeError):
    pass


def tax_id_for_percent(percent) -> int:
    """Map a tax percent to its FDMS taxID (matches applicableTaxes)."""
    try:
        pct = float(percent)
    except (TypeError, ValueError):
        return 1  # exempt
    if pct == 0:
        return 2
    if abs(pct - 15.5) < 0.01:
        return 515
    if abs(pct - 5.0) < 0.01:
        return 514
    return 1


TAX_TYPE_TO_PERCENT = {
    "standard": Decimal("15.5"),
    "zero": Decimal("0"),
    "exempt": Decimal("0"),
    "withholding": Decimal("5"),
}


def percent_for_tax_type(tax_type) -> Decimal:
    if isinstance(tax_type, (int, float, Decimal)):
        return Decimal(str(tax_type))
    return TAX_TYPE_TO_PERCENT.get(tax_type, Decimal("15.5"))


def _local_today() -> date:
    from django.utils import timezone as dj_tz

    return dj_tz.localdate()


def _parse_dt(value: str):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def buyer_payload(customer) -> dict:
    """ZIMRA buyerData from a Customer (or None → empty)."""
    if customer is None:
        return {}
    return {
        "buyerName": customer.name,
        "buyerAddress": customer.address or "",
        "buyerContact": customer.phone or customer.email or "",
        "buyerTIN": customer.tin or "",
        "buyerVATNumber": customer.vat_number or "",
    }


# ─────────────────────────────────────────────────────────────
# Device setup
# ─────────────────────────────────────────────────────────────

def register_device(business, actor, *, device_id, serial_no, activation_key,
                    model_name, model_version):
    """Wizard step 1: register with FDMS, store cert/key encrypted, sync config."""
    from sales.crypto import encrypt_value
    from sales.fiscal import fiscal_service_for
    from sales.models import FiscalDevice

    service = fiscal_service_for(business)
    result = service.register_device(device_id, serial_no, activation_key,
                                     model_name, model_version)
    log_action(business, actor, "fiscal.register", {
        "device_id": device_id, "serial_no": serial_no,
        "mode": service.name, "ok": result.ok, "error": result.error,
    })
    if not result.ok:
        return None

    device = FiscalDevice.objects.create(
        business=business,
        device_id=device_id,
        serial_no=serial_no,
        activation_key_enc=encrypt_value(activation_key),
        model_name=model_name,
        model_version=model_version,
        certificate_enc=encrypt_value(result.data.get("certificate", "")),
        private_key_enc=encrypt_value(result.data.get("private_key", "")),
    )
    sync_config(device)
    return device


def sync_config(device) -> bool:
    """getConfig() → store taxpayer details + applicableTaxes + cert expiry."""
    from sales.fiscal import fiscal_service_for

    service = fiscal_service_for(device.business)
    result = service.get_config(device)
    log_action(device.business, None, "fiscal.get_config", {
        "device_id": device.device_id, "ok": result.ok, "error": result.error,
    })
    if not result.ok:
        return False
    data = result.data
    device.taxpayer_name = data.get("taxPayerName", device.taxpayer_name)
    device.taxpayer_tin = data.get("taxPayerTIN", device.taxpayer_tin)
    device.vat_number = data.get("vatNumber", device.vat_number)
    device.branch_address = data.get("deviceBranchAddress", device.branch_address or {})
    device.applicable_taxes = data.get("applicableTaxes", device.applicable_taxes or [])
    device.qr_base_url = data.get("qrUrl", device.qr_base_url or "")
    valid_till = data.get("certificateValidTill")
    if valid_till:
        device.certificate_valid_till = _parse_dt(valid_till)
    device.save()
    return True


def renew_certificate(device, actor=None) -> bool:
    from sales.fiscal import fiscal_service_for

    service = fiscal_service_for(device.business)
    result = service.renew_certificate(device)
    log_action(device.business, actor, "fiscal.renew_certificate", {
        "device_id": device.device_id, "ok": result.ok, "error": result.error,
    })
    if not result.ok:
        return False
    cert = result.data.get("certificate")
    if cert:
        from sales.crypto import encrypt_value

        device.certificate_enc = encrypt_value(cert)
    valid_till = result.data["certificateValidTill"] if "certificateValidTill" in result.data else None
    if valid_till:
        device.certificate_valid_till = _parse_dt(valid_till)
    device.save()
    return True


# ─────────────────────────────────────────────────────────────
# Fiscal day
# ─────────────────────────────────────────────────────────────

def next_fiscal_day_no(device) -> int:
    """fiscalDayNo must be > last closed day's number."""
    last = device.fiscal_days.order_by("-fiscal_day_no").first()
    return (last.fiscal_day_no + 1) if last else 1


def get_or_open_today(business, device):
    """Today's open day; auto-closes stale open days, then opens a new day."""
    from sales.fiscal import fiscal_service_for
    from sales.models import FiscalDay

    today = _local_today()
    open_day = FiscalDay.objects.filter(device=device, state=FiscalDay.State.OPEN).first()
    if open_day and open_day.day_date == today:
        return open_day

    for stale in FiscalDay.objects.filter(device=device, state=FiscalDay.State.OPEN):
        if stale.day_date < today:
            close_day(business, device, day=stale, actor=None, silent=True)

    day_no = next_fiscal_day_no(device)
    service = fiscal_service_for(business)
    result = service.open_day(device, day_no)
    log_action(business, None, "fiscal.open_day", {
        "device": device.device_id, "day_no": day_no, "ok": result.ok,
        "response": result.data if result.ok else result.error,
    })
    if not result.ok:
        raise FiscalError(f"FDMS openDay failed: {result.error}")
    return FiscalDay.objects.create(
        device=device, fiscal_day_no=day_no, day_date=today,
        state=FiscalDay.State.OPEN, opened_at=datetime.now(timezone.utc),
        running_counters=[],
    )


def close_day(business, device, day=None, actor=None, silent: bool = False) -> dict:
    """Close the open fiscal day; counters come from running_counters (may be [])."""
    from sales.fiscal import fiscal_service_for
    from sales.models import FiscalDay

    if day is None:
        day = FiscalDay.objects.filter(device=device, state=FiscalDay.State.OPEN).first()
    if day is None:
        return {"ok": False, "error": "No open fiscal day"}
    if day.state == FiscalDay.State.CLOSED:
        return {"ok": False, "error": f"Fiscal day {day.fiscal_day_no} already closed"}

    counters = day.running_counters or []
    service = fiscal_service_for(business)
    result = service.close_day(device, day.fiscal_day_no, day.day_date,
                               day.last_receipt_counter, counters)
    log_action(business, actor, "fiscal.close_day", {
        "device": device.device_id, "day_no": day.fiscal_day_no,
        "counters": counters, "ok": result.ok,
        "response": result.data if result.ok else result.error,
    })
    if not result.ok and not silent:
        return {"ok": False, "error": result.error}

    with transaction.atomic():
        day.state = FiscalDay.State.CLOSED
        day.closed_at = datetime.now(timezone.utc)
        day.close_response = result.data if result.ok else {"error": result.error}
        day.save()
    return {"ok": True, "error": None, "response": result.data}


def fiscal_status(business) -> dict:
    """Status summary: device, open day, counters, cert expiry, pending sync."""
    from sales.fiscal import fiscal_service_for
    from sales.models import FiscalDay

    device = business.fiscal_devices.filter(is_active=True).first()
    if not device:
        return {"has_device": False, "pending_sync": 0}
    service = fiscal_service_for(business)
    status = service.get_status(device)
    open_day = FiscalDay.objects.filter(device=device, state=FiscalDay.State.OPEN).first()
    last_closed = (
        FiscalDay.objects.filter(device=device, state=FiscalDay.State.CLOSED)
        .order_by("-fiscal_day_no").first()
    )
    pending = business.sales.filter(fiscal_receipt__sync_status="pending").count()
    return {
        "has_device": True,
        "device": {
            "device_id": device.device_id,
            "serial_no": device.serial_no,
            "model_name": device.model_name,
            "model_version": device.model_version,
            "mode": service.name,
            "taxpayer_name": device.taxpayer_name,
            "taxpayer_tin": device.taxpayer_tin,
            "vat_number": device.vat_number,
        },
        "status_ok": status.ok,
        "status": status.data,
        "certificate_valid_till": device.certificate_valid_till,
        "day": {
            "open": open_day is not None,
            "fiscal_day_no": open_day.fiscal_day_no if open_day else None,
            "last_receipt_counter": open_day.last_receipt_counter if open_day else None,
            "yesterday_closed": (
                last_closed is not None
                and last_closed.day_date == _local_today() - timedelta(days=1)
            ),
        },
        "applicable_taxes": device.applicable_taxes or [],
        "pending_sync": pending,
    }


# ─────────────────────────────────────────────────────────────
# Receipts
# ─────────────────────────────────────────────────────────────

def _find_or_create_counter(counters: list, ctype: str, currency: str,
                            tax_id, tax_pct) -> dict:
    for c in counters:
        if (c.get("fiscalCounterType") == ctype
                and c.get("fiscalCounterCurrency") == currency
                and c.get("fiscalCounterTaxID") == tax_id):
            return c
    counter = {
        "fiscalCounterType": ctype,
        "fiscalCounterCurrency": currency,
        "fiscalCounterTaxID": tax_id,
        "fiscalCounterTaxPercent": tax_pct,
        "fiscalCounterValue": 0,
    }
    counters.append(counter)
    return counter


def _merge_receipt_into_day(day, prepared_payload: dict, payments: list):
    """Fold a prepared receipt into the day's running fiscal counters."""
    from sales.fiscal_workflow import tax_id_for_percent

    counters = day.running_counters or []
    currency = prepared_payload.get("receiptCurrency", "USD")

    for line in prepared_payload.get("receiptLines", []):
        pct = line.get("tax_percent", 0) or 0
        tax_id = tax_id_for_percent(pct)
        net = Decimal(str(line.get("line_total", 0) or 0))
        sale = _find_or_create_counter(counters, "SaleByTax", currency, tax_id, pct)
        sale["fiscalCounterValue"] = float(Decimal(str(sale["fiscalCounterValue"])) + net)
        vat = line.get("_vat")
        if vat:
            taxc = _find_or_create_counter(counters, "SaleTaxByTax", currency, tax_id, pct)
            taxc["fiscalCounterValue"] = float(
                Decimal(str(taxc["fiscalCounterValue"])) + Decimal(str(vat))
            )

    for payment in payments:
        code = payment.get("moneyTypeCode", 0)
        amt = Decimal(str(payment.get("paymentAmount", 0) or 0))
        bal = _find_or_create_counter(counters, "BalanceByMoneyType", currency, code, None)
        bal["fiscalCounterValue"] = float(Decimal(str(bal["fiscalCounterValue"])) + amt)

    day.running_counters = counters
    day.save()


def _previous_receipt_hash(day) -> str:
    """Chain hash: signature of the last receipt on this device (or '')."""
    from sales.models import FiscalReceipt

    last = (
        FiscalReceipt.objects.filter(fiscal_day__device=day.device)
        .order_by("-receipt_global_no")
        .first()
    )
    if last is None:
        return ""
    sig = last.server_signature or {}
    return sig.get("signature", "") or ""


def _receipt_payload(business, *, doc_type="FISCALINVOICE", currency="USD",
                     receipt_counter=0, receipt_global_no=0, lines=None,
                     invoice_no="", buyer=None, payments=None, notes="") -> dict:
    payload = {
        "receiptType": doc_type,
        "receiptCurrency": currency,
        "receiptCounter": receipt_counter,
        "receiptGlobalNo": receipt_global_no,
        "invoiceNo": invoice_no,
        "receiptDate": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
        "receiptLines": lines or [],
        "receiptPayments": payments or [{"moneyTypeCode": 0, "paymentAmount": 0}],
    }
    if notes:
        payload["receiptNotes"] = notes
    if buyer:
        payload["buyerData"] = buyer
    return payload


def _build_receipt_lines(sale, tax_percent_resolver) -> list[dict]:
    lines = []
    for line in sale.lines.all():
        pct = tax_percent_resolver(line)
        lines.append({
            "item_name": line.name,
            "tax_percent": float(pct),
            "quantity": float(line.qty),
            "unit_price": float(line.unit_price),
            "line_total": float(line.line_total),
            "hs_code": line.hs_code or "04021099",
        })
    return lines


def _build_receipt_payments(sale) -> list[dict]:
    payments = []
    for p in sale.payments.all():
        code = MONEY_TYPE_CODES.get(p.method, 0)
        if code is None:
            code = 0  # unconfirmed FDMS codes map to cash until confirmed (README)
        payments.append({"moneyTypeCode": code, "paymentAmount": float(p.amount)})
    if not payments:
        payments = [{"moneyTypeCode": 0, "paymentAmount": float(sale.total)}]
    return payments


def fiscalise_sale(business, sale, actor=None):
    """Fiscalise a Sale: ensure day → build payload → prepare → submit → QR → persist.

    Counter allocation runs inside a transaction with a row lock on the device
    so concurrent sales can never reuse a counter. FDMS unreachable → receipt
    is saved with sync_status='pending' (offline queue, retried in order).
    """
    from sales.fiscal import fiscal_service_for
    from sales.models import FiscalDay, FiscalDevice, FiscalReceipt

    device = business.fiscal_devices.filter(is_active=True).first()
    if not device:
        raise FiscalError("No fiscal device registered for this business")
    day = get_or_open_today(business, device)

    def resolver(line):
        return percent_for_tax_type(line.tax_type)

    lines = _build_receipt_lines(sale, resolver)
    payments = _build_receipt_payments(sale)
    buyer = buyer_payload(sale.customer)

    doc = "FISCALINVOICE"
    if sale.doc_type == "credit_note":
        doc = "CREDITNOTE"
    elif sale.doc_type == "debit_note":
        doc = "DEBITNOTE"

    service = fiscal_service_for(business)

    with transaction.atomic():
        # lock the device row so concurrent sales serialise on counter allocation
        locked = FiscalDevice.objects.select_for_update().get(pk=device.pk)
        locked_day = FiscalDay.objects.select_for_update().get(pk=day.pk)

        receipt_counter = locked_day.last_receipt_counter + 1
        receipt_global_no = locked.last_global_no + 1
        previous_hash = _previous_receipt_hash(locked_day)

        payload = _receipt_payload(
            business,
            doc_type=doc, currency=sale.currency,
            receipt_counter=receipt_counter, receipt_global_no=receipt_global_no,
            lines=lines, invoice_no=f"INV-{sale.id:06d}" if sale.id else "",
            buyer=buyer, payments=payments, notes=sale.receipt_notes,
        )

        if business.tax_inclusive_pricing:
            prepared = service.prepare_receipt(device, payload, previous_hash)
        else:
            prepared = service.prepare_receipt_tax_exclusive(device, payload, previous_hash)
        if not prepared.ok:
            log_action(business, actor, "fiscal.prepare_failed", {"error": prepared.error})
            raise FiscalError(f"FDMS prepareReceipt failed: {prepared.error}")

        submitted = service.submit_receipt(device, prepared.data)
        synced = submitted.ok

        locked.last_global_no = receipt_global_no
        locked.save()
        locked_day.last_receipt_counter = receipt_counter
        _merge_receipt_into_day(locked_day, prepared.data, payload["receiptPayments"])
        locked_day.save()

        receipt = FiscalReceipt.objects.create(
            sale=sale,
            device=device,
            fiscal_day=locked_day,
            receipt_type=doc,
            receipt_counter=receipt_counter,
            receipt_global_no=receipt_global_no,
            invoice_no=payload["invoiceNo"],
            server_signature=submitted.data if synced else {},
            previous_hash=previous_hash,
            qr_url="",
            payload=prepared.data,
            sync_status=FiscalReceipt.SyncStatus.SYNCED if synced else FiscalReceipt.SyncStatus.PENDING,
            submitted_at=datetime.now(timezone.utc) if synced else None,
        )
        if synced:
            qr = service.generate_qr(
                device,
                submitted.data.get("serverSignature", {}).get("signature", ""),
                receipt_global_no,
                _local_today(),
            )
            if qr.ok:
                receipt.qr_url = qr.data.get("qr_url", "")
                receipt.save(update_fields=["qr_url"])

        log_action(business, actor, "fiscal.receipt", {
            "receipt_global_no": receipt_global_no,
            "counter": receipt_counter,
            "sync": "synced" if synced else "pending",
            "receipt_id": submitted.data.get("receiptID") if synced else None,
            "error": "" if synced else submitted.error,
        })
        return receipt


def sync_pending_receipts(business) -> int:
    """Retry pending receipts IN ORDER (chaining depends on sequence)."""
    from sales.fiscal import fiscal_service_for
    from sales.models import FiscalReceipt

    service = fiscal_service_for(business)
    synced_count = 0
    receipts = (
        FiscalReceipt.objects.filter(device__business=business, sync_status="pending")
        .order_by("receipt_global_no")
    )
    for receipt in receipts:
        prepared = service.prepare_receipt(
            receipt.device, dict(receipt.payload),
            previous_hash=_previous_receipt_hash(receipt.fiscal_day),
        )
        if not prepared.ok:
            break
        submitted = service.submit_receipt(receipt.device, prepared.data)
        if not submitted.ok:
            break
        receipt.server_signature = submitted.data
        receipt.sync_status = "synced"
        receipt.submitted_at = datetime.now(timezone.utc)
        qr = service.generate_qr(
            receipt.device,
            submitted.data.get("serverSignature", {}).get("signature", ""),
            receipt.receipt_global_no, receipt.fiscal_day.day_date,
        )
        if qr.ok:
            receipt.qr_url = qr.data.get("qr_url", "")
        receipt.save()
        synced_count += 1
    return synced_count


def certificate_expiry_reminder(business) -> dict | None:
    """Return a reminder dict if the fiscal cert expires within 30 days."""
    from sales.fiscal_workflow import fiscal_status

    status = fiscal_status(business)
    valid_till = status.get("certificate_valid_till")
    if not valid_till:
        return None
    if isinstance(valid_till, str):
        valid_till = _parse_dt(valid_till)
    if valid_till is None:
        if isinstance(status.get("certificate_valid_till"), str):
            valid_till = _parse_dt(status["certificate_valid_till"])
        if valid_till is None:
            return None
    days_left = (valid_till.date() - _local_today()).days
    if days_left <= 30:
        return {
            "kind": "cert_expiry",
            "days_left": days_left,
            "message": f"Your FDMS certificate expires in {days_left} day(s). Renew now.",
        }
    return None
