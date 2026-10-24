"""Seed the TaxConfig table — every rate/due-date is admin-editable, never hard-coded.

Upsert semantics: re-running updates values (and last_verified) in place rather
than duplicating rows, so `seed_tax_config()` is safe to call on every boot.
"""
from datetime import date

from django.db import transaction

from compliance.models import TaxConfig

# Values flagged for verification with ZIMRA before production use (see README).
# last_verified dates record when each value was last checked against ZIMRA.
SEED_TAX_CONFIG = [
    # category, key, value, data_type, description, last_verified
    ("vat", "standard_rate", "15.5", "decimal",
     "VAT standard rate (ZIMRA, verify before production)", date(2026, 1, 15)),
    ("vat", "zero_rate", "0", "decimal",
     "VAT zero-rated supplies (0%)", date(2026, 1, 15)),
    ("vat", "return_due_day", "25", "int",
     "VAT return due day of the month following the tax period", date(2026, 1, 15)),
    # QPD instalments: percent of annual tax, each with its due date
    ("qpd", "q1_percent", "10", "decimal",
     "QPD 1st instalment — % of estimated annual tax", date(2026, 1, 15)),
    ("qpd", "q1_due", "2026-03-25", "date",
     "QPD 1st instalment due date (25 March)", date(2026, 1, 15)),
    ("qpd", "q2_percent", "25", "decimal",
     "QPD 2nd instalment — % of estimated annual tax", date(2026, 1, 15)),
    ("qpd", "q2_due", "2026-06-25", "date",
     "QPD 2nd instalment due date (25 June)", date(2026, 1, 15)),
    ("qpd", "q3_percent", "30", "decimal",
     "QPD 3rd instalment — % of estimated annual tax", date(2026, 1, 15)),
    ("qpd", "q3_due", "2026-09-25", "date",
     "QPD 3rd instalment due date (25 September)", date(2026, 1, 15)),
    ("qpd", "q4_percent", "35", "decimal",
     "QPD 4th instalment — % of estimated annual tax", date(2026, 1, 15)),
    ("qpd", "q4_due", "2026-12-20", "date",
     "QPD 4th instalment due date (20 December)", date(2026, 1, 15)),
    # Income tax estimate rate used by the QPD estimate
    ("income", "tax_rate", "25", "decimal",
     "Corporate income tax estimate rate (%) — confirm current scales", date(2026, 1, 15)),
    # General
    ("general", "disclaimer", (
        "Estimates only. Confirm with ZIMRA or a registered tax practitioner."
     ), "str",
     "Disclaimer shown with every tax estimate / export", date(2026, 1, 15)),
]


@transaction.atomic
def seed_tax_config():
    """Upsert every seeded TaxConfig row. Returns {key: TaxConfig} for all seeds."""
    seeded = {}
    for category, key, value, data_type, description, last_verified in SEED_TAX_CONFIG:
        obj, _created = TaxConfig.objects.update_or_create(
            key=key,
            defaults={
                "category": category,
                "value": value,
                "data_type": data_type,
                "description": description,
                "last_verified": last_verified,
                "is_active": True,
            },
        )
        seeded[f"{category}.{key}"] = obj
    return seeded
