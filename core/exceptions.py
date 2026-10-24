"""DRF exception handler: tenancy-aware, JSON errors for the Angular UI."""
from rest_framework import exceptions as drf_exceptions
from rest_framework.views import exception_handler


def tenancy_aware_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None and isinstance(response.data, dict):
        # normalise every error body to {"detail": "..."} (+ optional fields)
        if "detail" not in response.data:
            response.data = {"detail": str(response.data)}
    return response
