/**
 * Unified Modal System
 * Replaces alert(), confirm(), and prompt() with beautiful modals
 * Also provides toast notifications and error modals
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR MESSAGE DEFINITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const ERROR_DEFINITIONS = {
    // Buyer Stripe Errors
    'BUYER_NOT_ONBOARDED': {
      title: 'Stripe Not Configured',
      message: 'You need to set up Stripe before you can make purchases.',
      details: 'Go to your Profile settings and click "Configure Stripe" to complete the setup process.',
      type: 'warning',
      action: { label: 'Go to Settings', id: 'goto-settings' }
    },
    'BUYER_CHARGES_DISABLED': {
      title: 'Stripe Verification Incomplete',
      message: 'Your Stripe account is not fully verified yet.',
      details: 'Please complete the Stripe verification process in your Profile settings.',
      type: 'warning',
      action: { label: 'Complete Verification', id: 'goto-settings' }
    },
    'BUYER_STRIPE_ERROR': {
      title: 'Payment System Error',
      message: 'There was a problem connecting to the payment system.',
      details: 'Please try again in a few moments. If the problem persists, contact support.',
      type: 'error'
    },

    // Seller Stripe Errors
    'SELLER_NOT_ONBOARDED': {
      title: 'Seller Payment Not Set Up',
      message: 'The seller has not configured their payment account.',
      details: 'This property cannot be purchased until the seller sets up Stripe.',
      type: 'info'
    },
    'SELLER_CHARGES_DISABLED': {
      title: 'Seller Account Not Verified',
      message: "The seller's Stripe account is not fully verified.",
      details: 'This property cannot be purchased until the seller completes verification.',
      type: 'info'
    },
    'SELLER_PAYOUTS_DISABLED': {
      title: 'Seller Cannot Receive Payments',
      message: 'The seller cannot receive payouts yet.',
      details: "The seller's account needs additional verification.",
      type: 'info'
    },
    'SELLER_STRIPE_ERROR': {
      title: 'Seller Payment Error',
      message: "There was a problem with the seller's payment account.",
      details: 'Please try again later or contact the seller directly.',
      type: 'error'
    },

    // Listing Errors
    'LISTING_NOT_FOUND': {
      title: 'Listing Not Found',
      message: 'This listing no longer exists.',
      details: 'The property may have been sold or the listing was removed.',
      type: 'error'
    },
    'LISTING_NOT_ACTIVE': {
      title: 'Listing No Longer Active',
      message: 'This listing is no longer available.',
      details: 'The property may have been sold or the listing was cancelled.',
      type: 'warning'
    },
    'NO_SHARES_LEFT': {
      title: 'No Shares Available',
      message: 'All shares for this listing have been sold.',
      details: 'Check if there are other listings available for this property.',
      type: 'info'
    },
    'CANNOT_BUY_OWN': {
      title: 'Cannot Buy Own Listing',
      message: "You can't purchase your own listing.",
      details: 'Use "End listing" to remove this listing instead.',
      type: 'warning'
    },
    'LISTING_ACTIVE': {
      title: 'Listing Is Active',
      message: 'Cannot modify an active listing.',
      details: 'End the listing first, then make your changes.',
      type: 'warning'
    },

    // Ownership Errors
    'NOT_OWNER': {
      title: 'Not an Owner',
      message: "You don't own shares in this property.",
      details: 'You need to own shares before you can list them for sale.',
      type: 'error'
    },
    'NO_OWNERSHIP': {
      title: 'No Ownership Found',
      message: 'You have no ownership record for this property.',
      details: 'Please contact support if you believe this is an error.',
      type: 'error'
    },
    'ALREADY_OCCUPIED': {
      title: 'Property Already Occupied',
      message: 'This property already has an owner.',
      details: 'You can only claim empty properties.',
      type: 'info'
    },

    // Validation Errors
    'INVALID_PRICE': {
      title: 'Invalid Price',
      message: 'Please enter a valid price.',
      details: 'The price must be a positive number.',
      type: 'warning'
    },
    'PRICE_REQUIRED': {
      title: 'Price Required',
      message: 'Please enter a price for your listing.',
      details: 'Enter the total price you want for the shares.',
      type: 'warning'
    },
    'INVALID_SHARE_COUNT': {
      title: 'Invalid Share Count',
      message: 'Please enter a valid number of shares.',
      details: 'The share count must be positive and within your ownership.',
      type: 'warning'
    },
    'SHARES_MUST_BE_POSITIVE': {
      title: 'Invalid Share Count',
      message: 'Share count must be greater than zero.',
      details: 'Enter at least 1 share to sell.',
      type: 'warning'
    },
    'EXCEEDS_OWNERSHIP': {
      title: 'Too Many Shares',
      message: 'You cannot sell more shares than you own.',
      details: 'Reduce the number of shares to match your ownership.',
      type: 'warning'
    },

    // Authentication Errors
    'AUTH_REQUIRED': {
      title: 'Login Required',
      message: 'You need to be logged in to do this.',
      details: 'Please log in to your account to continue.',
      type: 'warning',
      action: { label: 'Log In', id: 'goto-login' }
    },
    'NOT_AUTHENTICATED': {
      title: 'Session Expired',
      message: 'Your session has expired.',
      details: 'Please log in again to continue.',
      type: 'warning',
      action: { label: 'Log In', id: 'goto-login' }
    },

    // General Errors
    'INVALID_JSON': {
      title: 'Request Error',
      message: 'There was a problem with your request.',
      details: 'Please try again. If the problem persists, refresh the page.',
      type: 'error'
    },
    'CONNECTION_ERROR': {
      title: 'Connection Error',
      message: 'Could not connect to the server.',
      details: 'Please check your internet connection and try again.',
      type: 'error'
    },
    'UNKNOWN_ERROR': {
      title: 'Something Went Wrong',
      message: 'An unexpected error occurred.',
      details: 'Please try again. If the problem persists, contact support.',
      type: 'error'
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ICONS
  // ═══════════════════════════════════════════════════════════════════════════

  const ICONS = {
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>`,
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>`,
    question: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`,
    input: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="5" width="18" height="14" rx="2"/>
      <line x1="7" y1="12" x2="17" y2="12"/>
    </svg>`
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL STATE
  // ═══════════════════════════════════════════════════════════════════════════

  let modalElement = null;
  let currentResolve = null;
  let currentReject = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE MODAL DOM
  // ═══════════════════════════════════════════════════════════════════════════

  function ensureModal() {
    if (modalElement) return;

    const html = `
      <div class="modal-overlay" id="unifiedModal">
        <div class="modal-container">
          <div class="modal-header">
            <div class="modal-icon" id="modalIcon"></div>
            <h2 class="modal-title" id="modalTitle">Title</h2>
            <button class="modal-close" id="modalClose">&times;</button>
          </div>
          <div class="modal-body">
            <p class="modal-message" id="modalMessage"></p>
            <p class="modal-details" id="modalDetails"></p>
            <div class="modal-input-wrapper" id="modalInputWrapper" style="display:none;">
              <input type="text" class="modal-input" id="modalInput" placeholder="">
              <p class="modal-input-error" id="modalInputError"></p>
            </div>
          </div>
          <div class="modal-footer" id="modalFooter">
            <button class="modal-btn modal-btn-secondary" id="modalCancel">Cancel</button>
            <button class="modal-btn modal-btn-primary" id="modalConfirm">OK</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    modalElement = document.getElementById('unifiedModal');

    // Event listeners
    document.getElementById('modalClose').addEventListener('click', () => handleClose(false));
    document.getElementById('modalCancel').addEventListener('click', () => handleClose(false));
    document.getElementById('modalConfirm').addEventListener('click', handleConfirm);

    modalElement.addEventListener('click', (e) => {
      if (e.target === modalElement) handleClose(false);
    });

    document.addEventListener('keydown', handleKeydown);

    // Input enter key
    document.getElementById('modalInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    });
  }

  function handleKeydown(e) {
    if (!modalElement || !modalElement.classList.contains('visible')) return;
    if (e.key === 'Escape') {
      handleClose(false);
    }
  }

  function handleClose(result) {
    if (modalElement) {
      modalElement.classList.remove('visible');
      document.body.style.overflow = '';
    }
    if (currentResolve) {
      currentResolve(result);
      currentResolve = null;
      currentReject = null;
    }
  }

  function handleConfirm() {
    const inputWrapper = document.getElementById('modalInputWrapper');
    const input = document.getElementById('modalInput');
    const errorEl = document.getElementById('modalInputError');

    // If it's an input modal, return the value
    if (inputWrapper && inputWrapper.style.display !== 'none') {
      const value = input.value.trim();

      // Validate if needed
      if (input.dataset.required === 'true' && !value) {
        errorEl.textContent = 'This field is required';
        errorEl.style.display = 'block';
        input.focus();
        return;
      }

      if (input.dataset.type === 'number') {
        const num = parseFloat(value);
        if (isNaN(num)) {
          errorEl.textContent = 'Please enter a valid number';
          errorEl.style.display = 'block';
          input.focus();
          return;
        }
        const min = parseFloat(input.dataset.min);
        const max = parseFloat(input.dataset.max);
        if (!isNaN(min) && num < min) {
          errorEl.textContent = `Value must be at least ${min}`;
          errorEl.style.display = 'block';
          input.focus();
          return;
        }
        if (!isNaN(max) && num > max) {
          errorEl.textContent = `Value must be at most ${max}`;
          errorEl.style.display = 'block';
          input.focus();
          return;
        }
        handleClose(num);
        return;
      }

      handleClose(value || null);
      return;
    }

    // Regular confirm
    handleClose(true);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHOW MODAL
  // ═══════════════════════════════════════════════════════════════════════════

  function showModal(options) {
    ensureModal();

    const {
      type = 'info',
      title = 'Notice',
      message = '',
      details = '',
      confirmText = 'OK',
      cancelText = 'Cancel',
      showCancel = false,
      input = null,
      action = null
    } = options;

    // Set content
    document.getElementById('modalIcon').innerHTML = ICONS[type] || ICONS.info;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('modalDetails').textContent = details;
    document.getElementById('modalDetails').style.display = details ? 'block' : 'none';

    // Set type class
    const container = modalElement.querySelector('.modal-container');
    container.className = `modal-container modal-${type}`;

    // Handle input
    const inputWrapper = document.getElementById('modalInputWrapper');
    const inputEl = document.getElementById('modalInput');
    const errorEl = document.getElementById('modalInputError');

    if (input) {
      inputWrapper.style.display = 'block';
      inputEl.value = input.value || '';
      inputEl.placeholder = input.placeholder || '';
      inputEl.type = input.type === 'number' ? 'number' : 'text';
      inputEl.dataset.required = input.required ? 'true' : 'false';
      inputEl.dataset.type = input.type || 'text';
      inputEl.dataset.min = input.min ?? '';
      inputEl.dataset.max = input.max ?? '';
      errorEl.textContent = '';
      errorEl.style.display = 'none';
      setTimeout(() => inputEl.focus(), 100);
    } else {
      inputWrapper.style.display = 'none';
    }

    // Handle buttons
    const cancelBtn = document.getElementById('modalCancel');
    const confirmBtn = document.getElementById('modalConfirm');

    cancelBtn.style.display = showCancel ? 'block' : 'none';
    cancelBtn.textContent = cancelText;
    confirmBtn.textContent = confirmText;

    // Handle action button
    if (action && action.id) {
      confirmBtn.dataset.actionId = action.id;
      confirmBtn.textContent = action.label || confirmText;
    } else {
      delete confirmBtn.dataset.actionId;
    }

    // Show modal
    modalElement.classList.add('visible');
    document.body.style.overflow = 'hidden';

    return new Promise((resolve, reject) => {
      currentResolve = resolve;
      currentReject = reject;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Show an alert modal (replaces alert())
   */
  async function alert(message, title, type = 'info') {
    return showModal({
      type,
      title: title || (type === 'error' ? 'Error' : type === 'warning' ? 'Warning' : 'Notice'),
      message,
      confirmText: 'OK',
      showCancel: false
    });
  }

  /**
   * Show a confirm modal (replaces confirm())
   */
  async function confirm(message, title, options = {}) {
    const result = await showModal({
      type: options.type || 'question',
      title: title || 'Confirm',
      message,
      details: options.details || '',
      confirmText: options.confirmText || 'Yes',
      cancelText: options.cancelText || 'No',
      showCancel: true
    });
    return result === true;
  }

  /**
   * Show a prompt modal (replaces prompt())
   */
  async function prompt(message, defaultValue = '', options = {}) {
    const result = await showModal({
      type: 'input',
      title: options.title || 'Input Required',
      message,
      confirmText: options.confirmText || 'Submit',
      cancelText: options.cancelText || 'Cancel',
      showCancel: true,
      input: {
        value: defaultValue,
        placeholder: options.placeholder || '',
        type: options.inputType || 'text',
        required: options.required !== false,
        min: options.min,
        max: options.max
      }
    });
    return result;
  }

  /**
   * Show an error modal with predefined error codes
   */
  function showError(errorCode, customMessage) {
    const def = ERROR_DEFINITIONS[errorCode] || {
      title: 'Error',
      message: customMessage || errorCode || 'An unexpected error occurred.',
      details: 'Please try again. If the problem persists, contact support.',
      type: 'error'
    };

    if (!ERROR_DEFINITIONS[errorCode] && customMessage) {
      def.message = customMessage;
    }

    return showModal({
      type: def.type || 'error',
      title: def.title,
      message: def.message,
      details: def.details,
      confirmText: def.action?.label || 'OK',
      showCancel: false,
      action: def.action
    }).then(result => {
      // Handle special actions
      if (result && def.action?.id) {
        switch (def.action.id) {
          case 'goto-settings':
            const profileBtn = document.querySelector('[data-action="profile"]');
            if (profileBtn) profileBtn.click();
            break;
          case 'goto-login':
            if (typeof window.showAuthPanel === 'function') {
              window.showAuthPanel();
            }
            break;
        }
      }
      return result;
    });
  }

  /**
   * Show a success modal
   */
  function showSuccess(title, message, details) {
    return showModal({
      type: 'success',
      title: title || 'Success',
      message: message || 'Operation completed successfully.',
      details: details || '',
      confirmText: 'OK',
      showCancel: false
    });
  }

  /**
   * Get user-friendly message for error code
   */
  function getMessage(errorCode, fallback) {
    const def = ERROR_DEFINITIONS[errorCode];
    return def ? def.message : (fallback || errorCode || 'An error occurred');
  }

  /**
   * Close the modal
   */
  function close() {
    handleClose(false);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOAST NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  function toast(message, duration = 3000) {
    let toastEl = document.getElementById('toast');

    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'toast';
      document.body.appendChild(toastEl);
    }

    toastEl.textContent = message;
    toastEl.style.display = 'block';
    toastEl.classList.add('toast-visible');

    clearTimeout(toastEl._timeout);
    toastEl._timeout = setTimeout(() => {
      toastEl.classList.remove('toast-visible');
      setTimeout(() => {
        toastEl.style.display = 'none';
      }, 300);
    }, duration);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  window.Modal = {
    alert,
    confirm,
    prompt,
    showError,
    showSuccess,
    getMessage,
    close,
    toast
  };

  // Backwards compatibility
  window.ErrorModal = {
    show: showError,
    close,
    getMessage,
    showSuccess,
    definitions: ERROR_DEFINITIONS
  };

  // Also expose toast globally
  window.toast = toast;

  console.log('[Modal] Unified modal system loaded');

})();
