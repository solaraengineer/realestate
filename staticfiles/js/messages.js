// static/js/messages.js — Messages V2 UI (clean, intuitive)
(function () {
  const appTitle = document.getElementById('appPanelTitle');
  const appBody  = document.getElementById('appPanelBody');

  // Słownik (PL domyślnie)
  const T = {
    title: 'Wiadomości',
    back: '← Wróć do listy',
    roleBuyer: 'Kupujący',
    roleSeller: 'Sprzedający',
    started: 'Rozpoczęto rozmowę',
    yourAnswer: 'Twoja odpowiedź:',
    placeholder: 'Wpisz kwotę lub komentarz...',
    send: 'Wyślij',
    finalize: 'Sfinalizuj sprzedaż',
    finalizeNote: '(Tylko dla Sprzedawcy)',
    awaiting: '[Oczekuje na Twoją odpowiedź]',
    noConversations: 'Brak rozmów.',
    loadError: 'Błąd ładowania'
  };

  // local cache: convId -> summary (house/other_user/awaiting)
  const convIndex = {};

  function fmtTime(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso || ''; }
  }
  async function api(url, opts = {}) {
    const r = await fetch(url, opts);
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    if (!r.ok) throw new Error(data?.error || text || T.loadError);
    return data;
  }

  // -------- LIST VIEW --------
  function convItemHTML(c) {
    const badge = c.awaiting_user ? `<span class="badge">${T.awaiting}</span> ` : '';
    return `
      <div class="conversation-item ${c.awaiting_user ? 'awaiting' : 'answered'}" data-conv="${c.id}">
        <div class="conv-summary">
          <div class="conv-line">
            <div>
              <b>${c.other_user}</b> — <span class="house">${c.house || ''}</span>
            </div>
            <span class="conv-time">${c.last_time ? fmtTime(c.last_time) : ''}</span>
          </div>
          <div class="conv-snippet">${badge}${(c.last_message || '').replace(/\n/g, ' ')}</div>
        </div>
      </div>
    `;
  }

  async function renderMessagesPanel() {
    if (appTitle) appTitle.textContent = T.title;
    if (typeof openPanelInMenu === 'function') openPanelInMenu('appPanel'); // dock in left panel

    appBody.innerHTML = '<div class="conv-card">Ładowanie…</div>';
    try {
      const data = await api('/api/messages/');
      if (!data.length) {
        appBody.innerHTML = `<div class="conv-card">${T.noConversations}</div>`;
        return;
      }
      // cache
      data.forEach(c => convIndex[c.id] = c);

      // render list
      appBody.innerHTML = `
        <div class="conv-v2">
          <div class="conv-card">
            <div class="conv-head"><div class="conv-title">${T.title}</div></div>
            <div class="conv-list">${data.map(convItemHTML).join('')}</div>
          </div>
        </div>
      `;

      // click -> open thread view
      appBody.querySelectorAll('.conversation-item').forEach(el => {
        el.addEventListener('click', () => openThreadView(el.getAttribute('data-conv')));
      });
    } catch (e) {
      appBody.innerHTML = `<div class="conv-card">${T.loadError}</div>`;
    }
  }

  // -------- THREAD VIEW (styl jak na screenie) --------
  function msgBubbleHTML(m) {
    const mine = (String(m.sender_id) === String(window.currentUserId || ''));
    const head = `<div class="msg-head"><span class="who">${m.sender_name}</span><span class="when">${fmtTime(m.time)}</span></div>`;
    const body = `<div class="msg-body">${(m.text || '').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div>`;
    return `<div class="msg ${mine ? 'mine' : 'theirs'} bubble">${head}${body}</div>`;
  }
  function optionsHTML(options) {
    if (!options || !options.length) return '';
    return `<div class="option-list">
      ${options.map((o,i) =>
        `<button class="opt ${i>0?'secondary':''}" data-option="${o.id}" ${o.requires_input?'data-requires-input="1"':''} ${o.action?`data-action="${o.action}"`:''}>
           ${o.text}
         </button>`).join('')}
    </div>`;
  }
  function finalizeHTML(canFinalize) {
    if (!canFinalize) return '';
    return `
      <div class="finalize">
        <span class="icon">🔥</span>
        <span class="txt">${T.finalize} <small>${T.finalizeNote}</small></span>
        <button class="btn-finalize">${T.finalize}</button>
      </div>
    `;
  }

  async function openThreadView(convId) {
    const summary = convIndex[convId] || {};
    appBody.innerHTML = `<div class="conv-card">Ładowanie…</div>`;
    try {
      const data = await api(`/api/messages/${convId}/`);

      // Ustal rolę na podstawie can_finalize: jeśli True – jesteś Sprzedawcą
      const role = data.can_finalize ? T.roleSeller : T.roleBuyer;

      // Ostatni schema_id (żeby wyświetlić odpowiednie opcje)
      let lastSchema = null;
      for (let i = data.messages.length - 1; i >= 0; i--) {
        const sId = data.messages[i].schema_id;
        if (sId !== null && sId !== undefined) { lastSchema = sId; break; }
      }
      // options dostajemy już z backendu (dopasowane do stanu) – pokażemy na dole
      const opts = data.options || [];

      // Render
      appBody.innerHTML = `
        <div class="conv-v2">
          <div class="conv-card">
            <div class="back-row"><button class="go-back">${T.back}</button></div>
            <div class="conv-head">
              <div class="conv-title">Wątek: ${summary.house ? ('Sprzedaż domu ('+summary.house+')') : 'Rozmowa'}</div>
              <div class="conv-role">${role}</div>
            </div>

            <div class="msg-timeline">
              <span class="bubble system">${T.started}</span>
              <div class="msgs">
                ${data.messages.map(msgBubbleHTML).join('')}
              </div>
              ${optionsHTML(opts)}
            </div>

            <div class="answer">
              <div class="answer-label">${T.yourAnswer}</div>
              <div class="answer-box">
                <input class="reply-text" type="text" placeholder="${T.placeholder}">
                <button class="reply-send">${T.send}</button>
              </div>
              <div class="extra" style="display:none;margin-top:8px;">
                <input class="extra-input" type="text" placeholder="${T.placeholder}">
              </div>
              ${finalizeHTML(!!data.can_finalize)}
            </div>
          </div>
        </div>
      `;

      wireThreadView(convId);
    } catch (e) {
      appBody.innerHTML = `<div class="conv-card">${T.loadError}</div>`;
    }
  }

  function wireThreadView(convId) {
    // back
    const back = appBody.querySelector('.go-back');
    if (back) back.addEventListener('click', renderMessagesPanel);

    const root = appBody;
    const replyInput = root.querySelector('.reply-text');
    const sendBtn = root.querySelector('.reply-send');
    const extraDiv = root.querySelector('.extra');
    const extraInput = root.querySelector('.extra-input');
    const msgsDiv = root.querySelector('.msgs');
    const finalizeBtn = root.querySelector('.btn-finalize');

    // klik w dużą opcję (niebieskie przyciski)
    root.querySelectorAll('.option-list .opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const optionId = btn.getAttribute('data-option') || '';
        const needExtra = !!btn.getAttribute('data-requires-input');
        replyInput.dataset.option = optionId;
        if (needExtra) { extraDiv.style.display = 'block'; extraInput.focus(); }
        else { extraDiv.style.display = 'none'; extraInput.value=''; }
      });
    });

    // wyślij
    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        const text = (replyInput.value || '').trim();
        const optionId = replyInput.dataset.option || '';
        const inputText = (extraInput.value || '').trim();
        if (!text && !optionId && !inputText) return;

        try {
          const r = await fetch(`/api/messages/${convId}/send/`, {
            method: 'POST',
            headers: {
              'X-CSRFToken': window.getCookie('csrftoken'),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            credentials: 'same-origin',
            body: new URLSearchParams({ text, option_id: optionId, input_text: inputText })
          });
          const data = await r.json();
          if (!r.ok || !data.ok) throw new Error('send failed');

          // dołóż dymek i wyczyść
          msgsDiv.insertAdjacentHTML('beforeend', msgBubbleHTML(data.message));
          replyInput.value = ''; replyInput.removeAttribute('data-option');
          extraInput.value=''; extraDiv.style.display='none';
        } catch {
          alert('Błąd wysyłania');
        }
      });
    }

    // finalizuj sprzedaż
    if (finalizeBtn) {
      finalizeBtn.addEventListener('click', async () => {
        if (!confirm('Sfinalizować sprzedaż w tej rozmowie?')) return;
        try {
          const r = await fetch(`/api/messages/${convId}/finalize/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': window.getCookie('csrftoken') },
            credentials: 'same-origin'
          });
          const data = await r.json();
          if (!r.ok || !data.ok) throw new Error('finalize failed');
          alert('Sprzedaż sfinalizowana.');
          // odśwież widok wątku
          openThreadView(convId);
        } catch {
          alert('Nie udało się sfinalizować sprzedaży.');
        }
      });
    }
  }

  // Publiczny entry-point wołany z menu
  window.renderMessagesPanel = renderMessagesPanel;

  // BONUS: przycisk w prawym panelu obiektu "Wyślij wiadomość" (jeśli istnieje)
  const fpBtn = document.getElementById('fpMessage');
  if (fpBtn) {
    fpBtn.addEventListener('click', async () => {
      const id_fme = (window.__lastPickedIdFME || '').trim();
      if (!id_fme) { alert('Brak ID_FME dla obiektu.'); return; }
      try {
        const r = await fetch('/api/messages/start/', {
          method: 'POST',
          headers: { 'X-CSRFToken': window.getCookie('csrftoken'), 'Content-Type': 'application/x-www-form-urlencoded' },
          credentials: 'same-origin',
          body: new URLSearchParams({ id_fme })
        });
        const data = await r.json();
        if (!r.ok || !data.ok) throw new Error('start failed');
        // przejdź do listy + od razu otwórz ten wątek
        await renderMessagesPanel();
        setTimeout(() => openThreadView(data.conversation_id), 0);
      } catch {
        alert('Nie udało się rozpocząć rozmowy.');
      }
    });
  }
})();
