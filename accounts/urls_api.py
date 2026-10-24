"""Accounts API urls (JSON, under /api/auth/)."""
from django.urls import path

from . import api

urlpatterns = [
    path("login/", api.login_api, name="api-login"),
    path("logout/", api.logout_api, name="api-logout"),
    path("me/", api.MeView.as_view(), name="api-me"),
]
