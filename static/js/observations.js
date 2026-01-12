/**
 * observations.js - House watchlist/observations panel
 * Allows users to save houses to watch and fly to them
 */

(function() {
  'use strict';

  const API = {
    list: '/api/observations/',
    save: '/api/observations/save/',
    delete: (id) => `/api/observations/${id}/delete/`,
    check: (houseId) => `/api/observations/check/${houseId}/`,
  };

  function getCsrf() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : '';
  }

  const ERROR_MESSAGES = {
    'AUTH_REQUIRED': 'Zaloguj sie, aby zapisywac obserwacje',
    'INVALID_JSON': 'Nieprawidlowe dane',
    'MISSING_HOUSE_ID': 'Brak ID budynku',
    'HOUSE_NOT_FOUND': 'Budynek nie znaleziony',
  };

  function getErrorMessage(code) {
    return ERROR_MESSAGES[code] || code || 'Wystapil blad';
  }

  async function jget(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    const data = await r.json();
    if (!r.ok) {
      const err = new Error(getErrorMessage(data?.error));
      err.code = data?.error;
      throw err;
    }
    return data;
  }

  async function jpost(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCsrf(),
      },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) {
      const err = new Error(getErrorMessage(data?.error));
      err.code = data?.error;
      throw err;
    }
    return data;
  }

  /**
   * Fly to a house location
   */
  function flyToHouse(house) {
    const viewer = window.__viewer;
    if (!viewer || !house || house.lat == null || house.lon == null) return;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(house.lon, house.lat, 500),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
      duration: 2.5,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  }

  /**
   * Add current house to observations
   */
  async function addObservation(houseId, note) {
    if (!houseId) {
      if (typeof window.toast === 'function') {
        window.toast('Wybierz budynek do obserwacji');
      }
      return null;
    }

    try {
      const result = await jpost(API.save, { house_id: houseId, note: note || undefined });
      if (typeof window.toast === 'function') {
        window.toast(result.updated ? 'Zaktualizowano obserwacje' : 'Dodano do obserwowanych');
      }
      return result.observation;
    } catch (err) {
      console.error('[Observations] Save error:', err);
      if (typeof window.toast === 'function') {
        window.toast(err.message || 'Blad zapisywania');
      }
      return null;
    }
  }

  /**
   * Remove observation
   */
  async function removeObservation(observationId) {
    try {
      await jpost(API.delete(observationId), {});
      if (typeof window.toast === 'function') {
        window.toast('Usunieto z obserwowanych');
      }
      return true;
    } catch (err) {
      console.error('[Observations] Delete error:', err);
      if (typeof window.toast === 'function') {
        window.toast('Blad usuwania');
      }
      return false;
    }
  }

  /**
   * Check if a house is being observed
   */
  async function isObserving(houseId) {
    if (!houseId) return false;
    try {
      const result = await jget(API.check(houseId));
      return result.observing === true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Render the observations panel
   */
  async function renderObservations() {
    const obsList = document.getElementById('obsList');
    const obsNote = document.getElementById('obsNote');
    const obsSave = document.getElementById('obsSave');

    if (!obsList) return;

    // Show loading
    obsList.innerHTML = '<div class="list-item">Ladowanie...</div>';

    try {
      const data = await jget(API.list);
      const observations = data.observations || [];

      if (observations.length === 0) {
        obsList.innerHTML = '<div class="list-item" style="color:var(--text-muted);">Brak obserwowanych budynkow. Kliknij na budynek i dodaj go do obserwacji!</div>';
      } else {
        obsList.innerHTML = '';
        observations.forEach((obs, i) => {
          const item = document.createElement('div');
          item.className = 'list-item';
          item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:6px;background:var(--glass-light);border:1px solid var(--border);border-radius:8px;';

          const house = obs.house || {};
          const houseName = house.name || 'Budynek';
          const coordsStr = `${house.lat?.toFixed(4) || '?'}, ${house.lon?.toFixed(4) || '?'}`;
          const noteHtml = obs.note ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;font-style:italic;">${obs.note}</div>` : '';
          const statusBadge = house.status === 'for_sale' ? '<span style="font-size:9px;background:var(--accent);color:white;padding:2px 5px;border-radius:4px;margin-left:6px;">Na sprzedaz</span>' : '';

          item.innerHTML = `
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${houseName}${statusBadge}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${coordsStr}</div>
              ${noteHtml}
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button class="btn fly-btn" data-idx="${i}" style="padding:6px 12px;font-size:11px;background:var(--accent);">Lec</button>
              <button class="btn del-btn" data-idx="${i}" style="padding:6px 10px;font-size:11px;background:#ef4444;">X</button>
            </div>
          `;

          obsList.appendChild(item);
        });

        // Attach click handlers
        obsList.querySelectorAll('.fly-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            const obs = observations[idx];
            if (obs && obs.house) {
              flyToHouse(obs.house);
              if (typeof window.toast === 'function') {
                window.toast(`Lece do: ${obs.house.name || 'budynku'}`);
              }
            }
          });
        });

        obsList.querySelectorAll('.del-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            const obs = observations[idx];
            if (!obs || !obs.id) return;

            const removed = await removeObservation(obs.id);
            if (removed) {
              renderObservations(); // Refresh
            }
          });
        });
      }

    } catch (err) {
      console.error('[Observations] Load error:', err);
      if (err.code === 'AUTH_REQUIRED') {
        obsList.innerHTML = '<div class="list-item" style="color:var(--text-muted);">Zaloguj sie, aby zobaczyc swoje obserwacje.</div>';
      } else {
        obsList.innerHTML = '<div class="list-item" style="color:#f87171;">Blad ladowania</div>';
      }
    }

    // Save button handler (for adding current selected house)
    if (obsSave) {
      obsSave.onclick = async () => {
        const houseId = window.__selectedHouseId;
        if (!houseId) {
          if (typeof window.toast === 'function') {
            window.toast('Najpierw wybierz budynek na mapie');
          }
          return;
        }

        const note = (obsNote?.value || '').trim();
        const result = await addObservation(houseId, note);
        if (result) {
          if (obsNote) obsNote.value = '';
          renderObservations(); // Refresh
        }
      };
    }
  }

  // Export functions
  window.Observations = {
    render: renderObservations,
    add: addObservation,
    remove: removeObservation,
    isObserving: isObserving,
    flyToHouse: flyToHouse,
  };
  window.renderObservations = renderObservations;

  console.log('[Observations] Module loaded');

})();
