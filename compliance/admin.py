"""Admin for the compliance app: TaxConfig editing is the whole point."""
from django.contrib import admin

from .models import ComplianceIssue, TaxConfig, TaxEstimate
from .seed_values import seed_tax_config


@admin.register(TaxConfig)
class TaxConfigAdmin(admin.ModelAdmin):
    list_display = ("category", "key", "value", "data_type", "last_verified",
                    "is_active", "updated_at")
    list_filter = ("category", "data_type", "is_active")
    search_fields = ("key", "description")
    list_editable = ("value", "is_active")
    ordering = ("category", "key")
    actions = ("reseed_defaults",)

    @admin.action(description="Re-seed default values (keeps custom rows)")
    def reseed_defaults(self, request, queryset):
        seed_tax_config()
        self.message_user(request, "Default tax config values re-seeded.")

    def changelist_view(self, request, extra_context=None):
        # make sure the seeded rows exist the first time an admin opens the list
        if not TaxConfig.objects.exists():
            seed_tax_config()
        return super().changelist_view(request, extra_context)


@admin.register(ComplianceIssue)
class ComplianceIssueAdmin(admin.ModelAdmin):
    list_display = ("code", "severity", "status", "business", "created_at")
    list_filter = ("severity", "status", "code")
    search_fields = ("title", "code", "business__name")
    readonly_fields = ("created_at",)


@admin.register(TaxEstimate)
class TaxEstimateAdmin(admin.ModelAdmin):
    list_display = ("business", "kind", "period", "estimated_amount", "due_date",
                    "computed_at")
    list_filter = ("kind", "period")
    search_fields = ("business__name", "period")
