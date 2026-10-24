from django.contrib.auth import views as auth_views
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from django.views.generic import CreateView

from .forms import LoginForm, SignupForm
from .models import Business, Membership, User


def login_view(request):
    return auth_views.LoginView.as_view(
        template_name="accounts/login.html",
        authentication_form=LoginForm,
        redirect_authenticated_user=True,
    )(request)


def logout_view(request):
    return auth_views.LogoutView.as_view()(request)


class SignupView(CreateView):
    form_class = SignupForm
    template_name = "accounts/signup.html"

    def form_valid(self, form):
        user = form.save()
        business = Business.objects.create(
            name=form.cleaned_data["business_name"],
            city=form.cleaned_data.get("business_city", ""),
        )
        Membership.objects.create(user=user, business=business, role=Membership.Role.OWNER)
        from django.contrib.auth import login

        login(self.request, user)
        return redirect("core:home")


@login_required
def switch_business(request, business_id):
    """Switch the active business (validated against membership)."""
    from core.tenancy import business_or_404

    business_or_404(request.user, business_id)  # 404 unless a member
    request.session["active_business_id"] = business_id
    return redirect("core:home")


@login_required
def invite_user(request):
    """Owner invites a user to the active business by email."""
    business = getattr(request, "business", None)
    message = None
    error = None
    if request.method == "POST" and business:
        email = (request.POST.get("email") or "").strip().lower()
        role = request.POST.get("role", Membership.Role.STAFF)
        if role not in Membership.Role.values:
            role = Membership.Role.STAFF
        if not email:
            error = "Email is required."
        else:
            user, created = User.objects.get_or_create(email=email, defaults={"username": email})
            if not Membership.objects.filter(user=user, business=business).exists():
                Membership.objects.create(user=user, business=business, role=role)
                message = f"Added {email} as {dict(Membership.Role.choices).get(role, role)}."
            else:
                error = f"{email} is already a member."
    members = Membership.objects.filter(business=business).select_related("user") if business else []
    return render(
        request,
        "accounts/invite.html",
        {"members": members, "message": message, "error": error},
    )
