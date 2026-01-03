// static/js/messages.mock.js — makieta 5-panelowa z minimalnymi interakcjami + toggle
(function () {
  // --- mock danych (bez backendu) ---
  const MOCK = {
    groups: [
      {
        name: 'Empire State Building',
        threads: [
          {
            title: 'Czy sprzedasz mi ten dom?',
            messages: [
              { who: 'them', text: 'Dzień dobry, czy dom jest na sprzedaż?' },
              { who: 'me',   text: 'Tak, cena wywoławcza 1 500 000 USD.' },
              { who: 'them', text: 'Czy rozważy Pan 1 420 000 USD?' }
            ]
          },
          {
            title: 'Moja oferta zakupu',
            messages: [
              { who: 'me',   text: 'Wysyłam ofertę 1 480 000 USD.' },
              { who: 'them', text: 'Dziękuję, dam znać po naradzie.' }
            ]
          },
          {
            title: 'Oglądanie – termin',
            messages: [
              { who: 'them', text: 'Czy pasuje Panu jutro 12:00?' },
              { who: 'me',   text: 'Tak, potwierdzam.' }
            ]
          }
        ]
      },
      {
        name: 'Dom XYZ',
        threads: [
          {
            title: 'Zapytanie o stan prawny',
            messages: [
              { who: 'them', text: 'Czy są hipoteki/obciążenia?' },
              { who: 'me',   text: 'Brak obciążeń, księga czysta.' }
            ]
          }
        ]
      },
      { name: 'Manhattan – 5th Ave 123', threads: [] },
      { name: 'Warszawa – Orla 8', threads: [] }
    ]
  };

  const state = { g: 0, t: 0 }; // indeks grupy i wątku

  function el(q, root = document) { return root.querySelector(q); }
  function els(q, root = document) { return Array.from(root.querySelectorAll(q)); }

  function groupsHTML() {
    return MOCK.groups.map((g, i) =>
      `<div class="msgx-item ${i===state.g?'active':''}" data-g="${i}">${g.name}</div>`
    ).join('');
  }
  function threadsHTML() {
    const threads = (MOCK.groups[state.g]?.threads || []);
    if (!threads.length) return `<div class="msgx-item">Brak wątków</div>`;
    return threads.map((t, i) =>
      `<div class="msgx-item ${i===state.t?'active':''}" data-t="${i}">${t.title}</div>`
    ).join('');
  }
  function chatBubblesHTML() {
    const thr = (MOCK.groups[state.g]?.threads?.[state.t]);
    if (!thr) return '';
    return thr.messages.map(m => `
      <div class="msgx-bubble ${m.who==='me'?'mine':'theirs'}">${escapeHTML(m.text)}</div>
    `).join('');
  }
  function escapeHTML(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function renderSkeleton() {
    const title = document.getElementById('appPanelTitle');
    const body  = document.getElementById('appPanelBody');
    const panel = document.getElementById('appPanel');

    if (title) title.textContent = 'Wiadomości (makieta)';
    if (panel) panel.classList.add('msgx-wide');

    body.innerHTML = `
      <div class="msgx-toolbar">
        <div class="spacer"></div>
        <button class="msgx-toggle" title="Przełącz na realny panel">Przełącz na REAL</button>
      </div>
      <div class="msgx">

        <!-- 1: Grupy -->
        <section class="msgx-col msgx-groups">
          <div class="msgx-head">Grupy (Domy)</div>
          <div class="msgx-list js-groups"></div>
        </section>

        <!-- 2: Wątki -->
        <section class="msgx-col msgx-threads">
          <div class="msgx-head">Wątki</div>
          <div class="msgx-list js-threads"></div>
        </section>

        <!-- 3: Czat -->
        <section class="msgx-col msgx-chat">
          <div class="msgx-chat-head">
            <div class="msgx-chat-title js-chat-title"></div>
          </div>
          <div class="msgx-chat-body js-chat-body"></div>

          <!-- 4: Kompozytor -->
          <div class="msgx-composer">
            <div class="msgx-quick">
              <button class="msgx-chip">Tak, sprzedam</button>
              <button class="msgx-chip">Nie sprzedam</button>
              <button class="msgx-chip">Za … USD</button>
              <button class="msgx-chip">Umówmy oglądanie</button>
            </div>
            <div class="msgx-compose-row">
              <input class="msgx-input" type="text" placeholder="Wpisz kwotę lub komentarz…" />
              <button class="msgx-send">Wyślij</button>
            </div>
          </div>
        </section>

        <!-- 5: Rezerwa -->
        <aside class="msgx-col msgx-side">
          <div class="msgx-head">Rezerwa</div>
          <div class="muted">Miejsce na przyszłe moduły (np. szczegóły domu, załączniki, status transakcji).</div>
        </aside>
      </div>
    `;

    // toggle: mock -> real
    const tog = el('.msgx-toggle', body);
    if (tog) {
      tog.addEventListener('click', () => {
        localStorage.setItem('messages-mode', 'real');
        if (typeof window.renderMessagesPanel === 'function') {
          window.renderMessagesPanel();
        } else {
          alert('Brak realnego panelu (messages.js).');
        }
      });
    }
  }

  function renderColumns() {
    const gList = el('.js-groups');
    const tList = el('.js-threads');
    const cHead = el('.js-chat-title');
    const cBody = el('.js-chat-body');

    if (gList) gList.innerHTML = groupsHTML();
    if (tList) tList.innerHTML = threadsHTML();

    const g = MOCK.groups[state.g];
    const thr = g?.threads?.[state.t];

    if (cHead) {
      const groupName = g?.name || '—';
      const threadTitle = thr?.title || 'Brak wątku';
      cHead.textContent = `Wątek: ${threadTitle} (${groupName})`;
    }
    if (cBody) {
      cBody.innerHTML = chatBubblesHTML();
      // autoscroll do dołu
      requestAnimationFrame(() => { cBody.scrollTop = cBody.scrollHeight; });
    }

    // bindowanie klików po każdym renderze list
    bindGroupClicks();
    bindThreadClicks();
  }

  function bindGroupClicks() {
    els('.js-groups .msgx-item').forEach(node => {
      node.addEventListener('click', () => {
        const gi = Number(node.getAttribute('data-g'));
        if (Number.isNaN(gi) || gi === state.g) return;
        state.g = gi;
        state.t = 0; // reset wątku na pierwszy w nowej grupie
        renderColumns();
      });
    });
  }
  function bindThreadClicks() {
    els('.js-threads .msgx-item').forEach(node => {
      node.addEventListener('click', () => {
        const ti = Number(node.getAttribute('data-t'));
        if (Number.isNaN(ti) || ti === state.t) return;
        state.t = ti;
        renderColumns();
      });
    });
  }

  // publiczny entry point – menu -> Wiadomości (makieta)
  window.renderMessagesMockPanel = function () {
    if (typeof openPanelInMenu === 'function') openPanelInMenu('appPanel');
    renderSkeleton();
    renderColumns();
  };
})();
