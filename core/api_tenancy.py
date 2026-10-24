"""Tenant-aware business resolution for API views."""
from rest_framework.request import Request

from accounts.models import Membership


def business_from_request(request) -> "object | None":
    """Resolve the business for an API request: X-Business-Id header → session.

    Returns the Business or None. Membership is enforced by callers via
    require_membership() — 404 for other tenants' data.
    """
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return None

    header_id = request.headers.get("X-Business-Id")
    if header_id:
        try:
            header_id = int(header_id)
        except (TypeError, ValueError):
            header_id = None
    if header_id is None:
        header_id = request.session.get("active_business_id")

    if header_id:
        try:
            membership = Membership.objects.select_related("business").get(
                user=user, business_id=header_id
            )
            request.session["active_business_id"] = header_id
            return membership.business
        except Membership.DoesNotExist:
            return None

    membership = (
        Membership.objects.select_related("business").filter(user=user).first()
    )
    if membership:
        request.session["active_business_id"] = membership.business_id
        return membership.business
    return None


def get_business_or_403(request):
    """Resolve business or raise DRF 404 (tenant isolation)."""
    from rest_framework.exceptions import NotFound

    business = business_from_request(request)
    if business is None:
        raise NotFound("No business in scope — send X-Business-Id or log in as a member.")
    return business
