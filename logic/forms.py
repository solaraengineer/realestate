from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

User = get_user_model()


class LoginForm(forms.Form):
    email = forms.EmailField()
    password = forms.CharField()


class RegisterForm(forms.Form):
    username = forms.CharField(max_length=150)
    email = forms.EmailField()
    password = forms.CharField()
    password2 = forms.CharField()
    accept_terms = forms.BooleanField()

    def clean_email(self):
        email = self.cleaned_data['email'].lower()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError('EMAIL_EXISTS')
        return email

    def clean_username(self):
        username = self.cleaned_data['username']
        if User.objects.filter(username__iexact=username).exists():
            raise forms.ValidationError('USERNAME_EXISTS')
        return username

    def clean(self):
        cd = super().clean()
        if cd.get('password') != cd.get('password2'):
            raise forms.ValidationError('PASSWORD_MISMATCH')
        if cd.get('password'):
            validate_password(cd['password'])
        return cd