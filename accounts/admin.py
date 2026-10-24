from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Business, Membership, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("email", "phone", "is_staff", "is_lender")
    search_fields = ("email", "phone", "first_name", "last_name")
    ordering = ("email",)
    fieldsets = BaseUserAdmin.fieldsets + (
        ("SME Business OS", {"fields": ("phone", "is_lender")}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ("SME Business OS", {"fields": ("email", "phone", "is_lender")}),
    )


@admin.register(Business)
class BusinessAdmin(admin.ModelAdmin):
    list_display = ("name", "sector", "city", "default_currency", "vat_registered", "fiscal_mode")
    list_filter = ("fiscal_mode", "vat_registered", "city")


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "business", "role", "created_at")
    list_filter = ("role",)
    search_fields = ("user__email", "business__name")
