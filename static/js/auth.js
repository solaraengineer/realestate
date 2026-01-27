const Auth = {
    TOKEN_KEY: 'jwt_token',

    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return '';
    },

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

    hasToken() {
        return !!this.getToken();
    },

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

    isTokenExpired(token) {
        const payload = this.decodeToken(token);
        if (!payload || !payload.exp) return true;
        return (payload.exp * 1000) < Date.now();
    },

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
            TOKEN_EXPIRED: 'Session expired, please log in again',
            INVALID_TOKEN: 'Invalid session, please log in again',
            MISSING_AUTH_HEADER: 'Authentication required',
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
            NOT_AUTHENTICATED: 'Please log in first',
            USER_NOT_FOUND: 'User not found',
            BLOCKED: 'You are blocked by this user',
            CANNOT_ADD_SELF: 'Cannot add yourself as friend',
            ALREADY_FRIENDS: 'Already friends with this user',
            REQUEST_PENDING: 'Friend request already pending',
            CANNOT_BLOCK_SELF: 'Cannot block yourself',
            NOT_OWNER: 'You do not own this property',
            ALREADY_OCCUPIED: 'Property is already owned',
            LISTING_NOT_FOUND: 'Listing not found',
            INVALID_PRICE: 'Invalid price',
            PRICE_REQUIRED: 'Price is required',
            INVALID_SHARE_COUNT: 'Invalid share count',
        };
        return errorMap[code] || code || 'An error occurred';
    },

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

        this.clearToken();

        return r.ok;
    },

    async whoami() {
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

window.getCookie = Auth.getCookie.bind(Auth);

const originalFetch = window.fetch;

/**
 * Enhanced fetch wrapper with JWT auto-refresh and retry logic.
 * - Automatically adds JWT token to API requests
 * - Handles token expiration with automatic refresh
 * - Retries failed requests with new token
 */
window.fetch = async function(url, options = {}) {
    const isApiCall = typeof url === 'string' && (
        url.startsWith('/api/') ||
        url.startsWith('api/')
    );

    if (isApiCall) {
        options = options || {};
        options.headers = options.headers || {};

        if (options.headers instanceof Headers) {
            const headersObj = {};
            options.headers.forEach((value, key) => {
                headersObj[key] = value;
            });
            options.headers = headersObj;
        }

        if (!options.headers['Authorization'] && !options.headers['authorization']) {
            const token = Auth.getToken();
            if (token) {
                options.headers['Authorization'] = `Bearer ${token}`;
            }
        }

        // Add CSRF token for non-GET requests
        if (options.method && options.method.toUpperCase() !== 'GET') {
            if (!options.headers['X-CSRFToken']) {
                options.headers['X-CSRFToken'] = Auth.getCookie('csrftoken');
            }
        }
    }

    let response = await originalFetch.call(window, url, options);

    if (isApiCall) {
        // Check for new token in response header
        const newToken = response.headers.get('X-New-Token');
        if (newToken) {
            console.log('[Auth] Received new token from server, saving...');
            Auth.setToken(newToken);
        }

        // Handle 401 errors with automatic retry
        if (response.status === 401 && !options._retried) {
            try {
                const data = await response.clone().json();

                // If server issued a new token, save it and retry
                if (data.new_token) {
                    console.log('[Auth] Token expired/missing, received new token. Retrying request...');
                    Auth.setToken(data.new_token);

                    // Update authorization header with new token
                    options.headers = options.headers || {};
                    options.headers['Authorization'] = `Bearer ${data.new_token}`;
                    options._retried = true;

                    // Retry the original request
                    response = await originalFetch.call(window, url, options);
                    return response;
                }

                // If token is expired without new token, try to refresh
                if (data.error === 'TOKEN_EXPIRED' || data.error === 'TOKEN_REQUIRED') {
                    console.log('[Auth] Attempting token refresh...');
                    const refreshed = await Auth.refreshToken();

                    if (refreshed) {
                        // Update authorization header with refreshed token
                        options.headers = options.headers || {};
                        options.headers['Authorization'] = `Bearer ${refreshed}`;
                        options._retried = true;

                        // Retry the original request
                        response = await originalFetch.call(window, url, options);
                        return response;
                    }
                }

                // Auth completely failed
                if (data.error === 'AUTH_REQUIRED' || data.error === 'INVALID_TOKEN') {
                    console.warn('[Auth] Authentication required. Please log in.');
                    Auth.clearToken();
                    // Dispatch custom event for UI to handle
                    window.dispatchEvent(new CustomEvent('auth:required', { detail: { error: data.error } }));
                }
            } catch (e) {
                console.warn('[Auth] Error parsing 401 response:', e);
            }
        }
    }

    return response;
};

/**
 * Make an authenticated API request with automatic retry.
 * Use this for important operations that should retry on auth failure.
 */
Auth.fetchWithRetry = async function(url, options = {}, maxRetries = 2) {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, { ...options, _retried: attempt > 0 });

            if (response.ok) {
                return response;
            }

            // If still 401 after retries, throw
            if (response.status === 401 && attempt === maxRetries) {
                const data = await response.json();
                throw new Error(data.error || 'Authentication failed');
            }

            // Other errors, don't retry
            if (response.status !== 401) {
                return response;
            }
        } catch (e) {
            lastError = e;
            if (attempt === maxRetries) {
                throw e;
            }
        }
    }

    throw lastError || new Error('Request failed after retries');
};

/**
 * Check if user is authenticated (has valid session or token).
 * Tries JWT first, falls back to session.
 */
Auth.isAuthenticated = async function() {
    try {
        const data = await Auth.whoami();
        return data && data.ok && data.user;
    } catch (e) {
        return false;
    }
};

/**
 * Ensure we have a valid token, refreshing if needed.
 * Returns the token or null if not authenticated.
 */
Auth.ensureToken = async function() {
    let token = this.getToken();

    if (token && !this.isTokenExpired(token)) {
        return token;
    }

    // Token missing or expired, try to refresh
    if (token) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
            return refreshed;
        }
    }

    // No token - check if we have a session and can get a new token
    try {
        const r = await originalFetch('/api/jwt/refresh/', {
            method: 'POST',
            credentials: 'same-origin'
        });

        if (r.ok) {
            const data = await r.json();
            if (data.ok && data.token) {
                this.setToken(data.token);
                return data.token;
            }
        }
    } catch (e) {
        console.warn('[Auth] Failed to get token from session:', e);
    }

    return null;
};

window.Auth = Auth;
