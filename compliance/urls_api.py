"""Compliance API urls — mounted at /api/ (see config/urls.py).

Endpoints (API_CONTRACT.md):
  tax/config/  tax/vat-summary/  tax/qpd/
  compliance/  compliance/refresh/  compliance/<id>/dismiss/  compliance/export/
"""
from django.urls import path

from . import api

urlpatterns = [
    # tax
    path("tax/config/", api.TaxConfigView.as_view(), name="api-tax-config"),
    path("tax/vat-summary/", api.VatSummaryView.as_view(), name="api-tax-vat-summary"),
    path("tax/qpd/", api.QpdView.as_view(), name="api-tax-qpd"),
    # compliance dashboard
    path("compliance/", api.ComplianceDashboardView.as_view(), name="api-compliance"),
    path("compliance/refresh/", api.ComplianceRefreshView.as_view(), name="api-compliance-refresh"),
    path("compliance/export/", api.ComplianceExportView.as_view(), name="api-compliance-export"),
    # note: export/ must come BEFORE the <int:issue_id> pattern
    path("compliance/<int:issue_id>/dismiss/", api.ComplianceDismissView.as_view(), name="api-compliance-dismiss"),
]
