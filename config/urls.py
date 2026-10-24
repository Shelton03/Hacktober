from django.contrib import admin
from django.conf import settings
from django.urls import include, path
from importlib import import_module


def _api_patterns():
    """Include every app's urls_api.py that exists (API_CONTRACT.md paths).

    Tolerant: an app mid-build simply doesn't expose endpoints yet.
    """
    patterns = []
    # accounts auth API lives at /api/auth/… (flat, not /api/api/auth/)
    patterns += [
        path("auth/", include("accounts.urls_api")),
    ]
    for app in ("sales", "inventory", "expenses", "compliance",
                "leads", "advisor", "notifications", "lender"):
        try:
            module = import_module(f"{app}.urls_api")
        except ModuleNotFoundError:
            continue
        patterns.append(path("", include((module.urlpatterns, app))))
    return patterns


urlpatterns = [
    path("admin/", admin.site.urls),
    # JSON API for the Angular frontend (and future WhatsApp/USSD/SMS channels)
    path("api/", include(_api_patterns())),
    # template flows (login/signup pages still exist as a fallback)
    path("accounts/", include("accounts.urls")),
    path("", include("core.urls")),
]

if settings.DEBUG:
    from django.conf.urls.static import static

    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
