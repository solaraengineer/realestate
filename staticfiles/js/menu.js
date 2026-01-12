<<<<<<< HEAD
(function() {
  // --- Elementy menu i sekcji logowania ---
  const menuToggle  = document.getElementById('menuToggle');
  const menuTitle   = document.querySelector('.menu-title');
  const menuContent = document.getElementById('menuContent');
  const menuPanel   = document.getElementById('menuPanel');
  const authPanel   = document.getElementById('authPanel');

  const showRegBtn  = document.getElementById('showRegBtn');
  const regSection  = document.getElementById('regSection');
  const forgotPass  = document.getElementById('forgotPass'); // link "Wyślij link do zmiany hasła"

  const preLogin    = document.querySelector('#authPanel #preLogin');   // formularze
  const postLogin   = document.querySelector('#menuPanel #postLogin');  // kafelki po zalogowaniu (w menu)
  const logoutBtn   = document.querySelector('#menuPanel #logoutBtn');  // przycisk wylogowania

  const loginBtn    = document.getElementById('loginBtn');
  const regBtn      = document.getElementById('regBtn');

  const show = (el) => { if (el) el.style.display = 'block'; };
  const hide = (el) => { if (el) el.style.display = 'none'; };
  let loggedIn = false;

  // === Utils ===
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
  }
  window.getCookie = getCookie;

  async function ensureCsrfToken() {
    // jeśli już jest cookie, użyj go
    let token = getCookie('csrftoken');
    if (token) return token;

    try {
      // poproś backend o ustawienie csrftoken
      await fetch('/api/auth/csrf/', {
        method: 'GET',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
      });
    } catch (e) {
      console.warn('[auth] csrf fetch failed', e);
    }

    // po wywołaniu api_csrf cookie powinno być ustawione
    token = getCookie('csrftoken');
    return token || '';
  }



  function toast(msg) {
    const t = document.getElementById('toast');
    if (t) { t.textContent = msg; t.style.display = 'block'; setTimeout(()=>t.style.display='none', 1500); }
    else { alert(msg); }
  }
  // udostępnienie dla innych plików (featurePanel, messages itd.)
  window.toast =  toast;

  function setLoginMenuVisibility() {
    const loginMenuBtn = document.querySelector('#menuContent [data-action="login"]');
    if (loginMenuBtn) loginMenuBtn.style.display = loggedIn ? 'none' : 'inline-block';
  }

  function updateUserInfo() {
    const userInfo = document.getElementById('userInfo');
    if (!userInfo) return;
    userInfo.style.display = loggedIn ? 'block' : 'none';
  }

  async function apiLogin(payload) {
    const body = new URLSearchParams(payload);

    // zapewnij, że mamy csrftoken w cookies
    const csrf = await ensureCsrfToken();

    const r = await fetch('/api/auth/login/', {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrf,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      credentials: 'same-origin',
      body
    });

    if (r.status === 429) throw new Error('Za dużo prób – spróbuj za minutę');
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      const msg = data.error === 'INVALID_CREDENTIALS' ? 'błędny login lub hasło' :
                  data.error === 'MISSING_CREDENTIALS' ? 'uzupełnij e-mail i hasło' :
                  data.error === 'RATE_LIMIT' ? 'za dużo prób – spróbuj za minutę' :
                  'błąd logowania';
      throw new Error(msg);
    }
    return data;
  }


  async function apiLogout() {
    const csrf = getCookie('csrftoken'); // tu nie musimy dociągać, bo i tak user jest zalogowany
    const r = await fetch('/api/auth/logout/', {
      method: 'POST',
      headers: { 'X-CSRFToken': csrf },
      credentials: 'same-origin'
    });
    return r.ok;
  }

  async function apiWhoAmI() {
    const r = await fetch('/api/auth/whoami/', { credentials: 'same-origin' });
    if (!r.ok) return null;
    return r.json().catch(() => null);
  }
  // --- Globalny polling czatu 1:1 (inbox) ---

  let chatInboxPollStarted = false;
  let chatInboxLastSeen = 0;
 

  function startChatInboxPolling() {
    if (chatInboxPollStarted) return;
    chatInboxPollStarted = true;

    // odpalaj co 10 sekund
    setInterval(pollChatInbox, 10000);
  }

  async function apiRegister(payload) {
    const body = new URLSearchParams(payload);
    const csrf = await ensureCsrfToken();

    const r = await fetch('/api/auth/register/', {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrf,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      credentials: 'same-origin',
      body
    });
    if (r.status === 429) throw new Error('Za dużo prób – spróbuj za minutę');
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      const code = data.error;
      const map = {
        MISSING_FIELDS: 'Uzupełnij wszystkie pola',
        PASSWORD_MISMATCH: 'Hasła nie pasują',
        TERMS_REQUIRED: 'Wymagana akceptacja regulaminu',
        EMAIL_EXISTS: 'Taki e-mail już istnieje',
        WEAK_PASSWORD: (data.messages && data.messages[0]) || 'Hasło nie spełnia wymagań',
        'RATE_LIMIT': 'Za dużo prób – spróbuj za chwilę',
        USERNAME_EXISTS: 'Taka nazwa użytkownika już istnieje',
        MISSING_USERNAME: 'Podaj nazwę użytkownika',
      };
      throw new Error(map[code] || 'Błąd rejestracji');
    }
    return data;
  }

  // --- UI helpers ---
  function restoreRegistrationUI() {
    const regBody = document.getElementById('regBody');
    if (!regBody) return;
    regBody.querySelectorAll('[data-hidden-by-step2]').forEach(el => {
      el.style.display = '';
      el.removeAttribute('data-hidden-by-step2');
    });
    document.getElementById('regVerifyGroup')?.remove();
    const regBtnEl = document.getElementById('regBtn');
    if (regBtnEl) regBody.appendChild(regBtnEl);
    const extras = document.getElementById('regStep1Extras');
    if (extras && regBtnEl) regBody.insertBefore(extras, regBtnEl);
    if (regBtnEl) {
      const safeLabel = (typeof originalRegLabel === 'string' && originalRegLabel)
                        ? originalRegLabel
                        : (regBtnEl.textContent || 'Utwórz konto');
      regBtnEl.textContent = safeLabel;
      regBtnEl.style.background = '';
    }
  }

  function showAuthPanel() {
    if (typeof hidePanels === 'function') hidePanels();
    hide(menuPanel);
    show(authPanel);
    if (regSection) regSection.style.display = 'none';
    if (showRegBtn) showRegBtn.style.display = 'inline-block';
    if (preLogin)  preLogin.style.display  = 'block';
    restoreRegistrationUI();
    document.querySelector('#loginBody input[type="email"]')?.focus();
  }
=======
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

  const chatPanel = document.getElementById('chatPanel');

  const allPanels = [
    authPanel,
    offersPanel,
    viewpointsPanel,
    transactionsPanel,
    featurePanel,
    appPanel,
    chatPanel
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
>>>>>>> 7ee9b21 (Inital at 01.12.2026)

  function backToMenu() {
    hide(authPanel);
    show(menuPanel);
<<<<<<< HEAD
    if (postLogin) postLogin.style.display = loggedIn ? 'block' : 'none';
    setOpen(true);
=======
    if (postLogin) {
      postLogin.style.display = loggedIn ? 'flex' : 'none';
      if (loggedIn) {
        postLogin.querySelectorAll('.section').forEach(s => s.style.display = 'flex');
        postLogin.querySelectorAll('.section-body').forEach(s => s.style.display = 'flex');
      }
    }
    setMenuOpen(true);
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
    setLoginMenuVisibility();
  }
  window.backToMenu = backToMenu;

<<<<<<< HEAD
  // --- Stan rozwinięcia menu ---
  // --- Stan rozwinięcia menu ---
  // Nie wychodzimy z całego pliku jeśli brakuje elementów — robimy „miękką” inicjalizację.
  let open = false;
  const setOpen = (value) => {
    open = value;
    if (open && menuPanel) menuPanel.style.display = 'block';
    if (menuContent) menuContent.style.display = open ? 'block' : 'none';
    if (menuToggle)  menuToggle.textContent   = open ? 'Zwiń' : 'Rozwiń';
  };

  if (menuToggle) menuToggle.addEventListener('click', () => setOpen(!open));
  if (menuTitle)  menuTitle.addEventListener('click', () => setOpen(!open));


  // --- Link "Zapomniałem hasła"
  if (forgotPass) {
    forgotPass.addEventListener('click', (e) => {
      e.preventDefault();
      toast('link do zmiany hasła wysłany na maila');
    });
  }

  // --- Klik „Utwórz konto” pod logowaniem → pokaż rejestrację
=======
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

>>>>>>> 7ee9b21 (Inital at 01.12.2026)
  if (showRegBtn) {
    showRegBtn.addEventListener('click', () => {
      if (regSection) regSection.style.display = 'block';
      showRegBtn.style.display = 'none';
    });
  }

<<<<<<< HEAD
  // --- Logowanie
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const emailEl = document.querySelector('#loginBody input[type="email"]');
      const passEl  = document.querySelector('#loginBody input[type="password"]');
      const email   = (emailEl?.value || '').trim();
      const password= passEl?.value || '';
      if (!email || !password) { toast('błędne dane'); emailEl?.focus(); return; }

      const originalLoginLabel = (loginBtn && loginBtn.textContent) || 'Zaloguj';
=======
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
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
      loginBtn.disabled = true;
      loginBtn.textContent = 'Logowanie...';

      try {
<<<<<<< HEAD
        const data = await apiLogin({ email, password });
        loggedIn = true;
        window.currentUserId = data.user.id;
        window.currentUsername = data.user.username;
        updateUserInfo();

        startChatInboxPolling(); 
        const userInfo = document.getElementById('userInfo');
        if (userInfo) {
          const u = data.user || {};
          userInfo.textContent = u.username ? `Zalogowany: ${u.username}` : 'Zalogowany';
          userInfo.style.display = 'block';
        }

        document.querySelectorAll('#loginBody input').forEach(i => i.value = '');
        backToMenu();
        if (postLogin) postLogin.style.display = 'block';
        setLoginMenuVisibility();
      } catch (e) {
        toast(e.message || 'błąd logowania');
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = originalLoginLabel;
      }
    });

    // ENTER w formularzu logowania
    document.querySelector('#loginBody')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); loginBtn.click(); }
    });
  }

  // --- Rejestracja
  const originalRegLabel = (regBtn && regBtn.textContent) || 'Utwórz konto';
  if (regBtn) {
    regBtn.addEventListener('click', async () => {
      const usernameEl = document.getElementById('regUsername');
      const emailEl    = document.querySelector('#regBody input[type="email"]');
      const passEls    = Array.from(document.querySelectorAll('#regBody input[type="password"]'));
      const pass1El    = passEls[0], pass2El = passEls[1];
      const acceptEl   = document.getElementById('regAcceptTerms');
      const referralEl = document.getElementById('regReferrer');

      const username    = (usernameEl?.value || '').trim();
      const email       = (emailEl?.value || '').trim();
      const password    = pass1El?.value || '';
      const password2   = pass2El?.value || '';
      const accept_terms= acceptEl?.checked ? '1' : '';
      const referral    = (referralEl?.value || '').trim();

      if (!username) { toast('Podaj nazwę użytkownika'); return; }
      if (!email || !password || !password2) { toast('Uzupełnij wszystkie pola'); return; }
      if (password !== password2) { toast('Hasła nie pasują'); return; }
      if (!acceptEl?.checked) { toast('Wymagana akceptacja regulaminu'); return; }

      const old = regBtn.textContent;
=======
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

>>>>>>> 7ee9b21 (Inital at 01.12.2026)
      regBtn.disabled = true;
      regBtn.textContent = 'Tworzenie konta...';

      try {
<<<<<<< HEAD
        const data = await apiRegister({
          username, email, password, password2, accept_terms,
          referral_email: referral
        });
        loggedIn = true;
        window.currentUserId = data.user.id;
        window.currentUsername = data.user.username;
        updateUserInfo();
        const userInfo = document.getElementById('userInfo');
        if (userInfo) {
          const u = data.user || {};
          userInfo.textContent = u.username ? `Zalogowany: ${u.username}` : 'Zalogowany';
          userInfo.style.display = 'block';
        }
        document.querySelectorAll('#regBody input').forEach(i => {
          if (i.type === 'checkbox') i.checked = false; else i.value = '';
        });
        backToMenu();
        if (postLogin) postLogin.style.display = 'block';
        setLoginMenuVisibility();
        toast('Konto utworzone i zalogowano');
      } catch (e) {
        toast(e.message || 'Błąd rejestracji');
        console.warn('register error', e);
      } finally {
        regBtn.disabled = false;
        regBtn.textContent = old;
=======
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
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
      }
    });
  }

