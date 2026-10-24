"""CSRF bootstrap for the SPA: GET this once to receive the csrftoken cookie."""
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def csrf(request):
    return JsonResponse({"detail": "CSRF cookie set"})
