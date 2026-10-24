"""
Sales, invoices, payments and ALL fiscal (FDMS) state.

The app owns FDMS state (the zimra library is stateless):
- FiscalDay.fiscal_day_no must be greater than the last closed day
- FiscalReceipt.receipt_counter resets per day; receipt_global_no never resets
- previousReceiptHash chains receipts
- FiscalDay.running_counters holds SaleByTax / SaleTaxByTax / BalanceByMoneyType
"""
from django.db import models


class Customer(models.Model):
    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="customers"
    )
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=200, blank=True)
    tin = models.CharField(max_length=20, blank=True, help_text="Buyer TIN (fiscal invoices)")
    vat_number = models.CharField(max_length=20, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Sale(models.Model):
    """Unified commercial document: POS sale / invoice / credit / debit note."""

    class DocType(models.TextChoices):
        SALE = "sale", "Quick sale (fiscalised)"
        INVOICE = "invoice", "Invoice"
        CREDIT_NOTE = "credit_note", "Credit note"
        DEBIT_NOTE = "debit_note", "Debit note"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        PART_PAID = "part_paid", "Part paid"
        PAID = "paid", "Paid"
        OVERDUE = "overdue", "Overdue"
        COMPLETED = "completed", "Completed"

    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="sales"
    )
    doc_type = models.CharField(max_length=16, choices=DocType.choices, default=DocType.SALE)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.COMPLETED)
    customer = models.ForeignKey(
        "sales.Customer", null=True, blank=True, on_delete=models.SET_NULL, related_name="purchases"
    )
    buyer_data = models.JSONField(
        default=dict, blank=True,
        help_text="ZIMRA buyerData: name, address, contact, TIN, VAT no",
    )
    # credit/debit notes reference the ORIGINAL fiscal receipt
    original = models.ForeignKey(
        "sales.Sale", null=True, blank=True, on_delete=models.SET_NULL, related_name="credit_debit_notes"
    )
    currency = models.CharField(max_length=3, default="USD")
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    date = models.DateField(db_index=True)
    due_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    receipt_notes = models.TextField(
        blank=True, help_text="Why this credit/debit note was issued (goes to FDMS)"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        label = self.get_doc_type_display()
        return f"{label} #{self.id} — {self.total} {self.currency}"


class SaleLine(models.Model):
    sale = models.ForeignKey("sales.Sale", on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(
        "inventory.Product", null=True, blank=True, on_delete=models.SET_NULL
    )
    name = models.CharField(max_length=120)
    qty = models.DecimalField(max_digits=12, decimal_places=3, default=1)
    unit_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_type = models.CharField(max_length=16, default="standard")
    tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    hs_code = models.CharField(max_length=10, blank=True)

    def __str__(self):
        return f"{self.name} x{self.qty}"


class Payment(models.Model):
    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        MOBILE_MONEY = "mobile_money", "Mobile money"
        BANK_TRANSFER = "bank_transfer", "Bank transfer"

    sale = models.ForeignKey("sales.Sale", on_delete=models.CASCADE, related_name="payments")
    method = models.CharField(max_length=16, choices=Method.choices, default=Method.CASH)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="USD")
    date = models.DateField()
    reference = models.CharField(max_length=60, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_method_display()} {self.amount} ({self.sale_id})"


class FiscalDevice(models.Model):
    """A registered FDMS device. Cert + key stored ENCRYPTED (Fernet)."""

    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="fiscal_devices"
    )
    device_id = models.CharField(max_length=32)
    serial_no = models.CharField(max_length=32)
    activation_key_enc = models.TextField(blank=True, help_text="Encrypted")
    model_name = models.CharField(max_length=60, default="Server")
    model_version = models.CharField(max_length=20, default="v1")
    certificate_enc = models.TextField(blank=True, help_text="Encrypted PEM")
    private_key_enc = models.TextField(blank=True, help_text="Encrypted PEM")
    taxpayer_name = models.CharField(max_length=120, blank=True)
    taxpayer_tin = models.CharField(max_length=20, blank=True)
    vat_number = models.CharField(max_length=20, blank=True)
    branch_address = models.JSONField(default=dict, blank=True)
    applicable_taxes = models.JSONField(default=list, blank=True)
    certificate_valid_till = models.DateTimeField(null=True, blank=True)
    qr_base_url = models.CharField(max_length=200, blank=True)
    last_global_no = models.IntegerField(
        default=0, help_text="receiptGlobalNo — never resets"
    )
    is_active = models.BooleanField(default=True)
    registered_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Device {self.device_id} ({self.business.name})"


class FiscalDay(models.Model):
    """One fiscal day per device. The app owns all counters."""

    class State(models.TextChoices):
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    device = models.ForeignKey(
        "sales.FiscalDevice", on_delete=models.CASCADE, related_name="fiscal_days"
    )
    fiscal_day_no = models.IntegerField()
    day_date = models.DateField(db_index=True)
    state = models.CharField(max_length=8, choices=State.choices, default=State.OPEN)
    opened_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    last_receipt_counter = models.IntegerField(default=0)
    # running counters for closeDay: SaleByTax / SaleTaxByTax / BalanceByMoneyType
    running_counters = models.JSONField(
        default=list, blank=True,
        help_text="List of fiscalDayCounters dicts, updated on every receipt",
    )
    close_response = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["device", "fiscal_day_no"], name="uniq_day_no_per_device"
            )
        ]
        ordering = ["-day_date"]

    def __str__(self):
        return f"Day {self.fiscal_day_no} ({self.device.device_id}) {'OPEN' if self.state == 'open' else 'closed'}"


class FiscalReceipt(models.Model):
    """The fiscal record of a submitted (or pending) receipt."""

    class SyncStatus(models.TextChoices):
        PENDING = "pending", "Pending sync"
        SYNCED = "synced", "Synced"
        FAILED = "failed", "Failed"

    sale = models.OneToOneField(
        "sales.Sale", on_delete=models.CASCADE, related_name="fiscal_receipt"
    )
    device = models.ForeignKey("sales.FiscalDevice", on_delete=models.CASCADE)
    fiscal_day = models.ForeignKey("sales.FiscalDay", on_delete=models.CASCADE)
    receipt_type = models.CharField(
        max_length=16, default="FISCALINVOICE"
    )  # FISCALINVOICE | CREDITNOTE | DEBITNOTE
    receipt_counter = models.IntegerField()
    receipt_global_no = models.IntegerField()
    invoice_no = models.CharField(max_length=40, blank=True)
    receipt_id = models.CharField(max_length=40, blank=True, help_text="FDMS receiptID")
    server_signature = models.JSONField(default=dict, blank=True)
    previous_hash = models.CharField(max_length=200, blank=True)
    qr_url = models.CharField(max_length=400, blank=True)
    payload = models.JSONField(default=dict, blank=True, help_text="Prepared receipt sent to FDMS")
    sync_status = models.CharField(
        max_length=10, choices=SyncStatus.choices, default=SyncStatus.SYNCED
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Receipt #{self.receipt_global_no} ({self.get_sync_status_display()})"
