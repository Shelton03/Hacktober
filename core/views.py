from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render

from core.models import AuditLog


@login_required
def home(request):
    """Dashboard home. Modules land here in build steps 2-9."""
    business = getattr(request, "business", None)
    if business is None:
        return render(request, "core/no_business.html")
    recent_audit = AuditLog.objects.filter(business=business)[:10]
    return render(
        request,
        "core/home.html",
        {"recent_audit": recent_audit},
    )
