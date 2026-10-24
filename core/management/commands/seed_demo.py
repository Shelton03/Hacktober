"""
seed_demo — build a realistic, self-contained DEMO dataset for Pfuma Mbiri.

Three demo businesses with ~6 months of history (sales fiscalised offline via
the MockFiscalService signing pattern, expenses, purchases, leads), a lender
demo layer (sample SMEs, fraud alerts, loan applications), demo logins and a
printed summary table.

Usage:
    python manage.py seed_demo            # seed only if no Business rows exist
    python manage.py seed_demo --flush   # wipe business-scoped data + reseed

Everything is random with a FIXED SEED (42) so repeated runs are reproducible.
All money is USD (ZWG where relevant), 2dp Decimals — no floats in the ledger.
"""
import hashlib
import logging
import random
import time
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone as dj_tz

logger = logging.getLogger(__name__)

SEED = 42
PASSWORD = "demo1234"
PHONE_START = 263771000001
MOCK_QR_BASE = "https://fdmstest.zimra.co.zw"
VAT_RATE = Decimal("15.5")

TWO_PLACES = Decimal("0.01")


def D(value) -> Decimal:
    """Coerce to a 2dp Decimal (mirrors core.money.D, local copy for speed)."""
    if isinstance(value, Decimal):
        return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    return Decimal(str(value)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


# ─────────────────────────────────────────────────────────────
# Demo fixtures (names, themes, categories)
# ─────────────────────────────────────────────────────────────

BUSINESSES = [
    {
        "name": "Mutare Hair Salon",
        "sector": "salon",
        "city": "Mutare",
        "vat_registered": False,
        "tin": "1029384756",
        "owner_email": "owner.salon@demo.com",
        "owner_first_name": "Rudo",
        "device_id": "101",
        "serial_no": "MOCK-SER-001",
        "activation_key": "ACT-001",
        "theme": "salon",
    },
    {
        "name": "Bulawayo Hardware Supplies",
        "sector": "hardware",
        "city": "Bulawayo",
        "vat_registered": True,
        "tin": "2039485761",
        "owner_email": "owner.hardware@demo.com",
        "owner_first_name": "Sipho",
        "device_id": "102",
        "serial_no": "MOCK-SER-002",
        "activation_key": "ACT-002",
        "theme": "hardware",
    },
    {
        "name": "Tendai Tuckshop, Harare",
        "sector": "retail",
        "city": "Harare",
        "vat_registered": True,
        "tin": "3049576812",
        "owner_email": "owner.tuckshop@demo.com",
        "owner_first_name": "Tendai",
        "device_id": "103",
        "serial_no": "MOCK-SER-003",
        "activation_key": "ACT-003",
        "theme": "grocery",
    },
]

PRODUCTS = {
    "salon": [
        ("Hair relaxer kit", 6.50, 14.00, "standard", "kit"),
        ("Coconut hair oil 250ml", 2.80, 7.50, "standard", "bottle"),
        ("Braiding hair pack", 4.00, 12.00, "standard", "pack"),
        ("Shampoo 500ml", 3.20, 8.50, "standard", "bottle"),
        ("Conditioner 500ml", 3.20, 8.50, "standard", "bottle"),
        ("Weave 20 inch", 9.00, 25.00, "standard", "unit"),
        ("Hair colour dye", 3.50, 9.00, "standard", "box"),
        ("Nail polish", 1.00, 3.50, "standard", "unit"),
        ("Hair dryer (retail)", 28.00, 55.00, "standard", "unit"),
        ("Barber clipper oil", 2.00, 5.00, "standard", "bottle"),
    ],
    "hardware": [
        ("Cement 50kg", 7.50, 11.00, "standard", "bag"),
        ("20L paint bucket", 22.00, 34.00, "standard", "unit"),
        ("Roof sheet 3m", 9.00, 15.50, "standard", "sheet"),
        ("Door hinge set", 1.80, 4.00, "standard", "set"),
        ("Padlock 60mm", 3.00, 7.00, "standard", "unit"),
        ("Hammer 500g", 4.50, 9.50, "standard", "unit"),
        ("PVC pipe 4m", 3.80, 7.00, "standard", "pipe"),
        ("Electrical cable 10m", 6.00, 12.50, "standard", "roll"),
        ("Steel nails 1kg", 1.50, 3.00, "standard", "kg"),
        ("Safety gloves", 1.20, 3.50, "standard", "pair"),
        ("Screwdriver set", 5.50, 12.00, "standard", "set"),
        ("Water tap mixer", 8.00, 18.00, "standard", "unit"),
    ],
    "grocery": [
        ("Maize meal 10kg", 6.80, 9.50, "standard", "bag"),
        ("Cooking oil 2L", 3.90, 5.80, "standard", "bottle"),
        ("Rice 2kg", 2.20, 3.60, "standard", "bag"),
        ("Sugar 2kg", 1.80, 2.90, "standard", "bag"),
        ("Flour 10kg", 5.50, 8.00, "standard", "bag"),
        ("Bread loaf", 0.75, 1.10, "zero", "unit"),
        ("Fresh milk 500ml", 0.80, 1.20, "standard", "bottle"),
        ("Laundry soap bar", 0.60, 1.00, "standard", "bar"),
        ("Candles 6-pack", 1.10, 2.00, "standard", "pack"),
        ("Airtime scratch card", 1.00, 1.10, "exempt", "unit"),
        ("Coke 330ml can", 0.45, 0.85, "standard", "can"),
        ("Baked beans 400g", 0.90, 1.50, "standard", "tin"),
    ],
}

# Zimbabwean names — some with a TIN, some without (triggers compliance issues)
CUSTOMER_NAMES = [
    ("Tendai Mabhena", True), ("Rutendo Nyoni", False),
    ("Farai Chikafu", True), ("Nomvula Sibanda", False),
    ("Takudzwa Mukono", True), ("Chiedza Moyo", False),
    ("Blessing Dube", True), ("Sibusiso Ncube", False),
    ("Tafara Gwena", True), ("Ruvarashe Matongo", False),
    ("Kudzai Banga", False), ("Precious Hadebe", True),
    ("Simba Machingauta", False), ("Tanaka Chirwa", True),
    ("Vimbai Jiri", False), ("Melissa Dube", True),
]

ZIMBABWE_CITIES = ["Harare", "Bulawayo", "Mutare", "Gweru", "Masvingo", "Kwekwe"]
STREETS = ["Josiah Tongogara St", "Samora Machel Ave", "Robert Mugabe Rd",
           "Herbert Chitepo St", "Jason Moyo Ave"]

EXPENSE_CATEGORIES = [
    "stock_purchase", "rent", "utilities", "salaries", "transport",
    "marketing", "office_supplies", "equipment", "professional_fees",
    "taxes_licences", "repairs", "other",
]

LEAD_INTERESTS = {
    "salon": ["Full bridal package", "Dreadlock retouch", "Manicure & pedicure",
              "Kids braiding", "Hair treatment", "Weave installation"],
    "hardware": ["Bulk cement order", "Roofing quote", "Paint for 3-room house",
                 "Plumbing materials", "Fencing wire", "Door frames x6"],
    "grocery": ["Weekly bulk groceries", "Event catering supplies", "Tuckshop restock",
                "Staff lunch order", "Bread supply contract", "Beverages for function"],
}

LEAD_SOURCES = ["walk_in", "whatsapp", "facebook", "referral"]
LEAD_STAGES = ["new", "contacted", "quoted", "won", "lost"]

SUPPLIERS = {
    "salon": ["Chikwandu Hair Suppliers", "Avon Beauty Distributors", "Salon Pro Wholesalers"],
    "hardware": ["Steel & Cement Wholesalers", "Bulawayo Paint Depot", "Pro Hardware Imports"],
    "grocery": ["National Foods Distributor", "Delta Beverages Depot", "Mars Wholesalers"],
}

# Lender demo layer — SAMPLE DATA ONLY (every lender page shows a DEMO banner)
SME_NAMES = [
    ("Chikwanas Groceries", "retail", "Harare"), ("Mvurwi Farm Supplies", "agriculture", "Mvurwi"),
    ("Kubatana Transport", "transport", "Bulawayo"), ("Ruva Beauty Salon", "salon", "Masvingo"),
    ("Tashinga Hardware", "hardware", "Gweru"), ("Mama Ngena Catering", "catering", "Harare"),
    ("Dzivarasekwa Butchery", "retail", "Harare"), ("Zunde Agro Dealers", "agriculture", "Bindura"),
    ("Rapid Movers Logistics", "transport", "Kwekwe"), ("Fabulous Cuts Salon", "salon", "Mutare"),
    ("Nyaradzo Building Supplies", "hardware", "Chitungwiza"), ("Tastee Bites Catering", "catering", "Bulawayo"),
    ("Green Valley Produce", "agriculture", "Marondera"), ("Mutoko Farm Inputs", "agriculture", "Mutoko"),
    ("City Stylists Salon", "salon", "Harare"), ("Chikanga Hardware Centre", "hardware", "Mutare"),
    ("Everyday Supermarket", "retail", "Gweru"), ("Speedy Freight Transport", "transport", "Harare"),
    ("Anowaida Caterers", "catering", "Chinhoyi"), ("Highfield Tuckshop Supplies", "retail", "Harare"),
    ("Rwenji Irrigation Scheme", "agriculture", "Nyanga"), ("Pamusha Hair Studio", "salon", "Bulawayo"),
    ("Zambezi Bolt & Nut", "hardware", "Kariba"), ("Utsanana Weddings Catering", "catering", "Harare"),
    ("N Richards Wholesaler", "retail", "Bulawayo"), ("Matopo Farming Co-op", "agriculture", "Matobo"),
    ("Kombi Fleet Services", "transport", "Kadoma"), ("Express Hair & Nails", "salon", "Kwekwe"),
    ("Turbo Electrical Supplies", "hardware", "Harare"), ("Gourmet Affairs Catering", "catering", "Mutare"),
    ("Choppies Corner Store", "retail", "Gwanda"), ("Sanyati Cotton Traders", "agriculture", "Sanyati"),
    ("Wenham Haulage", "transport", "Ruwa"), ("Braids & Beauty Bar", "salon", "Chitungwiza"),
    ("Plug Point Electrical", "hardware", "Bulawayo"), ("Kota Yemoyo Catering", "catering", "Masvingo"),
    ("Corner Bakerton Spaza", "retail", "Kadoma"), ("Inyanga Trout Farm", "agriculture", "Nyanga"),
    ("Redstone Bus Lines", "transport", "Masvingo"), ("Signature Looks Salon", "salon", "Harare"),
]

POSITIVE_REASONS = [
    "6 months of FDMS-verified sales — steady daily takings",
    "No missed VAT filings in the last 4 periods",
    "Revenue trend up 12% over the sampled months",
    "High data completeness — products, customers and receipts all captured",
    "Compliance score consistently above 85",
    "Cash-heavy sector — deposits align with declared takings",
    "Buyer TINs captured on most fiscal invoices",
    "Recent stock purchases match declared sales growth",
    "Low expenses-to-revenue ratio this period",
    "Previous facility repaid in full (sample record)",
]

NEGATIVE_REASONS = [
    "Receipt counter gaps in two fiscal days",
    "Two purchase invoices lack FDMS validation",
    "Revenue dips in two of the sampled months",
    "Declared sales diverge from fiscalised totals",
    "Compliance issues outstanding from last scan",
    "Thin trading history — only 5 months sampled",
]

FRAUD_KINDS = [
    ("national_id_multiple_sims", "critical",
     "One national ID is linked to multiple active SIM cards (3 different numbers).",
     "Verify the applicant in person and require proof of SIM ownership before proceeding."),
    ("device_reuse_across_applicants", "warning",
     "The same device fingerprint appears on applications from two different applicants.",
     "Request additional identity documents and check whether the applicants know each other."),
    ("recent_sim_swap_before_loan_request", "critical",
     "A SIM swap was recorded 2 days before the loan application was submitted.",
     "Contact the applicant on the previously registered number before any approval."),
    ("declared_vs_fiscalised_divergence", "warning",
     "Declared monthly sales are 38% higher than FDMS-fiscalised receipts for the same month.",
     "Ask for a ZIMRA fiscal report and reconcile before using declared revenue."),
    ("rapid_in_out_transactions", "critical",
     "Three rapid in-out transactions (received and forwarded within minutes) in one day.",
     "Request bank statements and an explanation of the transaction purpose."),
    ("sim_swap_account_takeover", "critical",
     "SIM swap detected 6 hours before the loan request — classic account-takeover pattern.",
     "Free the application and verify identity at a branch."),
]

LOAN_PURPOSES = [
    "Stock restock for festive season", "Second delivery vehicle", "Salon equipment upgrade",
    "Bulk fertilizer purchase", "Shopfitting for new branch", "Working capital for catering tender",
    "Borehole installation for farm", "POS and refrigeration equipment",
    "Furniture for new salon chairs", "Import consignment of building materials",
]


class Command(BaseCommand):
    help = (
        "Seed a full demo dataset: 3 businesses with ~6 months of history, "
        "fiscalised sales, expenses, leads, compliance scan, plus the lender "
        "demo layer (sample SMEs, fraud alerts, loan applications)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush", action="store_true",
            help="Wipe all business-scoped data (and demo users) and reseed.",
        )

    # ── entry ────────────────────────────────────────────────

    def handle(self, *args, **options):
        self.started = time.monotonic()
        random.seed(SEED)
        self._phone_seq = 0
        self.counts = {}

        from accounts.models import Business

        flush = options["flush"]
        if flush:
            self._flush()
        elif Business.objects.exists():
            self.stdout.write(self.style.WARNING(
                "Business data already present — skipping "
                "(use --flush to wipe & reseed)."
            ))
            return

        # tax config first (compliance/VAT math depends on it)
        try:
            from compliance.models import TaxConfig
            from compliance.seed_values import seed_tax_config
            seed_tax_config()
            self.counts["tax_config"] = TaxConfig.objects.count()
        except Exception as exc:
            logger.warning("seed_tax_config skipped: %s", exc)

        # 3 businesses, each in ONE transaction
        for spec in BUSINESSES:
            with transaction.atomic():
                business = self._seed_business(spec)
                self.counts[business.name] = self._seed_business_data(business, spec)

        # lender demo user (no business membership — is_lender gate only)
        try:
            self._mk_user("lender@demo.com", "Larry", is_lender=True,
                          last_name="Mlilo")
        except Exception as exc:
            logger.warning("lender user creation skipped: %s", exc)

        # lender demo layer (global sample data)
        try:
            self.counts["lender_demo"] = self._seed_lender_layer()
        except Exception as exc:
            logger.warning("lender layer skipped: %s", exc)
            self.counts["lender_demo"] = {}

        self._print_summary()
        self.stdout.write(self.style.SUCCESS(
            f"seed_demo completed in {self.runtime():.1f}s"
        ))

    def runtime(self) -> float:
        return time.monotonic() - self.started

    # ── flush ────────────────────────────────────────────────

    def _flush(self):
        """Wipe business-scoped data and demo users (cascades do most work)."""
        from accounts.models import Business, User

        self.stdout.write("Flushing existing data…")

        # Business ON DELETE CASCADE removes all business-scoped rows
        deleted, _ = Business.objects.all().delete()

        # demo users (idempotent re-runs): emails + demo phone range
        demo_emails = [b["owner_email"] for b in BUSINESSES] + [
            "accountant@demo.com", "staff@demo.com", "lender@demo.com",
        ]
        User.objects.filter(email__in=demo_emails).delete()
        User.objects.filter(phone__startswith=f"+{PHONE_START}").delete()

        # lender sample layer has no FK to business → wipe explicitly
        try:
            from lender.models import FraudAlert, LenderSme, LoanApplication
            LoanApplication.objects.all().delete()
            FraudAlert.objects.all().delete()
            LenderSme.objects.all().delete()
        except Exception as exc:
            logger.warning("lender flush skipped: %s", exc)

        # clear any notification stragglers (cascade should already have them)
        try:
            from notifications.models import Notification, SendLog
            SendLog.objects.all().delete()
            Notification.objects.all().delete()
        except Exception as exc:
            logger.warning("notifications flush skipped: %s", exc)

        self.stdout.write(f"  businesses deleted (cascades): {deleted}")

    # ── users ───────────────────────────────────────────────

    def _next_phone(self) -> str:
        self._phone_seq += 1
        return f"+{PHONE_START + self._phone_seq - 1}"

    def _mk_user(self, email: str, first_name: str, *, is_lender: bool = False,
                 last_name: str = ""):
        User = get_user_model()
        existing = User.objects.filter(email=email).first()
        if existing:
            return existing
        return User.objects.create_user(
            username=email,
            email=email,
            password=PASSWORD,
            first_name=first_name,
            last_name=last_name,
            phone=self._next_phone(),
            is_lender=is_lender,
        )

    # ── business shell ───────────────────────────────────────

    def _seed_business(self, spec):
        from accounts.models import Business, Membership

        owner = self._mk_user(spec["owner_email"], spec["owner_first_name"])

        business = Business.objects.create(
            name=spec["name"],
            sector=spec["sector"],
            city=spec["city"],
            country="Zimbabwe",
            default_currency="USD",
            vat_registered=spec["vat_registered"],
            tin=spec["tin"],
            fiscal_mode=Business.FiscalMode.MOCK,
            tax_inclusive_pricing=True,
        )
        Membership.objects.create(
            user=owner, business=business, role=Membership.Role.OWNER)

        # shared demo users
        accountant = self._mk_user("accountant@demo.com", "Anesu", last_name="Mhaka")
        Membership.objects.get_or_create(
            user=accountant, business=business,
            defaults={"role": Membership.Role.ACCOUNTANT},
        )
        if spec["theme"] == "grocery":
            staff = self._mk_user("staff@demo.com", "Kudzai", last_name="Marowa")
            Membership.objects.get_or_create(
                user=staff, business=business,
                defaults={"role": Membership.Role.STAFF},
            )

        # fiscal device via the REAL workflow (MOCK mode)
        device = None
        try:
            from sales.fiscal_workflow import register_device
            device = register_device(
                business, owner,
                device_id=spec["device_id"],
                serial_no=spec["serial_no"],
                activation_key=spec["activation_key"],
                model_name="Server",
                model_version="v1",
            )
            if device is None:
                raise RuntimeError("register_device returned None")
        except Exception as exc:
            logger.warning("fiscal device registration failed for %s: %s",
                           business.name, exc)

        self._device = device
        self._owner = owner
        return business

    # ── per-business data ────────────────────────────────────

    def _seed_business_data(self, business, spec) -> dict:
        counts = {}
        counts.update(self._seed_products(business, spec))
        counts.update(self._seed_customers(business))
        customers = list(business.customers.all())
        counts.update(self._seed_sales_history(business, spec, customers))
        counts.update(self._seed_expenses_and_purchases(business, spec))
        counts.update(self._seed_leads(business, spec))
        counts.update(self._seed_notifications(business))
        counts.update(self._seed_compliance_and_advisor(business))
        return counts

    # -- products ------------------------------------------------

    def _seed_products(self, business, spec) -> dict:
        from inventory.models import Product

        pool = PRODUCTS[spec["theme"]]
        chosen = pool[: random.randint(8, min(12, len(pool)))]
        rows = [
            Product(
                business=business,
                name=name,
                sku=f"{spec['theme'][:3].upper()}-{i:03d}",
                unit=unit,
                cost_price=D(cost),
                selling_price=D(sell),
                tax_type=tax_type,
                stock_qty=random.randint(3, 60),
                low_stock_threshold=5,
                currency="USD",
            )
            for i, (name, cost, sell, tax_type, unit) in enumerate(chosen, start=1)
        ]
        Product.objects.bulk_create(rows)
        return {"products": len(rows)}

    # -- customers ------------------------------------------------

    def _seed_customers(self, business) -> dict:
        from sales.models import Customer

        rows = []
        for name, has_tin in random.sample(CUSTOMER_NAMES, random.randint(10, 15)):
            rows.append(Customer(
                business=business,
                name=name,
                phone=self._next_phone(),
                email=f"{name.split()[0].lower()}{random.randint(1, 99)}@example.co.zw",
                address=(f"{random.randint(1, 200)} {random.choice(STREETS)}, "
                         f"{random.choice(ZIMBABWE_CITIES)}"),
                tin=f"{random.randint(10, 99)}{random.randint(1000000, 9999999)}"
                    if has_tin else "",
                vat_number="",
            ))
        Customer.objects.bulk_create(rows)
        return {"customers": len(rows)}

    # -- fiscalised sales history ---------------------------------
    #
    # History is written DIRECTLY as FiscalDay + FiscalReceipt rows using the
    # MockFiscalService signing pattern (SHA-256 of payload + per-device
    # secret, chained previous hashes) — realistic payloads, no live submit.
    # One FiscalDay per month block; receiptGlobalNo is sequential across ALL
    # receipts per device; receiptCounter resets per day (month block);
    # previous_hash chains from the previous receipt's signature.

    def _mock_sign(self, device, payload: str) -> str:
        secret = f"{device.device_id}:{device.serial_no}:mock-secret"
        return hashlib.sha256((payload + secret).encode()).hexdigest()

    def _mock_qr(self, device, signature: str, global_no: int) -> str:
        digest = hashlib.sha256(f"{signature}:{global_no}".encode()).hexdigest()[:28]
        try:
            device_num = int(device.device_id)
        except (TypeError, ValueError):
            device_num = 0
        return f"{MOCK_QR_BASE}/{device_num:010d}{global_no:010d}{digest}"

    def _line_tax(self, product) -> tuple:
        """(gross, net, vat, tax_percent) for one unit of a product,
        tax-inclusive retail pricing (business.tax_inclusive_pricing=True)."""
        gross = D(product.selling_price)
        if product.tax_type == "standard":
            net = D(gross / (Decimal(1) + VAT_RATE / Decimal(100)))
            return gross, net, gross - net, VAT_RATE
        pct = Decimal("5") if product.tax_type == "withholding" else Decimal("0")
        return gross, gross, Decimal("0.00"), pct

    def _seed_sales_history(self, business, spec, customers) -> dict:
        from sales.models import (FiscalDay, FiscalReceipt, Payment,
                                  Sale, SaleLine)

        device = self._device
        products = list(business.products.all())
        if device is None or not products:
            logger.warning("no device/products for %s — sales history skipped",
                           business.name)
            return {"sales": 0, "sale_lines": 0, "payments": 0,
                    "fiscal_days": 0, "fiscal_receipts": 0, "invoices": 0}

        today = dj_tz.localdate()
        tz = dj_tz.get_current_timezone()

        # ── plan: one (product, qty, customer, method) doc per sale ──
        n_sales = random.randint(120, 180)
        plans = []
        for _ in range(n_sales):
            chosen = random.sample(products, random.randint(1, 4))
            qty_plan = [(p, Decimal(random.randint(1, 3))) for p in chosen]
            customer = random.choice(customers) if random.random() < 0.35 else None
            method = random.choices(
                ["cash", "mobile_money", "card", "bank_transfer"],
                weights=[55, 25, 10, 10])[0]
            sale_date = today - timedelta(days=random.randint(1, 180))
            plans.append((sale_date, qty_plan, customer, method))
        plans.sort(key=lambda t: (t[0], random.random()))

        # ── Sales (totals derived from the SAME plan as the lines) ──
        sale_rows = []
        for sale_date, qty_plan, customer, method in plans:
            subtotal = Decimal("0.00")
            tax_total = Decimal("0.00")
            for p, qty in qty_plan:
                gross, net, vat, _pct = self._line_tax(p)
                subtotal += D(net * qty)
                tax_total += D(vat * qty)
            sale_rows.append(Sale(
                business=business,
                doc_type=Sale.DocType.SALE,
                status=Sale.Status.COMPLETED,
                customer=customer,
                currency="USD",
                subtotal=subtotal,
                tax_total=tax_total,
                total=D(subtotal + tax_total),
                date=sale_date,
            ))
        Sale.objects.bulk_create(sale_rows)
        sales = list(business.sales.filter(doc_type=Sale.DocType.SALE)
                     .order_by("date", "id"))

        # ── SaleLines + Payments ────────────────────────────────────
        line_rows, payment_rows = [], []
        for sale, (sale_date, qty_plan, customer, method) in zip(sales, plans):
            for p, qty in qty_plan:
                gross, net, vat, pct = self._line_tax(p)
                line_rows.append(SaleLine(
                    sale=sale,
                    product=p,
                    name=p.name,
                    qty=qty,
                    unit_price=p.selling_price,
                    tax_type=p.tax_type,
                    tax_percent=pct,
                    line_total=D(gross * qty),  # tax-inclusive gross
                ))
            payment_rows.append(Payment(
                sale=sale,
                method=method,
                amount=sale.total,
                currency="USD",
                date=sale.date,
            ))
        SaleLine.objects.bulk_create(line_rows)
        Payment.objects.bulk_create(payment_rows)

        lines_by_sale = {}
        for line in SaleLine.objects.filter(sale__in=sales):
            lines_by_sale.setdefault(line.sale_id, []).append(line)
        payments_by_sale = {p.sale_id: p for p in payment_rows}

        # ── FiscalDays: one per MONTH block ─────────────────────────
        months = sorted({(s.date.year, s.date.month) for s in sales})
        month_first_date = {}
        for s in sales:  # sales are date-ordered
            key = (s.date.year, s.date.month)
            if key not in month_first_date:
                month_first_date[key] = s.date

        day_rows = []
        day_by_month = {}
        for day_no, (y, m) in enumerate(months, start=1):
            day = FiscalDay(
                device=device,
                fiscal_day_no=day_no,
                day_date=month_first_date[(y, m)],
                state=FiscalDay.State.OPEN,
                opened_at=datetime.combine(month_first_date[(y, m)],
                                           datetime.min.time(), tzinfo=tz),
                running_counters=[],
            )
            day_rows.append(day)
            day_by_month[(y, m)] = day
        FiscalDay.objects.bulk_create(day_rows)
        # bulk_create on some backends leaves pk None → re-fetch by day_no
        if any(d.pk is None for d in day_rows):
            fetched = {d.fiscal_day_no: d for d in
                       FiscalDay.objects.filter(device=device)}
            for d in day_rows:
                d.pk = fetched[d.fiscal_day_no].pk

        # ── FiscalReceipts with chained signatures ─────────────────
        receipt_rows = []
        counter_by_month = {}
        global_no = 0
        previous_sig = ""
        for sale in sales:
            key = (sale.date.year, sale.date.month)
            day = day_by_month[key]
            counter = counter_by_month.get(key, 0) + 1
            counter_by_month[key] = counter
            global_no += 1

            lines_payload = []
            for line in lines_by_sale[sale.id]:
                if line.tax_type == "standard":
                    vat = float(D(line.line_total) -
                                D(line.line_total) / (Decimal(1) + VAT_RATE / Decimal(100)))
                else:
                    vat = 0.0
                lines_payload.append({
                    "item_name": line.name,
                    "tax_percent": float(line.tax_percent or 0),
                    "quantity": float(line.qty),
                    "unit_price": float(line.unit_price),
                    "line_total": float(line.line_total),
                    "hs_code": line.hs_code or "04021099",
                    "_vat": round(vat, 2),
                })
            payment = payments_by_sale[sale.id]
            money_code = {"cash": 0, "card": 1}.get(payment.method, 0)
            payments_payload = [{
                "moneyTypeCode": money_code,
                "paymentAmount": float(payment.amount),
            }]

            payload = {
                "receiptType": "FISCALINVOICE",
                "receiptCurrency": "USD",
                "receiptCounter": counter,
                "receiptGlobalNo": global_no,
                "invoiceNo": f"INV-{sale.id:06d}",
                "receiptDate": datetime.combine(
                    sale.date, datetime.min.time(), tzinfo=tz
                ).strftime("%Y-%m-%dT%H:%M:%S"),
                "receiptLines": lines_payload,
                "receiptPayments": payments_payload,
                "receiptPrintForm": "Receipt48",
                "receiptTotal": float(sale.total),
                "previousReceiptHash": previous_sig,
            }
            if sale.customer:
                c = sale.customer
                payload["buyerData"] = {
                    "buyerName": c.name,
                    "buyerAddress": c.address or "",
                    "buyerContact": c.phone or c.email or "",
                    "buyerTIN": c.tin or "",
                    "buyerVATNumber": c.vat_number or "",
                }

            # MockFiscalService signing pattern: SHA-256(globalNo:total + secret)
            signature = self._mock_sign(device, f"{global_no}:{float(sale.total)}")
            receipt_id = random.randint(10000, 99999)
            server_signature = {
                "signature": signature,
                "algorithm": "SHA-256+RSA",
                "receiptID": receipt_id,
                "operationID": f"MOCK:{device.device_id}:SUBMIT:{global_no}",
            }

            receipt_rows.append(FiscalReceipt(
                sale=sale,
                device=device,
                fiscal_day=day,
                receipt_type="FISCALINVOICE",
                receipt_counter=counter,
                receipt_global_no=global_no,
                invoice_no=payload["invoiceNo"],
                receipt_id=str(receipt_id),
                server_signature=server_signature,
                previous_hash=previous_sig,
                qr_url=self._mock_qr(device, signature, global_no),
                payload=payload,
                sync_status=FiscalReceipt.SyncStatus.SYNCED,
                submitted_at=datetime.combine(sale.date, datetime.min.time(),
                                               tzinfo=tz),
            ))
            previous_sig = signature
            self._fold_counters(day, payload)

        FiscalReceipt.objects.bulk_create(receipt_rows)

        # ── close every historical day (month block) ───────────────
        for day in day_rows:
            day.state = FiscalDay.State.CLOSED
            day.last_receipt_counter = counter_by_month.get(
                (day.day_date.year, day.day_date.month), 0)
            day.closed_at = datetime.combine(day.day_date,
                                             datetime.min.time(), tzinfo=tz) \
                + timedelta(hours=20)
            day.close_response = {
                "fiscalDayNo": day.fiscal_day_no,
                "signature": self._mock_sign(
                    device, f"close:{day.fiscal_day_no}:{day.last_receipt_counter}"),
                "operationID": f"MOCK:{device.device_id}:{day.fiscal_day_no}:CLOSE",
            }
        FiscalDay.objects.bulk_update(
            day_rows, ["state", "last_receipt_counter", "closed_at",
                       "close_response", "running_counters"])

        # one OPEN fiscal day for TODAY so the demo can show open→sale→close
        open_day_no = len(day_rows) + 1
        FiscalDay.objects.create(
            device=device, fiscal_day_no=open_day_no, day_date=today,
            state=FiscalDay.State.OPEN, opened_at=dj_tz.now(),
            running_counters=[],
        )

        counts = {
            "sales": len(sales),
            "sale_lines": len(line_rows),
            "payments": len(payment_rows),
            "fiscal_days": len(day_rows) + 1,
            "fiscal_receipts": len(receipt_rows),
        }
        counts.update(self._seed_invoices(business, customers, products))
        return counts

    def _fold_counters(self, day, payload: dict):
        """Fold a prepared receipt into the day's running fiscal counters
        (mirrors fiscal_workflow._merge_receipt_into_day, floats for JSON)."""
        counters = day.running_counters or []
        currency = payload.get("receiptCurrency", "USD")

        def find_or_add(ctype, tax_id, pct):
            for c in counters:
                if (c.get("fiscalCounterType") == ctype
                        and c.get("fiscalCounterCurrency") == currency
                        and c.get("fiscalCounterTaxID") == tax_id):
                    return c
            counter = {
                "fiscalCounterType": ctype,
                "fiscalCounterCurrency": currency,
                "fiscalCounterTaxID": tax_id,
                "fiscalCounterTaxPercent": pct,
                "fiscalCounterValue": 0.0,
            }
            counters.append(counter)
            return counter

        for line in payload.get("receiptLines", []):
            pct = line.get("tax_percent", 0) or 0
            if pct == 0:
                tax_id = 2
            elif abs(pct - 15.5) < 0.01:
                tax_id = 515
            else:
                tax_id = 1
            vat = line.get("_vat") or 0.0
            net = float(line.get("line_total", 0)) - vat
            sale = find_or_add("SaleByTax", tax_id, pct)
            sale["fiscalCounterValue"] = round(
                sale["fiscalCounterValue"] + net, 2)
            if vat:
                taxc = find_or_add("SaleTaxByTax", tax_id, pct)
                taxc["fiscalCounterValue"] = round(
                    taxc["fiscalCounterValue"] + vat, 2)

        for payment in payload.get("receiptPayments", []):
            code = payment.get("moneyTypeCode", 0)
            amt = float(payment.get("paymentAmount", 0) or 0)
            bal = find_or_add("BalanceByMoneyType", code, None)
            bal["fiscalCounterValue"] = round(bal["fiscalCounterValue"] + amt, 2)

        day.running_counters = counters

    def _seed_invoices(self, business, customers, products) -> dict:
        """Unpaid invoices — some OVERDUE (due in the past) for receivables."""
        from sales.models import Sale, SaleLine

        today = dj_tz.localdate()
        plans = []
        for _ in range(random.randint(6, 10)):
            qty_plan = [(p, Decimal(random.randint(1, 4)))
                        for p in random.sample(products, random.randint(1, 3))]
            if random.random() < 0.6:  # overdue
                due = today - timedelta(days=random.randint(3, 45))
                status = Sale.Status.OVERDUE
                date_ = due - timedelta(days=random.randint(5, 15))
            else:
                due = today + timedelta(days=random.randint(5, 30))
                status = Sale.Status.SENT
                date_ = today - timedelta(days=random.randint(1, 10))
            customer = random.choice(customers)
            plans.append((date_, due, status, customer, qty_plan))

        sale_rows = []
        for date_, due, status, customer, qty_plan in plans:
            subtotal = Decimal("0.00")
            tax_total = Decimal("0.00")
            for p, qty in qty_plan:
                gross, net, vat, _pct = self._line_tax(p)
                subtotal += D(net * qty)
                tax_total += D(vat * qty)
            sale_rows.append(Sale(
                business=business,
                doc_type=Sale.DocType.INVOICE,
                status=status,
                customer=customer,
                buyer_data={
                    "buyerName": customer.name,
                    "buyerAddress": customer.address or "",
                    "buyerContact": customer.phone or "",
                    "buyerTIN": customer.tin or "",
                },
                currency="USD",
                subtotal=subtotal,
                tax_total=tax_total,
                total=D(subtotal + tax_total),
                date=date_,
                due_date=due,
            ))
        Sale.objects.bulk_create(sale_rows)

        invoices = list(business.sales.filter(doc_type=Sale.DocType.INVOICE)
                        .order_by("id"))
        line_rows = []
        for sale, (_date_, _due, _status, _cust, qty_plan) in zip(invoices, plans):
            for p, qty in qty_plan:
                gross, _net, _vat, pct = self._line_tax(p)
                line_rows.append(SaleLine(
                    sale=sale,
                    product=p,
                    name=p.name,
                    qty=qty,
                    unit_price=p.selling_price,
                    tax_type=p.tax_type,
                    tax_percent=pct,
                    line_total=D(gross * qty),
                ))
        SaleLine.objects.bulk_create(line_rows)
        return {"invoices": len(sale_rows), "invoice_lines": len(line_rows)}

    # -- expenses & purchases --------------------------------------

    def _seed_expenses_and_purchases(self, business, spec) -> dict:
        from expenses.models import Expense, PurchaseInvoice, Supplier

        today = dj_tz.localdate()

        supplier_rows = [
            Supplier(
                business=business,
                name=name,
                tin=f"{random.randint(10, 99)}{random.randint(1000000, 9999999)}",
                phone=self._next_phone(),
                email=f"sales@{name.split()[0].lower()}.co.zw",
            )
            for name in SUPPLIERS[spec["theme"]]
        ]
        Supplier.objects.bulk_create(supplier_rows)
        suppliers = list(business.suppliers.all())

        # recurring monthly expenses + randoms → 30-60 total
        rows = []
        for month_back in range(6):
            month_date = today - timedelta(days=30 * month_back)
            for cat, lo, hi in [("rent", 150, 400), ("utilities", 40, 120),
                                ("salaries", 120, 350), ("transport", 20, 90)]:
                rows.append(Expense(
                    business=business,
                    category=cat,
                    description=(f"{cat.replace('_', ' ').title()} — "
                                 f"{month_date.strftime('%B %Y')}"),
                    amount=D(random.uniform(lo, hi)),
                    currency="USD",
                    date=month_date,
                ))
        while len(rows) < 30:
            rows.append(Expense(
                business=business,
                category=random.choice(EXPENSE_CATEGORIES),
                description=random.choice([
                    "Stock delivery", "Airtime for EcoCash line", "Cleaning supplies",
                    "Packaging materials", "Repairs to fridge", "Bank charges",
                    "Advertising on Facebook", "Borehole water refill",
                ]),
                amount=D(random.uniform(5, 80)),
                currency="USD",
                date=today - timedelta(days=random.randint(1, 180)),
            ))
        Expense.objects.bulk_create(rows)

        # purchase invoices: 8-15, with 2-3 NOT fdms_validated (compliance issue)
        n_purchases = random.randint(8, 15)
        n_unvalidated = random.randint(2, 3)
        purchase_rows = []
        for i in range(n_purchases):
            fiscal_no = f"FD-{random.randint(100000, 999999)}"
            amount = D(random.uniform(50, 800))
            validated = i >= n_unvalidated
            validation_ref = ""
            if validated:
                ref = hashlib.sha256(
                    f"{fiscal_no}:{amount}".encode()).hexdigest()[:16].upper()
                validation_ref = f"MOCKVAL-{ref}"
            purchase_rows.append(PurchaseInvoice(
                business=business,
                supplier=random.choice(suppliers),
                supplier_invoice_no=f"SI-{random.randint(1000, 9999)}",
                fiscal_invoice_no=fiscal_no,
                description=f"Stock purchase — {random.choice(suppliers).name}",
                amount=amount,
                vat_amount=D(amount * VAT_RATE / Decimal(100)),
                currency="USD",
                date=today - timedelta(days=random.randint(1, 180)),
                fdms_validated=validated,
                validation_ref=validation_ref,
                validated_at=(dj_tz.now() - timedelta(days=random.randint(0, 60))
                              if validated else None),
            ))
        PurchaseInvoice.objects.bulk_create(purchase_rows)

        return {
            "suppliers": len(supplier_rows),
            "expenses": len(rows),
            "purchase_invoices": len(purchase_rows),
            "purchases_unvalidated": n_unvalidated,
        }

    # -- leads ------------------------------------------------------

    def _seed_leads(self, business, spec) -> dict:
        from leads.models import Lead, LeadActivity

        today = dj_tz.localdate()
        members = [m.user for m in business.memberships.all()]
        interests = LEAD_INTERESTS[spec["theme"]]

        rows = []
        # guarantee at least one lead in EVERY stage, then randomise the rest
        stage_cycle = list(LEAD_STAGES)
        for i in range(random.randint(12, 20)):
            if i < len(stage_cycle):
                stage = stage_cycle[i]
            else:
                stage = random.choices(
                    LEAD_STAGES, weights=[30, 25, 20, 15, 10])[0]
            r = random.random()
            if r < 0.2:          # due today
                followup = today
            elif r < 0.35:       # due yesterday (overdue follow-up)
                followup = today - timedelta(days=1)
            elif r < 0.75:
                followup = today + timedelta(days=random.randint(1, 14))
            else:
                followup = None
            rows.append(Lead(
                business=business,
                name=random.choice(CUSTOMER_NAMES)[0],
                phone=self._next_phone(),
                source=random.choices(LEAD_SOURCES, weights=[40, 30, 15, 15])[0],
                interest=random.choice(interests),
                estimated_value=D(random.uniform(20, 800)),
                currency="USD",
                stage=stage,
                next_followup=followup,
                followup_note="Confirm quote by WhatsApp" if stage == "quoted" else "",
                assigned_to=random.choice(members) if members else None,
            ))
        # GUARANTEE at least one follow-up due today and one due yesterday
        if rows:
            rows[0].next_followup = today
            rows[1].next_followup = today - timedelta(days=1)
        Lead.objects.bulk_create(rows)

        leads = list(business.leads.order_by("-id")[:8])
        activity_rows = []
        for lead in leads:
            for _ in range(random.randint(1, 3)):
                activity_rows.append(LeadActivity(
                    lead=lead,
                    actor=random.choice(members) if members else None,
                    kind=random.choice(["note", "call", "whatsapp", "meeting"]),
                    note=random.choice([
                        "Called — asked for a quote on WhatsApp",
                        "Walked in, browsed products, took a flyer",
                        "Meeting booked for next week Tuesday",
                        "Referred by an existing customer",
                        "Quoted; awaiting confirmation",
                    ]),
                ))
        LeadActivity.objects.bulk_create(activity_rows)

        return {"leads": len(rows), "lead_activities": len(activity_rows)}

    # -- notifications ----------------------------------------------

    def _seed_notifications(self, business) -> dict:
        from notifications.models import Notification

        today = dj_tz.localdate()
        owner = self._owner
        rows = [
            Notification(
                business=business, user=owner, kind="tax_deadline",
                title=f"VAT return due {today.replace(day=25).isoformat()}",
                body="Your VAT return for last month is due on the 25th. "
                     "Open the Tax page for your position.",
                link="/tax", is_read=False,
            ),
            Notification(
                business=business, user=owner, kind="lead_followup",
                title="Lead follow-ups due today",
                body="You have leads waiting for a follow-up — check the Leads pipeline.",
                link="/leads", is_read=False,
            ),
            Notification(
                business=business, user=owner, kind="low_stock",
                title="Low stock alert",
                body="One or more products have fallen below their low-stock threshold.",
                link="/products", is_read=False,
            ),
        ]
        overdue = business.sales.filter(
            doc_type="invoice", status="overdue").count()
        if overdue:
            rows.append(Notification(
                business=business, user=owner, kind="overdue_invoice",
                title=f"{overdue} invoice(s) overdue",
                body="Overdue invoices are affecting your receivables — "
                     "send a WhatsApp reminder.",
                link="/invoices", is_read=True,
            ))
        Notification.objects.bulk_create(rows)
        return {"notifications": len(rows)}

    # -- compliance scan + advisor refresh ---------------------------

    def _seed_compliance_and_advisor(self, business) -> dict:
        counts = {}

        # compliance scan (lazy import — app may be mid-build)
        try:
            from compliance.services import refresh_compliance
            result = refresh_compliance(business)
            counts["compliance_issues"] = result.get("issues", 0)
            counts["compliance_score"] = result.get("score", 0)
        except Exception as exc:
            logger.warning("compliance scan failed for %s: %s",
                           business.name, exc)
            counts["compliance_issues"] = 0

        # advisor refresh (lazy import, tolerant)
        try:
            self._seed_advisor_insights(business)
            counts["insights"] = business.insights.count()
        except Exception as exc:
            logger.warning("advisor refresh failed for %s: %s",
                           business.name, exc)
            counts["insights"] = 0

        # security assessment + loan-readiness consent
        try:
            self._seed_security_and_consent(business)
            counts["security_assessments"] = business.security_assessments.count()
            counts["consents"] = business.consents.count()
        except Exception as exc:
            logger.warning("security/consent seeding failed for %s: %s",
                           business.name, exc)
            counts["security_assessments"] = 0
            counts["consents"] = 0

        return counts

    def _seed_advisor_insights(self, business):
        """Advisor insights computed from the freshly seeded ledger
        (mirrors the advisor contract: rule-based, numbers from the books)."""
        from advisor.models import Insight
        from expenses.models import Expense, PurchaseInvoice
        from sales.models import Sale

        today = dj_tz.localdate()
        rows = []

        # margin snapshot (last 30 days, from the ledger)
        since = today - timedelta(days=30)
        revenue = sum(
            (s.subtotal for s in Sale.objects.filter(
                business=business, doc_type="sale", date__gte=since)),
            Decimal("0.00"))
        spend = sum(
            (e.amount for e in Expense.objects.filter(
                business=business, date__gte=since)),
            Decimal("0.00"))
        if revenue:
            margin = (revenue - spend) / revenue * Decimal(100)
            rows.append((
                "margin_snapshot", "info",
                "Profit margin this month",
                f"Over the last 30 days you booked {revenue:,.2f} USD in net sales "
                f"against {spend:,.2f} USD in expenses — a margin of "
                f"{margin.quantize(Decimal('1')):,.0f}%.",
                "Keep recording expenses daily so this margin stays accurate.",
            ))

        # overdue receivables
        overdue = Sale.objects.filter(
            business=business, doc_type="invoice", status="overdue")
        if overdue.exists():
            amount = sum((s.total for s in overdue), Decimal("0.00"))
            rows.append((
                "overdue_receivables", "warning",
                f"{overdue.count()} overdue invoice(s) worth {amount:,.2f} USD",
                f"You have {overdue.count()} unpaid invoice(s) past their due date, "
                f"totalling {amount:,.2f} USD. Old receivables strain cash flow.",
                "Send a WhatsApp reminder from the invoice, or call the customer today.",
            ))

        # unvalidated purchases → input VAT at risk
        unvalidated = PurchaseInvoice.objects.filter(
            business=business, fdms_validated=False).count()
        if unvalidated:
            rows.append((
                "input_vat_at_risk", "warning",
                f"{unvalidated} purchase invoice(s) not FDMS-validated",
                "Input VAT can only be claimed on FDMS-validated supplier "
                f"invoices. {unvalidated} of your purchases are unvalidated.",
                "Open Expenses → Purchases and validate them against FDMS.",
            ))

        # cash-heavy sales mix
        if Sale.objects.filter(business=business, doc_type="sale").count() >= 10:
            rows.append((
                "sales_mix", "info",
                "Cash is still king in your takings",
                "Most of your sales settle in cash and EcoCash. Bank regularly "
                "and keep the float small to reduce risk.",
                "Bank cash takings at least twice a week.",
            ))

        for code, sev, title, explanation, action in rows:
            Insight.objects.update_or_create(
                business=business, code=code,
                defaults={
                    "title": title,
                    "explanation": explanation,
                    "recommended_action": action,
                    "severity": sev,
                    "status": "active",
                    "llm_phrased": False,
                },
            )

    def _seed_security_and_consent(self, business):
        from advisor.models import ConsentRecord, SecurityAssessment

        SecurityAssessment.objects.create(
            business=business,
            user=self._owner,
            answers={"1": "a", "2": "b", "3": "a", "4": "c", "5": "a",
                     "6": "b", "7": "a", "8": "b", "9": "c", "10": "a",
                     "11": "b", "12": "a"},
            score=68,
            fixes=[
                {"priority": "high",
                 "action": "Enable two-step verification on your EcoCash line"},
                {"priority": "medium",
                 "action": "Give the cashier a separate staff login"},
                {"priority": "low",
                 "action": "Keep cash float below $100 overnight"},
            ],
        )
        ConsentRecord.objects.create(
            business=business,
            lender_name="Sample Microfinance (demo)",
            data_scope=["sales", "compliance", "identity"],
            granted_by=self._owner,
            expires_at=dj_tz.localdate() + timedelta(days=90),
        )

    # ── lender demo layer ─────────────────────────────────────

    def _seed_lender_layer(self) -> dict:
        """SAMPLE DATA ONLY — the lender demo view (DEMO banner everywhere)."""
        from lender.models import FraudAlert, LenderSme, LoanApplication

        today = dj_tz.localdate()

        # 40 sample SMEs
        sme_rows = []
        for i, (name, sector, location) in enumerate(SME_NAMES, start=1):
            health = random.randint(40, 95)
            band = ("A" if health >= 85 else
                    "B" if health >= 70 else
                    "C" if health >= 55 else
                    "D" if health >= 45 else "E")
            base = random.uniform(1500, 9000)
            trend = []
            for _ in range(12):  # 12 monthly points
                base *= random.uniform(0.92, 1.10)
                trend.append(round(base, 2))
            compliance_history = [
                {"month": (today - timedelta(days=30 * m)).strftime("%Y-%m"),
                 "score": random.randint(55, 100)}
                for m in range(6)  # 6 points
            ]
            sme_rows.append(LenderSme(
                ref_id=f"SME-{i:04d}",
                name=name,
                sector=sector,
                location=location,
                health_score=health,
                risk_band=band,
                monthly_revenue_trend=trend,
                compliance_history=compliance_history,
                credit_score=random.randint(450, 800),
                credit_reasons=random.sample(
                    POSITIVE_REASONS + NEGATIVE_REASONS, 5),
                consent_status=random.choices(
                    ["granted", "expired", "revoked", "none"],
                    weights=[60, 15, 15, 10])[0],
            ))
        LenderSme.objects.bulk_create(sme_rows)
        smes = list(LenderSme.objects.all())

        # 8-12 fraud alerts with severity + explanation + suggested_action
        alert_rows = []
        for i in range(random.randint(8, 12)):
            kind, severity, explanation, suggested = \
                FRAUD_KINDS[i % len(FRAUD_KINDS)]
            alert_rows.append(FraudAlert(
                sme=random.choice(smes),
                kind=kind,
                severity=severity,
                explanation=explanation,
                suggested_action=suggested,
                detected_at=dj_tz.now() - timedelta(
                    days=random.randint(0, 30), hours=random.randint(0, 23)),
            ))
        FraudAlert.objects.bulk_create(alert_rows)

        # 10-15 loan applications: recommend / review / decline + reasons
        app_rows = []
        for _ in range(random.randint(10, 15)):
            sme = random.choice(smes)
            amount = D(random.choice([500, 1000, 2500, 5000, 8000, 12000])
                       + random.uniform(0, 500))
            if sme.health_score >= 75 and sme.consent_status == "granted":
                suggested = "recommend"
                reasons = random.sample(POSITIVE_REASONS, 3)
            elif sme.health_score >= 55:
                suggested = "review"
                reasons = (random.sample(POSITIVE_REASONS, 2)
                           + random.sample(NEGATIVE_REASONS, 1))
            else:
                suggested = "decline"
                reasons = random.sample(NEGATIVE_REASONS, 3)
            app_rows.append(LoanApplication(
                sme=sme,
                amount=amount,
                currency="USD",
                purpose=random.choice(LOAN_PURPOSES),
                suggested=suggested,
                reasons=reasons,
                submitted_at=dj_tz.now() - timedelta(
                    days=random.randint(0, 20), hours=random.randint(0, 23)),
            ))
        LoanApplication.objects.bulk_create(app_rows)

        return {
            "lender_smes": len(sme_rows),
            "fraud_alerts": len(alert_rows),
            "loan_applications": len(app_rows),
        }

    # ── summary ─────────────────────────────────────────────────

    def _print_summary(self):
        from accounts.models import User

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING(
            "Pfuma Mbiri — DEMO DATA SEEDED"))
        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"Demo logins (password: {PASSWORD})"))
        self.stdout.write(f"{'Email':<32} {'Role':<12} Business")
        self.stdout.write("-" * 78)
        demo_emails = [b["owner_email"] for b in BUSINESSES] + [
            "accountant@demo.com", "staff@demo.com", "lender@demo.com",
        ]
        for user in User.objects.filter(email__in=demo_emails).order_by("id"):
            if user.is_lender:
                self.stdout.write(
                    f"{user.email:<32} {'LENDER':<12} Lender demo view (sample data)")
                continue
            for m in user.memberships.select_related("business") \
                    .order_by("business__name"):
                self.stdout.write(
                    f"{user.email:<32} {m.role:<12} {m.business.name}")
        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("Data counts"))
        for name, data in self.counts.items():
            if isinstance(data, dict):
                self.stdout.write(f"  {name}:")
                for k, v in data.items():
                    self.stdout.write(f"    {k:<24} {v}")
            else:
                self.stdout.write(f"  {name}: {data}")
        self.stdout.write("")