<<<<<<< HEAD
  // --- Wylogowanie
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await apiLogout(); } catch (_) {}
      loggedIn = false;
      window.currentUserId = undefined;
      window.currentUsername = undefined;
      if (postLogin) postLogin.style.display = 'none';
      hide(authPanel);
      show(menuPanel);
      setOpen(false);
      setLoginMenuVisibility();
      updateUserInfo();
      document.getElementById('regVerifyGroup')?.remove();
      document.querySelectorAll('#loginBody input').forEach(i => i.value = '');
    });
  }

  async function pollChatInbox() {
    if (!loggedIn) return;

    // NOWE: jeśli WebSocket chat jest aktywny – nie polluj starego inboxa
    if (window.__chatWsSupportsInbox) {
      return;
    }

    try {
      const res = await fetch(`/api/chat/inbox/?t=${Date.now()}`, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "Cache-Control": "no-cache",
        },
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        console.warn('[chat-inbox] bad response', data);
        return;
      }

      // Spróbuj znaleźć listę „wiadomości” w kilku możliwych polach:
      const items =
        (Array.isArray(data.messages) && data.messages) ||
        (Array.isArray(data.inbox) && data.inbox) ||
        (Array.isArray(data.results) && data.results) ||
        (Array.isArray(data) && data) ||
        [];

      if (!items.length) {
        return;
      }

      let maxTs = chatInboxLastSeen || 0;

      for (const item of items) {
        // próba wyciągnięcia timestampu
        const tsStr =
          item.created_at ||
          item.last_message_at ||
          item.timestamp ||
          item.ts ||
          null;

        const ts = tsStr ? Date.parse(tsStr) : NaN;
        if (Number.isFinite(ts) && ts <= chatInboxLastSeen) {
          continue; // już widzieliśmy
        }

        // próba wyciągnięcia nadawcy
        const senderId =
          item.sender_id ??
          item.from_id ??
          item.user_id ??
          null;

        if (!senderId) continue;

        const senderName =
          item.sender_name ||
          item.from_name ||
          item.username ||
          `User ${senderId}`;

        if (typeof window.onIncomingDirectChat === 'function') {
          window.onIncomingDirectChat(
            String(senderId),
            senderName,
            tsStr || null
          );
        }

        if (Number.isFinite(ts) && ts > maxTs) {
          maxTs = ts;
        }
      }

      if (maxTs > (chatInboxLastSeen || 0)) {
        chatInboxLastSeen = maxTs;
      }
    } catch (err) {
      console.warn('[chat-inbox] poll error', err);
    }
  }


  // --- HELP: otwórz panel po prawej, nawet jeśli openPanelInMenu nie istnieje
  function openAppPanel(panelId = 'appPanel', opts = {}) {
    const dockLeft = !!opts.dockLeft;

    // 1) spróbuj mechanizmu projektowego (jeśli jest)
    if (typeof openPanelInMenu === 'function' && dockLeft) {
      try { openPanelInMenu(panelId); } catch (_) {}
    }

    // 2) wymuś widoczność niezależnie od powyższego
    const panel = document.getElementById(panelId);
    const menu  = document.getElementById('menuPanel');
    if (!panel) return;

    if (menu) menu.style.display = dockLeft ? 'block' : 'none';   // schowaj lewe menu

    panel.classList.add('is-open');
    if (dockLeft) {
      panel.classList.add('dock-left');
      panel.classList.remove('msgx-medium');
    } else {
      panel.classList.add('msgx-medium');
      panel.classList.remove('dock-left');
    }
    panel.classList.remove('msgx-wide');
    panel.style.display = 'flex';
    panel.style.zIndex = '1000';
  }

    function openMessagesPanel() {
      // Otwórz panel po lewej, jak inne dock-left
      openAppPanel('appPanel', { dockLeft: true });

      const panel  = document.getElementById('appPanel');
      const bodyEl = document.getElementById('appPanelBody');
      if (!panel) return;

      // tryb "messages"
      panel.setAttribute('data-panel', 'messages');
      panel.classList.add('dock-left', 'is-open');
      panel.classList.remove('msgx-medium', 'msgx-wide');

      // Wyzeruj rozmiar po poprzednich panelach (homes, itd.)
      panel.style.height = '';
      panel.style.width  = '';

      // Wyczyść zapamiętaną wysokość (na wszelki wypadek)
      try {
        localStorage.removeItem('messages_height');
      } catch (e) {}

      // Usuń pionowy uchwyt, jeśli został z "homes"
      const vHandle = panel.querySelector('.resize-handle-y');
      if (vHandle) vHandle.remove();

      // Render UI messages
      if (typeof window.renderMessagesPanel === 'function') {
        window.renderMessagesPanel();
      }

      // TYLKO poziomy resize (szerokość)
      enableResize(panel, { axis: 'x', min: 260, storeKey: 'messages_width' });
      // UWAGA: żadnego axis: 'y' tutaj!
    }


  // === Resizable panels (width/height) ===
  function enableResize(panelEl, { axis = 'x', min = 240, max = null, storeKey = 'homes_width' } = {}) {
    if (!panelEl) return;

     // ⬇⬇⬇ BLOKADA pionowego resize dla panelu messages
    if (axis === 'y' && panelEl.dataset && panelEl.dataset.panel === 'messages') {
      return;
    }
    // ⬆⬆⬆
    
    const mode = (panelEl.dataset && panelEl.dataset.panel) || 'default';
    const key = storeKey || `panel_size_${axis}_${panelEl.id}_${mode}`;
    const raw = localStorage.getItem(key);
      if (raw !== null && raw !== '') {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed > 0) {        // pozwól tylko sensowne wartości
          if (axis === 'x') panelEl.style.width  = parsed + 'px';
          if (axis === 'y') panelEl.style.height = parsed + 'px';
        } else {
          // stare „0”/śmieć – wyczyść, żeby nie psuło pierwszego open
          try { localStorage.removeItem(key); } catch (_) {}
        }
      }
    const handleClass = axis === 'x' ? 'resize-handle-x' : 'resize-handle-y';
    let h = panelEl.querySelector('.' + handleClass);
    if (!h) {
      h = document.createElement('div');
      h.className = handleClass;
      panelEl.appendChild(h);
    }
    // uchwyt musi być „łapalny”
    Object.assign(h.style, {
      position: 'absolute',
      top: '0',
      right: '0',
      width: axis === 'x' ? '12px' : '100%',
      height: axis === 'x' ? '100%' : '12px',
      cursor: axis === 'x' ? 'ew-resize' : 'ns-resize',
      zIndex: '2000',
      touchAction: 'none',         // mobilne gesty nie blokują
      background: 'transparent'    // zostaje niewidoczny
    });
    if (axis === 'y') { h.style.left = '0'; h.style.right = '0'; h.style.bottom = '0'; h.style.top = '';}

    let startPos = 0, startSize = 0, moving = false;

    const onMove = (e) => {
      if (!moving) return;
      const x = ('touches' in e) ? e.touches[0].clientX : e.clientX;
      const y = ('touches' in e) ? e.touches[0].clientY : e.clientY;
      if (axis === 'x') {
        const rect = panelEl.getBoundingClientRect();

        // maksymalna szerokość: jeśli nie podano w options.max,
        // licz dynamicznie do prawej krawędzi okna (z 16 px marginesu)
        const allowedMax = (max != null && Number.isFinite(max))
          ? max
          : (window.innerWidth - rect.left - 16);

        let w = Math.round(x - rect.left);           // x = clientX z eventu
        w = Math.max(min, Math.min(allowedMax, w));  // clamp [min, allowedMax]

        panelEl.style.width = w + 'px';
        localStorage.setItem(key, String(w));
        } else {
          const rect = panelEl.getBoundingClientRect();

          // max wysokość: jeśli nie podano `max`, licz do prawej krawędzi okna (z 16px marginesu)
          const allowedMax = (max != null && Number.isFinite(max))
            ? max
            : (window.innerHeight - rect.top - 16);

          let hgt = Math.round(y - rect.top);               // y = clientY z eventu
          hgt = Math.max(min, Math.min(allowedMax, hgt));   // clamp [min, allowedMax]

          panelEl.style.height = hgt + 'px';
          localStorage.setItem(key, String(hgt));

          // NIE ustawiaj wysokości na #appPanelBody — ma mieć height:auto + flex:1 w CSS
        }

      e.preventDefault();
    };
    const stop = () => {
      moving = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', stop);
      document.removeEventListener('touchmove', onMove, { passive:false });
      document.removeEventListener('touchend', stop);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    const start = (e) => {
      moving = true;
      startPos = ('touches' in e) ? e.touches[0].clientX : e.clientX;
      startSize = (axis === 'x')
        ? panelEl.getBoundingClientRect().width
        : panelEl.getBoundingClientRect().height;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', stop);
      document.addEventListener('touchmove', onMove, { passive:false });
      document.addEventListener('touchend', stop);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = (axis === 'x') ? 'ew-resize' : 'ns-resize';
      e.preventDefault();
    };
    h.onmousedown = start;
    h.ontouchstart = start;
  }

  window.enableAppPanelResize = enableResize;

  // === MARKERY MOICH DOMÓW (My Real Estate) ===
  const homesMarkers = [];

  function clearHomesMarkers() {
    const viewer = window.__viewer || window.viewer;
    if (!viewer || typeof Cesium === 'undefined') return;
    while (homesMarkers.length) {
      const ent = homesMarkers.pop();
      try { viewer.entities.remove(ent); } catch (_) {}
    }
  }

  function updateHomesMarkers(houses) {
    const viewer = window.__viewer || window.viewer;
    if (!viewer || typeof Cesium === 'undefined') return;

    clearHomesMarkers();
    if (!Array.isArray(houses)) return;

    for (const h of houses) {
      const lat = Number(h.lat);
      const lon = Number(h.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      // przybliżona wysokość markera na podstawie cam_height (h.height)
      let markerH = 20;
      const camH = Number(h.height);
      if (Number.isFinite(camH) && camH > 0) {
        let buildingH = camH;
        if (camH > 80) {
          buildingH = (camH - 150) / 3;
        }
        if (!Number.isFinite(buildingH) || buildingH <= 0) {
          buildingH = camH * 0.3;
        }
        markerH = Math.min(200, Math.max(8, buildingH * 0.6));
      }

      const myShares   = Number(h.my_shares);
      const totalShares = Number(h.total_shares);
      const price      = (h.listing_price != null) ? Number(h.listing_price) : null;

      const parts = [];
      if (Number.isFinite(myShares) && Number.isFinite(totalShares)) {
        parts.push(`${myShares}/${totalShares} sh`);
      }
      if (Number.isFinite(price)) {
        parts.push(`$${price}`);
      }
      const labelText = parts.join(' · ');

      const ent = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, markerH),
        point: {
          pixelSize: 7,
          color: Cesium.Color.fromCssColorString('#38bdf8'), // jasno-niebieskie: „my homes”
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: labelText ? {
          text: labelText,
          font: '14px "Segoe UI", sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          showBackground: true,
          backgroundColor: new Cesium.Color(0.05, 0.05, 0.08, 0.9)
        } : undefined
      });

      homesMarkers.push(ent);
    }
  }

  // wystawiamy globalnie, jak dla offers
  window.clearHomesMarkers = clearHomesMarkers;
  window.updateHomesMarkers = updateHomesMarkers;



  // === GLOBALNE KROPKI DOMÓW NA SPRZEDAŻ (toggle w głównym menu) ===

  const saleOverlayState = {
    enabled: false,       // czy w ogóle nasłuchujemy kamery
    showListings: false,  // checkbox: Show sale listings
    showSold: false,      // checkbox: Sold label
    markers: [],          // markery aktywnych listingów
    soldMarkers: [],      // markery sprzedanych domów
    radiusKm: 5,
    moveMeters: 200,
    soldDays: 14,
    lastCenter: null,
    cameraHandler: null,
    lastCheckTs: 0,
  };

  function saleOverlayGetViewer() {
    return window.__viewer || window.viewer;
  }

  function saleOverlayClearMarkers() {
    const viewer = saleOverlayGetViewer();
    if (!viewer || typeof Cesium === 'undefined') return;

    while (saleOverlayState.markers.length) {
      const ent = saleOverlayState.markers.pop();
      try { viewer.entities.remove(ent); } catch (_) {}
    }
    while (saleOverlayState.soldMarkers.length) {
      const ent = saleOverlayState.soldMarkers.pop();
      try { viewer.entities.remove(ent); } catch (_) {}
    }
  }

  function saleOverlayAddMarker(item) {
    const viewer = saleOverlayGetViewer();
    if (!viewer || typeof Cesium === 'undefined') return;

    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    let markerH = 20;
    const h = Number(item.height);
    if (Number.isFinite(h) && h > 0) {
      markerH = Math.max(8, h * 0.3); // ~1/3 wysokości budynku, min. 8 m
    }

    const isSold   = !!item.sold_at;               // z naszego API dla sprzedanych
    const listings = Array.isArray(item.listings)  // agregowane listingi dla jednego domu
      ? item.listings
      : null;

    let labelText = '';

    if (isSold) {
      // sprzedane – czerwony SOLD
      labelText = 'SOLD';
    } else if (listings && listings.length) {
      // DOM Z WIELOMA LISTINGAMI – pokażemy kilka linii, resztę „...”
      const lines = [];
      const maxLines = 5;

      for (let i = 0; i < listings.length && i < maxLines; i++) {
        const l = listings[i];
        const sharesForSale = Number(l.share_count);
        const totalShares   = Number(l.total_shares);
        const price         = (l.price != null) ? Number(l.price) : null;

        const parts = [];
        if (Number.isFinite(price)) {
          parts.push(`$${price}`);
        }
        if (Number.isFinite(sharesForSale) && Number.isFinite(totalShares)) {
          parts.push(`${sharesForSale}/${totalShares} sh`);
        } else if (Number.isFinite(sharesForSale)) {
          parts.push(`${sharesForSale} sh`);
        }

        const line = parts.length ? parts.join(' · ') : 'Listing';
        lines.push(line);
      }

      if (listings.length > maxLines) {
        lines.push('...');
      }

      // Cesium Label ładnie obsługuje \n jako nową linię
      labelText = lines.join('\n');
    } else {
      // STARY PRZYPADEK: pojedynczy listing bez agregacji
      const sharesForSale = Number(item.share_count);
      const totalShares   = Number(item.total_shares);
      const price         = (item.price != null) ? Number(item.price) : null;

      const parts = [];
      if (Number.isFinite(price)) {
        parts.push(`$${price}`);
      }
      if (Number.isFinite(sharesForSale) && Number.isFinite(totalShares)) {
        parts.push(`${sharesForSale}/${totalShares} sh`);
      } else if (Number.isFinite(sharesForSale)) {
        parts.push(`${sharesForSale} sh`);
      }
      labelText = parts.join(' · ');
    }


    let pointColor;
    if (isSold) {
      // czerwony SOLD
      pointColor = Cesium.Color.fromCssColorString('#ef4444');
    } else {
      const isMine = !!item.is_mine;
      pointColor = isMine
        ? Cesium.Color.fromCssColorString('#22c55e')   // moje listingi
        : Cesium.Color.fromCssColorString('#ffcc00');  // obce listingi
    }

    const bgColor = isSold
      // czerwone tło dla SOLD
      ? new Cesium.Color(0.8, 0.16, 0.16, 0.95)   // ciemnoczerwone, z alfą
      // ciemne tło jak wcześniej dla listingów
      : new Cesium.Color(0.05, 0.05, 0.05, 0.9);

    const ent = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, markerH),
      point: {
        pixelSize: 8,
        color: pointColor,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: labelText ? {
        text: labelText,
        font: '14px "Segoe UI", sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        showBackground: true,
        backgroundColor: bgColor
      } : undefined
    });

    if (isSold) {
      saleOverlayState.soldMarkers.push(ent);
    } else {
      saleOverlayState.markers.push(ent);
    }
  }

  function saleOverlayGetCameraLatLon() {
    const viewer = saleOverlayGetViewer();
    if (!viewer || typeof Cesium === 'undefined') return null;
    const c = viewer.camera.positionCartographic;
    return {
      lat: Cesium.Math.toDegrees(c.latitude),
      lon: Cesium.Math.toDegrees(c.longitude),
    };
  }

  function saleOverlayDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // m
    const toRad = angle => angle * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);

    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

    async function saleOverlayRefresh(centerOverride) {
    if (!saleOverlayState.enabled) return;

    const viewer = saleOverlayGetViewer();
    if (!viewer || typeof Cesium === 'undefined') {
      if (typeof toast === 'function') toast('Map is not ready');
      return;
    }

    // jeśli nic nie ma zaznaczone – tylko czyścimy
    if (!saleOverlayState.showListings && !saleOverlayState.showSold) {
      saleOverlayClearMarkers();
      return;
    }

    const center = centerOverride || saleOverlayGetCameraLatLon();
    if (!center) return;

    saleOverlayState.lastCenter = center;
    saleOverlayClearMarkers();

    const radiusKm = saleOverlayState.radiusKm || 5;
    const lat = center.lat;
    const lon = center.lon;
    const maxPages = 5;

    // zestaw domów, które mają aktywne listingi (po id_fme)
    const listingIds = new Set();

    // MAPA: id_fme -> obiekt zagregowany (dom + lista listingów)
    const groupedListings = new Map();

    // 1) aktywne listingi
    if (saleOverlayState.showListings) {
      let page = 1;
      while (true) {
        let data = null;
        try {
          const url = `/api/listings/nearby/?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&page=${page}`;
          const res = await fetch(url, { credentials: 'same-origin' });
          data = await res.json().catch(() => null);
          if (!res.ok || !data || data.ok === false) {
            throw new Error((data && data.error) || 'Error loading sale listings');
          }
        } catch (e) {
          console.error('[sale-overlay] listings load error', e);
          if (typeof toast === 'function') toast(e.message || 'Error loading sale listings');
          break;
        }

        if (!saleOverlayState.enabled || !saleOverlayState.showListings) break;

        const results = Array.isArray(data.results) ? data.results : [];
        if (!results.length) break;

        let lastDist = null;
        for (const item of results) {
          const d = Number(item.distance_km);
          if (Number.isFinite(d)) lastDist = d;

          if (!Number.isFinite(d) || d <= radiusKm) {
            const idFme = item.id_fme != null ? String(item.id_fme) : null;

            if (idFme) {
              let agg = groupedListings.get(idFme);
              if (!agg) {
                agg = {
                  id_fme: idFme,
                  lat: item.lat,
                  lon: item.lon,
                  height: item.height,
                  listings: [],
                  is_mine: false,
                };
                groupedListings.set(idFme, agg);
              }

              agg.listings.push({
                price: item.price,
                share_count: item.share_count,
                total_shares: item.total_shares,
                is_mine: !!item.is_mine,
              });

              if (item.is_mine) {
                agg.is_mine = true;
              }

              listingIds.add(idFme);
            } else {
              // brak id_fme – rysujemy pojedynczy marker jak dawniej
              saleOverlayAddMarker(item);
            }
          }
        }

        const pageSize = data.page_size || results.length;
        const total = data.total_results || 0;
        const haveMore = page * pageSize < total;
        const moreWithinRadius = haveMore && (lastDist != null && lastDist <= radiusKm);
        page += 1;
        if (!(haveMore && moreWithinRadius && page <= maxPages)) break;
      }

      // TERAZ dopiero rysujemy po 1 markerze na dom (z wieloma liniami w labelu)
      for (const agg of groupedListings.values()) {
        saleOverlayAddMarker(agg);
      }
    }

    // 2) sprzedane domy
    if (saleOverlayState.showSold) {
      let page = 1;
      const days = saleOverlayState.soldDays || 14;

      while (true) {
        let data = null;
        try {
          const url = `/api/houses/sold_nearby/?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&radius_km=${radiusKm}&days=${days}&page=${page}`;
          const res = await fetch(url, { credentials: 'same-origin' });
          data = await res.json().catch(() => null);
          if (!res.ok || !data || data.ok === false) {
            throw new Error((data && data.error) || 'Error loading sold houses');
          }
        } catch (e) {
          console.error('[sale-overlay] sold load error', e);
          if (typeof toast === 'function') toast(e.message || 'Error loading sold houses');
          break;
        }

        if (!saleOverlayState.enabled || !saleOverlayState.showSold) break;

        const results = Array.isArray(data.results) ? data.results : [];
        if (!results.length) break;

        let lastDist = null;
        for (const item of results) {
          const d = Number(item.distance_km);
          if (Number.isFinite(d)) lastDist = d;

          if (!Number.isFinite(d) || d <= radiusKm) {
            const idStr = item.id_fme != null ? String(item.id_fme) : null;

            // jeśli jest aktywny listing na tym domu – NIE rysujemy SOLD
            if (!idStr || !listingIds.has(idStr)) {
              saleOverlayAddMarker(item);
            }
          }
        }

        const pageSize = data.page_size || results.length;
        const total = data.total_results || 0;
        const haveMore = page * pageSize < total;
        const moreWithinRadius = haveMore && (lastDist != null && lastDist <= radiusKm);
        page += 1;
        if (!(haveMore && moreWithinRadius && page <= maxPages)) break;
      }
    }
  }


  function saleOverlayStartWatching() {
    if (saleOverlayState.cameraHandler) return;

    const viewer = saleOverlayGetViewer();
    if (!viewer || typeof Cesium === 'undefined' || !viewer.camera) {
      if (typeof toast === 'function') toast('Map is not ready');
      return;
    }

    const handler = () => {
      if (!saleOverlayState.enabled) return;

      const now = performance.now ? performance.now() : Date.now();
      if (now - saleOverlayState.lastCheckTs < 500) return; // throttling ~0.5s
      saleOverlayState.lastCheckTs = now;

      const center = saleOverlayGetCameraLatLon();
      if (!center) return;

      if (!saleOverlayState.lastCenter) {
        saleOverlayRefresh(center);
        return;
      }

      const dist = saleOverlayDistanceMeters(
        saleOverlayState.lastCenter.lat,
        saleOverlayState.lastCenter.lon,
        center.lat,
        center.lon
      );

      if (dist >= saleOverlayState.moveMeters) {
        saleOverlayRefresh(center);
      }
    };

    viewer.camera.changed.addEventListener(handler);
    saleOverlayState.cameraHandler = handler;

    const initialCenter = saleOverlayGetCameraLatLon();
    if (initialCenter) {
      saleOverlayRefresh(initialCenter);
    }
  }

  function saleOverlayStopWatching() {
    const viewer = saleOverlayGetViewer();
    if (viewer && saleOverlayState.cameraHandler && viewer.camera && viewer.camera.changed) {
      try {
        viewer.camera.changed.removeEventListener(saleOverlayState.cameraHandler);
      } catch (_) {}
    }
    saleOverlayState.cameraHandler = null;
    saleOverlayState.lastCenter = null;
    saleOverlayClearMarkers();
  }

  function setupSaleOverlayControls() {
    if (!menuContent) return;
    if (document.getElementById('saleOverlayControls')) return;

    const wrap = document.createElement('div');
    wrap.id = 'saleOverlayControls';
    wrap.style.marginTop = '10px';
    wrap.style.paddingTop = '6px';
    wrap.style.borderTop = '1px solid rgba(148, 163, 184, 0.4)';
    wrap.innerHTML = `
      <div style="font-weight:600; font-size:13px; margin-bottom:4px;">
        Map options
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; font-size:12px;">
        <label style="display:flex;align-items:center;gap:4px;">
          <input type="checkbox" id="saleShowListings">
          <span>Show sale listings</span>
        </label>
        <label style="display:flex;align-items:center;gap:4px;">
          <span>Radius (km)</span>
          <input type="number" id="saleRadiusKm" min="0.1" step="0.1" value="5"
                 style="width:70px;" class="input">
        </label>
        <label style="display:flex;align-items:center;gap:4px;">
          <span>Refresh after move (m)</span>
          <input type="number" id="saleMoveMeters" min="10" step="10" value="200"
                 style="width:80px;" class="input">
        </label>
      </div>

      <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; font-size:12px; margin-top:10px;">
        <label style="display:flex;align-items:center;gap:4px;">
          <input type="checkbox" id="saleShowSold">
          <span>Recently sold label</span>
        </label>
        <label style="display:flex;align-items:center;gap:4px;">
          <span>Last</span>
          <input type="number" id="saleLastDays" min="1" step="1" value="14"
                 style="width:60px;" class="input">
          <span>days</span>
        </label>
      </div>
    `;

    menuContent.appendChild(wrap);

    const chkListings = document.getElementById('saleShowListings');
    const rad        = document.getElementById('saleRadiusKm');
    const move       = document.getElementById('saleMoveMeters');
    const chkSold    = document.getElementById('saleShowSold');
    const daysInput  = document.getElementById('saleLastDays');

    function applyInputs() {
      const r = rad ? Number(rad.value) : NaN;
      const m = move ? Number(move.value) : NaN;
      const d = daysInput ? Number(daysInput.value) : NaN;

      saleOverlayState.radiusKm   = Number.isFinite(r) && r > 0 ? r : 5;
      saleOverlayState.moveMeters = Number.isFinite(m) && m > 0 ? m : 200;
      saleOverlayState.soldDays   = Number.isFinite(d) && d >= 1 ? d : 14;

      if (rad)       rad.value      = String(saleOverlayState.radiusKm);
      if (move)      move.value     = String(saleOverlayState.moveMeters);
      if (daysInput) daysInput.value= String(saleOverlayState.soldDays);

      saleOverlayState.showListings = !!(chkListings && chkListings.checked);
      saleOverlayState.showSold     = !!(chkSold && chkSold.checked);
    }

    function recomputeEnabled() {
      const anyOn = saleOverlayState.showListings || saleOverlayState.showSold;
      if (anyOn && !saleOverlayState.enabled) {
        saleOverlayState.enabled = true;
        saleOverlayStartWatching();
      } else if (!anyOn && saleOverlayState.enabled) {
        saleOverlayState.enabled = false;
        saleOverlayStopWatching();
      } else if (saleOverlayState.enabled) {
        // zmiana parametrów przy włączonym overlayu
        saleOverlayRefresh();
      }
    }

    applyInputs();

    if (rad) {
      rad.addEventListener('change', () => {
        applyInputs();
        if (saleOverlayState.enabled) {
          saleOverlayRefresh();
        }
      });
    }

    if (move) {
      move.addEventListener('change', () => {
        applyInputs();
      });
    }

    if (daysInput) {
      daysInput.addEventListener('change', () => {
        applyInputs();
        if (saleOverlayState.enabled && saleOverlayState.showSold) {
          saleOverlayRefresh();
        }
      });
    }

    if (chkListings) {
      chkListings.addEventListener('change', () => {
        applyInputs();
        recomputeEnabled();
      });
    }

    if (chkSold) {
      chkSold.addEventListener('change', () => {
        applyInputs();
        recomputeEnabled();
      });
    }
  }

  // Zainicjalizuj blok w menu, gdy DOM jest gotowy
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupSaleOverlayControls);
    } else {
      setupSaleOverlayControls();
    }
  }


  // --- Router klików po data-action (dla całego menu)
  if (menuContent) menuContent.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;

    const action   = el.dataset.action;
    const appTitle = document.getElementById('appPanelTitle');
    const appBody  = document.getElementById('appPanelBody');
    const appPanelEl = document.getElementById('appPanel');
    if (appPanelEl) appPanelEl.classList.remove('panel-homes-70');
    switch (action) {
       case 'homes': {
        // Otwórz panel po lewej
        openAppPanel('appPanel', { dockLeft: true });
        const panel = document.getElementById('appPanel');
        if (!panel) return;

        panel.setAttribute('data-panel', 'homes');
        panel.classList.add('dock-left', 'is-open');
        panel.classList.remove('msgx-medium', 'msgx-wide');

        // wyczyść poprzednie inline style
        panel.removeAttribute('style');

        // ustaw tytuł
        const appTitleEl = document.getElementById('appPanelTitle');
        if (appTitleEl) {
          appTitleEl.textContent = 'My Real Estate';
          appTitleEl.style.display = 'block';
          const headerEl = appTitleEl.closest('.panel-header');
          
        }

        // body panelu
        const bodyEl = document.getElementById('appPanelBody');
        if (bodyEl) {
          bodyEl.innerHTML = `
            <div id="homesWrap" class="homes-wrap">Loading...</div>
          `;
        }
        ;(async () => {
          try {
            const r = await fetch('/api/houses/owned/', {
              method: 'GET',
              credentials: 'same-origin',
              headers: { 'Accept': 'application/json' }
            });

            const raw = await r.json().catch(() => null);
            if (!r.ok || !raw) throw new Error('Błąd pobierania');

            // Rozpoznaj gdzie jest tablica domów
            let houses;
            if (Array.isArray(raw)) {
              houses = raw;
            } else if (Array.isArray(raw.houses)) {
              houses = raw.houses;
            } else if (Array.isArray(raw.results)) {
              houses = raw.results;
            } else if (Array.isArray(raw.items)) {
              houses = raw.items;
            } else if (raw && typeof raw === 'object') {
              // weź pierwszą tablicę z obiektu
              const key = Object.keys(raw).find(k => Array.isArray(raw[k]));
              houses = key ? raw[key] : [];
            } else {
              houses = [];
            }

            // cache do flyToHouse
            window.__homesCache = houses;
            if (typeof window.updateHomesMarkers === 'function') {
              window.updateHomesMarkers(houses);
            }
            // zbuduj wiersze: Name(+Address) | Actions
            const rows = houses.map(h => {
              const idFme = (h.id_fme ?? h.id ?? '').toString();
              const uuid  = (h.id ?? '').toString();           // UUID House z backendu
              const id    = idFme;

              const nm   = (h.name   ?? '').toString();
              const adr  = (h.address?? '').toString();
              const lat  = h.lat ?? '';
              const lon  = h.lon ?? '';
              const ht   = h.height ?? '';

              const totalShares   = Number.isFinite(h.total_shares) ? h.total_shares : (h.total_shares || 1);
              const listingShares = (h.listing_shares != null ? h.listing_shares : null);
              const isFractional  = totalShares > 1;

              const myShares      = Number.isFinite(h.my_shares) ? h.my_shares : (h.my_shares || 0);
              const canSplit      = !!h.can_split_direct;

              const limitShares   = (h.max_avail_total_shares !== null && h.max_avail_total_shares !== undefined)
                ? h.max_avail_total_shares
                : null;

              const split = h.split_proposal || null;
              const splitInfo = split && split.status === 'open' ? split : null;

              const isInitiator = !!(
                splitInfo &&
                window.currentUserId &&
                String(splitInfo.initiator_id) === String(window.currentUserId)
              );

              const proposeSplitBtn =
                (!splitInfo && !canSplit && myShares > 0 && totalShares > 1)
                  ? `<button class="btn btn-split-propose" data-uuid="${uuid}">Propose split</button>`
                  : ``;

              const yesPct = splitInfo && typeof splitInfo.yes_percent === 'number'
                ? splitInfo.yes_percent
                : (splitInfo?.yes_percent ?? 0);

              const noPct = splitInfo && typeof splitInfo.no_percent === 'number'
                ? splitInfo.no_percent
                : (splitInfo?.no_percent ?? null);

              const voteLabel = (splitInfo && splitInfo.my_vote)
                ? `(Your vote: ${splitInfo.my_vote.toUpperCase()})`
                : ``;

              const actionsHtml = splitInfo
                ? (
                    isInitiator
                      // inicjator tylko kasuje request
                      ? `<button class="btn btn-split-cancel" data-proposal-id="${splitInfo.id}">Cancel split request</button>`
                      // pozostali głosują YES/NO
                      : `
                          <button class="btn btn-split-yes" data-proposal-id="${splitInfo.id}">Yes</button>
                          <button class="btn btn-split-no"  data-proposal-id="${splitInfo.id}">No</button>
                        `
                  )
                : ``;

              const splitProposalBlock = splitInfo ? `
                <div class="split-proposal" data-proposal-id="${splitInfo.id}">
                  <div class="split-proposal-info">
                    Split to ${splitInfo.requested_total_shares} shares,
                    YES: ${yesPct}%${noPct != null ? `, NO: ${noPct}%` : ``}
                    ${voteLabel}
                  </div>
                  <div class="split-proposal-actions">
                    ${actionsHtml}
                  </div>
                </div>
              ` : ``;


              const soldDaysBackInput = document.getElementById('soldDaysBack');
              const showSoldLabel = document.getElementById('showSoldLabel');

              const soldDate = h.sold_at ? new Date(h.sold_at) : null;
              const now = new Date();
              const daysAgo = soldDate ? (now - soldDate) / (1000 * 60 * 60 * 24) : null;
              const showLabel = soldDate && showSoldLabel?.checked && daysAgo <= Number(soldDaysBackInput?.value || 14);

              const soldLabelHtml = showLabel
                ? `<div class="sold-label">SOLD</div>`
                : '';


              // cena z backendu
              const price = (h.listing_price !== null && h.listing_price !== undefined)
                ? h.listing_price
                : null;


              const listedLabel = (price !== null)
                ? (
                    isFractional
                      ? `<span class="listed-label">Listed ${listingShares ?? '?'} shares for $${price}</span>`
                      : `<span class="listed-label">Listed for $${price}</span>`
                  )
                : '';

              const sellBlock = h.listed
                ? `
                    <button class="btn btn-cancel" data-id="${id}" style="background:#ef4444">Cancel listing</button>
                    <button class="btn btn-edit"   data-id="${id}" style="background:#2563eb">Edit price</button>
                    ${listedLabel}
                  `
                : `<button class="btn btn-sell" data-id="${id}">Sell</button>`;

              const chatBtn = h.has_chat
                ? `<button class="btn btn-chat" data-id="${id}">Open chat</button>`
                : ``;

              const offersSummary = (
                typeof h.offers_count === 'number' &&
                h.offers_count > 1 &&
                h.highest_offer != null
              )
                ? `
                    <div class="offers-summary">
                      Offers: <strong>${h.offers_count}</strong>,
                      Highest offer: <strong>${h.highest_offer}</strong>
                    </div>
                  `
                : ``;

              const offersBlock = (h.buyer_offer != null && h.conv_id)
                ? `
                    <div class="deal-row" data-conv="${h.conv_id}">
                      <span>Buyer’s offer: <strong>${h.buyer_offer}</strong></span>
                      <button class="btn btn-accept" data-conv="${h.conv_id}" style="background:#22c55e">Accept offer</button>
                      <span style="margin-left:8px">Your offer:</span>
                      <input class="input js-offer" type="number" min="0" placeholder="${h.your_offer ?? ''}" style="width:110px">
                      <button class="btn btn-send-offer" data-conv="${h.conv_id}">Send offer</button>
                    </div>
                  `
                : ``;

              const splitBtn = canSplit
                ? `<button class="btn btn-split-shares" data-uuid="${uuid}">Split</button>`
                : ``;

              return `
                <tr data-id="${id}"
                    data-uuid="${uuid}"
                    data-lat="${lat}"
                    data-lon="${lon}"
                    data-h="${ht}"
                    data-total-shares="${totalShares}"
                    data-listing-shares="${listingShares ?? ''}">
                  <td class="col-name">
                    ${soldLabelHtml}
                    <div class="name-wrap">
                      <div class="prop-name">${nm || id}</div>
                      ${adr ? `<div class="prop-addr">${adr}</div>` : ``}
                      <div class="prop-meta">
                        Shares: ${totalShares}${limitShares != null ? `, Limit: ${limitShares}` : ``}
                      </div>
                    </div>
                  </td>
                  <td class="actions-cell" style="padding:6px 8px; border-bottom:1px solid var(--border)">
                    ${sellBlock}
                    ${splitBtn}
                    ${proposeSplitBtn}
                    <button class="btn btn-goto" data-id="${id}">Go to</button>
                    ${chatBtn}
                    ${offersSummary}
                    ${splitProposalBlock}
                    ${offersBlock}
                  </td>
                </tr>`;
            }).join('');

            // ... (reszta kodu zostaje bez zmian)


            const table = `
              <div class="sold-controls" style="margin-bottom:8px;display:flex;align-items:center;gap:8px;">
                <label style="display:flex;align-items:center;gap:4px;font-size:13px;">
                  <input type="checkbox" id="showSoldLabel">
                  <span>Sold label</span>
                </label>
                <label style="display:flex;align-items:center;gap:4px;font-size:13px;">
                  <span>Last</span>
                  <input type="number" id="soldDaysBack" min="1" value="14" style="width:60px;" class="input">
                  <span>days</span>
                </label>
              </div>
              <table id="homesTable" class="homes-table">
                <colgroup>
                  <col class="col-name-col">
                  <col class="actions-col">
                </colgroup>
                <tbody>${rows}</tbody>
              </table>`;

            const wrap = document.getElementById('homesWrap');
            if (wrap) wrap.innerHTML = table;

            document.getElementById('showSoldLabel')?.addEventListener('change', () => {
              const btn = document.querySelector('[data-action="homes"]');
              if (btn) btn.click(); // przeładuj panel
            });
            document.getElementById('soldDaysBack')?.addEventListener('change', () => {
              const btn = document.querySelector('[data-action="homes"]');
              if (btn) btn.click(); // przeładuj panel
            });

            const homesWrap = document.getElementById('homesWrap');
            if (homesWrap && !homesWrap.__bound) {
              homesWrap.__bound = true;
              homesWrap.addEventListener('click', async (e) => {
                const sell      = e.target.closest('.btn-sell');
                const go        = e.target.closest('.btn-goto');
                const cancel    = e.target.closest('.btn.btn-cancel');
                const edit      = e.target.closest('.btn.btn-edit');
                const chat      = e.target.closest('.btn.btn-chat');
                const accept    = e.target.closest('.btn.btn-accept');
                const sendOffer = e.target.closest('.btn.btn-send-offer');
                const splitShares = e.target.closest('.btn-split-shares');
                const proposeSplit = e.target.closest('.btn-split-propose');
                const splitYes     = e.target.closest('.btn-split-yes');
                const splitNo      = e.target.closest('.btn-split-no');
                const splitCancel  = e.target.closest('.btn-split-cancel');

                // Split shares (bez głosowania, gdy >50%)
                if (splitShares) {
                  const btn  = splitShares;
                  const row  = btn.closest('tr');
                  const uuid = btn.dataset.uuid || row?.dataset.uuid;
                  const totalShares = row ? Number(row.dataset.totalShares || 1) : 1;

                  if (!uuid) {
                    alert('Missing house UUID.');
                    return;
                  }

                  const raw = prompt(`New total number of shares (current: ${totalShares}).\nIt must be a multiple of ${totalShares} (2x, 5x, etc).`);
                  if (!raw) return;

                  const val = Number(String(raw).trim());
                  if (!Number.isFinite(val) || val <= totalShares) {
                    alert('Value must be an integer greater than current total.');
                    return;
                  }
                  if (val % totalShares !== 0) {
                    alert(`New total must be a multiple of current total (${totalShares}).`);
                    return;
                  }

                  // helper do split_direct
                  async function callSplitDirect() {
                    const r = await fetch(`/api/houses/${encodeURIComponent(uuid)}/split_direct/`, {
                      method: 'POST',
                      headers: {
                        'X-CSRFToken': getCookie('csrftoken'),
                        'Content-Type': 'application/json'
                      },
                      credentials: 'same-origin',
                      body: JSON.stringify({ total_shares: val })
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || !j.ok) {
                      return { ok: false, code: j.error || 'Split failed', data: j };
                    }
                    return { ok: true, data: j };
                  }

                  try {
                    // 1. pierwsza próba splitu
                    const first = await callSplitDirect();
                    if (!first.ok) {
                      const code = first.code;
                      const j    = first.data || {};

                      if (code === 'LIMIT_TOO_LOW') {
                        const cur = j.current_limit ?? null;
                        const msg = cur != null
                          ? `Split limit too low (max: ${cur}).\nSend request to increase limit to ${val}?`
                          : `Split limit too low.\nSend request to increase limit to ${val}?`;

                        if (!confirm(msg)) return;

                        // 2. wysyłamy request do WIELKIEGO ADMINA – BEZ automatycznego podnoszenia limitu
                        try {
                          const r2 = await fetch(`/api/houses/${encodeURIComponent(uuid)}/split_limit/request/`, {
                            method: 'POST',
                            headers: {
                              'X-CSRFToken': getCookie('csrftoken'),
                              'Content-Type': 'application/json'
                            },
                            credentials: 'same-origin',
                            body: JSON.stringify({ requested_max_shares: val })
                          });
                          const j2 = await r2.json().catch(() => ({}));

                          if (!r2.ok || !j2.ok) {
                            if (j2.error === 'LIMIT_REQUEST_EXISTS') {
                              const who = j2.requested_by_username || 'another user';
                              alert(`There is already a pending limit request for this house, submitted by ${who}.`);
                            } else {
                              alert(j2.error || 'Limit request failed');
                            }
                            return;
                          }

                          // OK: request zapisany jako 'pending' – admin musi ręcznie zmienić limit
                          const who = j2.requested_by_username || 'you';
                          alert(`Limit request sent to admin (by ${who}). When they approve and raise the limit, try the split again.`);
                          return;
                        } catch (err2) {
                          alert(err2.message || 'Limit request failed');
                          return;
                        }
                      } else if (code === 'NEED_VOTING') {
                        alert(`You have only ${j.my_percent ?? '?'}% of this house – voting required (not implemented yet).`);
                      } else if (code === 'NEW_TOTAL_MUST_BE_MULTIPLE_OF_OLD') {
                        alert('New total must be a multiple of current total.');
                      } else if (code === 'OVER_MAX_LIMIT') {
                        // na wszelki wypadek, gdyby przeszło z _apply_house_split_atomic
                        alert('Split above max_avail_total_shares is not allowed. Contact support.');
                      } else {
                        alert(code);
                      }
                      return;
                    }

                    // sukces za pierwszym razem (mieści się w limicie)
                    toast('Shares updated');
                    const homesBtn = document.querySelector('[data-action="homes"]');
                    if (homesBtn) homesBtn.click();
                  } catch (err) {
                    alert(err.message || 'Split failed');
                  }
                  return;
                }


                // Propose split (głosowanie, gdy masz <= 50% udziałów)
                if (proposeSplit) {
                  const btn  = proposeSplit;
                  const row  = btn.closest('tr');
                  const uuid = btn.dataset.uuid || row?.dataset.uuid;
                  const totalShares = row ? Number(row.dataset.totalShares || 1) : 1;

                  if (!uuid) {
                    alert('Missing house UUID.');
                    return;
                  }

                  const raw = prompt(
                    `Proposed new total number of shares (current: ${totalShares}).\n` +
                    `It must be a multiple of ${totalShares}.`
                  );
                  if (!raw) return;

                  const val = Number(String(raw).trim());
                  if (!Number.isFinite(val) || val <= totalShares) {
                    alert('Value must be an integer greater than current total.');
                    return;
                  }
                  if (val % totalShares !== 0) {
                    alert(`New total must be a multiple of current total (${totalShares}).`);
                    return;
                  }

                  try {
                    const r = await fetch(`/api/houses/${encodeURIComponent(uuid)}/split_proposals/`, {
                      method: 'POST',
                      headers: {
                        'X-CSRFToken': getCookie('csrftoken'),
                        'Content-Type': 'application/json',
                      },
                      credentials: 'same-origin',
                      body: JSON.stringify({ total_shares: val }),
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || !j.ok) {
                      const code = j.error || 'Split proposal failed';
                    if (code === 'LIMIT_TOO_LOW') {
                      const cur = j.current_limit ?? null;
                      const msg = cur != null
                        ? `Split limit too low (max: ${cur}).\nSend request to increase limit to ${val}?`
                        : `Split limit too low.\nSend request to increase limit to ${val}?`;

                      if (!confirm(msg)) return;

                      // wysyłamy request do WIELKIEGO ADMINA – BEZ automatycznego podnoszenia limitu
                      try {
                        const r2 = await fetch(`/api/houses/${encodeURIComponent(uuid)}/split_limit/request/`, {
                          method: 'POST',
                          headers: {
                            'X-CSRFToken': getCookie('csrftoken'),
                            'Content-Type': 'application/json'
                          },
                          credentials: 'same-origin',
                          body: JSON.stringify({ requested_max_shares: val })
                        });
                        const j2 = await r2.json().catch(() => ({}));

                        if (!r2.ok || !j2.ok) {
                          if (j2.error === 'LIMIT_REQUEST_EXISTS') {
                            const who = j2.requested_by_username || 'another user';
                            alert(`There is already a pending limit request for this house, submitted by ${who}.`);
                          } else {
                            alert(j2.error || 'Limit request failed');
                          }
                          return;
                        }

                        const who = j2.requested_by_username || 'you';
                        alert(`Limit request sent to admin (by ${who}). When they approve and raise the limit, try the split vote again.`);
                        return;
                      } catch (err2) {
                        alert(err2.message || 'Limit request failed');
                        return;
                      }
                    } else if (code === 'USE_DIRECT_SPLIT') {
                      alert('You have more than 50% of this house. Use direct Split instead.');
                    } else if (code === 'PROPOSAL_ALREADY_OPEN') {
                      alert('There is already an open split vote for this house.');
                    } else {
                      alert(code);
                    }
                    return;

                    }
                    toast('Split proposal created');
                    const homesBtn = document.querySelector('[data-action="homes"]');
                    if (homesBtn) homesBtn.click();
                  } catch (err) {
                    alert(err.message || 'Split proposal failed');
                  }
                  return;
                }

                // Głos YES / NO w głosowaniu split
                if (splitYes || splitNo) {
                  const btn = splitYes || splitNo;
                  const propId =
                    btn.dataset.proposalId ||
                    btn.closest('.split-proposal')?.dataset.proposalId;

                  if (!propId) {
                    alert('Missing proposal id.');
                    return;
                  }

                  const vote = splitYes ? 'yes' : 'no';

                  try {
                    const r = await fetch(`/api/split_proposals/${encodeURIComponent(propId)}/vote/`, {
                      method: 'POST',
                      headers: {
                        'X-CSRFToken': getCookie('csrftoken'),
                        'Content-Type': 'application/json',
                      },
                      credentials: 'same-origin',
                      body: JSON.stringify({ vote }),
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || !j.ok) {
                      const code = j.error || 'Vote failed';
                      if (code === 'LIMIT_TOO_LOW') {
                        alert(`Split limit too low (max: ${j.current_limit ?? 'n/a'}).`);
                      } else if (code === 'PROPOSAL_NOT_OPEN') {
                        alert('This split proposal is no longer open.');
                      } else if (code === 'NOT_OWNER') {
                        alert('Only co-owners can vote.');
                      } else {
                        alert(code);
                      }
                      return;
                    }

                    if (j.status === 'applied' || j.new_total_shares != null) {
                      toast('Split applied');
                    } else {
                      toast('Vote saved');
                    }
                    const homesBtn = document.querySelector('[data-action="homes"]');
                    if (homesBtn) homesBtn.click();
                  } catch (err) {
                    alert(err.message || 'Vote failed');
                  }
                  return;
                }

                // Cancel split proposal (tylko inicjator)
                if (splitCancel) {
                  const btn = splitCancel;
                  const propId =
                    btn.dataset.proposalId ||
                    btn.closest('.split-proposal')?.dataset.proposalId;

                  if (!propId) {
                    alert('Missing proposal id.');
                    return;
                  }

                  if (!confirm('Cancel this split vote?')) return;

                  try {
                    const r = await fetch(`/api/split_proposals/${encodeURIComponent(propId)}/cancel/`, {
                      method: 'POST',
                      headers: {
                        'X-CSRFToken': getCookie('csrftoken'),
                      },
                      credentials: 'same-origin',
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || !j.ok) {
                      const code = j.error || 'Cancel failed';
                      if (code === 'NOT_INITIATOR') {
                        alert('Only the user who started this vote can cancel it.');
                      } else {
                        alert(code);
                      }
                      return;
                    }
                    toast('Split vote cancelled');
                    const homesBtn = document.querySelector('[data-action="homes"]');
                    if (homesBtn) homesBtn.click();
                  } catch (err) {
                    alert(err.message || 'Cancel failed');
                  }
                  return;
                }


                // Cancel listing
                if (cancel) {
                  const id = cancel.dataset.id;
                  if (!confirm('Cancel this listing?')) return;
                  try {
                    const r = await fetch(`/api/house/${encodeURIComponent(id)}/unlist/`, {
                      method: 'POST',
                      headers: { 'X-CSRFToken': getCookie('csrftoken') },
                      credentials: 'same-origin'
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || !j.ok) throw new Error(j.error || 'Cancel failed');
                    toast('Listing canceled');

                    const cell = cancel.parentElement;
                    cell.querySelectorAll('.btn-cancel,.btn-edit,.listed-label').forEach(b => b.remove());

                    const sellBtn = document.createElement('button');
                    sellBtn.className = 'btn btn-sell';
                    sellBtn.dataset.id = id;
                    sellBtn.textContent = 'Sell';
                    const gotoBtn = cell.querySelector('.btn-goto');
                    cell.insertBefore(sellBtn, gotoBtn);
                  } catch (err) {
                    alert(err.message || 'Cancel failed');
                  }
                  return;
                }

                // Edit price
                if (edit) {
                  const id  = edit.dataset.id;
                  const row = edit.closest('tr');
                  const totalShares   = row ? Number(row.dataset.totalShares || 1) : 1;
                  const listingShares = row && row.dataset.listingShares
                    ? Number(row.dataset.listingShares)
                    : null;
                  const isFractional = Number.isFinite(totalShares) && totalShares > 1;

                  const rawPrice = prompt('New price ($):');
                  if (!rawPrice) return;
                  const price = String(rawPrice).trim();
                  if (!price) return;
                  try {
                    const r = await fetch(`/api/house/${encodeURIComponent(id)}/list/`, {
                      method: 'POST',
                      headers: {
                        'X-CSRFToken': getCookie('csrftoken'),
                        'Content-Type': 'application/x-www-form-urlencoded'
                      },
                      credentials: 'same-origin',
                      body: new URLSearchParams({ price })  // tylko cena; share_count zostaje jak było
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || !j.ok) throw new Error(j.error || 'Update failed');
                    toast('Price updated');

                    // zaktualizuj label
                    const cell = edit.parentElement;
                    if (cell) {
                      let label = cell.querySelector('.listed-label');
                      if (!label) {
                        label = document.createElement('span');
                        label.className = 'listed-label';
                        const gotoBtn = cell.querySelector('.btn-goto');
                        if (gotoBtn) {
                          cell.insertBefore(label, gotoBtn);
                        } else {
                          cell.appendChild(label);
                        }
                      }
                      if (isFractional && Number.isFinite(listingShares)) {
                        label.textContent = `Listed ${listingShares} shares for $${price}`;
                      } else {
                        label.textContent = `Listed for $${price}`;
                      }
                    }
                  } catch (err) {
                    alert(err.message || 'Update failed');
                  }
                  return;
                }

                // Open chat
                if (chat) {
                  window.__lastPickedIdFME = chat.dataset.id;
                  openMessagesPanel();
                  return;
                }

                // Accept offer
                if (accept) {
                  const conv = accept.dataset.conv;
                  if (!conv) return;
                  try {
                    const r = await fetch(`/api/messages/${encodeURIComponent(conv)}/accept/`, {
                      method: 'POST',
                      headers: { 'X-CSRFToken': getCookie('csrftoken') },
                      credentials: 'same-origin'
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || !j.ok) throw new Error(j.error || 'Accept failed');
                    toast('Offer accepted');
                  } catch (err) {
                    alert(err.message || 'Accept failed');
                  }
                  return;
                }

                // Send offer / counter
                if (sendOffer) {
                  const conv = sendOffer.dataset.conv;
                  if (!conv) return;
                  const row  = sendOffer.closest('.deal-row');
                  const priceEl = row && row.querySelector('.js-offer');
                  const price   = priceEl && priceEl.value.trim();
                  if (!price) { alert('Enter your price'); return; }

                  try {
                    const r = await fetch(`/api/messages/${encodeURIComponent(conv)}/offer/`, {
                      method: 'POST',
                      headers: { 'X-CSRFToken': getCookie('csrftoken'), 'Content-Type': 'application/x-www-form-urlencoded' },
                      credentials: 'same-origin',
                      body: new URLSearchParams({ price })
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || !j.ok) throw new Error(j.error || 'Send failed');
                    toast('Offer sent');
                  } catch (err) {
                    alert(err.message || 'Send failed');
                  }
                  return;
                }

                // Sell (wystaw)
                if (sell) {
                  const id  = sell.dataset.id;
                  const row = sell.closest('tr');
                  const totalShares = row ? Number(row.dataset.totalShares || 1) : 1;
                  const isFractional = Number.isFinite(totalShares) && totalShares > 1;

                  let shareCount = null;

                  if (isFractional) {
                    const rawShares = prompt(`How many shares do you want to sell? (1–${totalShares})`);
                    if (!rawShares) return;
                    shareCount = Number(String(rawShares).trim());
                    if (!Number.isFinite(shareCount) || shareCount < 1 || shareCount > totalShares) {
                      alert('Invalid number of shares');
                      return;
                    }
                  }

                  const rawPrice = prompt(isFractional ? 'Enter total price for these shares ($):' : 'Enter price ($):');
                  if (!rawPrice) return;
                  const price = String(rawPrice).trim();
                  if (!price) return;

                  try {
                    const params = new URLSearchParams({ price });
                    if (isFractional && shareCount != null) {
                      params.append('share_count', String(shareCount));
                    }

                    const r = await fetch(`/api/house/${encodeURIComponent(id)}/list/`, {
                      method: 'POST',
                      headers: {
                        'X-CSRFToken': getCookie('csrftoken'),
                        'Content-Type': 'application/x-www-form-urlencoded'
                      },
                      credentials: 'same-origin',
                      body: params
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || !j.ok) throw new Error(j.error || 'Listing failed');
                    toast('Listed');

                    // od razu zmień UI na: Cancel + Edit + Listed ...
                    const cell = sell.parentElement;
                    if (cell) {
                      const gotoBtn = cell.querySelector('.btn-goto');
                      // usuń "Sell"
                      sell.remove();

                      const cancelBtn = document.createElement('button');
                      cancelBtn.className = 'btn btn-cancel';
                      cancelBtn.dataset.id = id;
                      cancelBtn.textContent = 'Cancel listing';
                      cancelBtn.style.background = '#ef4444';

                      const editBtn = document.createElement('button');
                      editBtn.className = 'btn btn-edit';
                      editBtn.dataset.id = id;
                      editBtn.textContent = 'Edit price';
                      editBtn.style.background = '#2563eb';

                      const label = document.createElement('span');
                      label.className = 'listed-label';
                      if (isFractional && shareCount != null) {
                        label.textContent = `Listed ${shareCount} shares for $${price}`;
                        if (row) row.dataset.listingShares = String(shareCount);
                      } else {
                        label.textContent = `Listed for $${price}`;
                      }

                      if (gotoBtn) {
                        cell.insertBefore(cancelBtn, gotoBtn);
                        cell.insertBefore(editBtn, gotoBtn);
                        cell.insertBefore(label, gotoBtn);
                      } else {
                        cell.appendChild(cancelBtn);
                        cell.appendChild(editBtn);
                        cell.appendChild(label);
                      }
                    }
                  } catch (err) {
                    alert(err.message || 'Listing failed');
                  }
                  return;
                }



                // Go to (kamera) – zawsze przez jedną funkcję flyToHouseLatLon
                if (go) {
                  const id = go.dataset.id;
                  if (id && typeof window.flyToHouseLatLon === 'function') {
                    window.flyToHouseLatLon(id, { pitchDeg: -35 });
                  }
                  return;
                }

              });
            }

            // Włącz resize poziomy i pionowy dla panelu z domami
            enableResize(panel, {
              axis: 'x',
              min: 320,
              max: null,
              storeKey: 'homes_width'
            });
            
            enableResize(panel, {
              axis: 'y',
              min: 260,
              max: null,
              storeKey: 'homes_height'
            });
            
          } catch (err) {
            console.error('[homes] error:', err);
            const wrap = document.getElementById('homesWrap');
            if (wrap) wrap.textContent = 'Błąd pobierania listy domów.';
          }
        })();

        return;
      }

    case 'friends': {
      // Otwórz panel po lewej, jak homes/messages
      openAppPanel('appPanel', { dockLeft: true });

      const panel  = document.getElementById('appPanel');
      const titleEl = document.getElementById('appPanelTitle');
      const bodyEl  = document.getElementById('appPanelBody');
      if (!panel || !bodyEl) return;

      panel.setAttribute('data-panel', 'friends');
      panel.classList.add('dock-left', 'is-open');
      panel.classList.remove('msgx-medium', 'msgx-wide');

      // wyczyść stare inline-style (po innych panelach)
      panel.style.height = '';
      panel.style.width  = '';

      if (titleEl) {
        titleEl.textContent = 'Friends';
        titleEl.style.display = 'block';
      }

      bodyEl.innerHTML = `
        <div id="friendsWrap" class="friends-wrap" style="padding:6px; font-size:13px;">
          Loading friends...
        </div>
      `;

      (async () => {
        const wrap = document.getElementById('friendsWrap');
        if (!wrap) return;

        try {
          const res = await fetch('/api/chat/friends/', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
          });
          const data = await res.json().catch(() => ({}));

          if (!res.ok || !data.ok) {
            wrap.textContent = data.error || 'Error loading friends.';
            return;
          }

          const list = Array.isArray(data.friends) ? data.friends : [];
          if (!list.length) {
            wrap.textContent = 'You have no friends yet.';
            return;
          }

          const rows = list.map(u => {
            const id    = u.id;
            const name  = u.username || (`User ${id}`);
            const email = u.email || '';

            return `
              <div class="friend-row"
                   data-user-id="${id}"
                   data-user-name="${name}"
                   style="display:flex;align-items:center;justify-content:space-between;
                          padding:4px 0;border-bottom:1px solid rgba(148,163,184,0.3);">
                <div>
                  <div style="font-weight:600;">${name}</div>
                  ${email ? `<div style="font-size:11px;opacity:0.7;">${email}</div>` : ''}
                </div>
                <div style="display:flex;gap:4px;">
                  <button type="button"
                          class="btn btn-friend-chat"
                          data-user-id="${id}"
                          data-user-name="${name}"
                          style="padding:2px 6px;font-size:11px;">
                    Chat
                  </button>
                  <button type="button"
                          class="btn btn-friend-remove"
                          data-user-id="${id}"
                          style="padding:2px 6px;font-size:11px;background:#ef4444;">
                    Remove
                  </button>
                </div>
              </div>
            `;
          }).join('');

          wrap.innerHTML = rows;

          // jednokrotne podpięcie handlera kliknięć
          if (!wrap.__bound) {
            wrap.__bound = true;
            wrap.addEventListener('click', async (ev) => {
              const chatBtn   = ev.target.closest('.btn-friend-chat');
              const removeBtn = ev.target.closest('.btn-friend-remove');

              // Chat with friend
              // Chat with friend
              if (chatBtn) {
                const uid   = chatBtn.dataset.userId;
                const uname = chatBtn.dataset.userName || `User ${uid}`;

                if (typeof window.openChatWithUser === 'function') {
                  window.openChatWithUser(uid, uname);
                } else if (typeof window.openChatPanel === 'function') {
                  window.openChatPanel('conversations', { userId: uid, userName: uname });
                } else if (window.toast) {
                  window.toast('Chat panel not ready');
                } else {
                  alert('Chat panel not ready');
                }
                return;
              }

              // Remove friend
              if (removeBtn) {
                const uid = removeBtn.dataset.userId;
                if (!uid) return;
                if (!confirm('Remove this friend?')) return;

                try {
                  const csrf = window.getCookie ? window.getCookie('csrftoken') : null;
                  const r2 = await fetch('/api/chat/friends/remove/', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                      'Content-Type': 'application/x-www-form-urlencoded',
                      ...(csrf ? { 'X-CSRFToken': csrf } : {}),
                    },
                    body: new URLSearchParams({ user_id: String(uid) }),
                  });
                  const j2 = await r2.json().catch(() => ({}));
                  if (!r2.ok || !j2.ok) {
                    const msg = j2.error || 'Remove failed';
                    if (window.toast) window.toast(msg);
                    else alert(msg);
                    return;
                  }

                  const row = removeBtn.closest('.friend-row');
                  if (row) row.remove();

                  if (!wrap.querySelector('.friend-row')) {
                    wrap.textContent = 'You have no friends yet.';
                  }

                  if (window.toast) window.toast('Friend removed');
                } catch (err) {
                  const msg = err && err.message ? err.message : 'Remove failed';
                  if (window.toast) window.toast(msg);
                  else alert(msg);
                }
                return;
              }
            });
          }

        } catch (err) {
          const wrap2 = document.getElementById('friendsWrap');
          if (wrap2) {
            wrap2.textContent = err && err.message
              ? err.message
              : 'Error loading friends.';
          }
        }
      })();

      return;
    }

    


      case 'messages': {
        openMessagesPanel();
        return;
      }

      case 'offers': { // Panel ofert sprzedaży
        openAppPanel('offersPanel', { dockLeft: true });
        const panel = document.getElementById('offersPanel');
        if (!panel) return;

        panel.setAttribute('data-panel', 'offers');
        // jeśli masz stare saleBody/auctionBody – możesz je schować, ale panel i tak nadpisze HTML
        const auctionBody = document.getElementById('auctionBody');
        if (auctionBody) auctionBody.style.display = 'none';

        if (typeof window.renderOffersPanel === 'function') {
          window.renderOffersPanel();
        } else {
          toast('Offers panel not loaded');
        }
        return;
      }



      case 'viewpoints': { // Punkty widokowe (jeśli masz)
        openAppPanel('viewpointsPanel', { dockLeft: true }); 
        const vp = document.getElementById('viewpointsPanel'); if (vp) vp.setAttribute('data-panel','viewpoints');
        const vpEl = document.getElementById('viewpointsPanel');
        if (vpEl) vpEl.removeAttribute('style');
        if (typeof renderViewpoints === 'function') renderViewpoints();
        return;
      }

      case 'transactions': {
        // Panel „Twoje transakcje” – niezależny overlay po prawej
        const txPanel = document.getElementById('transactionsPanel');
        if (!txPanel) return;

        // NIE ruszamy appPanel, NIE używamy dock-left
        txPanel.setAttribute('data-panel', 'transactions');
        txPanel.classList.remove('dock-left', 'msgx-medium', 'msgx-wide');
        txPanel.classList.add('is-open');
        txPanel.style.display = 'flex';
        txPanel.style.zIndex = '2000';  // nad appPanel i mapą

        const wrap = txPanel.querySelector('#transactionsWrap');
        if (!wrap) return;

        // lokalny stan...
        const state = { status: 'active', page: 1, pageSize: 20, hasNext: false };

        // prosty formatter daty
        function fmtDate(s) {
          if (!s) return '';
          const d = new Date(s);
          if (Number.isNaN(d.getTime())) return s;
          return d.toLocaleString();
        }

        // szkielety HTML: filtry + paginacja + tabela
        function renderSkeleton() {
          wrap.innerHTML = `
            <div class="tx-controls">
              <div class="tx-filters">
                <button class="btn-ghost tx-tab tx-tab-active" data-status="active">Active</button>
                <button class="btn-ghost tx-tab" data-status="archived">Archived</button>
              </div>
              <div class="tx-pagination">
                <button class="btn-ghost tx-page-prev" disabled>Prev</button>
                <span class="tx-page-label">Page 1</span>
                <button class="btn-ghost tx-page-next" disabled>Next</button>
              </div>
            </div>
            <table class="transactions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>House</th>
                  <th>Role</th>
                  <th>Counterparty</th>
                  <th>Shares</th>
                  <th>Amount</th>
                  <th>% ownership</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody class="tx-tbody">
                <tr><td colspan="9">Loading...</td></tr>
              </tbody>
            </table>
          `;
        }

        // główna funkcja ładowania danych z API
        async function loadTransactions() {
          const tbody     = wrap.querySelector('.tx-tbody');
          const pageLabel = wrap.querySelector('.tx-page-label');
          const prevBtn   = wrap.querySelector('.tx-page-prev');
          const nextBtn   = wrap.querySelector('.tx-page-next');

          if (!tbody) return;

          if (pageLabel) pageLabel.textContent = `Page ${state.page}`;

          try {
            const params = new URLSearchParams();
            if (state.status) params.set('status', state.status);
            params.set('page', String(state.page));

            const r = await fetch(`/api/trades/mine/?${params.toString()}`, {
              method: 'GET',
              credentials: 'same-origin',
              headers: { 'Accept': 'application/json' },
            });
            const data = await r.json().catch(() => []);
            if (!r.ok || !Array.isArray(data)) {
              tbody.innerHTML = `<tr><td colspan="9">Error loading transactions</td></tr>`;
              if (prevBtn) prevBtn.disabled = (state.page <= 1);
              if (nextBtn) nextBtn.disabled = true;
              return;
            }

            state.hasNext = (data.length === state.pageSize);

            if (!data.length) {
              tbody.innerHTML = `<tr><td colspan="9">No transactions.</td></tr>`;
            } else {
              const rowsHtml = data.map(tx => {
                const dateStr = fmtDate(tx.date);
                const houseLabel = (tx.house_name || tx.house_id_fme || '');
                const amountStr = (tx.amount != null ? tx.amount : '');
                const pct = (typeof tx.percent === 'number' && Number.isFinite(tx.percent))
                  ? tx.percent.toFixed(2) + ' %'
                  : (tx.percent != null ? String(tx.percent) + ' %' : '');
                const sharesStr = (tx.shares != null ? tx.shares : '');
                const convBtn = tx.conversation_id
                  ? `<button class="btn btn-tx-thread" data-conv-id="${tx.conversation_id}">Thread</button>`
                  : `<span class="tx-no-thread">–</span>`;
                const gotoBtn = tx.house_id_fme
                  ? `<button class="btn btn-tx-goto" data-id-fme="${tx.house_id_fme}">Go to</button>`
                  : '';

                return `
                  <tr data-id-fme="${tx.house_id_fme || ''}"
                      data-conv-id="${tx.conversation_id || ''}">
                    <td>${dateStr}</td>
                    <td>${houseLabel}</td>
                    <td>${tx.role || ''}</td>
                    <td>${tx.counterparty || ''}</td>
                    <td>${sharesStr}</td>
                    <td>${amountStr}</td>
                    <td>${pct}</td>
                    <td>${tx.status || ''}</td>
                    <td>${convBtn} ${gotoBtn}</td>
                  </tr>
                `;
              }).join('');
              tbody.innerHTML = rowsHtml;
            }

            if (prevBtn) prevBtn.disabled = (state.page <= 1);
            if (nextBtn) nextBtn.disabled = !state.hasNext;
          } catch (err) {
            const msg = (err && err.message) ? err.message : 'Error loading transactions';
            tbody.innerHTML = `<tr><td colspan="9">${msg}</td></tr>`;
            if (prevBtn) prevBtn.disabled = (state.page <= 1);
            if (nextBtn) nextBtn.disabled = true;
          }
        }

        renderSkeleton();
        loadTransactions();

        // podpięcie przycisku Refresh w nagłówku panelu
        const refreshBtn = txPanel.querySelector('#txRefreshBtn');
        if (refreshBtn) {
          refreshBtn.onclick = () => {
            loadTransactions();
          };
        }

        // delegowany handler kliknięć w obrębie panelu transakcji
        if (!wrap.__bound) {
          wrap.__bound = true;
          wrap.addEventListener('click', (e) => {
            const tab = e.target.closest('.tx-tab');
            if (tab) {
              const newStatus = tab.dataset.status || 'active';
              state.status = newStatus;
              state.page = 1;
              // przełącz klasę aktywnego taba
              wrap.querySelectorAll('.tx-tab').forEach(btn => {
                btn.classList.toggle('tx-tab-active', btn === tab);
              });
              loadTransactions();
              return;
            }

            const prevBtn = e.target.closest('.tx-page-prev');
            if (prevBtn && !prevBtn.disabled) {
              state.page = Math.max(1, state.page - 1);
              loadTransactions();
              return;
            }

            const nextBtn = e.target.closest('.tx-page-next');
            if (nextBtn && !nextBtn.disabled) {
              state.page = state.page + 1;
              loadTransactions();
              return;
            }

            const threadBtn = e.target.closest('.btn-tx-thread');
            if (threadBtn) {
              const convId = threadBtn.dataset.convId
                || threadBtn.closest('tr')?.getAttribute('data-conv-id');
              if (convId) {
                window.__openConvId = convId;
                if (typeof openMessagesPanel === 'function') {
                  openMessagesPanel();
                }
              }
              return;
            }

            const gotoBtn = e.target.closest('.btn-tx-goto');
            if (gotoBtn) {
              const idFme = gotoBtn.dataset.idFme
                || gotoBtn.closest('tr')?.getAttribute('data-id-fme');
              if (idFme && typeof window.flyToHouseLatLon === 'function') {
                window.flyToHouseLatLon(idFme, { pitchDeg: -35 });
              }
              return;
            }

          });
        }
 

        return;
      }

      
      case 'admin': {
        // otwórz panel WIELKIEGO ADMINA
        openAppPanel('appPanel', { dockLeft: true });
        const panel = document.getElementById('appPanel');
        if (!panel) return;

        panel.setAttribute('data-panel', 'admin');
        panel.classList.add('dock-left', 'is-open');
        panel.classList.remove('msgx-medium', 'msgx-wide');

        // ustaw tytuł
        // ustaw tytuł – dla admina chowamy standardowy header (boczny)
        if (appTitle) {
          const headerEl = appTitle.closest('.panel-header');
          appTitle.style.display = 'none';
          if (headerEl) {
            headerEl.style.display = 'none';
          }
        }


        // body panelu
        if (appBody) {
          // tło i kolor tekstu, żeby nie był „duchem”
          appBody.style.background = 'rgba(17, 24, 39, 0.96)';
          appBody.style.color = '#f9fafb';
          appBody.style.padding = '8px 8px';

          appBody.innerHTML = `
            <div id="adminWrap" class="homes-wrap admin-wrap" style="height:100%; overflow:auto;">
              <div class="admin-header-row"
                  style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <div style="font-weight:800;">WIELKI ADMIN – split limit requests</div>
                <button class="btn-ghost" data-close="appPanel">X</button>
              </div>
              <div id="adminRequests">Loading...</div>
            </div>
          `;
        }



        // dociągnij listę requestów
        (async () => {
          const box = document.getElementById('adminRequests');
          if (!box) return;
          try {
            const r = await fetch('/api/admin/split_limit_requests/', {
              method: 'GET',
              credentials: 'same-origin',
              headers: { 'Accept': 'application/json' },
            });
            const data = await r.json().catch(() => []);
            if (!r.ok) {
              box.textContent = data.error || 'Error loading requests';
              return;
            }
            if (!Array.isArray(data) || !data.length) {
              box.textContent = 'No requests.';
              return;
            }

            const rows = data.map(req => `
              <tr data-id="${req.id}">
                <td>${req.house_id_fme || req.house_name || '(house)'}</td>
                <td>${req.requested_by_username || '(user)'}</td>
                <td>${req.requested_max_shares}</td>
                <td>${req.current_limit != null ? req.current_limit : '—'}</td>
                <td>${req.status}</td>
                <td>${req.created_at ? new Date(req.created_at).toLocaleString() : ''}</td>
                <td>
                  ${req.status === 'pending'
                    ? `<button class="btn btn-admin-approve" data-id="${req.id}">Approve</button>
                       <button class="btn btn-admin-reject"  data-id="${req.id}">Reject</button>`
                    : ''}
                </td>
              </tr>
            `).join('');

            box.innerHTML = `
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>House</th>
                    <th>User</th>
                    <th>Requested limit</th>
                    <th>Current limit</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            `;

            // obsługa kliknięć Approve/Reject
            box.addEventListener('click', async (ev) => {
              const approve = ev.target.closest('.btn-admin-approve');
              const reject  = ev.target.closest('.btn-admin-reject');
              if (!approve && !reject) return;

              const btn = approve || reject;
              const id  = btn.dataset.id;
              if (!id) return;

              const decision = approve ? 'approve' : 'reject';
              if (decision === 'approve' && !confirm('Approve this limit request and raise the limit?')) return;
              if (decision === 'reject'  && !confirm('Reject this limit request?')) return;

              try {
                const r2 = await fetch(`/api/admin/split_limit_requests/${encodeURIComponent(id)}/decide/`, {
                  method: 'POST',
                  headers: {
                    'X-CSRFToken': getCookie('csrftoken'),
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  credentials: 'same-origin',
                  body: new URLSearchParams({ decision }),
                });
                const j2 = await r2.json().catch(() => ({}));
                if (!r2.ok || !j2.ok) {
                  alert(j2.error || 'Decision failed');
                  return;
                }
                toast(decision === 'approve' ? 'Limit approved' : 'Request rejected');
                // przeładuj panel
                const adminBtn = document.querySelector('[data-action="admin"]');
                if (adminBtn) adminBtn.click();
              } catch (err) {
                alert(err.message || 'Decision failed');
              }
            }, { once: true });

          } catch (err) {
            const box = document.getElementById('adminRequests');
            if (box) box.textContent = err.message || 'Error loading requests';
          }
        })();

        return;
      }


      case 'login': { // Panel logowania
        if (typeof showAuthPanel === 'function') showAuthPanel();
        const auth = document.getElementById('authPanel'); 
        if (auth) auth.setAttribute('data-panel','login');
        const app = document.getElementById('appPanel');
        if (app) app.removeAttribute('style'); 
        return;
      }

      case 'profile': {
        const panel = document.getElementById('appPanel');
        if (panel) panel.classList.remove('panel-homes-70');
        
      if (appTitle) appTitle.textContent = 'Moje dane';
      openAppPanel('appPanel', { dockLeft: true }); // profil też w slocie menu (jak kiedyś)
      if (panel) panel.setAttribute('data-panel', 'profile');
      panel.removeAttribute('style'); 
      if (appBody) {
        appBody.innerHTML = `
          <div style="display:grid; gap:10px; padding:12px; max-width:720px">
            <div style="font-weight:800">Moje dane</div>

            <label>Nazwa użytkownika
              <input class="input" id="prof_username" type="text" placeholder="username">
            </label>
            <label>Imię
              <input class="input" id="prof_first" type="text" placeholder="Imię">
            </label>
            <label>Nazwisko
              <input class="input" id="prof_last" type="text" placeholder="Nazwisko">
            </label>
            <label>Nazwa firmy
              <input class="input" id="prof_company" type="text" placeholder="Nazwa firmy">
            </label>
            <label>Adres
              <input class="input" id="prof_addr" type="text" placeholder="Ulica i nr">
            </label>
            <label>Miasto
              <input class="input" id="prof_city" type="text" placeholder="Miasto">
            </label>
            <label>Kod pocztowy
              <input class="input" id="prof_zip" type="text" placeholder="00-000">
            </label>
            <label>Kraj
              <input class="input" id="prof_country" type="text" placeholder="Kraj">
            </label>
            <label>Nr VAT
              <input class="input" id="prof_vat" type="text" placeholder="PL...">
            </label>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
              <label>Nowe hasło
                <input class="input" id="prof_newpass" type="password" placeholder="Nowe hasło">
              </label>
              <label>Powtórz hasło
                <input class="input" id="prof_newpass2" type="password" placeholder="Powtórz hasło">
              </label>
            </div>

            <label class="checkbox-row" style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="prof_accept">
              <span>Logowanie dwuetapowe</span>
            </label>

            <div style="display:flex; gap:10px; margin-top:6px">
              <button class="btn" id="prof_save">Zastosuj zmiany</button>
              <button class="btn" id="prof_cancel">Anuluj</button>
            </div>
          </div>
        `;

        // Przywróć wartości, jeśli masz je w JS (opcjonalnie)
        try {
          document.getElementById('prof_username').value = window.currentUsername || '';
          // … tu możesz załadować z API /api/profile, jeśli masz
        } catch(_) {}

        // Zapis (placeholder – pokaż komunikat)
        const save = document.getElementById('prof_save');
        if (save) {
          save.addEventListener('click', () => {
            const t = document.getElementById('toast');
            if (t) { t.textContent = 'Zastosowano zmiany'; t.style.display = 'block'; setTimeout(()=>t.style.display='none', 1200); }
          });
        }
        const cancel = document.getElementById('prof_cancel');
        if (cancel) {
          cancel.addEventListener('click', () => {
            // powrót do menu
            const panel = document.getElementById('appPanel');
            if (panel) { panel.classList.remove('is-open', 'dock-left', 'msgx-medium'); panel.style.display=''; }
            const menu = document.getElementById('menuPanel'); if (menu) menu.style.display='block';
          });
        }
      }
      return;
    }

      // dopisz inne actiony jeśli masz (transactions, watchlist, search, goto)
      default:
        return;
    }
  });

  // --- Globalne zamykanie panelu wiadomości (data-close="appPanel")
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-close]');
    if (!btn) return;
=======
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
          // Use the new ChatPanel
          hideAllPanels();
          if (typeof window.ChatPanel !== 'undefined' && window.ChatPanel.open) {
            window.ChatPanel.open();
          } else {
            const chatPanel = document.getElementById('chatPanel');
            if (chatPanel) chatPanel.style.display = 'block';
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

>>>>>>> 7ee9b21 (Inital at 01.12.2026)
    const id = btn.getAttribute('data-close');
    const panel = document.getElementById(id);
    if (!panel) return;

<<<<<<< HEAD
    const panelType = panel.getAttribute('data-panel');

    if (panelType === 'offers' && typeof window.clearSaleMarkers === 'function') {
      window.clearSaleMarkers();
    }
    if (panelType === 'homes' && typeof window.clearHomesMarkers === 'function') {
      window.clearHomesMarkers();
    }

    panel.classList.remove('is-open','dock-left','msgx-medium','msgx-wide');
    panel.style.display = '';
    panel.removeAttribute('data-panel');
    if (id === 'appPanel' && typeof backToMenu === 'function') backToMenu();
  });


  // === Rozpoznaj aktywną sesję po odświeżeniu ===
  (async () => {
    try {
      const me = await apiWhoAmI();
      if (me?.ok) {
        loggedIn = true;
        updateUserInfo();
        window.currentUserId   = me.user.id;
        window.currentUsername = me.user.username;
        const userInfo = document.getElementById('userInfo');
        if (userInfo) userInfo.textContent = me.user?.username ? `Zalogowany: ${me.user.username}` : 'Zalogowany';
        setLoginMenuVisibility();
        if (postLogin) postLogin.style.display = 'block';
        startChatInboxPolling(); 
      }
    } catch (_) {}
  })();
  
  // === GOTO HELPERS (kamera Cesium) ===
  (function () {
    const toast = window.toast || (msg => alert(msg));

    function getViewer() {
      return window.__viewer || window.viewer;
    }

    // Stan zaznaczonego domu (marker + ewentualny kolor feature)
    let highlightedEntity = null;
    let highlightedFeature = null;
    let highlightedOriginalColor = null;

    function clearHouseHighlight() {
      const viewer = getViewer();
      if (!viewer || typeof Cesium === 'undefined') return;

      if (highlightedEntity) {
        try { viewer.entities.remove(highlightedEntity); } catch (e) {}
        highlightedEntity = null;
      }
      if (highlightedFeature && highlightedOriginalColor && 'color' in highlightedFeature) {
        try { highlightedFeature.color = highlightedOriginalColor; } catch (e) {}
      }
      highlightedFeature = null;
      highlightedOriginalColor = null;
    }

    function highlightHouse(id_fme, lat, lon, heightMeters) {
      const viewer = getViewer();
      if (!viewer || typeof Cesium === 'undefined') return;

      // zdejmij poprzednie zaznaczenie
      clearHouseHighlight();

      const latNum = Number(lat);
      const lonNum = Number(lon);

      // wylicz sensowną wysokość kropki na podstawie wysokości budynku / camHeight
      let markerHeight = 30; // domyślka
      const camH = Number(heightMeters);

      if (Number.isFinite(camH) && camH > 0) {
        // w Twoim systemie camH ≈ 3 * height + 150
        let buildingH = camH;
        if (camH > 80) {
          buildingH = (camH - 150) / 3;
        }
        if (!Number.isFinite(buildingH) || buildingH <= 0) {
          buildingH = camH * 0.3;
        }
        // kropka mniej więcej na 60% wysokości budynku, ale min 10, max 200
        markerHeight = Math.min(200, Math.max(10, buildingH * 0.6));
      }

      // marker w miejscu domu – pulsujący
      if (Number.isFinite(latNum) && Number.isFinite(lonNum)) {
        const startTime = Cesium.JulianDate.now();

        highlightedEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lonNum, latNum, markerHeight),
          point: {
            pixelSize: new Cesium.CallbackProperty(function (time, result) {
              const diff = Cesium.JulianDate.secondsDifference(time, startTime);
              const base = 12;
              const amp  = 4;
              // sinus co ~1s: 12 ± 4
              return base + Math.sin(diff * 2 * Math.PI) * amp;
            }, false),
            color: Cesium.Color.RED,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 3,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
      }

      // spróbuj podświetlić feature 3D w centrum ekranu (opcjonalnie)
      try {
        const viewer = getViewer();
        if (!viewer || typeof Cesium === 'undefined') return;
        const canvas = viewer.canvas;
        const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
        const picked = viewer.scene.pick(center);
        if (picked && typeof picked.getProperty === 'function') {
          const keys = ['ID_FME', 'id_fme', 'id', 'ID', 'OBJECTID', 'FID', 'BIN'];
          let fid = null;
          for (const k of keys) {
            try {
              const v = picked.getProperty(k);
              if (v !== undefined && v !== null && String(v).trim() !== '') {
                fid = String(v).trim();
                break;
              }
            } catch (_) {}
          }
          if (fid && fid === String(id_fme) && 'color' in picked) {
            highlightedOriginalColor = Cesium.Color.clone(picked.color, new Cesium.Color());
            highlightedFeature = picked;
            picked.color = Cesium.Color.YELLOW;
          }
        }
      } catch (e) {
        console.warn('[highlight] pick error', e);
      }
    }

    // wystaw do debugowania / użycia globalnie
    window.clearHouseHighlight = clearHouseHighlight;
    window.highlightHouse = highlightHouse;

    // Prosty przelot do lon/lat – kamera trochę PRZED domem, patrząc na budynek
    function flyToLonLat(lon, lat, opts = {}) {
      const viewer = getViewer();
      if (!viewer || typeof Cesium === 'undefined') {
        toast('Mapa jeszcze niegotowa');
        return;
      }

      const lonNum = Number(lon);
      const latNum = Number(lat);
      if (!Number.isFinite(lonNum) || !Number.isFinite(latNum)) {
        toast('Brak poprawnych współrzędnych');
        return;
      }

      const duration  = Number.isFinite(opts.duration) ? Number(opts.duration) : 1.2;
      const headingDeg = (opts.headingDeg !== undefined)
        ? Number(opts.headingDeg)
        : (viewer.camera.heading * Cesium.Math.DEGREES_PER_RADIAN);
      const pitchDeg   = (opts.pitchDeg !== undefined) ? Number(opts.pitchDeg) : -35;
      const rollDeg    = (opts.rollDeg  !== undefined) ? Number(opts.rollDeg)  : 0;

      // wysokość kamery nad terenem (m) – możesz przekazać np. 3*h+150
      const up = Number.isFinite(opts.height) ? Number(opts.height) : 300;

      // odległość pozioma przed domem
      const defaultRange = up * 1.2;
      const range = Number.isFinite(opts.range) ? Number(opts.range) : defaultRange;

      // środek domu
      const center = Cesium.Cartesian3.fromDegrees(lonNum, latNum, 0);
      const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);

      const headingRad = Cesium.Math.toRadians(headingDeg);
      const viewX = Math.sin(headingRad);
      const viewY = Math.cos(headingRad);

      const x = -viewX * range;   // East
      const y = -viewY * range;   // North
      const z = up;               // Up

      const offsetLocal = new Cesium.Cartesian3(x, y, z);
      const destination = new Cesium.Cartesian3();
      Cesium.Matrix4.multiplyByPoint(transform, offsetLocal, destination);

      viewer.camera.flyTo({
        destination,
        duration,
        orientation: {
          heading: Cesium.Math.toRadians(headingDeg),
          pitch:   Cesium.Math.toRadians(pitchDeg),
          roll:    Cesium.Math.toRadians(rollDeg),
        },
        complete: function () {
          if (typeof opts.onComplete === 'function') {
            try { opts.onComplete(); } catch (e) { console.warn('[flyToLonLat onComplete]', e); }
          }
        }
      });
    }

    // Główny helper: przenieś widok do domu po ID_FME, na bazie lat/lon
    async function flyToHouseLatLon(id_fme, opts = {}) {
      const id = String(id_fme || '').trim();
      if (!id) return;

      const viewer = getViewer();
      if (!viewer || typeof Cesium === 'undefined') {
        toast('Mapa jeszcze niegotowa');
        return;
      }

      const tryFromRecord = (rec) => {
        const lat = Number(rec?.lat);
        const lon = Number(rec?.lon);
        const h   = Number(rec?.height || rec?.fme_height || rec?.height || 200);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

        flyToLonLat(lon, lat, {
          height: h,
          duration: opts.duration || 1.2,
          pitchDeg: (opts.pitchDeg ?? -35),
          onComplete: () => {
            if (typeof highlightHouse === 'function') {
              highlightHouse(id, lat, lon, h);
            }
          }
        });
        return true;
      };

      // 1) spróbuj z cache panelu „My Real Estate”
      if (Array.isArray(window.__homesCache)) {
        const rec = window.__homesCache.find(h => String(h.id_fme || h.id || '').trim() === id);
        if (rec && tryFromRecord(rec)) return true;
      }

      // 2) Fallback – dociągnij szczegóły domu z API
      try {
        const r = await fetch(`/api/house/${encodeURIComponent(id)}/`, { credentials: 'same-origin' });
        const j = await r.json().catch(() => null);
        if (j) {
          const a = j.attrs || {};
          const rec = {
            id_fme: id,
            lat: j.lat ?? a.FME_lat ?? a.FME_center_lat ?? a.lat ?? a.center_lat ?? a.centroid_lat,
            lon: j.lon ?? a.FME_lon ?? a.FME_center_lon ?? a.lon ?? a.center_lon ?? a.centroid_lon,
            height: (j.height ?? j.fme_height ?? a.FME_height ?? a.height ?? 200) * 3 + 150,
          };
          if (tryFromRecord(rec)) return true;
        }
      } catch (e) {
        console.warn('[flyToHouseLatLon] fetch error', e);
      }

      toast(`Brak współrzędnych dla domu ${id}`);
      return false;
    }
    // === WELCOME TO NEW YORK – wielki billboard nad miastem ===
    function addWelcomeNYBillboard() {
      const viewer = getViewer();
      if (!viewer || typeof Cesium === 'undefined') return;

      // Jeśli już istnieje – nie dodawaj drugi raz
      if (viewer.entities.getById && viewer.entities.getById('welcomeNYBillboard')) {
        return;
      }

      // Przybliżone centrum Nowego Jorku
      const lon = -74.0060;
      const lat =  40.7128;
      const height = 1800;      // wysokość nad miastem w metrach
      const maxVisibleKm = 50;  // zasięg widoczności napisu w km

      const entity = viewer.entities.add({
        id: 'welcomeNYBillboard',
        position: Cesium.Cartesian3.fromDegrees(lon, lat, height),
        label: {
          text: 'WELCOME TO NEW YORK',
          font: 'bold 42px "Segoe UI", sans-serif',
          fillColor: Cesium.Color.RED,          // czerwony napis
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,

          showBackground: false,                // przezroczyste tło
          pixelOffset: new Cesium.Cartesian2(0, 0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,

          // ograniczenie widoczności wg dystansu kamery (0 m – maxVisibleKm km)
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
            0.0,
            maxVisibleKm * 100.0
          )
        }
      });

      // Nie pozwól, żeby kamera „przyklejała się” do tego napisu (trackedEntity)
      viewer.trackedEntityChanged.addEventListener(function(tracked) {
        if (tracked && tracked.id === 'welcomeNYBillboard') {
          viewer.trackedEntity = undefined;
        }
      });
    }

    // Dodaj billboard po starcie Cesium
    if (getViewer()) {
      addWelcomeNYBillboard();
    } else {
      window.addEventListener('cesium-ready', addWelcomeNYBillboard);
    }


    // eksport helperów
    window.flyToLonLat = flyToLonLat;
    window.flyToHouseLatLon = flyToHouseLatLon;
    window.flyToHouse = flyToHouseLatLon;

    // obsługa zdarzenia customowego
    window.addEventListener('goto-house', (e) => {
      const id = e && e.detail && e.detail.id_fme;
      if (id) flyToHouseLatLon(id);
    });
  })();

})();
=======
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
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
