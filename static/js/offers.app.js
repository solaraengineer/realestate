// static/js/offers.app.js — panel ofert sprzedaży
(function () {
  const PANEL_ID = 'offersPanel';

  function toast(msg) {
    return (window.toast ? window.toast(msg) : alert(msg));
  }

  function getViewer() {
    return window.__viewer || window.viewer;
  }

  function getCameraLatLon() {
    const viewer = getViewer();
    if (!viewer || typeof Cesium === 'undefined') return null;
    const c = viewer.camera.positionCartographic;
    return {
      lat: Cesium.Math.toDegrees(c.latitude),
      lon: Cesium.Math.toDegrees(c.longitude),
    };
  }

  // małe żółte kropki dla wszystkich ofert z listy
  const saleMarkers = [];

  function clearSaleMarkers() {
    const viewer = getViewer();
    if (!viewer || typeof Cesium === 'undefined') return;
    while (saleMarkers.length) {
      const ent = saleMarkers.pop();
      try { viewer.entities.remove(ent); } catch (_) {}
    }
  }
  function addSaleMarker(item) {
    const viewer = getViewer();
    if (!viewer || typeof Cesium === 'undefined') return;

    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    // wysokość kropki nad budynkiem
    let markerH = 20;
    const h = Number(item.height);
    if (Number.isFinite(h) && h > 0) {
      markerH = Math.max(8, h * 0.3); // ~1/3 wysokości budynku, min. 8 m
    }

    const sharesForSale = Number(item.share_count);
    const totalShares   = Number(item.total_shares);
    const price         = (item.price != null) ? Number(item.price) : null;
    const isMine        = !!item.is_mine;

    // Tekst labelki: $1200 · 3/200 sh
    const parts = [];
    if (Number.isFinite(price)) {
      parts.push(`$${price}`);
    }
    if (Number.isFinite(sharesForSale) && Number.isFinite(totalShares)) {
      parts.push(`${sharesForSale}/${totalShares} sh`);
    } else if (Number.isFinite(sharesForSale)) {
      parts.push(`${sharesForSale} sh`);
    }
    const labelText = parts.join(' · ');

    // kolor kropki: zielony = moje, żółty = obce
    const pointColor = isMine
      ? Cesium.Color.fromCssColorString('#22c55e')   // my listings
      : Cesium.Color.fromCssColorString('#ffcc00');  // other listings

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
        font: '12px "Segoe UI", sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        showBackground: true,
        backgroundColor: new Cesium.Color(0.05, 0.05, 0.05, 0.9)
      } : undefined
    });

    saleMarkers.push(ent);
  }



  // Główny entry-point panelu, tak jak window.renderMessagesPanel w messages.app.js
  window.renderOffersPanel = async function () {
    const panelEl = document.getElementById(PANEL_ID) || document.getElementById('appPanel');
    if (!panelEl) return;

    const appBody =
      panelEl.querySelector('#saleBody') ||
      panelEl.querySelector('#appPanelBody') ||
      panelEl;

    // jeśli rysujemy w #saleBody, a był schowany przez stary kod, pokaż go
    if (appBody && appBody.id === 'saleBody') {
      appBody.style.display = 'block';
    }

    // CSS tylko raz
    if (!document.getElementById('offersx-css')) {
      const s = document.createElement('style');
      s.id = 'offersx-css';
      s.textContent = `
        /* rozmiar i pozycja panelu ofert – jak w dawnym offers.css */
        #offersPanel[data-panel="offers"] {
          position: fixed;
          display: flex;
          flex-direction: column;
          width: 35vw;
          max-width: 35vw;
          height: 60vh;
          max-height: 60vh;
          top: 0;
          /* left jest ustawiany przez JS (dock-left) */
          overflow: hidden;
          margin: 0;
          z-index: 1000;
        }

        #offersPanel[data-panel="offers"] .section-body {
          overflow-y: auto;
          max-height: calc(60vh - 64px);
        }

        /* wnętrze naszego nowego panelu */
        #offersPanel .offersx-root {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: rgba(15, 23, 42, 0.96);
          color: #e5e7eb;
          border-radius: 12px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 13px;
        }
        #offersPanel .offersx-header {
          font-weight: 700;
          font-size: 14px;
          margin-bottom: 4px;
        }
        #offersPanel .offersx-toggles {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          font-size: 11px;
          margin-bottom: 4px;
        }
        #offersPanel .offersx-toggle {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        #offersPanel .offersx-toggle input {
          margin: 0;
        }



        #offersPanel .offersx-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          font-size: 11px;
        }
        #offersPanel .offersx-filter-group {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        #offersPanel .offersx-input {
          width: 110px;
          padding: 2px 4px;
          border-radius: 4px;
          border: 1px solid #4b5563;
          background: #020617;
          color: #e5e7eb;
          font-size: 11px;
        }
        #offersPanel .offersx-btn {
          border: none;
          border-radius: 9999px;
          padding: 4px 10px;
          font-size: 11px;
          cursor: pointer;
          background: #2563eb;
          color: #f9fafb;
          white-space: nowrap;
        }
        #offersPanel .offersx-btn:hover {
          filter: brightness(1.05);
        }
        #offersPanel .offersx-list {
          margin-top: 6px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
        }

        #offersPanel .offersx-item {
          background: rgba(15, 23, 42, 0.9);
          border-radius: 8px;
          padding: 6px 8px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        #offersPanel .offersx-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }
        #offersPanel .offersx-name {
          font-weight: 600;
          font-size: 13px;
        }
        #offersPanel .offersx-price {
          font-weight: 500;
          font-size: 12px;
        }
        #offersPanel .offersx-meta {
          font-size: 11px;
          opacity: 0.75;
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        #offersPanel .offersx-footer {
          margin-top: 6px;
          display: flex;
          justify-content: center;
        }
        #offersPanel .offersx-empty {
          font-size: 11px;
          opacity: 0.7;
          padding: 4px 0;
        }
      `;
      document.head.appendChild(s);
    }



    // HTML panelu
    appBody.innerHTML = `
      <div class="offersx-root">
        <div class="offersx-header">Sale listings near you</div>

        <div class="offersx-toggles">
          <label class="offersx-toggle">
            <input type="checkbox" class="offersx-chk-mine" checked>
            <span>My listings</span>
          </label>
          <label class="offersx-toggle">
            <input type="checkbox" class="offersx-chk-others" checked>
            <span>Other listings</span>
          </label>
        </div>

        <div class="offersx-filters">
          <div class="offersx-filter-group">
            <span>Price from</span>
            <input class="offersx-input offersx-min" type="number" min="0" step="1" placeholder="0">
          </div>
          <div class="offersx-filter-group">
            <span>to</span>
            <input class="offersx-input offersx-max" type="number" min="0" step="1" placeholder="∞">
          </div>
          <button class="offersx-btn offersx-apply">Apply</button>
        </div>

        <div class="offersx-list"></div>
        <div class="offersx-footer">
          <button class="offersx-btn offersx-more" style="display:none;">Load more</button>
        </div>
      </div>
    `;


    const listEl   = appBody.querySelector('.offersx-list');
    const moreBtn  = appBody.querySelector('.offersx-more');
    const minInput = appBody.querySelector('.offersx-min');
    const maxInput = appBody.querySelector('.offersx-max');
    const applyBtn = appBody.querySelector('.offersx-apply');
    const chkMine   = appBody.querySelector('.offersx-chk-mine');
    const chkOthers = appBody.querySelector('.offersx-chk-others');


    const state = {
      page: 1,
      loading: false,
      priceMin: null,
      priceMax: null,
      hasNext: false,
      includeMine: true,
      includeOthers: true,
    };


    async function loadListings(reset = false) {
      if (state.loading) return;
      const pos = getCameraLatLon();
      if (!pos) {
        toast('Map is not ready');
        return;
      }
      if (!listEl) return;

      if (reset) {
        state.page = 1;
        listEl.innerHTML = '';
        clearSaleMarkers();
      }

      state.loading = true;
      let url = `/api/listings/nearby/?lat=${encodeURIComponent(pos.lat)}&lon=${encodeURIComponent(pos.lon)}&page=${state.page}`;
      if (state.priceMin != null) url += `&price_min=${encodeURIComponent(state.priceMin)}`;
      if (state.priceMax != null) url += `&price_max=${encodeURIComponent(state.priceMax)}`;

      try {
        const r = await fetch(url, { credentials: 'same-origin' });
        const data = await r.json().catch(() => null);
        if (!r.ok || !data || data.ok === false) {
          throw new Error((data && data.error) || 'Error loading offers');
        }

        const results = Array.isArray(data.results) ? data.results : [];

        // filtr po checkboxach: My listings / Other listings
        const filtered = results.filter((item) => {
          const mine = !!item.is_mine;
          if (state.includeMine && mine) return true;
          if (state.includeOthers && !mine) return true;
          return false;
        });

        if (reset && !filtered.length) {
          listEl.innerHTML = `<div class="offersx-empty">No offers found for selected filters.</div>`;
        } else {
          for (const item of filtered) {
            addSaleMarker(item);

            const row = document.createElement('div');
            row.className = 'offersx-item';

            const name  = item.name || item.id_fme || '(house)';
            const price = (item.price != null ? Number(item.price) : null);
            const priceDisplay = (Number.isFinite(price) ? `$${price}` : '?');
            const shares = item.share_count != null ? item.share_count : null;
            const dist   = item.distance_km != null ? `${item.distance_km} km` : '';

            row.innerHTML = `
                <div class="offersx-item-header">
                    <div class="offersx-name">${name}</div>
                    <div class="offersx-price">${priceDisplay}</div>
                </div>
              <div class="offersx-meta">
                <span>${shares ? `${shares} shares` : ''}</span>
                <span>${dist}</span>
              </div>
              <div style="margin-top:4px;">
                <button class="offersx-btn offersx-goto" data-id-fme="${item.id_fme || ''}">Go to</button>
              </div>
            `;
            listEl.appendChild(row);
          }
        }


        const total = data.total_results || 0;
        const pageSize = data.page_size || results.length;
        const currentEnd = state.page * pageSize;
        state.hasNext = currentEnd < total;
        if (moreBtn) {
          moreBtn.style.display = state.hasNext ? '' : 'none';
        }
      } catch (e) {
        console.error('[offers] load error', e);
        if (reset) {
          listEl.innerHTML = `<div class="offersx-empty">Error loading offers.</div>`;
        } else {
          toast(e.message || 'Error loading offers');
        }
      } finally {
        state.loading = false;
      }
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const minVal = minInput && minInput.value ? Number(minInput.value) : null;
        const maxVal = maxInput && maxInput.value ? Number(maxInput.value) : null;
        state.priceMin = Number.isFinite(minVal) && minVal > 0 ? minVal : null;
        state.priceMax = Number.isFinite(maxVal) && maxVal > 0 ? maxVal : null;
        loadListings(true);
      });
    }
    if (chkMine) {
      chkMine.addEventListener('change', () => {
        state.includeMine = chkMine.checked;
        loadListings(true);
      });
    }

    if (chkOthers) {
      chkOthers.addEventListener('change', () => {
        state.includeOthers = chkOthers.checked;
        loadListings(true);
      });
    }

    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        if (state.loading || !state.hasNext) return;
        state.page += 1;
        loadListings(false);
      });
    }

    // Go to (kamera)
    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.offersx-goto');
      if (!btn) return;
      const id = btn.dataset.idFme;
      if (!id) return;
      if (typeof window.flyToHouseLatLon === 'function') {
        window.flyToHouseLatLon(id, { pitchDeg: -35 });
      } else if (typeof window.flyToHouse === 'function') {
        window.flyToHouse(id, { pitchDeg: -35 });
      }
    });

    // start
    loadListings(true);
  };

  // udostępnij clearSaleMarkers globalnie, jakbyśmy chcieli sprzątać przy zamknięciu panelu
  window.clearSaleMarkers = clearSaleMarkers;
})();
