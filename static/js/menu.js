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
  }

  function showPanel(panel) {
    hideAllPanels();
    if (panel) panel.style.display = 'block';
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
          showPanel(offersPanel);
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
          showPanel(appPanel);
          document.getElementById('appPanelTitle').textContent = 'Moje domy';
          document.getElementById('appPanelBody').innerHTML = '<p style="color:var(--text-muted)">Ładowanie...</p>';
          loadMyHouses();
          break;

        case 'transactions':
          showPanel(appPanel);
          document.getElementById('appPanelTitle').textContent = 'Moje transakcje';
          document.getElementById('appPanelBody').innerHTML = '<p style="color:var(--text-muted)">Ładowanie...</p>';
          loadMyTransactions();
          break;

        case 'watchlist':
          showPanel(appPanel);
          document.getElementById('appPanelTitle').textContent = 'Moje obserwacje';
          document.getElementById('appPanelBody').innerHTML = '<p style="color:var(--text-muted)">Obserwowane nieruchomości pojawią się tutaj.</p>';
          break;

        case 'messages':
          showPanel(appPanel);
          document.getElementById('appPanelTitle').textContent = 'Wiadomości';
          document.getElementById('appPanelBody').innerHTML = '<p style="color:var(--text-muted)">Twoje wiadomości pojawią się tutaj.</p>';
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
          showPanel(appPanel);
          document.getElementById('appPanelTitle').textContent = 'Moje dane';
          document.getElementById('appPanelBody').innerHTML = `
            <div style="display:grid;gap:14px;">
              <label style="color:var(--text-muted);font-size:12px;">Email
                <input class="input" type="email" value="${window.currentUsername || ''}" disabled style="margin-top:6px;opacity:0.6;">
              </label>
              <label style="color:var(--text-muted);font-size:12px;">Imię
                <input class="input" type="text" placeholder="Jan" style="margin-top:6px;">
              </label>
              <label style="color:var(--text-muted);font-size:12px;">Nazwisko
                <input class="input" type="text" placeholder="Kowalski" style="margin-top:6px;">
              </label>
              <button class="btn-ghost" style="margin-top:8px;">Zapisz zmiany</button>
            </div>
          `;
          break;


        // logout handled by logoutBtn directly
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
  // MY HOUSES
  // ═══════════════════════════════════════════════════════════════════════════

  async function loadMyHouses() {
    const body = document.getElementById('appPanelBody');
    if (!body) return;

    try {
      const res = await fetch('/api/my/houses/', { credentials: 'same-origin' });
      const data = await res.json();

      if (!data.ok) {
        body.innerHTML = '<p style="color:#f87171;">Błąd ładowania</p>';
        return;
      }

      if (!data.houses || data.houses.length === 0) {
        body.innerHTML = '<p style="color:var(--text-muted)">Nie posiadasz żadnych nieruchomości.</p>';
        return;
      }

      let html = '<div style="display:flex;flex-direction:column;gap:10px;">';
      for (const h of data.houses) {
        const statusBadge = h.has_listing
          ? `<span style="background:#22c55e;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;">Na sprzedaż: ${h.listing_price} PLN</span>`
          : '';

        html += `
          <div class="house-item" data-lat="${h.lat || ''}" data-lon="${h.lon || ''}" data-id-fme="${h.id_fme || ''}"
               style="padding:12px;background:var(--glass-light);border:1px solid var(--border);border-radius:8px;cursor:pointer;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-weight:600;font-size:14px;">${h.name || 'Dom'}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">
                  ${h.shares}/${h.total_shares} udziałów (${h.percent}%)
                </div>
              </div>
              <div style="text-align:right;">
                ${statusBadge}
              </div>
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
      body.innerHTML = '<p style="color:#f87171;">Błąd połączenia</p>';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MY TRANSACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async function loadMyTransactions() {
    const body = document.getElementById('appPanelBody');
    if (!body) return;

    try {
      const res = await fetch('/api/my/transactions/', { credentials: 'same-origin' });
      const data = await res.json();

      if (!data.ok) {
        body.innerHTML = '<p style="color:#f87171;">Błąd ładowania</p>';
        return;
      }

      if (!data.transactions || data.transactions.length === 0) {
        body.innerHTML = '<p style="color:var(--text-muted)">Brak transakcji.</p>';
        return;
      }

      let html = '<div style="display:flex;flex-direction:column;gap:10px;">';
      for (const t of data.transactions) {
        const roleLabel = t.role === 'buyer' ? 'Kupno' : 'Sprzedaż';
        const roleColor = t.role === 'buyer' ? '#3b82f6' : '#22c55e';
        const dateStr = t.created_at ? new Date(t.created_at).toLocaleString('pl-PL') : '';

        html += `
          <div class="transaction-item" data-lat="${t.house_lat || ''}" data-lon="${t.house_lon || ''}" data-id-fme="${t.house_id_fme || ''}"
               style="padding:12px;background:var(--glass-light);border:1px solid var(--border);border-radius:8px;cursor:pointer;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-weight:600;font-size:14px;">${t.house_name || 'Dom'}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">
                  ${t.counterparty ? (t.role === 'buyer' ? 'od ' : 'do ') + t.counterparty : ''}
                </div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${dateStr}</div>
              </div>
              <div style="text-align:right;">
                <span style="background:${roleColor};color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;">${roleLabel}</span>
                <div style="font-weight:700;font-size:14px;color:var(--accent);margin-top:4px;">
                  ${t.amount ? t.amount.toLocaleString('pl-PL') : '—'} ${t.currency || 'PLN'}
                </div>
              </div>
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
      body.innerHTML = '<p style="color:#f87171;">Błąd połączenia</p>';
    }
  }

  console.log('[Menu] Initialized');

})();