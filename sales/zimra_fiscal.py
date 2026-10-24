"""
ZimraFiscalService — real calls to the `zimra` library (TEST mode).

PRODUCTION is only reachable when the global FDMS_MODE=PRODUCTION flag allows it
(see fiscal_service_for in fiscal.py); this class just mirrors the library API.

Cert/key are stored ENCRYPTED in the DB (Fernet) and materialised to a secure
temporary directory at runtime — never plain files in the repo or web root.
"""
from __future__ import annotations

import logging
import shutil
import tempfile
from pathlib import Path

from sales.crypto import decrypt_value
from sales.fiscal import FiscalResult, FiscalService

logger = logging.getLogger(__name__)


class ZimraFiscalService(FiscalService):
    name = "ZIMRA"

    def __init__(self, test_mode: bool = True):
        self.test_mode = test_mode

    # -- helpers --

    def _build_device(self, fd_model):
        """Materialise encrypted cert/key to a secure temp dir, build a zimra Device."""
        from zimra import Device

        cert_pem = decrypt_value(fd_model.certificate_enc)
        key_pem = decrypt_value(fd_model.private_key_enc)

        tmpdir = tempfile.mkdtemp(prefix="fdms_")
        cert_path = Path(tmpdir) / "certificate.crt"
        key_path = Path(tmpdir) / "decrypted_key.key"
        cert_path.write_text(cert_pem)
        key_path.write_text(key_pem)
        cert_path.chmod(0o600)
        key_path.chmod(0o600)

        device = Device(
            device_id=str(fd_model.device_id),
            serialNo=fd_model.serial_no,
            activationKey=decrypt_value(fd_model.activation_key_enc),
            cert_path=str(cert_path),
            private_key_path=str(key_path),
            test_mode=self.test_mode,
            deviceModelName=fd_model.model_name,
            deviceModelVersion=fd_model.model_version,
            company_name=fd_model.taxpayer_name or "SME",
        )
        return device, tmpdir

    def _cleanup(self, tmpdir):
        if tmpdir and Path(tmpdir).exists():
            shutil.rmtree(tmpdir, ignore_errors=True)

    def _wrap(self, fn, *args, **kwargs) -> FiscalResult:
        try:
            data = fn(*args, **kwargs)
        except Exception as exc:
            logger.warning("ZimraFiscalService error: %s", exc)
            return FiscalResult(ok=False, error=str(exc))
        if isinstance(data, dict) and ("error" in data or 400 in data):
            return FiscalResult(ok=False, error=str(data), data=data)
        if not isinstance(data, dict):
            return FiscalResult(ok=True, data={"value": data})
        return FiscalResult(ok=True, data=data)

    # -- device lifecycle --

    def register_device(self, device_id, serial_no, activation_key,
                        model_name, model_version) -> FiscalResult:
        from zimra import register_new_device

        tmpdir = tempfile.mkdtemp(prefix="fdms_reg_")
        try:
            register_new_device(
                fiscal_device_serial_no=serial_no,
                device_id=str(device_id),
                activation_key=activation_key,
                model_name=model_name,
                folder_name=tmpdir,
                certificate_filename="certificate",
                private_key_filename="decrypted_key",
                prod=False,
            )
            cert_pem = (Path(tmpdir) / "certificate.crt").read_text()
            key_pem = (Path(tmpdir) / "decrypted_key.key").read_text()
            return FiscalResult(ok=True, data={
                "certificate": cert_pem,
                "private_key": key_pem,
                "certificateValidTill": "",  # getConfig() fills it
            })
        except Exception as exc:
            return FiscalResult(ok=False, error=str(exc))
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    def get_config(self, device) -> FiscalResult:
        zimra_device, tmpdir = self._build_device(device)
        try:
            return self._wrap(zimra_device.getConfig)
        finally:
            self._cleanup(tmpdir)

    def get_status(self, device) -> FiscalResult:
        zimra_device, tmpdir = self._build_device(device)
        try:
            return self._wrap(zimra_device.getStatus)
        finally:
            self._cleanup(tmpdir)

    def renew_certificate(self, device) -> FiscalResult:
        zimra_device, tmpdir = self._build_device(device)
        try:
            return self._wrap(zimra_device.renewCertificate)
        finally:
            self._cleanup(tmpdir)

    # -- fiscal day --

    def open_day(self, device, fiscal_day_no) -> FiscalResult:
        zimra_device, tmpdir = self._build_device(device)
        try:
            return self._wrap(zimra_device.openDay, fiscalDayNo=fiscal_day_no)
        finally:
            self._cleanup(tmpdir)

    def close_day(self, device, fiscal_day_no, day_date,
                  last_receipt_counter, fiscal_day_counters) -> FiscalResult:
        zimra_device, tmpdir = self._build_device(device)
        try:
            return self._wrap(
                zimra_device.closeDay,
                fiscalDayNo=fiscal_day_no,
                fiscalDayDate=day_date.strftime("%Y-%m-%dT%H:%M:%S"),
                lastReceiptCounterValue=last_receipt_counter,
                fiscalDayCounters=fiscal_day_counters,
            )
        finally:
            self._cleanup(tmpdir)

    # -- receipts --

    def prepare_receipt(self, device, receipt_data, previous_hash="") -> FiscalResult:
        zimra_device, tmpdir = self._build_device(device)
        try:
            return self._wrap(
                zimra_device.prepareReceipt,
                receiptData=receipt_data,
                previousReceiptHash=previous_hash,
            )
        finally:
            self._cleanup(tmpdir)

    def prepare_receipt_tax_exclusive(self, device, receipt_data, previous_hash="") -> FiscalResult:
        zimra_device, tmpdir = self._build_device(device)
        try:
            return self._wrap(
                zimra_device.prepareReceiptTaxExclusive,
                receiptData=receipt_data,
                previousReceiptHash=previous_hash,
                receiptPrintForm="ReceiptA4",
            )
        finally:
            self._cleanup(tmpdir)

    def submit_receipt(self, device, prepared) -> FiscalResult:
        zimra_device, tmpdir = self._build_device(device)
        try:
            return self._wrap(zimra_device.submitReceipt, prepared)
        finally:
            self._cleanup(tmpdir)

    def generate_qr(self, device, signature, receipt_global_no, receipt_date) -> FiscalResult:
        zimra_device, tmpdir = self._build_device(device)
        try:
            return self._wrap(
                zimra_device.generate_qr_code,
                signature, receipt_global_no, receipt_date,
            )
        finally:
            self._cleanup(tmpdir)

    def validate_purchase_invoice(self, device, fiscal_invoice_no, amount) -> FiscalResult:
        # FDMS purchase-invoice validation isn't in the library's public API;
        # TEST mode falls back to mock validation, clearly labelled.
        from sales.mock_fiscal import MockFiscalService

        result = MockFiscalService().validate_purchase_invoice(device, fiscal_invoice_no, amount)
        result.data["via"] = "mock-fallback"
        return result
