const Auth = {
    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return '';
    },

    getErrorMessage(code, details = null) {
        const errorMap = {
            // Auth errors
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
            WEAK_PASSWORD: details && details.length ? details.join(', ') : 'Password too weak',
            WRONG_PASSWORD: 'Current password is incorrect',
            CURRENT_PASSWORD_REQUIRED: 'Enter your current password',
            // Profile errors
            USERNAME_TOO_LONG: 'Username too long (max 150 chars)',
            EMAIL_TOO_LONG: 'Email too long (max 150 chars)',
            FIRST_NAME_TOO_LONG: 'First name too long (max 30 chars)',
            LAST_NAME_TOO_LONG: 'Last name too long (max 30 chars)',
            COMPANY_NAME_TOO_LONG: 'Company name too long (max 50 chars)',
            ADDRESS_TOO_LONG: 'Address too long (max 100 chars)',
            CITY_TOO_LONG: 'City too long (max 20 chars)',
            POSTAL_CODE_TOO_LONG: 'Postal code too long (max 10 chars)',
            COUNTRY_TOO_LONG: 'Country too long (max 20 chars)',
            VAT_NUMBER_TOO_LONG: 'VAT number too long (max 11 chars)',
            // Chat/Friends errors
            NOT_AUTHENTICATED: 'Please log in first',
            USER_NOT_FOUND: 'User not found',
            BLOCKED: 'You are blocked by this user',
            CANNOT_ADD_SELF: 'Cannot add yourself as friend',
            ALREADY_FRIENDS: 'Already friends with this user',
            REQUEST_PENDING: 'Friend request already pending',
            CANNOT_BLOCK_SELF: 'Cannot block yourself',
            // House errors
            NOT_OWNER: 'You do not own this property',
            ALREADY_OCCUPIED: 'Property is already owned',
            LISTING_NOT_FOUND: 'Listing not found',
            INVALID_PRICE: 'Invalid price',
            PRICE_REQUIRED: 'Price is required',
            INVALID_SHARE_COUNT: 'Invalid share count',
        };
        return errorMap[code] || code || 'An error occurred';
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
            const errMsg = this.getErrorMessage(data.error, data.messages);
            const err = new Error(errMsg);
            err.code = data.error;
            err.messages = data.messages;
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
            const errMsg = this.getErrorMessage(data.error, data.messages);
            const err = new Error(errMsg);
            err.code = data.error;
            err.messages = data.messages;
            throw err;
        }
        return data;
    }
};

// Make getCookie globally available for other modules
window.getCookie = Auth.getCookie.bind(Auth);
