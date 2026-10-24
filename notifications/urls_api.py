from django.urls import path

from . import api

urlpatterns = [
    path("notifications/", api.NotificationListView.as_view(), name="notifications"),
    path("notifications/unread-count/", api.UnreadCountView.as_view(), name="notifications-unread"),
    path("notifications/<int:pk>/read/", api.NotificationReadView.as_view(), name="notification-read"),
    path("notifications/settings/", api.SettingsView.as_view(), name="notification-settings"),
]
