(() => {
  const build = 'featurePanel.2025.js :: build 2025-10-19 19:05 CEST';
  console.log(build);
  // opcjonalnie, oznacz stronę atrybutem – widać w Elements
  document.documentElement.setAttribute('data-fp-build', build);
})();


function sendClickAnalytics(userId, idFme, lat, lon, h3) {
  if (!window.ANALYTICS_BASE || !window.ANALYTICS_TOKEN) return;
  if (!idFme) return;

  // --- DEDUPE: 1 klik na H3 na dzień w danej przeglądarce ---
  try {
    // jeśli mamy h3, deduplikujemy po h3; jeśli nie, po idFme
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const userKey = userId ? String(userId) : "anon";
    const keyBase = h3 ? String(h3) : String(idFme);
    const key = `analytics_click_${userKey}_${keyBase}_${today}`;
    if (localStorage.getItem(key)) {
      // już był klik w ten H3 (lub ten dom) dzisiaj – nie wysyłamy drugi raz
      return;
    }
    localStorage.setItem(key, "1");
  } catch (e) {
    // jeśli localStorage nie działa – po prostu wysyłamy, bez deduplikacji
    console.warn("[analytics] localStorage error", e);
  }
  // --- KONIEC DEDUPE ---

  const payload = {
    user_id: userId ? String(userId) : "anon",
    id_fme: String(idFme),
    lat: lat != null ? Number(lat) : null,
    lon: lon != null ? Number(lon) : null,
    h3: h3 ? String(h3) : null
  };

  fetch(`${window.ANALYTICS_BASE}/api/clicks/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${window.ANALYTICS_TOKEN}`,
    },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {});
}



