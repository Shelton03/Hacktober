from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import AuthenticationForm

User = get_user_model()


class LoginForm(AuthenticationForm):
    """Log in with email OR phone in one field."""

    username = forms.CharField(
        label="Email or phone",
        widget=forms.TextInput(
            attrs={"autofocus": True, "placeholder": "you@example.com or +263771234567"}
        ),
    )


class SignupForm(forms.ModelForm):
    """Register a new business owner: user + first business in one form."""

    business_name = forms.CharField(max_length=120, label="Business name")
    business_city = forms.CharField(max_length=60, required=False, label="City")
    password1 = forms.CharField(
        label="Password", strip=False, widget=forms.PasswordInput
    )
    password2 = forms.CharField(
        label="Confirm password", widget=forms.PasswordInput, strip=False
    )

    class Meta:
        model = User
        fields = ("email", "phone", "first_name", "last_name")

    def clean(self):
        cleaned = super().clean()
        p1, p2 = cleaned.get("password1"), cleaned.get("password2")
        if p1 and p2 and p1 != p2:
            raise forms.ValidationError("Passwords do not match.")
        if p1:
            from django.contrib.auth.password_validation import validate_password

            validate_password(p1)
        return cleaned

    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data["password1"])
        if commit:
            user.save()
        return user
