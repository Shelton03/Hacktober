"""Lender DEMO API urls — mounted at /api/ (see config/urls.py).

Endpoints (API_CONTRACT.md):
  lender/portfolio/  lender/smes/<id>/  lender/alerts/  lender/applications/
Read-only — GET only, no POST/PUT/DELETE routes exist.
"""
from django.urls import path

from . import api

urlpatterns = [
    path("lender/portfolio/", api.PortfolioView.as_view(), name="api-lender-portfolio"),
    path("lender/smes/<int:sme_id>/", api.SmeDetailView.as_view(), name="api-lender-sme"),
    path("lender/alerts/", api.AlertsView.as_view(), name="api-lender-alerts"),
    path("lender/applications/", api.ApplicationsView.as_view(), name="api-lender-applications"),
]
