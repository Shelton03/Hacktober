"""Admin for the lender DEMO app — sample data, read-mostly review screens.

Every admin page is clearly labelled as a demo so nobody mistakes the
sample portfolio/fraud alerts for a real credit-decisioning system.
"""
from django.contrib import admin

from .models import FraudAlert, LenderSme, LoanApplication

admin.site.site_header = "Pfuma Mbiri Admin"
admin.site.site_title = "Pfuma Mbiri Admin"
admin.site.index_title = "Business administration — DEMO lender data"


@admin.register(LenderSme)
class LenderSmeAdmin(admin.ModelAdmin):
    list_display = ("ref_id", "name", "sector", "location", "health_score",
                    "risk_band", "credit_score", "consent_status")
    list_filter = ("risk_band", "sector", "consent_status")
    search_fields = ("ref_id", "name", "sector", "location")
    ordering = ("risk_band", "-health_score")


@admin.register(FraudAlert)
class FraudAlertAdmin(admin.ModelAdmin):
    list_display = ("kind", "severity", "sme", "detected_at")
    list_filter = ("severity", "kind")
    search_fields = ("kind", "explanation", "sme__name")
    date_hierarchy = "detected_at"
    ordering = ("-detected_at",)


@admin.register(LoanApplication)
class LoanApplicationAdmin(admin.ModelAdmin):
    list_display = ("sme", "amount", "currency", "purpose", "suggested", "submitted_at")
    list_filter = ("suggested", "currency")
    search_fields = ("sme__name", "purpose")
    date_hierarchy = "submitted_at"
    ordering = ("-submitted_at",)