// js/featurePanel.js — v4 ROBUST: hover outline (if possible) + persistent select + dynamic style fallback
(function () {
  console.log('[FeaturePanel v4] loaded ver 1.3');
  // Ustal id zalogowanego (cache w window.currentUserId)
  async function whoamiId() {
    if (window.currentUserId) return String(window.currentUserId);
    try {
      const r = await fetch('/api/auth/whoami/', { credentials: 'same-origin' });
      if (!r.ok) return '';
      const j = await r.json();
      const id = j.id ?? j.user_id ?? (j.user && j.user.id);
      window.currentUserId = id ? String(id) : '';
      return window.currentUserId;
    } catch {
      return '';
    }
  }

  function bind() {
    const viewer = window.__viewer || window.viewer;
    console.log('[FeaturePanel v4] bind start — viewer', viewer ? 'OK' : 'MISSING');
    if (!viewer) return;

    const scene = viewer.scene;

    // ---- UI: small hover overlay (name) + right panel props ----
    const panel    = document.getElementById('featurePanel');
    const titleEl  = document.getElementById('featureTitle');
    const propsEl  = document.getElementById('featureProps');
    const btnClose = document.getElementById('featureClose');
    const openPanel  = () => { if (panel) panel.style.display = 'block'; };
    const closePanel = () => { if (panel) { panel.style.display = 'none'; if (propsEl) propsEl.innerHTML = ''; } };


    if (btnClose) btnClose.addEventListener('click', closePanel);

    const overlay = document.createElement('div');
    overlay.className = 'backdrop';
    Object.assign(overlay.style, {
      display:'none', position:'absolute', bottom:'0', left:'0',
      pointerEvents:'none', padding:'4px 6px', background:'rgba(0,0,0,.85)',
      color:'#fff', font:'12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
    });
    viewer.container.appendChild(overlay);

    const url = String(location.search || '');
    const forceSilh     = /(?:\?|&)silh=1(?:&|$)/.test(url);
    const forceFallback = /(?:\?|&)silh=0(?:&|$)/.test(url);
    const forceStyle    = /(?:\?|&)style=1(?:&|$)/.test(url);

    const silhSupported = Cesium.PostProcessStageLibrary.isSilhouetteSupported(scene);
    const useSilhouette = !forceFallback && (forceSilh || silhSupported) && !forceStyle;

    console.log('[FeaturePanel v4] silhouettes supported:', silhSupported, 'useSilhouette:', useSilhouette, 'forceStyle:', forceStyle);

    function isFeature(obj) {
      return Cesium.defined(obj) && (typeof obj.getProperty === 'function' || typeof obj.getPropertyIds === 'function' || obj.hasOwnProperty('_batchId'));
    }
    function pickAt(position) {
      try { return scene.pick(position); } catch (e) { console.warn('[FeaturePanel v4] pick error', e); return undefined; }
    }
    function setOverlay(picked, pos) {
      try {
        let txt = '';
        if (isFeature(picked) && typeof picked.getProperty === 'function') {
          const cands = ['name','id','OBJECTID','FID','BIN'];
          for (const c of cands) {
            const v = picked.getProperty(c);
            if (v != null) { txt = String(v); break; }
          }
        }
        overlay.textContent = txt;
        overlay.style.display = txt ? 'block' : 'none';
        if (pos) {
          overlay.style.bottom = `${viewer.canvas.clientHeight - pos.y}px`;
          overlay.style.left = `${pos.x + 8}px`;
        }
      } catch { overlay.style.display = 'none'; }
    }

    // ------------------------------
    //   PROPERTIES (robust readers)
    // ------------------------------
    function listProps(obj){
      console.log('[DEBUG feature]', obj);

      let h = '';
      const add = (k,v)=>{ h += `<div class="prop"><div class="k">${k}</div><div>${v==null?'':String(v)}</div></div>`; };

      // ZAWSZE pokaż podstawy (nawet gdy brak atrybutów)
      try {
        if (obj && (obj._batchId || obj._batchId===0)) add('batchId', obj._batchId);
        const ts = (obj && (obj.tileset || obj.content?.tileset || obj._content?._tileset));
        if (ts?.url) add('tilesetUrl', ts.url);
      } catch(_) {}

      const hasGet = obj && typeof obj.getProperty === 'function';

      // 1) klasyczne API (property names)
      if (hasGet && obj.getPropertyNames) {
        try { const names = obj.getPropertyNames(); if (names?.length) names.forEach(n => add(n, obj.getProperty(n))); } catch(_){}
      }

      // 2) 3D Tiles Next (property ids)
      if (hasGet && obj.getPropertyIds) {
        try { const ids = obj.getPropertyIds(); if (ids?.length) ids.forEach(id => add(id, obj.getProperty(id))); } catch(_){}
      }

      // 3) BEST-EFFORT: BatchTable z contentu
      try {
        const content    = obj._content || obj.content || obj._tile?.content;
        const batchTable = content?.batchTable || content?._batchTable || content?._model?.batchTable || content?._model?._batchTable;
        const bId        = (obj && (obj._batchId || obj._batchId===0)) ? obj._batchId : undefined;

        if (batchTable && bId !== undefined) {
          // 3a) nazwy właściwości
          try {
            const btTry = batchTable.getPropertyNames ? batchTable.getPropertyNames(bId) : [];
            const btNo  = batchTable.getPropertyNames ? batchTable.getPropertyNames()     : [];
            const bt    = (btTry && btTry.length ? btTry : btNo) || [];
            if (bt.length) bt.forEach(n => { try { add(n, batchTable.getProperty ? batchTable.getProperty(bId, n) : undefined); } catch(_){ } });
          } catch(_){}

          // 3b) JSON-owa część (często tu są realne wartości)
          try {
            const json = batchTable._batchTableJson || batchTable.batchTableJson || batchTable._json;
            if (json && typeof json === 'object') {
              Object.keys(json).forEach(n=>{
                try {
                  const val = json[n];
                  const v = Array.isArray(val) ? val[bId] : val;
                  if (v != null) add(n, v);
                } catch(_){}
              });
            }
          } catch(_){}

          // 3c) binarne/alternatywne przechowywanie
          try {
            Object.keys(batchTable._binaryProperties || {}).forEach(n => { try { const v = batchTable.getProperty?.(bId, n); if (v != null) add(n, v); } catch(_){} });
          } catch(_){}
          try {
            Object.keys(batchTable._properties || {}).forEach(n => {
              try {
                const p = batchTable._properties[n]; let v;
                if (Array.isArray(p?.values)) v = p.values[bId];
                else if (p?.values)           v = p.values[bId];
                else if (p && typeof p.length === 'number') v = p[bId];
                if (v != null) add(n, v);
              } catch(_){}
            });
          } catch(_){}
          try {
            Object.keys(batchTable._propertyIds || {}).forEach(n => {
              try {
                const p = batchTable._propertyIds[n]; let v;
                if (Array.isArray(p?.values)) v = p.values[bId];
                else if (p?.values)           v = p.values[bId];
                else if (p && typeof p.length === 'number') v = p[bId];
                if (v != null) add(n, v);
              } catch(_){}
            });
          } catch(_){}
        }
      } catch(_){}

      // 4) heurystyki: typowe klucze
      if (h === '' && hasGet) {
        ['name','id','height','class','type','Longitude','Latitude','Height','OBJECTID','FID','BIN']
          .forEach(n=>{ try { const v=obj.getProperty(n); if (v!=null) add(n,v); } catch(_){ } });
      }

      // 5) fallback: proste własne pola (nie obiekty)
      if (h === '') {
        try {
          Object.keys(obj).forEach(k=>{ try { const v = obj[k]; if (v==null || typeof v==='object') return; add(k, v); } catch(_){} });
        } catch(_){}
      }

      if (h === '') h = '<div class="prop"><div class="k">Brak właściwości</div><div></div></div>';
      return h;
    }

    // wersja SAFE – panel się nie wywali nawet przy wyjątkach wewnątrz listProps
    function listPropsSafe(obj) {
      try {
        return listProps(obj);
      } catch (e) {
        console.error('[FeaturePanel] listProps error:', e);
        return '<div class="prop"><div class="k">Błąd odczytu właściwości</div><div>szczegóły w konsoli</div></div>';
      }
    }

    function showPropsFor(picked){
      if (!Cesium.defined(picked)) { closePanel(); return; }

      let title = 'Wybrany obiekt';
      try {
        if (typeof picked.getProperty === 'function') {
          const t = picked.getProperty('name') || picked.getProperty('id') || picked.getProperty('OBJECTID') || picked.getProperty('BIN');
          if (t != null) title = t;
        } else if (picked.id && picked.id.name) {
          title = picked.id.name;
        }
      } catch(_) {}

      if (titleEl) titleEl.textContent = title;

      // najpierw pokaż panel, potem ładuj treść – żeby UI zareagował natychmiast
      openPanel && openPanel();

      if (propsEl) propsEl.innerHTML = listPropsSafe(picked);

      // --- [DB] stabilny box + diagnostyka ---
      const API_BASE = window.API_BASE || '/api';

      // 1) Zapewnij stały pojemnik na dane z DB
      let dbBox = propsEl.querySelector('#dbProps');
      if (!dbBox) {
        dbBox = document.createElement('div');
        dbBox.id = 'dbProps';
        propsEl.prepend(dbBox);
        // Jednorazowo dolej styl dla sekcji DB
        if (!document.getElementById('dbPanelCSS')) {
          const s = document.createElement('style');
          s.id = 'dbPanelCSS';
          s.textContent = `
            /* Delikatne tło i padding tylko dla sekcji z bazy */
            #featurePanel #dbProps{
              background: rgba(255, 215, 0, 0.08); /* lekko złote, bardzo subtelne */
              padding: 8px 10px;
              border-radius: 10px;
              margin: 8px 0 10px;
            }
            #featurePanel #dbProps .db-head{
              font-weight: 700; font-size: 12px; opacity: .7; margin-bottom: 6px;
            }
            /* Każdy wiersz DB to pełna szerokość; label i wartość w 2 kolumnach */
            #featurePanel #dbProps .db-row{
              display: grid;
              grid-template-columns: 120px 1fr;
              column-gap: 10px;
              row-gap: 4px;
              align-items: start;
              padding: 2px 0;
            }
            #featurePanel #dbProps .db-row .k{ opacity: .75; }
          `;
          document.head.appendChild(s);
          // Styl dla czerwonego przycisku „Przejęcie”
          if (!document.getElementById('fpActionsCSS')) {
            const s2 = document.createElement('style');
            s2.id = 'fpActionsCSS';
            s2.textContent = `
              #featurePanel .btn.btn-danger { background:#d92c2c; border:1px solid #b51f1f; color:#fff; }
              #featurePanel .btn.btn-danger:hover { filter: brightness(.95); }
            `;
            document.head.appendChild(s2);
          }
        }
      }
      dbBox.innerHTML = '<div class="db-head">Baza</div><div class="db-row"><div class="k">Ładowanie…</div><div class="v"></div></div>';


      // 2) Wyciągnij ID z klikniętego feature (kilka kluczy + sanityzacja)
      function sanitizeId(v) {
        if (v === undefined || v === null) return '';
        const s = String(v).trim();
        // usuwamy .0 z końca jeśli przychodzi z floatów
        return s.replace(/\.0+$/, '');
      }
      function getPickedId(p) {
        try {
          if (!p?.getProperty) return '';
          for (const k of ['ID_FME','id_fme','ID','OBJECTID','FID','BIN']) {
            const val = p.getProperty(k);
            if (val !== undefined && val !== null && String(val).trim() !== '') {
              return sanitizeId(val);
            }
          }
        } catch (e) { console.warn('[DB] getPickedId err', e); }
        return '';
      }

      const id = getPickedId(picked);
      window.__lastPickedIdFME = id; // zapamiętaj ID_FME dla przycisku "Wyślij wiadomość"
      console.log('[DB] click id =', id, 'props keys =', picked?.getPropertyIds?.());

      // 3) Jeśli brak ID — pokaż komunikat i wyjdź
      if (!id) {
          dbBox.innerHTML = '<div class="db-head">Baza</div><div class="db-row"><div class="k">Brak ID_FME</div><div class="v">Nie znaleziono w kafelku</div></div>';
          return;
        } else {
        // === TU: nowy endpoint Django ===
        const url = `/api/house/${encodeURIComponent(id)}/`;
        console.log('[DB] fetch', url);

        fetch(url, { headers: { 'Accept': 'application/json' } })
          .then(async r => {
            const text = await r.text();
            console.log('[DB] status', r.status, 'body', text.slice(0, 200));
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return JSON.parse(text);
          })
          .then(async d => {

            // --- ANALITYKA: logowanie kliknięcia domu ---
            try {
              const currentUserId = await whoamiId();
              const idFme = d.id_fme ?? id;
              const lat = d.lat ?? latVal;
              const lon = d.lon ?? lonVal;
              sendClickAnalytics(currentUserId, idFme, lat, lon, d.h3_id);
            } catch (e) {
              console.warn('[analytics] click log failed', e);
            }
            // --- KONIEC FRAGMENTU ANALITYKI ---

            // Pola wg Twojego API: name, levels, height, h3_id, h3_res, status (reszta może być null)
            const makeRow = (k, v) => (v == null || v === '')
              ? ''
              : `<div class="db-row"><div class="k">${k}</div><div class="v">${v}</div></div>`;


            const currentUserId = await whoamiId();  
            const totalShares   = Number.isFinite(d.total_shares) ? d.total_shares : (d.total_shares || 1);
            const listingShares = (d.listing_shares != null ? d.listing_shares : null);
            const isFractional  = totalShares > 1;

    // listings z API (nowe pole: d.listings)
    const listings = Array.isArray(d.listings) ? d.listings : [];
    const listingsBySeller = new Map();
    listings.forEach(lst => {
      if (lst && lst.seller_id != null) {
        listingsBySeller.set(String(lst.seller_id), lst);
      }
    });

    const owners = Array.isArray(d.owners) ? d.owners : [];
    let ownersBlock = '';
    if (owners.length) {
      const rows = owners.map(o => {
        const sellerId  = o.user_id;
        const uname     = o.username || `User ${sellerId ?? ''}`;
        const shares    = o.shares;
        let   perc      = o.percent;

        if ((perc === null || perc === undefined) && totalShares) {
          perc = (shares / totalShares) * 100.0;
        }
        const percTxt = (perc !== null && perc !== undefined && isFinite(perc))
          ? ` (${perc.toFixed(1)}%)`
          : '';

        const isMe       = currentUserId && String(sellerId) === String(currentUserId);
        const lst        = listingsBySeller.get(String(sellerId)) || null;
        const hasListing = !!lst;
        const priceTxt   = (lst && lst.price != null) ? `$${lst.price}` : '';
        const shCount    = (lst && lst.share_count != null) ? lst.share_count : null;

        let actionsHtml = '';

        if (hasListing) {
          const listingInfo = shCount != null
            ? `Listing: ${shCount} shares for ${priceTxt}`
            : `Listing for ${priceTxt}`;

          if (isMe) {
            // MÓJ listing: Edit + End
            actionsHtml = `
              <div class="owner-listing-row">
                <span class="owner-listing">${listingInfo}</span>
                <button class="btn fp-owner-edit" data-listing-id="${lst.id}">Edit price</button>
                <button class="btn fp-owner-end"  data-listing-id="${lst.id}">End listing</button>
              </div>`;
          } else {
            // CUDZY listing: Buy + Message
            actionsHtml = `
              <div class="owner-listing-row">
                <span class="owner-listing">${listingInfo}</span>
                <button class="btn fp-owner-buy"
                        data-listing-id="${lst.id}"
                        data-seller-id="${sellerId}">Buy</button>
                <button class="btn fp-owner-msg"
                        data-seller-id="${sellerId}">Send message</button>
              </div>`;
          }
        } else {
          // Brak listingów u tego właściciela
          if (!isMe) {
            actionsHtml = `
              <div class="owner-listing-row">
                <button class="btn fp-owner-msg"
                        data-seller-id="${sellerId}">Send message</button>
              </div>`;
          } else {
            // Mój dom, brak listingu → pokaż SELL przy moim nicku
            actionsHtml = `
              <div class="owner-listing-row">
                <button class="btn fp-owner-sell"
                        data-owner-id="${sellerId}">Sell</button>
              </div>`;
          }
        }

        return `
          <div class="owner-row" data-owner-id="${sellerId}">
            <div class="owner-main">
              <span class="owner-name">${uname}</span>
              <span class="owner-shares">${shares}${percTxt}</span>
            </div>
            <div class="owner-actions">
              ${actionsHtml}
            </div>
          </div>`;
      });

      ownersBlock = `<div class="owners-list">${rows.join('')}</div>`;
    }

            const attrs = d.attrs || {};

            const latVal =
              d.lat ??
              attrs.FME_lat ??
              attrs.lat ??
              attrs.FME_center_lat ??
              attrs.center_lat ??
              attrs.centroid_lat;

            const lonVal =
              d.lon ??
              attrs.FME_lon ??
              attrs.lon ??
              attrs.FME_center_lon ??
              attrs.center_lon ??
              attrs.centroid_lon;

            const rows =
              makeRow('ID_FME', d.id_fme ?? id) +
              makeRow('Nazwa', d.name) +
              makeRow('Piętra', d.levels) +
              makeRow('Wysokość', d.height != null ? `${d.height} m` : null) +
                            makeRow(
                'Lat/Lon',
                (d.lat != null && d.lon != null)
                  ? `${d.lat}, ${d.lon}`
                  : null
              ) +
              makeRow('H3', [d.h3_id, d.h3_res != null ? ('@' + d.h3_res) : ''].filter(Boolean).join(' ')) +
              (isFractional ? makeRow('Udziały', `${totalShares}`) : '') +
              (ownersBlock ? makeRow('Współwłaściciele', ownersBlock) : '');




            dbBox.innerHTML = '<div class="db-head">Baza</div>' + (rows || '<div class="db-row"><div class="k">Brak danych</div><div class="v"></div></div>');
            // Ukryj "Wyślij wiadomość" dla własnego domu
            const msgBtn = document.getElementById('fpMessage');
            if (msgBtn) {
              const me = await whoamiId();
              const ownersArr = Array.isArray(d.owners) ? d.owners : [];
              const iAmOwner = ownersArr.some(o => String(o.user_id) === me && o.shares > 0);
              msgBtn.style.display = (me && iAmOwner) ? 'none' : 'inline-block';
            }

            // --- per-owner actions: Buy / Edit / End / Send message (lista współwłaścicieli) ---
            dbBox.addEventListener('click', async (ev) => {
              const sellOwnerBtn = ev.target.closest('.fp-owner-sell');
              const buyBtn      = ev.target.closest('.fp-owner-buy');
              const editBtn     = ev.target.closest('.fp-owner-edit');
              const endBtn      = ev.target.closest('.fp-owner-end');
              const msgBtnOwner = ev.target.closest('.fp-owner-msg');

            // SELL przy naszym nicku
              if (sellOwnerBtn) {
                ev.preventDefault();

                const ownersArr = Array.isArray(d.owners) ? d.owners : [];
                const me = await whoamiId();
                const myOwnerEntry = ownersArr.find(o => String(o.user_id) === String(me));
                const myShares = myOwnerEntry ? myOwnerEntry.shares : 0;

                if (!myShares) {
                  alert('Nie masz udziałów w tym domu.');
                  return;
                }

                const rawShares = prompt(`How many shares do you want to sell? (1–${myShares})`);
                if (!rawShares) return;
                const shareCount = Number(String(rawShares).trim());
                if (!Number.isFinite(shareCount) || shareCount < 1 || shareCount > myShares) {
                  alert(`Nieprawidłowa liczba udziałów (1–${myShares}).`);
                  return;
                }

                const rawPrice = prompt('Enter total price for these shares ($):');
                if (!rawPrice) return;
                const price = String(rawPrice).trim();
                if (!price) return;

                try {
                  const params = new URLSearchParams({ price, share_count: String(shareCount) });
                  const resp = await fetch(`/api/house/${encodeURIComponent(d.id_fme ?? id)}/list/`, {
                    method: 'POST',
                    headers: {
                      'X-CSRFToken': getCookie('csrftoken'),
                      'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    credentials: 'same-origin',
                    body: params
                  });
                  const j = await resp.json().catch(() => ({}));
                  if (!resp.ok || !j.ok) throw new Error(j.error || 'Listing failed');
                  showPropsFor(picked);
                } catch (e) {
                  alert(e.message || 'Błąd wystawiania');
                }
                return;
              }



              // BUY – bezpośrednia finalizacja listingu (kup pakiet udziałów)
              if (buyBtn) {
                ev.preventDefault();
                const listingId = buyBtn.dataset.listingId;
                if (!listingId) return;
                if (!confirm('Czy na pewno chcesz kupić ten pakiet udziałów?')) return;

                try {
                  const resp = await fetch('/api/trade/finalize/', {
                    method: 'POST',
                    headers: {
                      'X-CSRFToken': getCookie('csrftoken'),
                      'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    credentials: 'same-origin',
                    body: new URLSearchParams({ listing_id: listingId })
                  });
                  const j = await resp.json().catch(() => ({}));
                  if (!resp.ok || !j.ok) throw new Error(j.error || 'Trade failed');

            
                  // --- NOWY KOMUNIKAT PO ZAKUPIE ---
                  if (j.shares && j.amount) {
                    const priceTxt = j.currency ? `${j.amount} ${j.currency}` : j.amount;
                    const fromWho = j.seller_username
                      ? ` from ${j.seller_username}`
                      : (j.seller_id ? ` from user ${j.seller_id}` : '');

                    const msg = `You bought ${j.shares} shares${fromWho} for ${priceTxt}.`;
                    alert(msg);
                  } else {
                    alert('Trade completed.');
                  }


                  // odśwież panel domku / współwłaścicieli po transakcji
                  showPropsFor(picked);
                } catch (e) {
                  alert(e.message || 'Błąd zakupu');
                }
                return;
              }


              // EDIT PRICE – zmiana ceny własnego listingu
              if (editBtn) {
                ev.preventDefault();
                const listingId = editBtn.dataset.listingId;
                if (!listingId) return;

                const rawPrice = prompt('New price ($):');
                if (!rawPrice) return;
                const price = String(rawPrice).trim();
                if (!price) return;

                try {
                  const resp = await fetch(`/api/house/${encodeURIComponent(d.id_fme ?? id)}/list/`, {
                    method: 'POST',
                    headers: {
                      'X-CSRFToken': getCookie('csrftoken'),
                      'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    credentials: 'same-origin',
                    // TU DODAJEMY listing_id
                    body: new URLSearchParams({ price, listing_id: listingId })
                  });
                  const j = await resp.json().catch(() => ({}));

                  if (!resp.ok || !j.ok) {
                    // Jeśli listing jest już zamknięty / sprzedany → pokaż komunikat i odśwież panel
                    if (j.error === 'LISTING_NOT_ACTIVE') {
                      alert('This listing is no longer active (sold or ended). The panel will refresh.');
                      if (picked) {
                        showPropsFor(picked);
                      }
                      return;
                    }
                    throw new Error(j.error || 'Update failed');
                  }

                  // sukces – normalne odświeżenie panelu
                  showPropsFor(picked);
                } catch (e) {
                  alert(e.message || 'Błąd aktualizacji ceny');
                }
                return;
              }


              // END LISTING – zakończenie własnego ogłoszenia
              if (endBtn) {
                ev.preventDefault();
                const listingId = endBtn.dataset.listingId;
                if (!listingId) return; // logicznie, ale backend bierze house+user
                if (!confirm('Zakończyć to ogłoszenie?')) return;
                try {
                  const resp = await fetch(`/api/house/${encodeURIComponent(d.id_fme ?? id)}/unlist/`, {
                    method: 'POST',
                    headers: { 'X-CSRFToken': getCookie('csrftoken') },
                    credentials: 'same-origin'
                  });
                  const j = await resp.json().catch(() => ({}));
                  if (!resp.ok || !j.ok) throw new Error(j.error || 'Unlist failed');
                  showPropsFor(picked);
                } catch (e) {
                  alert(e.message || 'Błąd zdejmowania ogłoszenia');
                }
                return;
              }

              // SEND MESSAGE – do konkretnego współwłaściciela (owner row)
              if (msgBtnOwner) {
                ev.preventDefault();
                const sellerId = msgBtnOwner.dataset.sellerId;
                const id_fme   = (d.id_fme ?? id);
                if (!sellerId || !id_fme) return;
                try {
                  const resp = await fetch('/api/messages/start/', {
                    method: 'POST',
                    headers: {
                      'X-CSRFToken': getCookie('csrftoken'),
                      'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    credentials: 'same-origin',
                    body: new URLSearchParams({
                      id_fme: id_fme,
                      seller_id: String(sellerId),
                    })
                  });
                  const j = await resp.json().catch(() => ({}));
                  if (!resp.ok || !j.ok) throw new Error(j.error || 'Message start failed');

                  // ustaw rozmowę i przełącz panel messages
                  window.__openConvId = j.conversation_id;
                  window.__lastPickedIdFME = id_fme;

                  const app = document.getElementById('appPanel');
                  if (app) app.setAttribute('data-panel', 'messages');
                  if (typeof window.renderMessagesPanel === 'function') {
                    window.renderMessagesPanel();
                    if (typeof closePanel === 'function') closePanel();
                  }
                } catch (e) {
                  alert(e.message || 'Błąd otwierania wiadomości');
                }
                return;
              }
            });


            // Podłącz klik — otwórz panel wiadomości
            const msgBtn2 = document.getElementById('fpMessage');
            if (msgBtn2 && !msgBtn2.dataset.msgBound) {
              msgBtn2.dataset.msgBound = '1';
              msgBtn2.addEventListener('click', (e) => {
                e.preventDefault();
                const app = document.getElementById('appPanel');
                if (app) app.setAttribute('data-panel', 'messages');
                if (typeof window.renderMessagesPanel === 'function') {
                  window.renderMessagesPanel(); // messages.app.js załaduje /prepare na bazie window.__lastPickedIdFME
                  if (typeof closePanel === 'function') closePanel();
                }
              });
            }
            // === ACTIONS: Zajmij / Sell / Kup ===
            // === ACTIONS: Zajmij / Sell / Kup / Przejęcie ===
            try {
              const currentUserId = await whoamiId();

              const totalShares   = Number.isFinite(d.total_shares) ? d.total_shares : (d.total_shares || 1);
              const isFractional  = totalShares > 1;

              const ownersArr = Array.isArray(d.owners) ? d.owners : [];
              const myOwnerEntry = ownersArr.find(o => String(o.user_id) === currentUserId);
              const hasShares = !!myOwnerEntry && myOwnerEntry.shares > 0;

              let actionsHtml = '';

              // 1) Nikt nie ma udziałów → "Zajmij"
              if (!ownersArr.length) {
                // brak właścicieli → Zajmij
                if (currentUserId) {
                  actionsHtml += '<div id="houseActions"><button class="btn" id="occupyBtn">Zajmij</button></div>';
                }

              } else if (currentUserId && hasShares) {
                // Właściciel / współwłaściciel – sprzedaż tylko z listy współwłaścicieli
                // (tu celowo NIE generujemy żadnych globalnych przycisków Sell)

              } else if (currentUserId && !hasShares && ownersArr.length > 0) {
                // User nie ma udziałów, ale dom ma właścicieli → tylko Przejęcie
                actionsHtml += '<div id="houseActions">' +
                              '  <button class="btn btn-danger" id="takeoverBtn">Przejęcie</button>' +
                              '</div>';
              }



              let actionsRoot = null;                  // <-- ważne: dostępny w całym bloku
              if (actionsHtml) {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = actionsHtml;
                dbBox.appendChild(wrapper.firstElementChild);

                actionsRoot = dbBox.querySelector('#houseActions');
                if (!actionsRoot) return;

                // --- ZAJMIJ ---
                const occupyBtn = actionsRoot.querySelector('#occupyBtn');
                if (occupyBtn) {
                  occupyBtn.addEventListener('click', async () => {
                    if (!currentUserId) { alert('Zaloguj się.'); return; }
                    const resp = await fetch(`/api/house/${encodeURIComponent(id)}/occupy/`, {
                      method: 'POST',
                      headers: { 'X-CSRFToken': getCookie('csrftoken') },
                      credentials: 'same-origin'
                    });
                    const j = await resp.json().catch(()=>({}));
                    if (resp.ok && j.ok) { showPropsFor(picked); } else { alert('Błąd zajmowania'); }
                  });
                }

                // --- PRZEJĘCIE ---
                const takeoverBtn = actionsRoot.querySelector('#takeoverBtn');
                if (takeoverBtn) {
                  takeoverBtn.addEventListener('click', async () => {
                    if (!currentUserId) { alert('Zaloguj się.'); return; }
                    if (!confirm('Na pewno przejąć ten dom na własność?')) return;
                    const resp = await fetch(`/api/house/${encodeURIComponent(id)}/takeover/`, {
                      method: 'POST',
                      headers: { 'X-CSRFToken': getCookie('csrftoken') },
                      credentials: 'same-origin'
                    });
                    const j = await resp.json().catch(()=>({}));
                    if (resp.ok && j.ok) { showPropsFor(picked); } else { alert(j.error || 'Błąd przejęcia'); }
                  });
                }





              }
            } catch(e) {
              console.warn('[house-actions] error', e);
            }
            
            })
          .catch(e => {
            dbBox.innerHTML = '<div class="db-head">Baza</div><div class="db-row"><div class="k">Błąd</div><div class="v">' + (e.message || 'Nieznany błąd') + '</div></div>';
          });

      }


    }

    // ---- DYNAMIC TILESET & STYLE FALLBACK ----
    const origStyle = new WeakMap(); // Cesium3DTileset -> style
    function getTilesetFromPicked(p) {
      if (!p) return undefined;
      try {
        if (p.tileset) return p.tileset;
        if (p.content && p.content.tileset) return p.content.tileset;
        if (p._content && p._content._tileset) return p._content._tileset;
      } catch {}
      // fallback: find first tileset
      try {
        const list = scene.primitives?._primitives || [];
        for (const it of list) if (it instanceof Cesium.Cesium3DTileset) return it;
      } catch {}
      return undefined;
    }
    function getKeyVal(p) {
      if (!isFeature(p) || typeof p.getProperty !== 'function') return null;
      // prefer "id-like" keys
      const pref = ['id','ID','OBJECTID','FID','BIN'];
      let key, val;
      try {
        if (p.getPropertyNames) {
          const names = p.getPropertyNames();
          for (const n of pref) if (names?.includes?.(n)) { key = n; break; }
          if (!key && names?.length) key = names[0];
        }
      } catch {}
      if (!key) {
        for (const n of pref) {
          try {
            const v = p.getProperty(n);
            if (v != null) { key = n; val = v; break; }
          } catch {}
        }
      }
      if (key && val == null) { try { val = p.getProperty(key); } catch {} }
      if (key == null || val == null) return null;
      return { key, val };
    }
    function condForKV({key,val}, cssColor) {
      const condVal = (typeof val === 'number') ? String(val) : `'${String(val).replace(/'/g, "\\'")}'`;
      return [`\${${key}} === ${condVal}`, `color('${cssColor}')`];
    }

    // Keep states (per-tileset style)
    let hoverState = null;   // { tileset, kv }
    let selectState = null;  // { tileset, kv }
    function applyStyle(tileset) {
      if (!tileset) return;
      if (!origStyle.has(tileset)) origStyle.set(tileset, tileset.style);
      const conditions = [];
      if (selectState && selectState.tileset === tileset) {
        conditions.push(condForKV(selectState.kv, 'lime'));
      }
      if (hoverState && hoverState.tileset === tileset) {
        // avoid duplicate if same as selected
        const same = selectState && selectState.tileset === tileset &&
                     selectState.kv.key === hoverState.kv.key &&
                     selectState.kv.val === hoverState.kv.val;
        if (!same) conditions.push(condForKV(hoverState.kv, 'yellow'));
      }
      if (conditions.length === 0) {
        // restore original
        tileset.style = origStyle.get(tileset) || undefined;
        return;
      }
      conditions.push(['true', "color('white')"]); // default color (tiles that are not hovered/selected)
      tileset.style = new Cesium.Cesium3DTileStyle({ color: { conditions } });
    }
    function clearHover() {
      if (!hoverState) return;
      const ts = hoverState.tileset;
      hoverState = null;
      applyStyle(ts);
    }

    // ---- INPUT HANDLERS ----
    const clickDefault = viewer.screenSpaceEventHandler.getInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);

    if (useSilhouette) {
      // Post-process outlines
      const silhouetteBlue  = Cesium.PostProcessStageLibrary.createEdgeDetectionStage();
      silhouetteBlue.uniforms.color  = Cesium.Color.BLUE;
      silhouetteBlue.uniforms.length = 0.01;
      silhouetteBlue.selected = [];

      const silhouetteGreen = Cesium.PostProcessStageLibrary.createEdgeDetectionStage();
      silhouetteGreen.uniforms.color  = Cesium.Color.LIME;
      silhouetteGreen.uniforms.length = 0.01;
      silhouetteGreen.selected = [];

      const stage = Cesium.PostProcessStageLibrary.createSilhouetteStage([silhouetteBlue, silhouetteGreen]);
      scene.postProcessStages.add(stage);
      console.log('[FeaturePanel v4] silhouette stage added');

      let selectedFeature = undefined;

      // HOVER: blue outline (no need for tileset.style)
      viewer.screenSpaceEventHandler.setInputAction((move) => {
        silhouetteBlue.selected = [];
        const p = pickAt(move.endPosition);
        setOverlay(p, move.endPosition);
        if (!isFeature(p) || p === selectedFeature) { clearHover(); return; }
        silhouetteBlue.selected = [p];
        clearHover(); // make sure style-hover is off
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      // CLICK: green outline + panel
      viewer.screenSpaceEventHandler.setInputAction((click) => {
        const p = pickAt(click.position);
        console.log('[FeaturePanel v4] click:', p);
        if (!isFeature(p)) {
          silhouetteGreen.selected = [];
          selectedFeature = undefined;
          setOverlay(undefined);
          closePanel();
          if (typeof clickDefault === 'function') clickDefault(click);
          return;
        }
        silhouetteGreen.selected = [p];
        selectedFeature = p;
        showPropsFor(p);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    } else {
      // Fallback: use feature.color if present, otherwise per-tileset style conditions
      const canDirectColor = (f) => isFeature(f) && ('color' in f);
      const highlighted = { feature: undefined, originalColor: new Cesium.Color() };
      const selected    = { feature: undefined, originalColor: new Cesium.Color() };

      viewer.screenSpaceEventHandler.setInputAction((move) => {
        const p = pickAt(move.endPosition);
        setOverlay(p, move.endPosition);

        // Clear previous hover color/style
        if (Cesium.defined(highlighted.feature)) {
          if (canDirectColor(highlighted.feature)) {
            highlighted.feature.color = highlighted.originalColor;
          } else {
            clearHover();
          }
          highlighted.feature = undefined;
        }

        if (!isFeature(p) || (selected.feature && p === selected.feature)) return;

        if (canDirectColor(p)) {
          highlighted.feature = p;
          Cesium.Color.clone(p.color, highlighted.originalColor);
          p.color = Cesium.Color.YELLOW;
        } else {
          // style hover
          const ts = getTilesetFromPicked(p);
          const kv = getKeyVal(p);
          if (ts && kv) {
            hoverState = { tileset: ts, kv };
            applyStyle(ts);
          }
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      viewer.screenSpaceEventHandler.setInputAction((click) => {
        const p = pickAt(click.position);
        console.log('[FeaturePanel v4] click:', p);

        // Clear previous selection
        if (Cesium.defined(selected.feature)) {
          if (canDirectColor(selected.feature)) {
            selected.feature.color = selected.originalColor;
          } else if (selectState) {
            const ts = selectState.tileset;
            selectState = null;
            applyStyle(ts);
          }
          selected.feature = undefined;
        }

        if (!isFeature(p)) {
          setOverlay(undefined);
          closePanel();
          if (typeof clickDefault === 'function') clickDefault(click);
          return;
        }

        if (canDirectColor(p)) {
          selected.feature = p;
          if (p === highlighted.feature) {
            Cesium.Color.clone(highlighted.originalColor, selected.originalColor);
            highlighted.feature = undefined;
          } else {
            Cesium.Color.clone(p.color, selected.originalColor);
          }
          p.color = Cesium.Color.LIME;
        } else {
          // style select
          const ts = getTilesetFromPicked(p);
          const kv = getKeyVal(p);
          if (ts && kv) {
            selectState = { tileset: ts, kv };
            applyStyle(ts);
          } else {
            console.warn('[FeaturePanel v4] cannot derive key/value for style selection');
          }
        }

        showPropsFor(p);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }
  }

  if (window.__viewer || window.viewer) bind();
  else window.addEventListener('cesium-ready', bind);
})();
