"""Authenticate with either an email address or a phone number."""
from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.db.models import Q

User = get_user_model()


class EmailOrPhoneBackend(ModelBackend):
    """
    The single login form accepts "email or phone" in one field.
    If it contains an "@", treat it as email; otherwise treat it as phone
    (digits and a leading + are kept, anything else is rejected).
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password:
            return None
        username = username.strip()
        if "@" in username:
            lookup = Q(email__iexact=username)
        else:
            compact = "".join(ch for ch in username if ch.isdigit() or ch == "+")
            if not compact:
                return None
            lookup = Q(phone=compact)
        try:
            user = User.objects.get(lookup)
        except (User.DoesNotExist, User.MultipleObjectsReturned):
            User().set_password(password)  # timing defence
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
