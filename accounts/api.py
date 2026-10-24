"""Auth API for the Angular frontend (session + CSRF)."""
import json

from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


def _business_payload(user):
    from accounts.models import Membership

    memberships = Membership.objects.filter(user=user).select_related("business")
    businesses = [
        {
            "id": m.business_id,
            "name": m.business.name,
            "role": m.role,
            "is_lender": m.role == Membership.Role.LENDER,
        }
        for m in memberships
    ]
    return businesses


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        businesses = _business_payload(user)
        active = getattr(request, "business", None)
        return Response(
            {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "phone": user.phone,
                "is_lender": user.is_lender,
                "business_id": active.id if active else (businesses[0]["id"] if businesses else None),
                "businesses": businesses,
            }
        )


@ensure_csrf_cookie
@require_POST
def login_api(request):
    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Invalid JSON body."}, status=400)
    email_or_phone = (data.get("email_or_phone") or "").strip()
    password = data.get("password") or ""
    if not email_or_phone or not password:
        return JsonResponse(
            {"detail": "Email/phone and password are required."}, status=400
        )
    user = authenticate(request, username=email_or_phone, password=password)
    if user is None:
        return JsonResponse(
            {"detail": "Invalid credentials. Check your email/phone and password."}, status=403
        )
    login(request, user)
    businesses = _business_payload(user)
    business_id = businesses[0]["id"] if businesses else None
    request.session["active_business_id"] = business_id
    return JsonResponse(
        {
            "user": {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "is_lender": user.is_lender,
            },
            "businesses": businesses,
            "business_id": business_id,
        }
    )


@require_POST
def logout_api(request):
    logout(request)
    return JsonResponse({"ok": True})
