"""
MockFiscalService — realistic fake FDMS responses.

Default for demos: no network, no certificates, deterministic-ish IDs.
Signatures are SHA-256 of the payload + a per-device secret so they LOOK real
and are stable for tests. QR URLs point at the FDMS verification URL shape.
"""
from __future__ import annotations

import hashlib
import random
from datetime import datetime, timedelta, timezone

from sales.fiscal import FiscalResult, FiscalService

MOCK_QR_BASE = "https://fdmstest.zimra.co.zw"
MOCK_TAXES = [
    {"taxID": 1, "taxPercent": None, "taxName": "Exempt"},
    {"taxID": 2, "taxPercent": 0.0, "taxName": "Zero rate 0%"},
    {"taxID": 515, "taxPercent": 15.5, "taxName": "Standard rated 15.5%"},
    {"taxID": 514, "taxPercent": 5.0, "taxName": "Non-VAT Withholding Tax"},
]


def _device_secret(device) -> str:
    if device is None:
        return "mock-device:none"
    return f"{device.device_id}:{device.serial_no}:mock-secret"


def _sign(device, payload: str) -> str:
    return hashlib.sha256(
        (payload + _device_secret(device)).encode()
    ).hexdigest()


class MockFiscalService(FiscalService):
    name = "MOCK"

    # -- device lifecycle --

    def register_device(self, device_id, serial_no, activation_key,
                        model_name, model_version) -> FiscalResult:
        # pretend ZIMRA issued a certificate valid ~1 year
        valid_till = datetime.now(timezone.utc) + timedelta(days=365)
        return FiscalResult(ok=True, data={
            "deviceRegistered": True,
            "certificate": "-----BEGIN CERTIFICATE-----\nMOCK-CERT\n-----END CERTIFICATE-----\n",
            "private_key": "-----BEGIN PRIVATE KEY-----\nMOCK-KEY\n-----END PRIVATE KEY-----\n",
            "certificateValidTill": valid_till.strftime("%Y-%m-%dT%H:%M:%S"),
        })

    def get_config(self, device) -> FiscalResult:
        return FiscalResult(ok=True, data={
            "taxPayerName": device.taxpayer_name or (device.business.name if hasattr(device, "business") else "MOCK TAXPAYER"),
            "taxPayerTIN": device.taxpayer_tin or "0000000000",
            "vatNumber": device.vat_number or "",
            "deviceSerialNo": device.serial_no,
            "deviceBranchName": device.business.name if hasattr(device, "business") else "",
            "deviceBranchAddress": device.branch_address or {},
            "applicableTaxes": MOCK_TAXES,
            "certificateValidTill": (device.certificate_valid_till or datetime.now(timezone.utc) + timedelta(days=300)).strftime("%Y-%m-%dT%H:%M:%S"),
            "qrUrl": MOCK_QR_BASE,
        })

    def get_status(self, device) -> FiscalResult:
        return FiscalResult(ok=True, data={
            "deviceStatus": "ACTIVE",
            "serialNo": device.serial_no,
            "certificateValidTill": (device.certificate_valid_till or datetime.now(timezone.utc) + timedelta(days=300)).strftime("%Y-%m-%dT%H:%M:%S"),
        })

    def renew_certificate(self, device) -> FiscalResult:
        valid_till = datetime.now(timezone.utc) + timedelta(days=365)
        return FiscalResult(ok=True, data={
            "certificate": "-----BEGIN CERTIFICATE-----\nMOCK-CERT-RENEWED\n-----END CERTIFICATE-----\n",
            "certificateValidTill": valid_till.strftime("%Y-%m-%dT%H:%M:%S"),
        })

    # -- fiscal day --

    def open_day(self, device, fiscal_day_no) -> FiscalResult:
        if fiscal_day_no < 1:
            return FiscalResult(ok=False, error="fiscalDayNo must be >= 1")
        return FiscalResult(ok=True, data={
            "fiscalDayNo": fiscal_day_no,
            "operationID": f"MOCK:{device.device_id}:{fiscal_day_no}:OPEN",
        })

    def close_day(self, device, fiscal_day_no, day_date,
                  last_receipt_counter, fiscal_day_counters) -> FiscalResult:
        signature = _sign(device, f"close:{fiscal_day_no}:{last_receipt_counter}")
        return FiscalResult(ok=True, data={
            "fiscalDayNo": fiscal_day_no,
            "signature": signature,
            "operationID": f"MOCK:{device.device_id}:{fiscal_day_no}:CLOSE",
        })

    # -- receipts --

    def _validate_receipt(self, receipt_data: dict) -> str:
        required = ["receiptType", "receiptCurrency", "receiptCounter",
                    "receiptGlobalNo", "receiptDate", "receiptLines", "receiptPayments"]
        missing = [k for k in required if k not in receipt_data]
        if missing:
            return f"Missing fields: {', '.join(missing)}"
        return ""

    def prepare_receipt(self, device, receipt_data, previous_hash="") -> FiscalResult:
        err = self._validate_receipt(receipt_data)
        if err:
            return FiscalResult(ok=False, error=err)
        prepared = dict(receipt_data)
        prepared["receiptPrintForm"] = prepared.get("receiptPrintForm", "Receipt48")
        # total from lines (tax-inclusive: line totals ARE the gross)
        total = sum(
            float(l.get("line_total", l.get("quantity", 0) * l.get("unit_price", 0)))
            for l in receipt_data["receiptLines"]
        )
        prepared["receiptTotal"] = round(total, 2)
        prepared["previousReceiptHash"] = previous_hash
        return FiscalResult(ok=True, data=prepared)

    def prepare_receipt_tax_exclusive(self, device, receipt_data, previous_hash="") -> FiscalResult:
        result = self.prepare_receipt(device, receipt_data, previous_hash)
        if not result.ok:
            return result
        # tax-exclusive: add VAT on top for standard-rated lines
        total = 0.0
        for line in result.data["receiptLines"]:
            rate = line.get("tax_percent", 0)
            if isinstance(rate, str):
                rate = 0
            line_total = float(line.get("line_total", line["quantity"] * line["unit_price"]))
            total += line_total * (1 + float(rate) / 100.0)
        result.data["receiptTotal"] = round(total, 2)
        return result

    def submit_receipt(self, device, prepared) -> FiscalResult:
        if "receiptTotal" not in prepared:
            return FiscalResult(ok=False, error="Receipt not prepared")
        receipt_id = random.randint(10000, 99999)
        signature = _sign(device, f"{prepared['receiptGlobalNo']}:{prepared['receiptTotal']}")
        device_tag = device.device_id if device is not None else "nodev"
        return FiscalResult(ok=True, data={
            "receiptID": receipt_id,
            "receiptGlobalNo": prepared["receiptGlobalNo"],
            "serverSignature": {"signature": signature, "algorithm": "SHA-256+RSA"},
            "operationID": f"MOCK:{device_tag}:SUBMIT:{prepared['receiptGlobalNo']}",
        })

    def generate_qr(self, device, signature, receipt_global_no, receipt_date) -> FiscalResult:
        digest = hashlib.sha256(f"{signature}:{receipt_global_no}".encode()).hexdigest()[:28]
        device_id = str(device.device_id) if device is not None else "0"
        try:
            device_num = int(device_id)
        except (TypeError, ValueError):
            device_num = 0
        url = f"{MOCK_QR_BASE}/{device_num:010d}{receipt_global_no:010d}{digest}"
        return FiscalResult(ok=True, data={"qr_url": url})

    # -- purchases --

    def validate_purchase_invoice(self, device, fiscal_invoice_no, amount) -> FiscalResult:
        # deterministic "validation": format check + hash reference
        if not fiscal_invoice_no:
            return FiscalResult(ok=False, error="Fiscal invoice number required")
        ref = hashlib.sha256(f"{fiscal_invoice_no}:{amount}".encode()).hexdigest()[:16].upper()
        return FiscalResult(ok=True, data={
            "validated": True,
            "validation_ref": f"MOCKVAL-{ref}",
        })
