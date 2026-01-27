(function() {
  'use strict';

  const ERROR_DEFINITIONS = {
    'BUYER_NOT_ONBOARDED': {
      title: 'Stripe Not Configured',
      message: 'You need to set up Stripe before you can make purchases.',
      details: 'Go to your Profile settings and click "Configure Stripe" to complete the setup process.',
      type: 'warning',
      action: {
        label: 'Go to Settings',
        handler: () => {
          window.ErrorModal.close();
          const profileBtn = document.querySelector('[data-action="profile"]');
          if (profileBtn) profileBtn.click();
        }
      }
    },
    'BUYER_CHARGES_DISABLED': {
      title: 'Stripe Verification Incomplete',
      message: 'Your Stripe account is not fully verified yet.',
      details: 'Please complete the Stripe verification process in your Profile settings to enable payments.',
      type: 'warning',
      action: {
        label: 'Complete Verification',
        handler: () => {
          window.ErrorModal.close();
          const profileBtn = document.querySelector('[data-action="profile"]');
          if (profileBtn) profileBtn.click();
        }
      }
    },
    'BUYER_STRIPE_ERROR': {
      title: 'Payment System Error',
      message: 'There was a problem connecting to the payment system.',
      details: 'Please try again in a few moments. If the problem persists, contact support.',
      type: 'error'
    },
    'SELLER_NOT_ONBOARDED': {
      title: 'Seller Payment Not Set Up',
      message: 'The seller has not configured their payment account.',
      details: 'This property cannot be purchased until the seller sets up Stripe. You can send them a message to let them know.',
      type: 'info'
    },
    'SELLER_CHARGES_DISABLED': {
      title: 'Seller Account Not Verified',
      message: "The seller's Stripe account is not fully verified.",
      details: 'This property cannot be purchased until the seller completes their Stripe verification.',
      type: 'info'
    },
    'SELLER_PAYOUTS_DISABLED': {
      title: 'Seller Cannot Receive Payments',
      message: 'The seller cannot receive payouts yet.',
      details: "The seller's Stripe account needs additional verification before they can receive payments.",
      type: 'info'
    },
    'SELLER_STRIPE_ERROR': {
      title: 'Seller Payment Error',
      message: "There was a problem with the seller's payment account.",
      details: 'Please try again later or contact the seller directly.',
      type: 'error'
    },
    'LISTING_NOT_FOUND': {
      title: 'Listing Not Found',
      message: 'This listing no longer exists.',
      details: 'The property may have been sold or the listing was removed by the owner.',
      type: 'error'
    },
    'LISTING_NOT_ACTIVE': {
      title: 'Listing No Longer Active',
      message: 'This listing is no longer available.',
      details: 'The property may have already been sold or the listing was cancelled.',
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
      details: 'If you want to remove this listing, use the "End listing" option instead.',
      type: 'warning'
    },
    'LISTING_ACTIVE': {
      title: 'Listing Is Active',
      message: 'Cannot modify an active listing.',
      details: 'To change the share count, first end the listing, make your changes, then create a new listing.',
      type: 'warning'
    },
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
    'INVALID_PRICE': {
      title: 'Invalid Price',
      message: 'Please enter a valid price.',
      details: 'The price must be a positive number.',
      type: 'warning'
    },
    'PRICE_REQUIRED': {
      title: 'Price Required',
      message: 'Please enter a price for your listing.',
      details: 'Enter the total price you want for the shares you are selling.',
      type: 'warning'
    },
    'INVALID_SHARE_COUNT': {
      title: 'Invalid Share Count',
      message: 'Please enter a valid number of shares.',
      details: 'The share count must be a positive number and cannot exceed your ownership.',
      type: 'warning'
    },
    'INVALID_SHARES': {
      title: 'Invalid Shares',
      message: 'Please enter a valid number of shares.',
      details: 'The number of shares must be a positive whole number.',
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
    'AUTH_REQUIRED': {
      title: 'Login Required',
      message: 'You need to be logged in to do this.',
      details: 'Please log in to your account to continue.',
      type: 'warning',
      action: {
        label: 'Log In',
        handler: () => {
          window.ErrorModal.close();
          if (typeof window.showAuthPanel === 'function') {
            window.showAuthPanel();
          }
        }
      }
    },
    'NOT_AUTHENTICATED': {
      title: 'Session Expired',
      message: 'Your session has expired.',
      details: 'Please log in again to continue.',
      type: 'warning',
      action: {
        label: 'Log In',
        handler: () => {
          window.ErrorModal.close();
          if (typeof window.showAuthPanel === 'function') {
            window.showAuthPanel();
          }
        }
      }
    },
    'INVALID_JSON': {
      title: 'Request Error',
      message: 'There was a problem with your request.',
      details: 'Please try again. If the problem persists, refresh the page.',
      type: 'error'
    },
    'METHOD_NOT_ALLOWED': {
      title: 'Action Not Allowed',
      message: 'This action is not permitted.',
      details: 'Please try a different approach or contact support.',
      type: 'error'
    },
    'MISSING_LISTING_ID': {
      title: 'Missing Information',
      message: 'No listing was specified.',
      details: 'Please select a listing and try again.',
      type: 'error'
    },
    'HOUSE_NOT_FOUND': {
      title: 'Property Not Found',
      message: 'This property could not be found.',
      details: 'The property may have been removed from the system.',
      type: 'error'
    }
  };

  function createModal() {
    if (document.getElementById('errorModal')) return;

    const modalHTML = `
      <div id="errorModal" class="error-modal-overlay">
        <div class="error-modal">
          <div class="error-modal-header">
            <div class="error-modal-icon" id="errorModalIcon"></div>
            <h2 class="error-modal-title" id="errorModalTitle">Error</h2>
            <button class="error-modal-close" id="errorModalClose">&times;</button>
          </div>
          <div class="error-modal-body">
            <p class="error-modal-message" id="errorModalMessage"></p>
            <p class="error-modal-details" id="errorModalDetails"></p>
          </div>
          <div class="error-modal-footer">
            <button class="error-modal-btn error-modal-btn-secondary" id="errorModalDismiss">Dismiss</button>
            <button class="error-modal-btn error-modal-btn-primary" id="errorModalAction" style="display:none;"></button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('errorModalClose').addEventListener('click', close);
    document.getElementById('errorModalDismiss').addEventListener('click', close);
    document.getElementById('errorModal').addEventListener('click', (e) => {
      if (e.target.id === 'errorModal') close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('errorModal').classList.contains('visible')) {
        close();
      }
    });
  }

  function getIcon(type) {
    switch (type) {
      case 'error':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`;
      case 'warning':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>`;
      case 'info':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>`;
      default:
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>`;
    }
  }

  function show(errorCode, customMessage) {
    createModal();

    const modal = document.getElementById('errorModal');
    const iconEl = document.getElementById('errorModalIcon');
    const titleEl = document.getElementById('errorModalTitle');
    const messageEl = document.getElementById('errorModalMessage');
    const detailsEl = document.getElementById('errorModalDetails');
    const actionBtn = document.getElementById('errorModalAction');

    const def = ERROR_DEFINITIONS[errorCode] || {
      title: 'Error',
      message: customMessage || errorCode || 'An unexpected error occurred.',
      details: 'Please try again. If the problem persists, contact support.',
      type: 'error'
    };

    if (!ERROR_DEFINITIONS[errorCode] && customMessage) {
      def.message = customMessage;
    }

    modal.querySelector('.error-modal').className = `error-modal error-modal-${def.type || 'error'}`;

    iconEl.innerHTML = getIcon(def.type);
    titleEl.textContent = def.title;
    messageEl.textContent = def.message;
    detailsEl.textContent = def.details;

    if (def.action) {
      actionBtn.textContent = def.action.label;
      actionBtn.style.display = 'block';
      actionBtn.onclick = def.action.handler;
    } else {
      actionBtn.style.display = 'none';
      actionBtn.onclick = null;
    }

    modal.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    const modal = document.getElementById('errorModal');
    if (modal) {
      modal.classList.remove('visible');
      document.body.style.overflow = '';
    }
  }

  function getMessage(errorCode, fallback) {
    const def = ERROR_DEFINITIONS[errorCode];
    if (def) return def.message;
    return fallback || errorCode || 'An error occurred';
  }

  function showSuccess(title, message, details) {
    createModal();

    const modal = document.getElementById('errorModal');
    const iconEl = document.getElementById('errorModalIcon');
    const titleEl = document.getElementById('errorModalTitle');
    const messageEl = document.getElementById('errorModalMessage');
    const detailsEl = document.getElementById('errorModalDetails');
    const actionBtn = document.getElementById('errorModalAction');

    modal.querySelector('.error-modal').className = 'error-modal error-modal-success';

    iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>`;

    titleEl.textContent = title || 'Success';
    messageEl.textContent = message || 'Operation completed successfully.';
    detailsEl.textContent = details || '';
    actionBtn.style.display = 'none';

    modal.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  window.ErrorModal = {
    show,
    close,
    getMessage,
    showSuccess,
    definitions: ERROR_DEFINITIONS
  };

  console.log('[ErrorModal] Loaded');

})();
