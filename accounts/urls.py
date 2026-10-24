from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("signup/", views.SignupView.as_view(), name="signup"),
    path("switch/<int:business_id>/", views.switch_business, name="switch"),
    path("team/", views.invite_user, name="team"),
]
