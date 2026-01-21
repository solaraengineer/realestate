/**
 * Auth module with JWT token management
 * - Stores JWT in localStorage
 * - Auto-attaches JWT to all API calls
 * - Handles token refresh
 */
const Auth = {
    // LocalStorage key for JWT token
    TOKEN_KEY: 'jwt_token',

    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return '';
    },

    // JWT Token management
    getToken() {
        return localStorage.getItem(this.TOKEN_KEY);
    },

    setToken(token) {
        if (token) {
            localStorage.setItem(this.TOKEN_KEY, token);
        } else {
            localStorage.removeItem(this.TOKEN_KEY);
        }
    },

    clearToken() {
        localStorage.removeItem(this.TOKEN_KEY);
    },

    // Check if token exists
    hasToken() {
        return !!this.getToken();
    },

    // Decode JWT payload (without verification - just for reading)
    decodeToken(token) {
        if (!token) return null;
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            const payload = JSON.parse(atob(parts[1]));
            return payload;
        } catch (e) {
            console.warn('[Auth] Failed to decode token:', e);
            return null;
        }
    },

    // Check if token is expired
    isTokenExpired(token) {
        const payload = this.decodeToken(token);
        if (!payload || !payload.exp) return true;
        // exp is in seconds, Date.now() is in milliseconds
        return (payload.exp * 1000) < Date.now();
    },

    // Get user info from token
    getUserFromToken() {
        const token = this.getToken();
        if (!token) return null;
        const payload = this.decodeToken(token);
        if (!payload) return null;
        return {
            id: payload.sub,
            username: payload.username,
            email: payload.email
        };
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
            // JWT errors
            TOKEN_EXPIRED: 'Session expired, please log in again',
            INVALID_TOKEN: 'Invalid session, please log in again',
            MISSING_AUTH_HEADER: 'Authentication required',
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

    // Build headers with JWT token
    getAuthHeaders(extraHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'X-CSRFToken': this.getCookie('csrftoken'),
            ...extraHeaders
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
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

        // Save JWT token
        if (data.token) {
            this.setToken(data.token);
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

        // Save JWT token
        if (data.token) {
            this.setToken(data.token);
        }

        return data;
    },

    async logout() {
        const r = await fetch('/api/auth/logout/', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            credentials: 'same-origin'
        });

        // Clear token on logout
        this.clearToken();

        return r.ok;
    },

    async whoami() {
        // First try JWT whoami if we have a token
        const token = this.getToken();
        if (token && !this.isTokenExpired(token)) {
            try {
                const r = await fetch('/api/jwt/whoami/', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    credentials: 'same-origin'
                });
                if (r.ok) {
                    const data = await r.json();
                    if (data.ok) return data;
                }
            } catch (e) {
                console.warn('[Auth] JWT whoami failed:', e);
            }
        }

        // Fallback to session whoami
        const r = await fetch('/api/auth/whoami/', {
            credentials: 'same-origin'
        });
        if (!r.ok) return null;
        return r.json();
    },

    async refreshToken() {
        const token = this.getToken();
        if (!token) return null;

        try {
            const r = await fetch('/api/jwt/refresh/', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'same-origin'
            });

            const data = await r.json();
            if (r.ok && data.ok && data.token) {
                this.setToken(data.token);
                return data.token;
            }
        } catch (e) {
            console.warn('[Auth] Token refresh failed:', e);
        }

        // Clear invalid token
        this.clearToken();
        return null;
    },

    async getProfile() {
        const r = await fetch('/api/profile/', {
            headers: this.getAuthHeaders(),
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
            headers: this.getAuthHeaders(),
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
            headers: this.getAuthHeaders(),
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

// ═══════════════════════════════════════════════════════════════════════════
// Global fetch wrapper that auto-attaches JWT token and handles refresh
// ═══════════════════════════════════════════════════════════════════════════

// Store original fetch
const originalFetch = window.fetch;

// Override fetch to auto-attach JWT and handle token refresh
window.fetch = async function(url, options = {}) {
    // Only modify API calls to our backend
    const isApiCall = typeof url === 'string' && (
        url.startsWith('/api/') ||
        url.startsWith('api/')
    );

    if (isApiCall) {
        options = options || {};
        options.headers = options.headers || {};

        // Convert Headers object to plain object if needed
        if (options.headers instanceof Headers) {
            const headersObj = {};
            options.headers.forEach((value, key) => {
                headersObj[key] = value;
            });
            options.headers = headersObj;
        }

        // Add Authorization header if token exists and not already present
        if (!options.headers['Authorization'] && !options.headers['authorization']) {
            const token = Auth.getToken();
            if (token) {
                options.headers['Authorization'] = `Bearer ${token}`;
            }
        }
    }

    // Make the request
    const response = await originalFetch.call(window, url, options);

    // Check for new token in response header (issued when old token expired but session valid)
    if (isApiCall) {
        const newToken = response.headers.get('X-New-Token');
        if (newToken) {
            console.log('[Auth] Received new token from server, saving...');
            Auth.setToken(newToken);
        }
    }

    return response;
};

// Export Auth globally
window.Auth = Auth;
