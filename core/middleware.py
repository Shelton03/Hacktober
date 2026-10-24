"""Resolve the active business for every request after login."""
from django.utils.deprecation import MiddlewareMixin

from core.tenancy import get_active_business


class ActiveBusinessMiddleware(MiddlewareMixin):
    def process_view(self, request, view_func, view_args, view_kwargs):
        # views and templates read request.business; None when logged out
        request.business = get_active_business(request)
        return None
