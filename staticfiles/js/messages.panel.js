// static/js/messages.panel.js — panel 4-częściowy (1: grupy, 2: wątki, 3: czat, 4: odpowiedzi)
(function () {
  const MOCK = {
    groups: [
      {
        name: 'Empire State Building',
        threads: [
          {
            title: 'User 01231',
            messages: [
              { who: 'them', text: 'Dzień dobry, czy dom jest na sprzedaż?' },
              { who: 'me',   text: 'Tak, cena wywoławcza 1 500 000 USD.' },
              { who: 'them', text: 'Czy rozważy Pan 1 420 000 USD?' }
            ]
          },
          {
            title: 'AdamSender@gmail.com',
            messages: [
              { who: 'me',   text: 'Wysyłam ofertę 1 480 000 USD.' },
              { who: 'them', text: 'Dziękuję, dam znać po naradzie.' }
            ]
          },
          {
            title: 'DzyngisHan@yahoo.com',
            messages: [
              { who: 'them', text: 'Czy pasuje Panu jutro 12:00?' },
              { who: 'me',   text: 'Tak, potwierdzam.' }
            ]
          }
        ]
      },
      { name: 'Dom XYZ', threads: [
        { title: 'HenryLee21', messages:[
          { who: 'them', text: 'Czy są hipoteki/obciążenia?' },
          { who: 'me',   text: 'Brak obciążeń, księga czysta.' }
        ]}
      ]},
      { name: 'Manhattan – 5th Ave 123', threads: [] },
      { name: 'Warszawa – Orla 8', threads: [] }
    ]
  };

  const state = { g: 0, t: 0 };
  const $ = (q, r=document)=>r.querySelector(q);
  const $$ = (q, r=document)=>Array.from(r.querySelectorAll(q));
  const esc = s => String(s).replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function groupsHTML() {
    return MOCK.groups.map((g,i)=>`<div class="msgx-item ${i===state.g?'active':''}" data-g="${i}">${esc(g.name)}</div>`).join('');
  }
  function threadsHTML() {
    const th = (MOCK.groups[state.g]?.threads||[]);
    if (!th.length) return `<div class="msgx-item">Brak wątków</div>`;
    return th.map((t,i)=>`<div class="msgx-item ${i===state.t?'active':''}" data-t="${i}">${esc(t.title)}</div>`).join('');
  }
  function bubblesHTML() {
    const thr = MOCK.groups[state.g]?.threads?.[state.t];
    if (!thr) return '';
    return thr.messages.map(m=>`<div class="msgx-bubble ${m.who==='me'?'mine':'theirs'}">${esc(m.text)}</div>`).join('');
  }

  function skeletonHTML() {
    return `
      <div class="msgx">
        <!-- 1: Grupy -->
        <section class="msgx-col">
          <div class="msgx-head">Grupy (Domy)</div>
          <div class="msgx-list js-groups"></div>
        </section>

        <!-- 2: Wątki -->
        <section class="msgx-col">
          <div class="msgx-head">Wątki</div>
          <div class="msgx-list js-threads"></div>
        </section>

        <!-- 3: Czat (z kompozytorem jako 4) -->
        <section class="msgx-col msgx-chat">
          <div class="msgx-chat-head">
            <div class="msgx-chat-title js-chat-title"></div>
          </div>
          <div class="msgx-chat-body js-chat-body"></div>

          <!-- 4: Odpowiedzi + input -->
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
      </div>
    `;
  }

  function renderColumns() {
    const gList = $('.js-groups');    if (gList) gList.innerHTML = groupsHTML();
    const tList = $('.js-threads');   if (tList) tList.innerHTML = threadsHTML();

    const g = MOCK.groups[state.g], thr = g?.threads?.[state.t];
    const head = $('.js-chat-title'); if (head) head.textContent = `Wątek: ${thr?.title||'—'} (${g?.name||'—'})`;
    const body = $('.js-chat-body');  if (body) { body.innerHTML = bubblesHTML(); requestAnimationFrame(()=>{ body.scrollTop = body.scrollHeight; }); }

    $$('.js-groups .msgx-item').forEach(n=>n.addEventListener('click', ()=>{ const gi=+n.dataset.g; if(gi!==state.g){ state.g=gi; state.t=0; renderColumns(); } }));
    $$('.js-threads .msgx-item').forEach(n=>n.addEventListener('click', ()=>{ const ti=+n.dataset.t; if(ti!==state.t){ state.t=ti; renderColumns(); } }));
  }

  // Wejście główne – wywołuj z menu
  window.renderMessagesPanel = function () {
    if (typeof openPanelInMenu === 'function') openPanelInMenu('appPanel'); // pokaż #appPanel (masz to już) :contentReference[oaicite:0]{index=0}
    const title = $('#appPanelTitle'); const panel = $('#appPanel'); const body = $('#appPanelBody');
    if (title) title.textContent = 'Wiadomości';
    if (panel) panel.classList.add('msgx-wide');
    if (body)  body.innerHTML = skeletonHTML();
    renderColumns();
  };
})();
