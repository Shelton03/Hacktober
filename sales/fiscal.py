"""
FiscalService — the ONE internal interface over ZIMRA FDMS.

Two implementations:
- MockFiscalService: realistic fake responses (default for demos, offline-safe)
- ZimraFiscalService: real `zimra` library calls (TEST mode; PRODUCTION behind flag)

The app owns ALL FDMS state (fiscalDayNo, receiptCounter, receiptGlobalNo,
previousReceiptHash, running day counters) — see fiscal_workflow.py.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FiscalResult:
    """Uniform result from any fiscal operation. Never raises."""

    ok: bool = False
    data: dict = field(default_factory=dict)
    error: str = ""

    def __bool__(self):
        return self.ok


class FiscalService:
    """Interface. Implementations must be stateless per call (DB holds state)."""

    name = "base"

    # -- device lifecycle --
    def register_device(self, device_id, serial_no, activation_key,
                        model_name, model_version) -> FiscalResult:
        raise NotImplementedError

    def get_config(self, device) -> FiscalResult:
        raise NotImplementedError

    def get_status(self, device) -> FiscalResult:
        raise NotImplementedError

    def renew_certificate(self, device) -> FiscalResult:
        raise NotImplementedError

    # -- fiscal day --
    def open_day(self, device, fiscal_day_no) -> FiscalResult:
        raise NotImplementedError

    def close_day(self, device, fiscal_day_no, day_date,
                  last_receipt_counter, fiscal_day_counters) -> FiscalResult:
        raise NotImplementedError

    # -- receipts --
    def prepare_receipt(self, device, receipt_data, previous_hash="") -> FiscalResult:
        """Tax-inclusive receipts. Returns prepared payload."""
        raise NotImplementedError

    def prepare_receipt_tax_exclusive(self, device, receipt_data, previous_hash="") -> FiscalResult:
        """Tax-exclusive receipts (VAT added on top)."""
        raise NotImplementedError

    def submit_receipt(self, device, prepared) -> FiscalResult:
        """Returns receiptID / serverSignature / operationID."""
        raise NotImplementedError

    def generate_qr(self, device, signature, receipt_global_no, receipt_date) -> FiscalResult:
        raise NotImplementedError

    # -- purchases (input-VAT validation) --
    def validate_purchase_invoice(self, device, fiscal_invoice_no, amount) -> FiscalResult:
        """FDMS validation of a supplier fiscal invoice (mock in MOCK mode)."""
        raise NotImplementedError


def fiscal_service_for(business) -> FiscalService:
    """Factory: pick the implementation from the business's fiscal_mode.

    business.fiscal_mode: MOCK | TEST | PRODUCTION.
    PRODUCTION additionally requires settings.FDMS_MODE == 'PRODUCTION'
    (kill-switch feature flag); otherwise it falls back to MOCK.
    """
    from django.conf import settings

    mode = getattr(business, "fiscal_mode", "MOCK") or "MOCK"
    if mode in ("TEST", "PRODUCTION"):
        if mode == "PRODUCTION" and settings.FDMS_MODE != "PRODUCTION":
            # production disabled behind the global feature flag
            from sales.mock_fiscal import MockFiscalService

            return MockFiscalService()
        from sales.zimra_fiscal import ZimraFiscalService

        return ZimraFiscalService(test_mode=(mode == "TEST"))
    from sales.mock_fiscal import MockFiscalService

    return MockFiscalService()
