from django.urls import path

from . import api

urlpatterns = [
    path("leads/", api.LeadListView.as_view(), name="leads"),
    path("leads/kanban/", api.KanbanView.as_view(), name="leads-kanban"),
    path("leads/reports/", api.LeadReportsView.as_view(), name="leads-reports"),
    path("leads/<int:pk>/", api.LeadDetailView.as_view(), name="lead-detail"),
    path("leads/<int:pk>/activities/", api.LeadActivityView.as_view(), name="lead-activity"),
    path("leads/<int:pk>/convert/", api.LeadConvertView.as_view(), name="lead-convert"),
]
