const Auth = {
    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return '';
    },

    getErrorMessage(code) {
        const messages = {
            INVALID_JSON: 'Invalid request',
            MISSING_CREDENTIALS: 'Enter email and password',
            INVALID_CREDENTIALS: 'Wrong email or password',
            INACTIVE: 'Account is inactive',
            MISSING_USERNAME: 'Enter username',
            MISSING_FIELDS: 'Fill in all fields',
            PASSWORD_MISMATCH: 'Passwords do not match',
            TERMS_REQUIRED: 'Accept the terms',
            EMAIL_EXISTS: 'Email already registered',
            USERNAME_EXISTS: 'Username already taken',
            WEAK_PASSWORD: 'Password too weak'
        };
        return messages[code] || code;
    },

    async login(email, password) {
        const r = await fetch('/api/auth/login/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': this.getCookie('csrftoken')
            },
            credentials: 'same-origin',
            body: JSON.stringify({ email, password })
        });

        const data = await r.json();
        if (!r.ok || !data.ok) {
            const err = new Error(data.error || 'Login failed');
            err.code = data.error;
            throw err;
        }
        return data;
    },

    async register({ username, email, password, password2, acceptTerms }) {
        const r = await fetch('/api/auth/register/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': this.getCookie('csrftoken')
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                username,
                email,
                password,
                password2,
                accept_terms: acceptTerms
            })
        });

        const data = await r.json();
        if (!r.ok || !data.ok) {
            const err = new Error(data.error || 'Registration failed');
            err.code = data.error;
            throw err;
        }
        return data;
    },

    async logout() {
        const r = await fetch('/api/auth/logout/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': this.getCookie('csrftoken')
            },
            credentials: 'same-origin'
        });
        return r.ok;
    },

    async whoami() {
        const r = await fetch('/api/auth/whoami/', {
            credentials: 'same-origin'
        });
        if (!r.ok) return null;
        return r.json();
    },

    async getProfile() {
        const r = await fetch('/api/profile/', {
            credentials: 'same-origin'
        });
        const data = await r.json();
        if (!r.ok || !data.ok) {
            const err = new Error(data.error || 'Failed to load profile');
            err.code = data.error;
            throw err;
        }
        return data;
    },

    async updateProfile({ firstName, lastName, companyName, address, city, postalCode, country, vatNumber, twoFactorEnabled }) {
        const r = await fetch('/api/profile/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': this.getCookie('csrftoken')
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                first_name: firstName,
                last_name: lastName,
                company_name: companyName,
                address: address,
                city: city,
                postal_code: postalCode,
                country: country,
                vat_number: vatNumber,
                two_factor_enabled: twoFactorEnabled
            })
        });

        const data = await r.json();
        if (!r.ok || !data.ok) {
            const err = new Error(data.error || 'Failed to update profile');
            err.code = data.error;
            throw err;
        }
        return data;
    },

    async changePassword(currentPassword, newPassword) {
        const r = await fetch('/api/profile/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': this.getCookie('csrftoken')
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });

        const data = await r.json();
        if (!r.ok || !data.ok) {
            const err = new Error(data.error || 'Failed to change password');
            err.code = data.error;
            throw err;
        }
        return data;
    }
};