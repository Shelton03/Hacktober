"""Template context: active business + membership everywhere."""
from core.tenancy import get_user_businesses


def active_business(request):
    if not request.user.is_authenticated:
        return {"request_business": None, "user_businesses": []}
    return {
        "request_business": getattr(request, "business", None),
        "user_businesses": [
            m.business for m in get_user_businesses(request.user)
        ],
    }
