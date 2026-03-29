(function() {
  'use strict';

  function escHtml(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

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
    'AUTH_REQUIRED': 'Log in to save watchlist items',
    'INVALID_JSON': 'Invalid data',
    'MISSING_HOUSE_ID': 'Missing building ID',
    'HOUSE_NOT_FOUND': 'Building not found',
  };

  function getErrorMessage(code) {
    return ERROR_MESSAGES[code] || code || 'An error occurred';
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

  async function addObservation(houseId, note) {
    if (!houseId) {
      if (typeof window.toast === 'function') {
        window.toast('Select a building to watch');
      }
      return null;
    }

    try {
      const result = await jpost(API.save, { house_id: houseId, note: note || undefined });
      if (typeof window.toast === 'function') {
        window.toast(result.updated ? 'Watchlist item updated' : 'Added to watchlist');
      }
      return result.observation;
    } catch (err) {
      console.error('[Observations] Save error:', err);
      if (typeof window.toast === 'function') {
        window.toast(err.message || 'Error saving');
      }
      return null;
    }
  }

  async function removeObservation(observationId) {
    try {
      await jpost(API.delete(observationId), {});
      if (typeof window.toast === 'function') {
        window.toast('Removed from watchlist');
      }
      return true;
    } catch (err) {
      console.error('[Observations] Delete error:', err);
      if (typeof window.toast === 'function') {
        window.toast('Error removing');
      }
      return false;
    }
  }

  async function isObserving(houseId) {
    if (!houseId) return false;
    try {
      const result = await jget(API.check(houseId));
      return result.observing === true;
    } catch (err) {
      return false;
    }
  }

  async function renderObservations() {
    const obsList = document.getElementById('obsList');
    const obsNote = document.getElementById('obsNote');
    const obsSave = document.getElementById('obsSave');

    if (!obsList) return;

    obsList.innerHTML = '<div class="list-item">Loading...</div>';

    try {
      const data = await jget(API.list);
      const observations = data.observations || [];

      if (observations.length === 0) {
        obsList.innerHTML = '<div class="list-item" style="color:var(--text-muted);">No watchlist items. Click on a building and add it to your watchlist!</div>';
      } else {
        obsList.innerHTML = '';
        observations.forEach((obs, i) => {
          const item = document.createElement('div');
          item.className = 'list-item';
          item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:6px;background:var(--glass-light);border:1px solid var(--border);border-radius:8px;';

          const house = obs.house || {};
          const houseName = house.name || 'Building';
          const coordsStr = `${house.lat?.toFixed(4) || '?'}, ${house.lon?.toFixed(4) || '?'}`;
          const noteHtml = obs.note ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;font-style:italic;">${escHtml(obs.note)}</div>` : '';
          const statusBadge = house.status === 'for_sale' ? '<span style="font-size:9px;background:var(--accent);color:white;padding:2px 5px;border-radius:4px;margin-left:6px;">For sale</span>' : '';

          item.innerHTML = `
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(houseName)}${statusBadge}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${coordsStr}</div>
              ${noteHtml}
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button class="btn fly-btn" data-idx="${i}" style="padding:6px 12px;font-size:11px;background:var(--accent);">Fly</button>
              <button class="btn del-btn" data-idx="${i}" style="padding:6px 10px;font-size:11px;background:#ef4444;">X</button>
            </div>
          `;

          obsList.appendChild(item);
        });

        obsList.querySelectorAll('.fly-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            const obs = observations[idx];
            if (obs && obs.house) {
              flyToHouse(obs.house);
              if (typeof window.toast === 'function') {
                window.toast(`Flying to: ${escHtml(obs.house.name || 'building')}`);
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
              renderObservations();
            }
          });
        });
      }

    } catch (err) {
      console.error('[Observations] Load error:', err);
      if (err.code === 'AUTH_REQUIRED') {
        obsList.innerHTML = '<div class="list-item" style="color:var(--text-muted);">Log in to see your watchlist.</div>';
      } else {
        obsList.innerHTML = '<div class="list-item" style="color:#f87171;">Loading error</div>';
      }
    }

    if (obsSave) {
      obsSave.onclick = async () => {
        const houseId = window.__selectedHouseId;
        if (!houseId) {
          if (typeof window.toast === 'function') {
            window.toast('First select a building on the map');
          }
          return;
        }

        const note = (obsNote?.value || '').trim();
        const result = await addObservation(houseId, note);
        if (result) {
          if (obsNote) obsNote.value = '';
          renderObservations();
        }
      };
    }
  }

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
