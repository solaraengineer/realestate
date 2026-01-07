/**
 * menu.js - Menu and UI Controller
 * Works with Auth module for real login/register
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // ELEMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  const menuPanel = document.getElementById('menuPanel');
  const menuContent = document.getElementById('menuContent');
  const menuToggle = document.getElementById('menuToggle');
  const menuTitle = document.querySelector('.menu-title');
  const postLogin = document.getElementById('postLogin');
  const userInfo = document.getElementById('userInfo');
  const logoutBtn = document.getElementById('logoutBtn');

  // Auth panel
  const authPanel = document.getElementById('authPanel');
  const showRegBtn = document.getElementById('showRegBtn');
  const regSection = document.getElementById('regSection');
  const forgotPass = document.getElementById('forgotPass');
  const loginBtn = document.getElementById('loginBtn');
  const regBtn = document.getElementById('regBtn');

  // Other panels
  const offersPanel = document.getElementById('offersPanel');
  const viewpointsPanel = document.getElementById('viewpointsPanel');
  const transactionsPanel = document.getElementById('transactionsPanel');
  const featurePanel = document.getElementById('featurePanel');
  const appPanel = document.getElementById('appPanel');

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════

  let loggedIn = false;
  let menuOpen = false;

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  const show = (el) => { if (el) el.style.display = 'block'; };
  const hide = (el) => { if (el) el.style.display = 'none'; };

  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return alert(msg);

    t.textContent = msg;
    t.style.display = 'block';

    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => {
      t.style.display = 'none';
    }, 2000);
  }
  window.toast = toast;

  // ═══════════════════════════════════════════════════════════════════════════
  // PANEL MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  const allPanels = [
    authPanel,
    offersPanel,
    viewpointsPanel,
    transactionsPanel,
    featurePanel,
    appPanel
  ];

  function hideAllPanels() {
    allPanels.forEach(panel => {
      if (panel) panel.style.display = 'none';
    });
    // Reset appPanel position class
    if (appPanel) appPanel.classList.remove('panel-left');
  }

  function showPanel(panel, position) {
    hideAllPanels();
    if (panel) {
      // Add position class if specified
      if (position === 'left') {
        panel.classList.add('panel-left');
      }
      panel.style.display = 'block';
    }
  }

  window.hideAllPanels = hideAllPanels;
  window.hidePanels = hideAllPanels;

  // ═══════════════════════════════════════════════════════════════════════════
  // MENU STATE
  // ═══════════════════════════════════════════════════════════════════════════

  function setMenuOpen(value) {
    menuOpen = value;
    if (menuPanel) menuPanel.style.display = 'flex';
    if (menuContent) {
      menuContent.style.display = 'flex';
      menuContent.querySelectorAll('.section').forEach(s => s.style.display = 'flex');
      menuContent.querySelectorAll('.section-body').forEach(s => s.style.display = 'flex');
    }
    if (menuToggle) menuToggle.textContent = menuOpen ? 'Zwiń' : 'Rozwiń';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGIN STATE UI
  // ═══════════════════════════════════════════════════════════════════════════

  function setLoginMenuVisibility() {
    const loginMenuBtn = document.querySelector('[data-action="login"]');
    if (loginMenuBtn) {
      loginMenuBtn.style.display = loggedIn ? 'none' : '';
    }
  }

  function updateUserInfo() {
    if (userInfo) {
      userInfo.style.display = loggedIn ? 'block' : 'none';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH PANEL
  // ═══════════════════════════════════════════════════════════════════════════

  function showAuthPanel() {
    hideAllPanels();
    hide(menuPanel);
    show(authPanel);
    if (regSection) regSection.style.display = 'none';
    if (showRegBtn) showRegBtn.style.display = '';
    document.querySelector('#loginBody input[type="email"]')?.focus();
  }
  window.showAuthPanel = showAuthPanel;

  function backToMenu() {
    hide(authPanel);
    show(menuPanel);
    if (postLogin) {
      postLogin.style.display = loggedIn ? 'flex' : 'none';
      if (loggedIn) {
        postLogin.querySelectorAll('.section').forEach(s => s.style.display = 'flex');
        postLogin.querySelectorAll('.section-body').forEach(s => s.style.display = 'flex');
      }
    }
    setMenuOpen(true);
    setLoginMenuVisibility();
  }
  window.backToMenu = backToMenu;

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGIN SUCCESS / LOGOUT
  // ═══════════════════════════════════════════════════════════════════════════

  function onLoginSuccess(userData) {
    loggedIn = true;
    window.currentUserId = userData.id;
    window.currentUsername = userData.username;

    updateUserInfo();

    if (userInfo) {
      userInfo.textContent = userData.username
        ? `Zalogowany: ${userData.username}`
        : 'Zalogowany';
      userInfo.style.display = 'block';
    }

    backToMenu();
    if (postLogin) {
      postLogin.style.display = 'flex';
      postLogin.querySelectorAll('.section').forEach(s => s.style.display = 'flex');
      postLogin.querySelectorAll('.section-body').forEach(s => s.style.display = 'flex');
    }
    setLoginMenuVisibility();

    if (typeof startChatInboxPolling === 'function') {
      startChatInboxPolling();
    }
  }

  function onLogout() {
    loggedIn = false;
    window.currentUserId = undefined;
    window.currentUsername = undefined;

    if (postLogin) postLogin.style.display = 'none';
    hide(authPanel);
    show(menuPanel);
    setMenuOpen(false);
    setLoginMenuVisibility();
    updateUserInfo();

    // Clear forms
    document.querySelectorAll('#loginBody input').forEach(i => i.value = '');
    document.querySelectorAll('#regBody input').forEach(i => {
      if (i.type === 'checkbox') i.checked = false;
      else i.value = '';
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MENU TOGGLE
  // ═══════════════════════════════════════════════════════════════════════════

  if (menuToggle) {
    menuToggle.addEventListener('click', () => setMenuOpen(!menuOpen));
  }
  if (menuTitle) {
    menuTitle.addEventListener('click', () => setMenuOpen(!menuOpen));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHOW REGISTER FORM
  // ═══════════════════════════════════════════════════════════════════════════

  if (showRegBtn) {
    showRegBtn.addEventListener('click', () => {
      if (regSection) regSection.style.display = 'block';
      showRegBtn.style.display = 'none';
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FORGOT PASSWORD
  // ═══════════════════════════════════════════════════════════════════════════

  if (forgotPass) {
    forgotPass.addEventListener('click', (e) => {
      e.preventDefault();
      toast('Link do zmiany hasła wysłany na maila');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGIN BUTTON
  // ═══════════════════════════════════════════════════════════════════════════

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const emailEl = document.querySelector('#loginBody input[type="email"]');
      const passEl = document.querySelector('#loginBody input[type="password"]');
      const email = (emailEl?.value || '').trim();
      const password = passEl?.value || '';

      if (!email || !password) {
        toast('Uzupełnij e-mail i hasło');
        emailEl?.focus();
        return;
      }

      const originalLabel = loginBtn.textContent;
      loginBtn.disabled = true;
      loginBtn.textContent = 'Logowanie...';

      try {
        const result = await Auth.login(email, password);

        // Clear form
        document.querySelectorAll('#loginBody input').forEach(i => i.value = '');

        onLoginSuccess(result.user);
        toast('Zalogowano pomyślnie');
      } catch (e) {
        console.warn('[Login] Error:', e);
        toast(Auth.getErrorMessage(e.code) || e.message || 'Błąd logowania');
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = originalLabel;
      }
    });

    // Enter key
    document.querySelector('#loginBody')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loginBtn.click();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTER BUTTON
  // ═══════════════════════════════════════════════════════════════════════════

  if (regBtn) {
    const originalRegLabel = regBtn.textContent || 'Utwórz konto';

    regBtn.addEventListener('click', async () => {
      const username = (document.getElementById('regUsername')?.value || '').trim();
      const email = (document.getElementById('regEmail')?.value || '').trim();
      const password = document.getElementById('regPass1')?.value || '';
      const password2 = document.getElementById('regPass2')?.value || '';
      const acceptTerms = document.getElementById('regAcceptTerms')?.checked || false;
      const referralEmail = (document.getElementById('regReferrer')?.value || '').trim();

      if (!username) {
        toast('Podaj nazwę użytkownika');
        document.getElementById('regUsername')?.focus();
        return;
      }
      if (!email || !password || !password2) {
        toast('Uzupełnij wszystkie pola');
        return;
      }
      if (password !== password2) {
        toast('Hasła nie pasują');
        return;
      }
      if (!acceptTerms) {
        toast('Wymagana akceptacja regulaminu');
        return;
      }

      regBtn.disabled = true;
      regBtn.textContent = 'Tworzenie konta...';

      try {
        const result = await Auth.register({
          username,
          email,
          password,
          password2,
          acceptTerms,
          referralEmail,
        });

        // Clear form
        document.querySelectorAll('#regBody input').forEach(i => {
          if (i.type === 'checkbox') i.checked = false;
          else i.value = '';
        });

        onLoginSuccess(result.user);
        toast('Konto utworzone i zalogowano');
      } catch (e) {
        console.warn('[Register] Error:', e);
        toast(Auth.getErrorMessage(e.code) || e.message || 'Błąd rejestracji');
      } finally {
        regBtn.disabled = false;
        regBtn.textContent = originalRegLabel;
      }
    });

    // Enter key
    document.querySelector('#regBody')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        regBtn.click();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGOUT BUTTON
  // ═══════════════════════════════════════════════════════════════════════════

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await Auth.logout();
      } catch (e) {
        console.warn('[Logout] Error:', e);
      }
      onLogout();
      toast('Wylogowano');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MENU ACTION ROUTER
  // ═══════════════════════════════════════════════════════════════════════════

  if (menuContent) {
    menuContent.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;

      const action = el.dataset.action;

      switch (action) {
        case 'login':
          showAuthPanel();
          break;

        case 'offers':
          showPanel(offersPanel); // center (default)
          const saleBody = document.getElementById('saleBody');
          if (saleBody) saleBody.style.display = 'block';
          const saleToggle = document.getElementById('saleToggle');
          if (saleToggle && saleToggle.getAttribute('aria-pressed') !== 'true') {
            saleToggle.setAttribute('aria-pressed', 'true');
            saleToggle.textContent = 'Ukryj oferty';
            if (typeof window.loadListings === 'function') window.loadListings();
          }
          break;

        case 'homes':
          showPanel(appPanel, 'left'); // LEFT SIDE
          document.getElementById('appPanelTitle').textContent = 'Moje domy';
          document.getElementById('appPanelBody').innerHTML = '<p class="loading-text">Ładowanie...</p>';
          loadMyHouses();
          break;

        case 'transactions':
          showPanel(appPanel, 'left'); // LEFT SIDE
          document.getElementById('appPanelTitle').textContent = 'Moje transakcje';
          document.getElementById('appPanelBody').innerHTML = '<p class="loading-text">Ładowanie...</p>';
          loadMyTransactions();
          break;

        case 'watchlist':
          showPanel(appPanel, 'left');
          document.getElementById('appPanelTitle').textContent = 'Moje obserwacje';
          document.getElementById('appPanelBody').innerHTML = '<p style="color:var(--text-muted)">Obserwowane nieruchomości pojawią się tutaj.</p>';
          break;

        case 'messages':
          showPanel(appPanel, 'left');
          document.getElementById('appPanelTitle').textContent = 'Wiadomości';
          document.getElementById('appPanelBody').innerHTML = '<p class="loading-text">Ładowanie...</p>';
          if (typeof window.renderMessagesPanel === 'function') {
            window.renderMessagesPanel();
          }
          break;

        case 'viewpoints':
          showPanel(viewpointsPanel);
          if (typeof window.renderViewpoints === 'function') {
            window.renderViewpoints();
          }
          break;

        case 'profile':
          showPanel(appPanel, 'left');
          document.getElementById('appPanelTitle').textContent = 'Moje dane';
          document.getElementById('appPanelBody').innerHTML = `
            <div class="profile-form">
              <div class="profile-section">
                <div class="profile-section-title">Dane osobowe</div>
                <label class="form-label">Imię
                  <input class="input" type="text" id="profileFirstName" placeholder="Jan">
                </label>
                <label class="form-label">Nazwisko
                  <input class="input" type="text" id="profileLastName" placeholder="Kowalski">
                </label>
              </div>

              <div class="profile-section">
                <div class="profile-section-title">Adres</div>
                <label class="form-label">Adres
                  <input class="input" type="text" id="profileAddress" placeholder="ul. Przykładowa 123/45">
                </label>
                <label class="form-label">Miasto
                  <input class="input" type="text" id="profileCity" placeholder="Warszawa">
                </label>
                <label class="form-label">Kod pocztowy
                  <input class="input" type="text" id="profilePostalCode" placeholder="00-000">
                </label>
                <label class="form-label">Kraj
                  <input class="input" type="text" id="profileCountry" placeholder="Polska">
                </label>
              </div>

              <div class="profile-section">
                <div class="profile-section-title">Dane do faktury</div>
                <label class="form-label">Nazwa firmy (opcjonalnie)
                  <input class="input" type="text" id="profileCompanyName" placeholder="Firma Sp. z o.o.">
                </label>
                <label class="form-label">NIP (opcjonalnie)
                  <input class="input" type="text" id="profileVatNumber" placeholder="PL1234567890">
                </label>
              </div>

              <div class="profile-section">
                <div class="profile-section-title">Bezpieczeństwo</div>
                <label class="form-label">Obecne hasło
                  <input class="input" type="password" id="profileCurrentPassword" placeholder="••••••••">
                </label>
                <label class="form-label">Nowe hasło
                  <input class="input" type="password" id="profileNewPassword" placeholder="••••••••">
                </label>
                <label class="form-label">Potwierdź nowe hasło
                  <input class="input" type="password" id="profileConfirmPassword" placeholder="••••••••">
                </label>
                <label class="checkbox-row">
                  <input type="checkbox" id="profileTwoFactor">
                  <span>Włącz weryfikację dwuetapową (2FA)</span>
                </label>
              </div>

              <button class="btn-save" id="saveProfileBtn">Zapisz zmiany</button>
            </div>
          `;
          loadProfileData();
          document.getElementById('saveProfileBtn')?.addEventListener('click', saveProfile);
          break;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOSE PANEL BUTTONS
  // ═══════════════════════════════════════════════════════════════════════════

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-close]');
    if (!btn) return;

    const id = btn.getAttribute('data-close');
    const panel = document.getElementById(id);
    if (!panel) return;

    panel.style.display = 'none';
    panel.classList.remove('panel-left');

    if (id === 'authPanel') {
      backToMenu();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ESCAPE KEY
  // ═══════════════════════════════════════════════════════════════════════════

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideAllPanels();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION TRIGGERS (Accordion)
  // ═══════════════════════════════════════════════════════════════════════════

  document.querySelectorAll('.section-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const targetSelector = trigger.dataset.target;
      if (!targetSelector) return;

      const target = document.querySelector(targetSelector);
      if (!target) return;

      const isVisible = target.style.display === 'block';
      target.style.display = isVisible ? 'none' : 'block';
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE PANEL CLOSE
  // ═══════════════════════════════════════════════════════════════════════════

  const featureClose = document.getElementById('featureClose');
  if (featureClose && featurePanel) {
    featureClose.addEventListener('click', () => {
      featurePanel.style.display = 'none';
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK SESSION ON LOAD
  // ═══════════════════════════════════════════════════════════════════════════

  (async () => {
    try {
      const session = await Auth.whoami();
      if (session?.ok && session.user) {
        loggedIn = true;
        window.currentUserId = session.user.id;
        window.currentUsername = session.user.username;

        updateUserInfo();

        if (userInfo) {
          userInfo.textContent = session.user.username
            ? `Zalogowany: ${session.user.username}`
            : 'Zalogowany';
        }

        setLoginMenuVisibility();
        if (postLogin) {
          postLogin.style.display = 'flex';
          postLogin.querySelectorAll('.section').forEach(s => s.style.display = 'flex');
          postLogin.querySelectorAll('.section-body').forEach(s => s.style.display = 'flex');
        }

        if (typeof startChatInboxPolling === 'function') {
          startChatInboxPolling();
        }
      }
    } catch (e) {
      console.warn('[Session Check] Error:', e);
    }
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════════

  // Start with menu open
  setMenuOpen(true);

  // Export
  window.getCookie = Auth?.getCookie;

  // ═══════════════════════════════════════════════════════════════════════════
  // MY HOUSES - REDESIGNED CARDS
  // ═══════════════════════════════════════════════════════════════════════════

  async function loadMyHouses() {
    const body = document.getElementById('appPanelBody');
    if (!body) return;

    try {
      const res = await fetch('/api/my/houses/', { credentials: 'same-origin' });
      const data = await res.json();

      if (!data.ok) {
        body.innerHTML = '<p style="color:var(--danger);">Błąd ładowania</p>';
        return;
      }

      if (!data.houses || data.houses.length === 0) {
        body.innerHTML = '<p style="color:var(--text-muted)">Nie posiadasz żadnych nieruchomości.</p>';
        return;
      }

      let html = '<div class="cards-list">';
      for (const h of data.houses) {
        const statusBadge = h.has_listing
          ? `<span class="status-badge for-sale">Na sprzedaż</span>`
          : '';

        const priceDisplay = h.has_listing && h.listing_price
          ? `<div class="price">${Number(h.listing_price).toLocaleString('pl-PL')} PLN</div>`
          : '';

        html += `
          <div class="house-item" data-lat="${h.lat || ''}" data-lon="${h.lon || ''}" data-id-fme="${h.id_fme || ''}">
            <div class="card-left">
              <div class="house-name">${h.name || 'Dom'}</div>
              <div class="house-shares">${h.shares}/${h.total_shares} udziałów (${h.percent}%)</div>
            </div>
            <div class="card-right">
              ${statusBadge}
              ${priceDisplay}
            </div>
          </div>
        `;
      }
      html += '</div>';
      body.innerHTML = html;

      // Add click handlers for fly-to
      body.querySelectorAll('.house-item').forEach(el => {
        el.addEventListener('click', () => {
          const lat = parseFloat(el.dataset.lat);
          const lon = parseFloat(el.dataset.lon);
          const idFme = el.dataset.idFme;

          if (lat && lon && window.__viewer) {
            window.__viewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(lon, lat, 500),
              duration: 1.5
            });
          }

          if (idFme && typeof window.showFeaturePanel === 'function') {
            window.showFeaturePanel(idFme);
          }
        });
      });

    } catch (e) {
      console.error('[MyHouses]', e);
      body.innerHTML = '<p style="color:var(--danger);">Błąd połączenia</p>';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MY TRANSACTIONS - REDESIGNED CARDS
  // ═══════════════════════════════════════════════════════════════════════════

  async function loadMyTransactions() {
    const body = document.getElementById('appPanelBody');
    if (!body) return;

    try {
      const res = await fetch('/api/my/transactions/', { credentials: 'same-origin' });
      const data = await res.json();

      if (!data.ok) {
        body.innerHTML = '<p style="color:var(--danger);">Błąd ładowania</p>';
        return;
      }

      if (!data.transactions || data.transactions.length === 0) {
        body.innerHTML = '<p style="color:var(--text-muted)">Brak transakcji.</p>';
        return;
      }

      let html = '<div class="cards-list">';
      for (const t of data.transactions) {
        const isBuyer = t.role === 'buyer';
        const roleLabel = isBuyer ? 'Kupno' : 'Sprzedaż';
        const badgeClass = isBuyer ? 'bought' : 'sold';
        const dateStr = t.created_at ? new Date(t.created_at).toLocaleDateString('pl-PL', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }) : '';

        const counterpartyText = t.counterparty
          ? (isBuyer ? 'od ' : 'do ') + t.counterparty
          : '';

        html += `
          <div class="transaction-item" data-lat="${t.house_lat || ''}" data-lon="${t.house_lon || ''}" data-id-fme="${t.house_id_fme || ''}">
            <div class="card-left">
              <div class="tx-name">${t.house_name || 'Dom'}</div>
              <div class="tx-counterparty">${counterpartyText}</div>
              <div class="tx-date">${dateStr}</div>
            </div>
            <div class="card-right">
              <span class="status-badge ${badgeClass}">${roleLabel}</span>
              <div class="price">${t.amount ? t.amount.toLocaleString('pl-PL') : '—'} ${t.currency || 'PLN'}</div>
            </div>
          </div>
        `;
      }
      html += '</div>';
      body.innerHTML = html;

      // Add click handlers for fly-to
      body.querySelectorAll('.transaction-item').forEach(el => {
        el.addEventListener('click', () => {
          const lat = parseFloat(el.dataset.lat);
          const lon = parseFloat(el.dataset.lon);
          const idFme = el.dataset.idFme;

          if (lat && lon && window.__viewer) {
            window.__viewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(lon, lat, 500),
              duration: 1.5
            });
          }

          if (idFme && typeof window.showFeaturePanel === 'function') {
            window.showFeaturePanel(idFme);
          }
        });
      });

    } catch (e) {
      console.error('[MyTransactions]', e);
      body.innerHTML = '<p style="color:var(--danger);">Błąd połączenia</p>';
    }
  }

  console.log('[Menu] Initialized');

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE DATA - LOAD & SAVE
  // ═══════════════════════════════════════════════════════════════════════════

  async function loadProfileData() {
    try {
      const res = await fetch('/api/profile/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCookie('csrftoken')
        },
        credentials: 'same-origin',
      });

       const data = await res.json();

      if (!data.ok) return;

      const fields = {
        profileFirstName: data.first_name,
        profileLastName: data.last_name,
        profileAddress: data.address,
        profileCity: data.city,
        profilePostalCode: data.postal_code,
        profileCountry: data.country,
        profileCompanyName: data.company_name,
        profileVatNumber: data.vat_number
      };

      for (const [id, value] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el && value) el.value = value;
      }

      const twoFactorEl = document.getElementById('profileTwoFactor');
      if (twoFactorEl) twoFactorEl.checked = !!data.two_factor_enabled;

    } catch (e) {
      console.warn('[Profile] Load error:', e);
    }
  }

  async function saveProfile() {
    const btn = document.getElementById('saveProfileBtn');
    if (!btn) return;

    const newPassword = document.getElementById('profileNewPassword')?.value || '';
    const confirmPassword = document.getElementById('profileConfirmPassword')?.value || '';

    if (newPassword && newPassword !== confirmPassword) {
      toast('Hasła nie są takie same');
      return;
    }

    const data = {
      first_name: document.getElementById('profileFirstName')?.value?.trim() || '',
      last_name: document.getElementById('profileLastName')?.value?.trim() || '',
      address: document.getElementById('profileAddress')?.value?.trim() || '',
      city: document.getElementById('profileCity')?.value?.trim() || '',
      postal_code: document.getElementById('profilePostalCode')?.value?.trim() || '',
      country: document.getElementById('profileCountry')?.value?.trim() || '',
      company_name: document.getElementById('profileCompanyName')?.value?.trim() || '',
      vat_number: document.getElementById('profileVatNumber')?.value?.trim() || '',
      two_factor_enabled: document.getElementById('profileTwoFactor')?.checked || false,
      current_password: document.getElementById('profileCurrentPassword')?.value || '',
      new_password: newPassword,
    };

    btn.disabled = true;
    btn.textContent = 'Zapisywanie...';

    try {
      const res = await fetch('/api/profile/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCookie('csrftoken')
        },
        credentials: 'same-origin',
        body: JSON.stringify(data)
      });

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Save failed');
      }

      // Clear password fields after success
      document.getElementById('profileCurrentPassword').value = '';
      document.getElementById('profileNewPassword').value = '';
      document.getElementById('profileConfirmPassword').value = '';

      toast('Dane zapisane');
    } catch (e) {
      console.error('[Profile] Save error:', e);
      toast(e.message || 'Błąd zapisywania');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Zapisz zmiany';
    }
  }

})();
async function buyListing(listingId) {
    try {
        const res = await fetch('/api/checkout/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            credentials: 'same-origin',
            body: JSON.stringify({ listing_id: listingId })
        });

        const data = await res.json();

        if (!data.ok) {
            toast(data.error || 'Błąd płatności');
            return;
        }

        // redirect to stripe checkout
        window.location.href = data.checkout_url;

    } catch (e) {
        console.error('[Checkout]', e);
        toast('Błąd połączenia');
    }
}

// expose globally
window.buyListing = buyListing;