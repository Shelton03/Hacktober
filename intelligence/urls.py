from django.urls import include, path

from . import views

app_name = "intelligence"

urlpatterns = [
    path("", include("intelligence.urls_api")),
]
