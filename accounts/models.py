"""User, Business and Membership models — the multi-tenant core."""
from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models


class User(AbstractUser):
    """User who can log in with email OR phone number."""

    phone_validator = RegexValidator(
        regex=r"^\+?\d{7,15}$",
        message="Phone must be 7-15 digits, optionally starting with + (e.g. +263771234567).",
    )

    email = models.EmailField("email address", unique=True)
    # normalise blank phones to NULL so several users may simply have none
    phone = models.CharField(
        max_length=16,
        unique=True,
        null=True,
        blank=True,
        validators=[phone_validator],
        help_text="e.g. +263771234567 — used as an alternative login",
    )
    # demo-only flag for the separate lender view (Phase 3 makes this real)
    is_lender = models.BooleanField(
        default=False, help_text="Can access the lender demo view (sample data only)."
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ["id"]

    def clean(self):
        super().clean()
        if self.phone == "":
            self.phone = None

    def save(self, *args, **kwargs):
        if self.phone == "":
            self.phone = None
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email


class Business(models.Model):
    """One SME tenant. All financial data hangs off this."""

    class FiscalMode(models.TextChoices):
        MOCK = "MOCK", "Mock (offline demo)"
        TEST = "TEST", "ZIMRA test environment"
        PRODUCTION = "PRODUCTION", "Production (feature-flagged)"

    name = models.CharField(max_length=120)
    sector = models.CharField(max_length=80, blank=True)
    city = models.CharField(max_length=60, blank=True)
    country = models.CharField(max_length=60, default="Zimbabwe")
    default_currency = models.CharField(max_length=3, default="USD")  # USD | ZWG
    vat_registered = models.BooleanField(default=False)
    tin = models.CharField(max_length=20, blank=True)
    # FDMS mode per business (MVP default: MOCK)
    fiscal_mode = models.CharField(
        max_length=12,
        choices=FiscalMode.choices,
        default=FiscalMode.MOCK,
    )
    tax_inclusive_pricing = models.BooleanField(
        default=True, help_text="Retail (tax-inclusive) vs wholesale (tax-exclusive)."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "businesses"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Membership(models.Model):
    """A user's role in a business. One user may belong to several."""

    class Role(models.TextChoices):
        OWNER = "OWNER", "Owner"
        ACCOUNTANT = "ACCOUNTANT", "Accountant"
        STAFF = "STAFF", "Staff"
        LENDER = "LENDER", "Lender (demo view)"

    user = models.ForeignKey(
        "accounts.User", on_delete=models.CASCADE, related_name="memberships"
    )
    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="memberships"
    )
    role = models.CharField(max_length=12, choices=Role.choices, default=Role.OWNER)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "business"], name="uniq_user_business")
        ]
        ordering = ["business__name"]

    def __str__(self):
        return f"{self.user.email} – {self.get_role_display()} @ {self.business.name}"
