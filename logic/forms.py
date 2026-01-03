
from django import forms
import re
from django.contrib.auth import get_user_model



class RegistrationForm(forms.Form):
    username = forms.CharField(max_length=30, required=True)
    email = forms.EmailField(required=True)
    password = forms.CharField(widget=forms.PasswordInput)

    def clean_password(self):
        password = self.cleaned_data.get("password")
        if len(password) < 6 or not re.search(r'[A-Z]', password):
            raise forms.ValidationError("Password must be at least 6 characters and contain an uppercase letter.")
        return password

class LoginForm(forms.Form):
    email = forms.EmailField(required=True)
    password = forms.CharField(widget=forms.PasswordInput)

User = get_user_model()

class UpdateForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ['username', 'email', 'password']

