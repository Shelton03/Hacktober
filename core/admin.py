from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "business", "actor", "action")
    list_filter = ("action", "business")
    search_fields = ("business__name", "actor__email", "action")
    readonly_fields = ("business", "actor", "action", "detail", "created_at")

    def has_add_permission(self, request):
        return False  # append-only

    def has_change_permission(self, request, obj=None):
        return False  # append-only

    def has_delete_permission(self, request, obj=None):
        return False  # append-only
