"""Sales API — DRF views: sales, invoices, customers, fiscal, dashboard."""
from __future__ import annotations

import logging
from decimal import Decimal

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api_tenancy import get_business_or_403
from core.models import log_action
from sales import services
from sales.fiscal_workflow import (
    close_day,
    fiscal_status,
    get_or_open_today,
    register_device,
    renew_certificate,
    sync_pending_receipts,
)
from sales.models import Customer, FiscalDevice, FiscalReceipt, Sale
from sales.pdf import invoice_pdf_response, receipt_pdf_response

logger = logging.getLogger(__name__)


def _sale_json(sale, detail=False):
    data = {
        "id": sale.id,
        "doc_type": sale.doc_type,
        "status": sale.status,
        "date": str(sale.date),
        "due_date": str(sale.due_date) if sale.due_date else None,
        "customer": sale.customer_id,
        "customer_name": sale.customer.name if sale.customer else None,
        "currency": sale.currency,
        "subtotal": str(sale.subtotal),
        "tax_total": str(sale.tax_total),
        "total": str(sale.total),
    }
    receipt = getattr(sale, "fiscal_receipt", None)
    if receipt is not None:
        data["receipt"] = {
            "receipt_id": receipt.receipt_id,
            "global_no": receipt.receipt_global_no,
            "counter": receipt.receipt_counter,
            "fiscal_day_no": receipt.fiscal_day.fiscal_day_no,
            "qr_url": receipt.qr_url,
            "sync_status": receipt.sync_status,
        }
    if detail:
        data["lines"] = [
            {"id": l.id, "product": l.product_id, "name": l.name,
             "qty": str(l.qty), "unit_price": str(l.unit_price),
             "tax_type": l.tax_type, "tax_percent": str(l.tax_percent),
             "line_total": str(l.line_total)}
            for l in sale.lines.all()
        ]
        data["payments"] = [
            {"id": p.id, "method": p.method, "amount": str(p.amount), "date": str(p.date)}
            for p in sale.payments.all()
        ]
        if sale.original_id:
            orig = sale.original
            orig_receipt = getattr(orig, "fiscal_receipt", None)
            data["original"] = {
                "id": orig.id,
                "receipt_id": orig_receipt.receipt_id if orig_receipt else "",
                "receipt_global_no": orig_receipt.receipt_global_no if orig_receipt else "",
                "fiscal_day_no": orig_receipt.fiscal_day.fiscal_day_no if orig_receipt else "",
                "date": str(orig.date),
            }
        data["share"] = {"wa_link": services.wa_link(sale),
                         "pdf_url": f"/api/sales/{sale.id}/pdf/"}
    return data


class QuickSaleView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        business = get_business_or_403(request)
        try:
            sale = services.create_quick_sale(business, request.user, request.data)
        except (ValueError, KeyError) as exc:
            return Response({"detail": str(exc)}, status=400)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found"}, status=400)
        return Response(_sale_json(sale, detail=True), status=201)


class SaleListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        qs = business.sales.exclude(doc_type=Sale.DocType.INVOICE).order_by("-date", "-id")
        return Response([_sale_json(s) for s in qs])


class SaleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        business = get_business_or_403(request)
        sale = business.sales.filter(pk=pk).first()
        if not sale:
            return Response({"detail": "Not found"}, status=404)
        return Response(_sale_json(sale, detail=True))


class InvoiceListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        services.refresh_overdue(business)
        qs = business.sales.filter(doc_type=Sale.DocType.INVOICE).order_by("-date", "-id")
        st = request.query_params.get("status")
        if st:
            qs = qs.filter(status=st)
        return Response([_sale_json(s) for s in qs])

    def post(self, request):
        business = get_business_or_403(request)
        try:
            sale = services.create_invoice(business, request.user, request.data)
        except (ValueError, KeyError) as exc:
            return Response({"detail": str(exc)}, status=400)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found"}, status=400)
        return Response(_sale_json(sale, detail=True), status=201)


class InvoiceDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        business = get_business_or_403(request)
        sale = business.sales.filter(pk=pk, doc_type=Sale.DocType.INVOICE).first()
        if not sale:
            return Response({"detail": "Not found"}, status=404)
        return Response(_sale_json(sale, detail=True))


class InvoiceSendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        business = get_business_or_403(request)
        sale = business.sales.filter(pk=pk, doc_type=Sale.DocType.INVOICE).first()
        if not sale:
            return Response({"detail": "Not found"}, status=404)
        services.mark_sent(business, request.user, sale)
        return Response({"ok": True, "wa_link": services.wa_link(sale),
                         "status": sale.status})


class InvoicePaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        business = get_business_or_403(request)
        sale = business.sales.filter(pk=pk, doc_type=Sale.DocType.INVOICE).first()
        if not sale:
            return Response({"detail": "Not found"}, status=404)
        try:
            payment = services.record_payment(
                business, request.user, sale, request.data.get("amount"),
                method=request.data.get("method", "cash"),
                date_=None, reference=request.data.get("reference", ""))
        except Exception as exc:
            return Response({"detail": f"Invalid payment: {exc}"}, status=400)
        return Response({"ok": True, "payment_id": payment.id, "status": sale.status})


class CreditNoteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        business = get_business_or_403(request)
        original = business.sales.filter(pk=pk).first()
        if not original:
            return Response({"detail": "Not found"}, status=404)
        note = services.create_credit_note(business, request.user, original, request.data)
        return Response(_sale_json(note, detail=True), status=201)


class DebitNoteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        business = get_business_or_403(request)
        original = business.sales.filter(pk=pk).first()
        if not original:
            return Response({"detail": "Not found"}, status=404)
        note = services.create_debit_note(business, request.user, original, request.data)
        return Response(_sale_json(note, detail=True), status=201)


class SalePdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        business = get_business_or_403(request)
        sale = business.sales.filter(pk=pk).first()
        if not sale:
            return Response({"detail": "Not found"}, status=404)
        return invoice_pdf_response(sale)


class ReceiptPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        business = get_business_or_403(request)
        sale = business.sales.filter(pk=pk).first()
        if not sale:
            return Response({"detail": "Not found"}, status=404)
        return receipt_pdf_response(sale)


class CustomerListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        return Response([
            {"id": c.id, "name": c.name, "phone": c.phone, "email": c.email,
             "address": c.address, "tin": c.tin, "vat_number": c.vat_number}
            for c in business.customers.all()
        ])

    def post(self, request):
        business = get_business_or_403(request)
        data = request.data
        if not data.get("name"):
            return Response({"detail": "Name is required"}, status=400)
        c = Customer.objects.create(
            business=business, name=data.get("name", ""),
            phone=data.get("phone", ""), email=data.get("email", ""),
            address=data.get("address", ""), tin=data.get("tin", ""),
            vat_number=data.get("vat_number", ""), notes=data.get("notes", ""))
        return Response({"id": c.id, "name": c.name}, status=201)


class CustomerDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        business = get_business_or_403(request)
        customer = business.customers.filter(pk=pk).first()
        if not customer:
            return Response({"detail": "Not found"}, status=404)
        history = [
            {"id": s.id, "date": str(s.date), "doc_type": s.doc_type,
             "total": str(s.total), "currency": s.currency, "status": s.status}
            for s in customer.purchases.order_by("-date")[:50]
        ]
        return Response({
            "id": customer.id, "name": customer.name, "phone": customer.phone,
            "email": customer.email, "address": customer.address,
            "tin": customer.tin, "vat_number": customer.vat_number,
            "notes": customer.notes, "purchase_history": history,
        })

    def patch(self, request, pk):
        business = get_business_or_403(request)
        customer = business.customers.filter(pk=pk).first()
        if not customer:
            return Response({"detail": "Not found"}, status=404)
        for f in ("name", "phone", "email", "address", "tin", "vat_number", "notes"):
            if f in request.data:
                setattr(customer, f, request.data[f])
        customer.save()
        return Response({"ok": True})

    def delete(self, request, pk):
        business = get_business_or_403(request)
        if business.customers.filter(pk=pk).delete()[0]:
            return Response({"ok": True})
        return Response({"detail": "Not found"}, status=404)


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        return Response(services.dashboard(business))


# ── fiscal ──────────────────────────────────────────────────

class FiscalDeviceListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        out = []
        for d in business.fiscal_devices.all():
            out.append({
                "id": d.id, "device_id": d.device_id, "serial_no": d.serial_no,
                "model_name": d.model_name, "model_version": d.model_version,
                "status": "active" if d.is_active else "inactive",
                "certificate_valid_till": str(d.certificate_valid_till) if d.certificate_valid_till else None,
                "taxpayer": {"name": d.taxpayer_name, "tin": d.taxpayer_tin, "vat": d.vat_number},
                "applicable_taxes": d.applicable_taxes,
            })
        return Response(out)

    def post(self, request):
        business = get_business_or_403(request)
        data = request.data
        required = ["device_id", "serial_no", "activation_key"]
        missing = [f for f in required if not data.get(f)]
        if missing:
            return Response({"detail": f"Missing: {', '.join(missing)}"}, status=400)
        device = register_device(
            business, request.user,
            device_id=data.get("device_id"), serial_no=data.get("serial_no"),
            activation_key=data.get("activation_key"),
            model_name=data.get("model_name", "Server"),
            model_version=data.get("model_version", "v1"))
        if device is None:
            return Response({"detail": "FDMS registration failed"}, status=400)
        return Response({"id": device.id, "device_id": device.device_id}, status=201)


class FiscalDeviceRenewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        business = get_business_or_403(request)
        device = business.fiscal_devices.filter(pk=pk).first()
        if not device:
            return Response({"detail": "Not found"}, status=404)
        ok = renew_certificate(device, request.user)
        return Response({"ok": ok})


class FiscalStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        return Response(fiscal_status(business))


class FiscalOpenDayView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        business = get_business_or_403(request)
        device = business.fiscal_devices.filter(is_active=True).first()
        if not device:
            return Response({"detail": "No fiscal device"}, status=400)
        day = get_or_open_today(business, device)
        return Response({"ok": True, "fiscal_day_no": day.fiscal_day_no,
                         "day_date": str(day.day_date)})


class FiscalCloseDayView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        business = get_business_or_403(request)
        device = business.fiscal_devices.filter(is_active=True).first()
        if not device:
            return Response({"detail": "No fiscal device"}, status=400)
        result = close_day(business, device, actor=request.user)
        return Response(result, status=200 if result.get("ok") else 400)


class FiscalReceiptsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business = get_business_or_403(request)
        qs = FiscalReceipt.objects.filter(device__business=business).order_by("-receipt_global_no")
        st = request.query_params.get("sync_status")
        if st:
            qs = qs.filter(sync_status=st)
        return Response([
            {"id": r.id, "sale": r.sale_id, "receipt_id": r.receipt_id,
             "global_no": r.receipt_global_no, "counter": r.receipt_counter,
             "sync_status": r.sync_status, "qr_url": r.qr_url,
             "invoice_no": r.invoice_no}
            for r in qs[:200]
        ])


class FiscalSyncPendingView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        business = get_business_or_403(request)
        n = sync_pending_receipts(business)
        return Response({"ok": True, "synced": n})
