"""Tenancy helpers: resolve the active business and enforce isolation."""
from django.shortcuts import get_object_or_404

from accounts.models import Membership


def get_user_businesses(user):
    """Businesses the user belongs to."""
    if not user.is_authenticated:
        return Membership.objects.none()
    return Membership.objects.filter(user=user).select_related("business")


def get_active_business(request):
    """The business currently in scope for this request, or None.

    Order: ?business=<id> switcher (validated against membership) →
    session key → the user's first membership.
    """
    if not request.user.is_authenticated:
        return None

    memberships = list(get_user_businesses(request.user))
    if not memberships:
        return None

    requested = request.GET.get("business") or request.session.get("active_business_id")
    for membership in memberships:
        if str(membership.business_id) == str(requested):
            request.session["active_business_id"] = membership.business_id
            return membership.business

    # fall back to the first membership and remember it
    first = memberships[0]
    request.session["active_business_id"] = first.business_id
    return first.business


def require_membership(user, business, roles=None):
    """Raise 404 unless `user` is a member of `business` (optionally in `roles`).

    Returning 404 (not 403) for other tenants' objects means no cross-tenant
    information leak through guessable IDs.
    """
    qs = Membership.objects.filter(user=user, business=business)
    if roles:
        qs = qs.filter(role__in=roles)
    if not qs.exists():
        # import here to avoid circularity at module import time
        from django.http import Http404

        raise Http404("No such business.")
    return True


def business_or_404(user, business_id):
    """Load a business only if the user is a member (tenant isolation)."""
    membership = get_object_or_404(
        Membership.objects.select_related("business"),
        user=user,
        business_id=business_id,
    )
    return membership.business
