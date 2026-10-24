from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    # JSON API for the Angular frontend (and future WhatsApp/USSD/SMS channels)
    path("api/auth/", include("accounts.urls_api")),
    # template flows (login/signup pages still exist as a fallback)
    path("accounts/", include("accounts.urls")),
    path("", include("core.urls")),
]
