"""PDFs via reportlab: A4 invoice + Receipt48 (80mm) with QR codes."""
from __future__ import annotations

import io
from decimal import Decimal

import qrcode
from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (Image, Paragraph, SimpleDocTemplate, Spacer,
                                Table, TableStyle)


def _qr_image(data: str, box: int = 22) -> Image | None:
    if not data:
        return None
    try:
        img = qrcode.make(data)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        from reportlab.lib.utils import ImageReader

        return Image(ImageReader(buf), width=box * mm, height=box * mm)
    except Exception:
        return None


def _shared_styles():
    ss = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("t", parent=ss["Title"], fontSize=16, spaceAfter=6),
        "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontSize=11, spaceAfter=4),
        "small": ParagraphStyle("s", parent=ss["Normal"], fontSize=8, textColor=colors.grey),
        "normal": ss["Normal"],
    }


def _fiscal_block(sale):
    receipt = getattr(sale, "fiscal_receipt", None)
    if receipt is None:
        return None
    return {
        "receipt_id": receipt.receipt_id,
        "global_no": receipt.receipt_global_no,
        "counter": receipt.receipt_counter,
        "day_no": receipt.fiscal_day.fiscal_day_no,
        "date": str(receipt.fiscal_day.day_date),
        "qr": receipt.qr_url,
        "signature": (receipt.server_signature or {}).get("signature", ""),
    }


def invoice_pdf_response(sale) -> HttpResponse:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm)
    st = _shared_styles()
    fiscal = _fiscal_block(sale)
    story = [
        Paragraph("Pfuma Mbiri — INVOICE", st["title"]),
        Paragraph(f"{sale.business.name}", st["h2"]),
        Spacer(1, 4 * mm),
    ]
    if sale.customer:
        story.append(Paragraph(
            f"Bill to: {sale.customer.name}<br/>{sale.customer.address or ''}"
            f"{'<br/>TIN: ' + sale.customer.tin if sale.customer.tin else ''}", st["normal"]))
    story.append(Paragraph(f"Date: {sale.date}    Due: {sale.due_date or '—'}    Status: {sale.status}", st["small"]))
    story.append(Spacer(1, 6 * mm))
    rows = [["Item", "Qty", "Unit", "Tax %", "Total"]]
    for line in sale.lines.all():
        rows.append([line.name, str(line.qty), str(line.unit_price),
                     str(line.tax_percent), str(line.line_total)])
    rows.append(["", "", "", "Subtotal", str(sale.subtotal)])
    rows.append(["", "", "", "Tax", str(sale.tax_total)])
    rows.append(["", "", "", "TOTAL", f"{sale.total} {sale.currency}"])
    table = Table(rows, colWidths=[70 * mm, 20 * mm, 30 * mm, 25 * mm, 40 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F766E")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ]))
    story.append(table)
    story.append(Spacer(1, 8 * mm))
    if fiscal:
        story.append(Paragraph(
            f"FDMS Receipt #{fiscal['global_no']} (day {fiscal['day_no']}, counter {fiscal['counter']}) — "
            f"receiptID {fiscal['receipt_id']} — {fiscal['date']}", st["small"]))
        story.append(Paragraph(f"Verify: {fiscal['qr']}", st["small"]))
        qr = _qr_image(fiscal["qr"])
        if qr:
            story.append(Spacer(1, 3 * mm))
            story.append(qr)
    else:
        story.append(Paragraph("Not fiscalised", st["small"]))
    doc.build(story)
    buf.seek(0)
    resp = HttpResponse(buf.getvalue(), content_type="application/pdf")
    resp["Content-Disposition"] = f'inline; filename="invoice-{sale.id}.pdf"'
    return resp


def receipt_pdf_response(sale) -> HttpResponse:
    """80mm thermal Receipt48 with verifiable QR."""
    buf = io.BytesIO()
    width = 80 * mm
    doc = SimpleDocTemplate(buf, pagesize=(width, 297 * mm), leftMargin=6 * mm, rightMargin=6 * mm)
    st = _shared_styles()
    fiscal = _fiscal_block(sale)
    story = [
        Paragraph(sale.business.name, ParagraphStyle(
            "c", parent=st["title"], fontSize=13, alignment=1)),
        Paragraph(f"Taxpayer TIN: {sale.business.fiscal_devices.first().taxpayer_tin if sale.business.fiscal_devices.exists() else ''}",
                  ParagraphStyle("cs", parent=st["small"], alignment=1)),
        Spacer(1, 3 * mm),
        Paragraph(f"{sale.date} — Sale #{sale.id}", ParagraphStyle(
            "c2", parent=st["small"], alignment=1)),
        Spacer(1, 3 * mm),
    ]
    rows = [["Item", "Qty", "Total"]]
    for line in sale.lines.all():
        rows.append([line.name, str(line.qty), str(line.line_total)])
    rows.append(["", "TOTAL", f"{sale.total} {sale.currency}"])
    table = Table(rows, colWidths=[42 * mm, 16 * mm, 22 * mm])
    table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ]))
    story.append(table)
    story.append(Spacer(1, 4 * mm))
    if fiscal:
        story.append(Paragraph(
            f"FDMS #{fiscal['global_no']} day {fiscal['day_no']} ctr {fiscal['counter']}<br/>"
            f"receiptID: {fiscal['receipt_id']}<br/>Sig: {fiscal['signature'][:24]}…",
            ParagraphStyle("f", parent=st["small"], alignment=1)))
        qr = _qr_image(fiscal["qr"], box=24)
        if qr:
            story.append(Spacer(1, 2 * mm))
            story.append(qr)
    doc.build(story)
    buf.seek(0)
    resp = HttpResponse(buf.getvalue(), content_type="application/pdf")
    resp["Content-Disposition"] = f'inline; filename="receipt-{sale.id}.pdf"'
    return resp
