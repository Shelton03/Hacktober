from django.urls import path

from . import api

urlpatterns = [
    path("advisor/insights/", api.InsightListView.as_view(), name="advisor-insights"),
    path("advisor/refresh/", api.InsightRefreshView.as_view(), name="advisor-refresh"),
    path("advisor/insights/<int:pk>/dismiss/", api.InsightDismissView.as_view(), name="insight-dismiss"),
    path("advisor/insights/<int:pk>/done/", api.InsightDoneView.as_view(), name="insight-done"),
    path("security/questions/", api.SecurityQuestionsView.as_view(), name="security-questions"),
    path("security/assessment/", api.SecurityAssessmentView.as_view(), name="security-assessment"),
    path("security/lessons/", api.SecurityLessonsView.as_view(), name="security-lessons"),
    path("security/coaching/", api.SecurityCoachingView.as_view(), name="security-coaching"),
    path("security/coach/", api.SecurityCoachView.as_view(), name="security-coach"),
    path("security/templates/<str:which>/", api.SecurityTemplateView.as_view(), name="security-template"),
    path("loan/health/", api.LoanHealthView.as_view(), name="loan-health"),
    path("loan/consent/", api.ConsentListView.as_view(), name="loan-consent"),
    path("loan/consent/<int:pk>/revoke/", api.ConsentRevokeView.as_view(), name="consent-revoke"),
]
