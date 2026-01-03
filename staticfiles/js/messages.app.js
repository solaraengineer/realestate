// static/js/messages.app.js — real messages panel (bez makiety)
(function () {
  const appTitle = document.getElementById('appPanelTitle');
  const appBody  = document.getElementById('appPanelBody');
  const panel    = document.getElementById('appPanel');

  // schowaj panel wiadomości po starcie + zdejmij ew. dockowanie
  if (panel) {
    panel.classList.remove('dock-left', 'msgx-wide', 'is-open'); // nic nie pokazujemy na starcie
    panel.style.display = '';  // czyścimy ewentualne inline
  }
  // auto-refresh: aktywne odpytywanie bieżącego wątku
  let pollTimer   = null;
  let pollConvId  = null;
  let pollSnap    = { count: 0, actionsKey: '' };

  let listPollTimer = null;                 // NOWE: polling listy rozmów
  const parseTs = s => (s ? Date.parse(s) || 0 : 0);

  window.stopMessagesPolling = function () {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (listPollTimer) { clearInterval(listPollTimer); listPollTimer = null; }
    pollConvId = null;
    pollSnap   = { count: 0, actionsKey: '' };
  };

  const T = {
    title: 'Wiadomości',
    groups: 'Grupy (Domy)',
    threads: 'Wątki',
    write: 'Wpisz wiadomość…',
    send: 'Wyślij',
    price: 'Cena',
    makeOffer: 'Składam ofertę',
    sendOffer: 'Złóż ofertę',
    cancel: 'Anuluj',
    accept: 'Zgoda',                // <— krócej
    counter: 'Moja oferta',
    sendCounter: 'Złóż kontrofertę',
    finalize: 'Kupuję',             // sprzedający dostanie „Sprzedaj” dynamicznie
    stop: 'Stop',
    resumeThread: 'Resume thread',
    loading: 'Ładowanie…',
    noThreads: 'Brak wątków',

    buyerOffer: 'Oferta kupującego',
    sellerOffer: 'Oferta sprzedającego',
    yourOffer: 'Twoja oferta',
  };


  const API = {
    list:      '/api/messages/',
    prepare:   '/api/messages/prepare/',
    start:     '/api/messages/start/',
    thread:    (id)=>`/api/messages/${id}/`,
    send:      (id)=>`/api/messages/${id}/send/`,
    offer:     (id)=>`/api/messages/${id}/offer/`,
    accept:    (id)=>`/api/messages/${id}/accept/`,
    finalize:  (id)=>`/api/messages/${id}/finalize/`,
    stop:      (id)=>`/api/messages/${id}/stop/`,
    archived: '/api/messages/archived/',
  };

  const csrf = ()=> window.getCookie ? window.getCookie('csrftoken') : '';


  function setComposer(html) {
    const comp = appBody.querySelector('.js-composer');
    comp.innerHTML = html;
    const fresh = comp.cloneNode(true);      // klon bez listenerów
    comp.parentNode.replaceChild(fresh, comp);
    return fresh;                            // zwróć świeży węzeł do bindowania
  }
 
  async function jget(url) {
    const r = await fetch(url, {credentials:'same-origin'});
    const t = await r.text(); let d=null; try { d=JSON.parse(t) } catch{} 
    if(!r.ok) throw new Error(d?.error || t || 'HTTP error');
    return d;
  }
  async function jpost(url, data) {
    const r = await fetch(url, {
      method:'POST',
      headers:{'X-CSRFToken': csrf(), 'Content-Type':'application/x-www-form-urlencoded'},
      credentials:'same-origin',
      body:new URLSearchParams(data||{})
    });
    const t = await r.text(); let d=null; try { d=JSON.parse(t) } catch{} 
    if(!r.ok) throw new Error(d?.error || t || 'HTTP error');
    return d;
  }

  // ---- helpers ----
  function groupByHouse(convs) {
    // grupujemy po polu conv.house (string)
    const map = new Map();
    for (const c of convs) {
      const key = c.house || '(house)';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    return [...map.entries()].map(([house, items])=>({house, items}));
  }
  function injectPreparedGroup() {
    if (!state.prepared || !state.prepared.house) return;

    const label =
      state.prepared.house.name ||
      state.prepared.house.id_fme ||
      state.prepared.house.id ||
      '(dom)';

    // jeśli taka grupa już istnieje – nie duplikuj
    const exists = state.groups.some(g => g.house === label);
    if (!exists) {
      state.groups = [{ house: label, items: [], __prepared: true }, ...state.groups];
    }

    // nowo wstrzyknięta grupa ma być aktywna
    state.groupIdx  = 0;
    state.threadIdx = 0;
  }
  function msgHTML(m) {
    const mine = String(m.sender_id) === String(window.currentUserId || '');
    const whoLabel = mine ? 'You' : (m.sender_name || '');
    const head = `<div class="msg-head"><span class="who">${whoLabel}, </span><span class="when">${new Date(m.time).toLocaleString()}</span></div>`;
    const body = `<div class="msg-body">${String(m.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>`;
    return `<div class="msgx-bubble ${mine ? 'mine' : 'theirs'}">${head}${body}</div>`;
  }

  function fmtPrice(p) {
    const n = Number(p);
    return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(p ?? '—');
  }
  function extractDeal(d) {
    const deal = d?.deal || d?.negotiation || {};
    // ceny
    const buyer = deal.buyer ?? d?.price_buyer ?? d?.buyer_offer ?? null;
    const seller = deal.seller ?? d?.price_seller ?? d?.seller_offer ?? null;
    // udziały (shares)
    const buyerShares = deal.buyer_shares ?? deal.buyerShares ?? d?.buyer_shares ?? null;
    const sellerShares = deal.seller_shares ?? deal.sellerShares ?? d?.seller_shares ?? null;

    const role =
      deal.role ??
      d?.role ??
      (d?.is_seller ? 'seller' : (d?.is_buyer ? 'buyer' : null));

    return { buyer, seller, role, buyerShares, sellerShares };
  }

  function updateDealBar(d) {
    const { buyer, buyerShares, role } = extractDeal(d || {});
    const root = document.getElementById('appPanel') || document;

    const buyerPill  = root.querySelector('.msgx-pill.buyer');
    const sellerPill = root.querySelector('.msgx-pill.seller');
    const bEl = root.querySelector('.js-buyer-offer');
    const sEl = root.querySelector('.js-seller-offer');

    // ZAWSZE chowamy "oferta sprzedającego"
    if (sellerPill) sellerPill.style.display = 'none';
    if (sEl) sEl.textContent = '';

    // Pokaż tylko jeden pill (kupującego)
    if (buyerPill) buyerPill.style.display = '';

    // Ustaw etykietę w zależności od roli:
    // - kupujący: "Twoja oferta"
    // - sprzedający: "Oferta kupującego"
    const bLbl = buyerPill ? buyerPill.querySelector('strong') : null;
    if (bLbl) {
      if (role === 'buyer') {
        bLbl.textContent = `${T.yourOffer}:`;
      } else if (role === 'seller') {
        bLbl.textContent = `${T.buyerOffer}:`;
      } else {
        // fallback, gdyby rola nie doszła
        bLbl.textContent = `${T.buyerOffer}:`;
      }
    }

    // Wartość: zawsze pokazujemy ofertę kupującego (cenę + udziały)
    if (bEl) {
      if (buyer != null) {
        const priceStr = fmtPrice(buyer);
        if (buyerShares != null) {
          bEl.textContent = `${priceStr} (${buyerShares} udz.)`;
        } else {
          bEl.textContent = priceStr;
        }
      } else {
        bEl.textContent = '—';
      }
    }
  }



  function setBang(el, on) {
    if (!el) return;
    // przełącz znacznik na elemencie (dla czerwonej listwy po prawej)
    el.classList.toggle('msgx-has-bang', !!on);

    // wstaw / usuń bąbelek „!”
    let dot = el.querySelector('.msgx-bang');
    if (on) {
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'msgx-bang';
        dot.textContent = '!';
        el.appendChild(dot);
      }
    } else if (dot) {
      dot.remove();
    }
  }
  function applyBadges() {
    // Grupy
    const gBox = appBody.querySelector('.js-groups');
    if (gBox) {
      gBox.querySelectorAll('.msgx-item').forEach(el => {
        const gi  = +el.getAttribute('data-g');
        const grp = state.groups[gi];
        const has = !!grp && grp.items.some(c => state.badges.has(c.id));
        setBang(el, has);
      });
    }
    // Wątki (dla aktywnej grupy)
    const tBox = appBody.querySelector('.js-threads');
    if (tBox) {
      tBox.querySelectorAll('.msgx-item').forEach(el => {
        const ti = +el.getAttribute('data-t');
        const c  = state.threads[ti];
        const has = !!c && state.badges.has(c.id);
        setBang(el, has);
      });
    }
  }

  function startListPolling() {
    if (listPollTimer) clearInterval(listPollTimer);
    const tick = async () => {
      try {
        const list = await jget(API.list);           // [{id, awaiting_user, last_time, house, other_user, ...}]
        // Nie przebudowujemy UI – tylko wyznaczamy badge-i
        const next = new Set();
        for (const c of list) {
          const last = parseTs(c.last_time);
          const seen = parseTs(state.lastSeen.get(c.id));
          // Badge tylko jeśli ostatnia wiadomość jest od przeciwnika i jest nowsza niż to, co “widziałem”
          if (c.awaiting_user && last > seen) next.add(c.id);
        }
        state.badges = next;
        applyBadges();
      } catch (_) { /* ignoruj chwilowe błędy */ }
    };
    tick(); // od razu
    listPollTimer = setInterval(tick, 4000);
  }

  // ---- renderers ----
  function layoutHTML() {
    return `
      <div class="msgx">
        <section class="msgx-col">
          <div class="msgx-head">
            <span>${T.groups}</span>
            <span style="float:right; display:flex; gap:4px;">
              <button class="msgx-chip js-show-active">Aktualne</button>
              <button class="msgx-chip js-show-archived">Archiwum</button>
            </span>
          </div>
          <div class="msgx-list js-groups"></div>
        </section>
        <section class="msgx-col">
          <div class="msgx-head">${T.threads}</div>
          <div class="msgx-list js-threads"></div>
        </section>
        <section class="msgx-col msgx-chat">
          <div class="msgx-chat-head">
            <div class="msgx-chat-title js-chat-title"></div>
            <div class="msgx-dealbar">
              <span class="msgx-pill buyer"><strong>${T.buyerOffer}:</strong> <span class="js-buyer-offer">—</span></span>
              <span class="msgx-pill seller"><strong>${T.sellerOffer}:</strong> <span class="js-seller-offer">—</span></span>
            </div>
          </div>
          <div class="msgx-chat-body js-chat-body"></div>
          <div class="msgx-composer js-composer"></div>
        </section>
      </div>`;
  }

    function composerDefaultHTML() {
      const stopLabel = (state.viewMode === 'archived') ? T.resumeThread : T.stop;
      return `
        <div class="msgx-quick">
          <button class="msgx-chip js-counter">${T.counter}</button>
          <button class="msgx-chip js-stop">${stopLabel}</button>
        </div>
        <div class="msgx-compose-row">
          <input class="msgx-input js-text" type="text" placeholder="${T.write}">
          <button class="msgx-send js-send">${T.send}</button>
        </div>`;
    }
  function composerDisabledHTML() {
    return `
      <div class="msgx-quick" style="opacity:.85;color:#e7ecef">
        Wybierz dom na mapie i kliknij „Wyślij wiadomość”<br>
        lub otwórz istniejący wątek z listy.
      </div>`;
  }
  function composerOfferHTML() {
    return `
      <div class="msgx-quick">
        <label style="color:#e7ecef;">${T.price}</label>
        <input class="msgx-input js-price" type="number" step="0.01" min="0" placeholder="${T.price}">
        <label style="color:#e7ecef; margin-left:8px;">Shares</label>
        <input class="msgx-input js-shares" type="number" step="1" min="1" placeholder="Shares">
        <button class="msgx-send js-send-offer">${T.sendOffer}</button>
        <button class="msgx-chip js-cancel">${T.cancel}</button>
      </div>`;
  }

  function composerCounterHTML() {
    return `
      <div class="msgx-quick">
        <label style="color:#e7ecef;">${T.price}</label>
        <input class="msgx-input js-price" type="number" step="0.01" min="0" placeholder="${T.price}">
        <label style="color:#e7ecef; margin-left:8px;">Shares</label>
        <input class="msgx-input js-shares" type="number" step="1" min="1" placeholder="Shares">
        <button class="msgx-send js-send-counter">${T.sendCounter}</button>
        <button class="msgx-chip js-cancel">${T.cancel}</button>
      </div>`;
  }

  function composerActionsHTML(allowed) {
    // allowed: ['send_text','make_offer','stop'] | ['accept','counter','stop'] | ['finalize','counter','stop'] | ['finalize','stop']
    const btn = (cls, label)=>`<button class="msgx-chip ${cls}">${label}</button>`;
    const rows = [];
    const chips = [];

    const stopLabel = (state.viewMode === 'archived') ? T.resumeThread : T.stop;

    if (allowed.includes('accept'))     chips.push(btn('js-accept', T.accept));
    if (allowed.includes('counter'))    chips.push(btn('js-counter', T.counter));
    if (allowed.includes('finalize'))   chips.push(btn('js-finalize', T.finalize));
    if (allowed.includes('stop'))       chips.push(btn('js-stop', stopLabel));

    rows.push(`<div class="msgx-quick">${chips.join(' ')}</div>`);

    if (allowed.includes('send_text')) {
      rows.push(`
        <div class="msgx-compose-row">
          <input class="msgx-input js-text" type="text" placeholder="${T.write}">
          <button class="msgx-send js-send">${T.send}</button>
        </div>`);
    }
    return rows.join('\n');
  }

  // ---- state ----
  const state = {
    list: [],             // conversations (GET /api/messages/)
    groups: [],           // grouped by house
    groupIdx: 0,
    threads: [],          // conversations in group
    threadIdx: 0,
    currentConvId: null,
    prepared: null,       // result of /prepare
    viewMode: 'active',   // 'active' albo 'archived'
  };
  state.badges   = new Set();
  state.lastSeen = new Map();

  async function loadList() {
      state.viewMode = 'active';
      state.list = await jget(API.list);
      state.groups = groupByHouse(state.list);
    }

  async function loadArchived() {
      state.viewMode = 'archived';
      state.list = await jget(API.archived);
      state.groups = groupByHouse(state.list);
  }


  function renderGroups() {
    const box = appBody.querySelector('.js-groups');
    if (!box) return;
    box.innerHTML = state.groups.map((g,i)=>`
      <div class="msgx-item ${i===state.groupIdx?'active':''}" data-g="${i}">${g.house}</div>
    `).join('');
    box.querySelectorAll('.msgx-item').forEach(el=>{
      el.addEventListener('click', ()=>{
        const gi = +el.getAttribute('data-g');
        if (Number.isNaN(gi)) return;
        state.groupIdx = gi; state.threadIdx = 0;
        box.querySelectorAll('.msgx-item.active').forEach(n => n.classList.remove('active'));
        el.classList.add('active');
        buildThreads();
      });
    });
    applyBadges();
  }
  function buildThreads() {
    const g = state.groups[state.groupIdx];
    state.threads = g ? g.items : [];
    const box = appBody.querySelector('.js-threads');
    if (!box) return;
    if (!state.threads.length) {
      // zatrzymaj polling, gdy nie ma aktywnego wątku
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      pollConvId = null;
      pollSnap   = { count: 0, actionsKey: '' };
      box.innerHTML = `<div class="msgx-item">${T.noThreads}</div>`;
      appBody.querySelector('.js-chat-title').textContent = '';
      appBody.querySelector('.js-chat-body').innerHTML = '';

      if (state.prepared && state.prepared.can_message) {
        const fresh = setComposer(composerDefaultHTML());
        wireComposerNoConv(state.groups[state.groupIdx]?.house); // zapyta ponownie o .js-composer (to już fresh)
      } else {
        setComposer(composerDisabledHTML());
      }
      applyBadges();
      return;
    }
    box.innerHTML = state.threads.map((t,i)=>`
      <div class="msgx-item ${i===state.threadIdx?'active':''}" data-t="${i}">
        ${t.other_user}
      </div>
    `).join('');
    box.querySelectorAll('.msgx-item').forEach(el=>{
      el.addEventListener('click', ()=> {
        const ti = +el.getAttribute('data-t');
        if (Number.isNaN(ti)) return;
        state.threadIdx = ti;
        box.querySelectorAll('.msgx-item.active').forEach(n => n.classList.remove('active'));
        el.classList.add('active');
        const c = state.threads[ti];
        if (c) {
          state.badges.delete(c.id);                      // zgaś badge dla tego wątku
          state.lastSeen.set(c.id, new Date().toISOString()); // „widziałem” — zanim dociągnie się JSON
        }
        applyBadges();     
        openThread(state.threads[ti].id);
      });
    });
    // jeśli mamy wątek — otwórz pierwszy
    openThread(state.threads[state.threadIdx].id);
    const activeEl = box.querySelector(`.msgx-item[data-t="${state.threadIdx}"]`);
    if (activeEl) {
      box.querySelectorAll('.msgx-item.active').forEach(n => n.classList.remove('active'));
      activeEl.classList.add('active');
    }
    applyBadges();
  }

  async function openThread(convId) {
    // zapamiętaj aktywny wątek
    state.currentConvId = convId;

    // wczytaj pełne dane wątku (bezpiecznie)
    let data;
    try {
      data = await jget(API.thread(convId));
    } catch (e) {
      const bodyEl = appBody.querySelector('.js-chat-body');
      if (bodyEl) {
        bodyEl.innerHTML = `<div class="msgx-bubble theirs">
          <div class="msg-body">Błąd wczytywania wątku: ${String(e.message || e)}</div>
        </div>`;
      }
      state.lastSeen.set(convId, new Date().toISOString());
      applyBadges(); // zgaś badge w UI
      setComposer(composerDisabledHTML());
      return; // nie jedziemy dalej, ale UI nie jest „czarne”
    }

    // ustaw tytuł sekcji (Wątek: <użytkownik> (<dom>))
    const g = state.groups[state.groupIdx];
    const t = state.threads[state.threadIdx];
    const titleEl = appBody.querySelector('.js-chat-title');
    if (titleEl) {
      titleEl.textContent = `Wątek: ${t?.other_user || ''} (${g?.house || ''})`;
    }

    // wyrenderuj historię wiadomości
    const bodyEl = appBody.querySelector('.js-chat-body');
    if (bodyEl) {
      bodyEl.innerHTML = (data.messages || []).map(msgHTML).join('');
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }
    const lastMsg = (data.messages || []).slice(-1)[0];
    if (lastMsg?.time) state.lastSeen.set(convId, lastMsg.time);
    applyBadges();

    // pasek ofert w nagłówku
    updateDealBar(data);

    // composer wg dozwolonych akcji
    setComposer(composerActionsHTML(data.allowed_actions || []));
    wireComposerConv(data);

    // --- start/refresh polling dla otwartego wątku ---
    pollConvId = convId;

    // snapshot do wykrywania zmian
    pollSnap.count      = (data.messages || []).length;
    pollSnap.actionsKey = JSON.stringify(data.allowed_actions || []);
    pollSnap.status     = data.status || null;  

    // snapshot ofert (dla paska ofert)
    const d0 = extractDeal(data);
    pollSnap.dealKey = JSON.stringify({
      b: d0.buyer,
      s: d0.seller,
      bs: d0.buyerShares,
      ss: d0.sellerShares,
    });

    // cykliczne odświeżanie
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    pollTimer = setInterval(async () => {
      try {
        // jeśli w międzyczasie zmieniłeś wątek – nic nie rób
        if (pollConvId !== state.currentConvId) return;

        // pobierz aktualizację
        const upd = await jget(API.thread(pollConvId));
        const newCount      = (upd.messages || []).length;
        const newActionsKey = JSON.stringify(upd.allowed_actions || []);


        const newStatus = upd.status || null;
        if (newStatus !== pollSnap.status) {
          setComposer(composerActionsHTML(upd.allowed_actions || []));
          wireComposerConv(upd);
          pollSnap.status = newStatus;
        }

        // 1) doszły nowe wiadomości → podmień body
        if (newCount !== pollSnap.count) {
          const bodyEl = appBody.querySelector('.js-chat-body');
          if (bodyEl) {
            bodyEl.innerHTML = (upd.messages || []).map(msgHTML).join('');
            bodyEl.scrollTop = bodyEl.scrollHeight;
          }
          const last = (upd.messages || []).slice(-1)[0];
          if (last?.time) state.lastSeen.set(pollConvId, last.time);
          applyBadges();
          pollSnap.count = newCount;
        }

        // 2) zmieniły się allowed_actions → odśwież composer
        if (newActionsKey !== pollSnap.actionsKey) {
          setComposer(composerActionsHTML(upd.allowed_actions || []));
          wireComposerConv(upd);
          pollSnap.actionsKey = newActionsKey;
        }

        // 3) zmieniły się oferty → odśwież pasek + PRZE-RENDERUJ composer
        const d1 = extractDeal(upd);
        const newDealKey = JSON.stringify({
          b: d1.buyer,
          s: d1.seller,
          bs: d1.buyerShares,
          ss: d1.sellerShares,
        });
        if (newDealKey !== pollSnap.dealKey) {
          updateDealBar(upd);
          setComposer(composerActionsHTML(upd.allowed_actions || []));
          wireComposerConv(upd);
          pollSnap.dealKey = newDealKey;
        }


      } catch (_) {
        // transient errors ignorujemy
      }
    }, 2000);
  }




  // -------- Composer (brak rozmowy, tryb start) --------
  // --- [NO THREAD] Kompozytor w trybie startowym (po kliknięciu „Wyślij wiadomość”, gdy nie ma jeszcze rozmowy)
  function wireComposerNoConv (houseName) {
    const root = document.getElementById('appPanel') || document;

    attach(); // podpinamy jeden delegowany listener do świeżego .js-composer

    function attach() {
      const comp = root.querySelector('.js-composer');
      if (!comp) return;
      const fresh = comp.cloneNode(true);
      comp.replaceWith(fresh);
      fresh.addEventListener('click', onClick);

      const input   = fresh.querySelector('.js-text, .msgx-input, .reply-text');
      const sendBtn = fresh.querySelector('.js-send, .msgx-send, .reply-send');
      if (input && sendBtn) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            sendBtn.click();
          }
        });
      }
    }

    async function onClick (e) {
      const comp = e.currentTarget;
      const btn  = e.target.closest('button');
      if (!btn || !comp.contains(btn)) return;

      // STOP – wyczyść historię i zresetuj kompozytor
      if (btn.classList.contains('js-stop')) {
        const body = root.querySelector('.js-chat-body, .msgx-chat-body');
        if (body) body.innerHTML = '';
        const fresh = setComposer(composerDefaultHTML());
        fresh.addEventListener('click', onClick);
        return;
      }

      // „Składam ofertę” (na razie i tak nie masz tego przycisku, ale logika zostaje)
      if (btn.classList.contains('js-make-offer')) {
        const fresh    = setComposer(composerOfferHTML());
        const priceEl  = fresh.querySelector('.js-price');
        const sharesEl = fresh.querySelector('.js-shares');
        const sendBtn  = fresh.querySelector('.js-send-offer');
        const cancelBt = fresh.querySelector('.js-cancel');

        if (priceEl && sendBtn) {
          priceEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              sendBtn.click();
            }
          });
        }
        if (sharesEl && sendBtn) {
          sharesEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              sendBtn.click();
            }
          });
        }

        if (sendBtn) {
          sendBtn.addEventListener('click', async () => {
            const price  = (priceEl  && priceEl.value  ? priceEl.value.trim()  : '');
            const shares = (sharesEl && sharesEl.value ? sharesEl.value.trim() : '');
            if (!price)  { alert('Podaj kwotę'); return; }
            if (!shares) { alert('Podaj liczbę udziałów'); return; }
            try {
              await ensureStart();
              await jpost(API.offer(state.currentConvId), { price, shares });
              await openThread(state.currentConvId);
            } catch (err) {
              alert((err && err.message) || 'Błąd wysyłania oferty');
            }
          });
        }

        if (cancelBt) {
          cancelBt.addEventListener('click', () => {
            const f2 = setComposer(composerDefaultHTML());
            f2.addEventListener('click', onClick);
          });
        }
        return;
      }

      // „Moja oferta” – w trybie bez wątku
      if (btn.classList.contains('js-counter')) {
        const fresh    = setComposer(composerOfferHTML());
        const priceEl  = fresh.querySelector('.js-price');
        const sharesEl = fresh.querySelector('.js-shares');
        const sendBtn  = fresh.querySelector('.js-send-offer');
        const cancelBt = fresh.querySelector('.js-cancel');

        if (priceEl && sendBtn) {
          priceEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              sendBtn.click();
            }
          });
        }
        if (sharesEl && sendBtn) {
          sharesEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              sendBtn.click();
            }
          });
        }

        if (sendBtn) {
          sendBtn.addEventListener('click', async () => {
            const price  = (priceEl  && priceEl.value  ? priceEl.value.trim()  : '');
            const shares = (sharesEl && sharesEl.value ? sharesEl.value.trim() : '');
            if (!price)  { alert('Podaj kwotę'); return; }
            if (!shares) { alert('Podaj liczbę udziałów'); return; }

            try {
              await ensureStart();
              await jpost(API.offer(state.currentConvId), { price, shares });
              await openThread(state.currentConvId);
            } catch (err) {
              alert((err && err.message) || 'Błąd wysyłania oferty');
            }
          });
        }

        if (cancelBt) {
          cancelBt.addEventListener('click', () => {
            const f2 = setComposer(composerDefaultHTML());
            f2.addEventListener('click', onClick);
          });
        }
        return;
      }

      // „Wyślij” w trybie startowym – ZAWSZE zwykła wiadomość
      // „Wyślij” w trybie startowym – zawsze zwykła wiadomość tekstowa
      if (btn.classList.contains('js-send') || btn.classList.contains('msgx-send') || btn.classList.contains('reply-send')) {
        const input = comp.querySelector('.js-text, .msgx-input, .reply-text');
        const text  = (input && input.value ? input.value : '').trim();
        if (!text) return;

        try {
          await ensureStart();                         // zakłada / znajduje Conversation
          await jpost(API.send(state.currentConvId), { text }); // ZAWSZE messages_send
          if (input) input.value = '';
          await openThread(state.currentConvId);       // odśwież wątek
        } catch (err) {
          alert((err && err.message) || 'Błąd wysyłania');
        }
        return;
      }


    }

    async function ensureStart() {
      const id_fme = (window.__lastPickedIdFME || '').trim();
      if (!id_fme || !state?.prepared || !state.prepared.can_message) {
        alert('Najpierw kliknij dom i wybierz „Wyślij wiadomość”.');
        throw new Error('no-thread-start-guard');
      }
      const payload = { id_fme };
      if (state.prepared.seller?.id) payload.seller_id = state.prepared.seller.id;

      const data = await jpost(API.start, payload);
      state.currentConvId = data.conversation_id;

      await loadList();
      renderGroups();
      for (let gi = 0; gi < state.groups.length; gi++) {
        const g = state.groups[gi];
        for (let ti = 0; ti < g.items.length; ti++) {
          const item = g.items[ti];
          if (item && item.id === state.currentConvId) {
            state.groupIdx = gi;
            state.threadIdx = ti;
            gi = state.groups.length;
            break;
          }
        }
      }
      buildThreads();
    }
  }


    function wireComposerConv(threadData) {
      const convId =
        (threadData && threadData.conversation_id) ||
        (typeof state !== 'undefined' ? state.currentConvId : null);
      if (!convId) return;

      const root       = document.getElementById('appPanel') || document;
      const input      = root.querySelector('.js-text, .reply-text, .msgx-input');
      const sendBtn    = root.querySelector('.js-send, .reply-send, .msgx-send');

      // ENTER w polu tekstowym = Wyślij (dla istniejącego wątku)
      if (input && sendBtn) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            sendBtn.click();
          }
        });
      }

      const makeBtn    = root.querySelector('.js-make-offer');           // już nie rysujemy, ale gdyby backend dał — ukryjemy
      const counterBtn = root.querySelector('.js-counter');              // teraz: „Moja oferta”
      const acceptBtn  = root.querySelector('.js-accept');
      const finalBtn   = root.querySelector('.js-finalize, .btn-finalize');
      const stopBtn    = root.querySelector('.js-stop');

      // --- rola i stan ofert ---
      const deal = (typeof extractDeal === 'function' ? extractDeal(threadData) : { role: null, buyer: null, seller: null });
      const role = deal.role || (threadData?.deal?.role || (threadData?.is_seller ? 'seller' : 'buyer'));
      const buyerHas  = deal.buyer  != null;
      const sellerHas = deal.seller != null;
      const status    = threadData?.status;

      // --- etykiety ---
      if (counterBtn) counterBtn.textContent = 'Moja oferta';
      if (finalBtn)   finalBtn.textContent   = (role === 'seller') ? 'Sprzedaję' : T.finalize;
      if (makeBtn)    makeBtn.style.display  = 'none'; // „Składam ofertę” ma zniknąć; już go nie używamy

      // --- blokady wg zasad ---
      // 1) sprzedający bez oferty kupującego → blokuj „Moja oferta” i „Sprzedaję”
      if (role === 'seller' && !buyerHas) {
        if (counterBtn) counterBtn.setAttribute('disabled', '');
        if (finalBtn)   finalBtn.setAttribute('disabled', '');
      }
      if (status === 'agreed') {
        // „Moja oferta” już nieaktywna
        if (counterBtn) counterBtn.setAttribute('disabled', '');
        // kupujący może od razu „Kupuję”
        if (role === 'buyer' && finalBtn) finalBtn.removeAttribute('disabled');
      }
      // 2) kupujący bez oferty sprzedającego i bez „agreed” → blokuj „Kupuję”
      if (role === 'buyer' && !sellerHas && status !== 'agreed') {
        if (finalBtn) finalBtn.setAttribute('disabled', '');
      }

      // --- helper: formularz ceny (Moja oferta / kontroferta) ---
      function showPriceForm(mode) {
        const html  = (mode === 'counter') ? composerCounterHTML() : composerOfferHTML();
        const fresh = setComposer(html);
        const priceEl      = fresh.querySelector('.js-price');
        const sharesEl     = fresh.querySelector('.js-shares');
        const sendSel      = (mode === 'counter') ? '.js-send-counter' : '.js-send-offer';
        const sendPriceBtn = fresh.querySelector(sendSel);
        const cancelBtn    = fresh.querySelector('.js-cancel');

        // ENTER w polach = Wyślij ofertę
        if (priceEl && sendPriceBtn) {
          priceEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              sendPriceBtn.click();
            }
          });
        }
        if (sharesEl && sendPriceBtn) {
          sharesEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              sendPriceBtn.click();
            }
          });
        }

        if (sendPriceBtn) {
          sendPriceBtn.addEventListener('click', async () => {
            const price  = (priceEl  && priceEl.value  ? priceEl.value.trim()  : '');
            const shares = (sharesEl && sharesEl.value ? sharesEl.value.trim() : '');
            if (!price)  { alert('Podaj kwotę'); return; }
            if (!shares) { alert('Podaj liczbę udziałów'); return; }
            try {
              await jpost(API.offer(convId), { price, shares });
              await openThread(convId); // odśwież wątek + pasek ofert
            } catch (e) {
              alert((e && e.message) || 'Błąd wysyłania oferty');
            }
          });
        }

        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => {
            const f2 = setComposer(
              composerActionsHTML((threadData && threadData.allowed_actions) || [])
            );
            wireComposerConv(threadData); // odtwórz standardowe akcje
          });
        }
      }

      // --- akcje szybkie (chipsy) ---
      if (counterBtn) {
        counterBtn.addEventListener('click', () => {
          if (counterBtn.hasAttribute('disabled')) return;
          const mode = (role === 'seller') ? 'counter' : 'offer';
          showPriceForm(mode);
        });
      }

      if (acceptBtn) {
        acceptBtn.addEventListener('click', async () => {
          try {
            await jpost(API.accept(convId), {});
            await openThread(convId);
          } catch (e) {
            alert((e && e.message) || 'Nie udało się zaakceptować oferty');
          }
        });
      }

      if (finalBtn) {
        finalBtn.addEventListener('click', async () => {
          if (finalBtn.hasAttribute('disabled')) return;

          const deal = (typeof extractDeal === 'function' ? extractDeal(threadData) : { role: null });
          const roleNow = deal.role || (threadData?.deal?.role || (threadData?.is_seller ? 'seller' : 'buyer'));

          try {
            // 1) przygotuj wątek (akceptacje + listing)
            let prep = await jpost(API.finalize(convId), {});

            // miękki konflikt listingu publicznego – pytamy sprzedającego
            if (prep && prep.ok === false && prep.error === 'PUBLIC_LISTING_WILL_CHANGE' && roleNow === 'seller') {
              const curSh = prep.current_shares;
              const curPr = prep.current_price;
              const newSh = prep.requested_shares;
              const newPr = prep.requested_price;

              const msg = (curSh != null)
                ? `Masz już publiczne ogłoszenie na ${curSh} udziałów za ${curPr}.\n` +
                  `Ta zgoda zastąpi je nową ofertą: ${newSh} udziałów za ${newPr}.\n` +
                  `Czy chcesz kontynuować?`
                : `Masz już publiczne ogłoszenie. Ta zgoda je zastąpi. Kontynuować?`;

              if (!confirm(msg)) {
                return;
              }

              // drugie podejście – z potwierdzeniem zmiany publicznego listingu
              prep = await jpost(API.finalize(convId), { force_public_change: 1 });
            }

            if (!prep || prep.ok === false) {
              throw new Error(prep && prep.error || 'Finalize failed');
            }

            // 2) kupujący od razu odpala centralną finalizację (trade)
            if (roleNow === 'buyer') {
              const listingId = prep.listing_id || prep.listing || prep.listingId;
              if (!listingId) throw new Error('NO_LISTING_ID');
              await jpost('/api/trade/finalize/', { listing_id: listingId });
            }

            await loadList();
            renderGroups();
            state.threadIdx = 0;
            buildThreads();
          } catch (e) {
            alert((e && e.message) || 'Nie udało się sfinalizować transakcji');
          }
        });
      }

      if (stopBtn) {
        stopBtn.addEventListener('click', async () => {
          try {
            await jpost(API.stop(convId), {});
            await loadList();
            renderGroups();
            state.threadIdx = 0;
            buildThreads();
          } catch (e) {
            alert((e && e.message) || 'Nie udało się zakończyć rozmowy');
          }
        });
      }

      if (sendBtn) {
        sendBtn.addEventListener('click', async () => {
          const text = (input && input.value ? input.value.trim() : '');
          if (!text) return;
          try {
            // zawsze zwykła wiadomość tekstowa
            await jpost(API.send(convId), { text });
            input.value = '';
            await openThread(convId);
          } catch (e) {
            alert((e && e.message) || 'Błąd wysyłania');
          }
        });
      }

    }



 


  // --- publiczny entry point: WYMIANA CAŁEJ FUNKCJI ---
  window.renderMessagesPanel = async function () {
    if (appTitle) appTitle.textContent = T.title;
    if (typeof openPanelInMenu === 'function') openPanelInMenu('appPanel');
    // USTAW tryb rozmiaru panelu: średni (80% wysokości, obok menu)
    const panelEl = document.getElementById('appPanel');

    if (panelEl && panelEl.getAttribute('data-panel') !== 'messages') {
      panelEl.setAttribute('data-panel', 'messages');
    }
    if (panelEl) {
      const fixSizing = () => {
        panelEl.classList.remove('msgx-wide', 'msgx-medium');
        panelEl.classList.add('dock-left', 'is-open');   // << pokazujemy panel WYŁĄCZNIE przez klasę
        panelEl.style.removeProperty('width');
        panelEl.style.removeProperty('left');
        panelEl.style.removeProperty('right');
      };
      // sync + microtask + rAF + timeout — odporne na opóźnione dopięcie klas
      fixSizing(); queueMicrotask(fixSizing); requestAnimationFrame(fixSizing); setTimeout(fixSizing, 0);
    }

    appBody.innerHTML = `<div class="conv-card">${T.loading}</div>`;

    // wyczyść poprzedni kontekst – unikamy przejęcia starego wątku
    state.currentConvId = null;
    state.prepared = null;

    // 1) wczytaj listę konwersacji i zbuduj grupy
    await loadList();
    appBody.innerHTML = layoutHTML();

    // >>> TU DODAĆ obsługę przycisków „Aktualne / Archiwum”
    const btnActive   = appBody.querySelector('.js-show-active');
    const btnArchived = appBody.querySelector('.js-show-archived');

    if (btnActive) {
      btnActive.addEventListener('click', async () => {
        await loadList();
        renderGroups();
        state.groupIdx = 0;
        state.threadIdx = 0;
        buildThreads();
      });
    }

    if (btnArchived) {
      btnArchived.addEventListener('click', async () => {
        await loadArchived();
        renderGroups();
        state.groupIdx = 0;
        state.threadIdx = 0;
        buildThreads();
      });
    }

    // Czy mamy narzucony konkretny wątek? (np. z My Real Estate)
    let targetConvId = window.__openConvId ? String(window.__openConvId) : null;

    // 2) PREPARE – jeśli przyszliśmy z klikniętego domu
    const id_fme = (window.__lastPickedIdFME || '').trim();
    if (id_fme) {
      try {
        const prep = await jget(`${API.prepare}?id_fme=${encodeURIComponent(id_fme)}`);
        state.prepared = prep;

        if (prep.has_conversation && prep.conversation_id) {
          // jeśli nie narzucono targetu ręcznie, użyj wątku z prepare
          if (!targetConvId) {
            targetConvId = String(prep.conversation_id);
          }
        } else {
          // brak wątku dla tego domu – wstrzyknij „wirtualną” grupę
          injectPreparedGroup();
        }
      } catch (e) {
        // brak kontekstu / błąd prepare – jedziemy dalej z samą listą
      }
    }

    // Jeśli mamy docelowy wątek – ustaw groupIdx / threadIdx na niego
    if (targetConvId) {
      outer: for (let gi = 0; gi < state.groups.length; gi++) {
        const g = state.groups[gi];
        for (let ti = 0; ti < g.items.length; ti++) {
          if (String(g.items[ti].id) === targetConvId) {
            state.groupIdx  = gi;
            state.threadIdx = ti;
            break outer;
          }
        }
      }
    }

    // 3) render
    renderGroups();
    buildThreads();
    startListPolling();

    // Włącz poziomy i pionowy resize dla panelu wiadomości
    if (panelEl && typeof window.enableAppPanelResize === 'function') {
      window.enableAppPanelResize(panelEl, {
        axis: 'x',
        min: 260,
        storeKey: 'messages_width'
      });
      window.enableAppPanelResize(panelEl, {
        axis: 'y',
        min: 260,
        storeKey: 'messages_height'
      });
    }
    // wyczyść, żeby kolejny raz nie wymuszać tego samego wątku
    window.__openConvId = null;

  };


  const closeBtn = document.querySelector('[data-close="appPanel"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.stopMessagesPolling?.();
      const panel = document.getElementById('appPanel');
      if (panel) panel.classList.remove('is-open', 'msgx-wide', 'dock-left');
      if (typeof backToMenu === 'function') backToMenu(); // wróć do menu
    });
  }


})();


