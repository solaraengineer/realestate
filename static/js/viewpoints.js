/**
<<<<<<< HEAD
 * viewpoints.js - Viewpoints panel with Redis backend and smooth fly-to animation
=======
 * viewpoints.js - Viewpoints/Observations panel with database backend and smooth fly-to animation
 * Supports saving observations linked to specific houses
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
 */

(function() {
  'use strict';

  const API = {
    list: '/api/viewpoints/',
    save: '/api/viewpoints/save/',
    delete: (id) => `/api/viewpoints/${id}/delete/`,
  };

  function getCsrf() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : '';
  }

<<<<<<< HEAD
  async function jget(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || 'HTTP error');
=======
  const ERROR_MESSAGES = {
    'AUTH_REQUIRED': 'Zaloguj się, aby zapisywać viewpointy',
    'INVALID_JSON': 'Nieprawidłowe dane',
    'BAD_COORDS': 'Nie można pobrać współrzędnych',
  };

  function getErrorMessage(code) {
    return ERROR_MESSAGES[code] || code || 'Wystąpił błąd';
  }

  async function jget(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    const data = await r.json();
    if (!r.ok) {
      const err = new Error(getErrorMessage(data?.error));
      err.code = data?.error;
      throw err;
    }
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
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
<<<<<<< HEAD
    if (!r.ok) throw new Error(data?.error || 'HTTP error');
=======
    if (!r.ok) {
      const err = new Error(getErrorMessage(data?.error));
      err.code = data?.error;
      throw err;
    }
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
    return data;
  }

  /**
   * Get current camera position and convert to lat/lon
   */
  function getCurrentViewpoint() {
    const viewer = window.__viewer;
    if (!viewer) return null;

    const camera = viewer.camera;
    const position = camera.position;
    const cartographic = Cesium.Cartographic.fromCartesian(position);

    return {
      lat: Cesium.Math.toDegrees(cartographic.latitude),
      lon: Cesium.Math.toDegrees(cartographic.longitude),
      height: cartographic.height,
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
      pos_x: position.x,
      pos_y: position.y,
      pos_z: position.z,
    };
  }

  /**
   * Fly to a viewpoint with smooth animation
   */
  function flyToViewpoint(vp) {
    const viewer = window.__viewer;
    if (!viewer) return;

    // If we have Cartesian3 position, use it directly for exact camera position
    if (vp.pos_x != null && vp.pos_y != null && vp.pos_z != null) {
      viewer.camera.flyTo({
        destination: new Cesium.Cartesian3(vp.pos_x, vp.pos_y, vp.pos_z),
        orientation: {
          heading: vp.heading || 0,
          pitch: vp.pitch || -0.5,
          roll: vp.roll || 0,
        },
        duration: 2.5,
        easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      });
    } else {
      // Fallback to lat/lon/height
      const height = vp.height || 500;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(vp.lon, vp.lat, height),
        orientation: {
          heading: vp.heading || 0,
          pitch: vp.pitch || Cesium.Math.toRadians(-45),
          roll: vp.roll || 0,
        },
        duration: 2.5,
        easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      });
    }
  }

  /**
   * Render the viewpoints panel
   */
  async function renderViewpoints() {
    const vpList = document.getElementById('vpList');
    const vpName = document.getElementById('vpName');
    const vpSave = document.getElementById('vpSave');

    if (!vpList || !vpSave) return;

    // Show loading
    vpList.innerHTML = '<div class="list-item">Ładowanie...</div>';

    try {
      const data = await jget(API.list);
      const viewpoints = data.viewpoints || [];

      if (viewpoints.length === 0) {
        vpList.innerHTML = '<div class="list-item" style="color:var(--text-muted);">Brak zapisanych ujęć. Dodaj swój pierwszy viewpoint!</div>';
      } else {
        vpList.innerHTML = '';
        viewpoints.forEach((vp, i) => {
          const item = document.createElement('div');
          item.className = 'list-item';
          item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:6px;background:var(--glass-light);border:1px solid var(--border);border-radius:8px;';

          const coordsStr = `${vp.lat?.toFixed(4) || '?'}, ${vp.lon?.toFixed(4) || '?'}`;

          item.innerHTML = `
            <div style="flex:1;min-width:0;">
<<<<<<< HEAD
              <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${vp.name || 'Ujęcie ' + (i + 1)}</div>
=======
              <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${vp.name || 'Ujecie ' + (i + 1)}</div>
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${coordsStr}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button class="btn fly-btn" data-idx="${i}" style="padding:6px 12px;font-size:11px;background:var(--accent);">Leć</button>
              <button class="btn del-btn" data-idx="${i}" style="padding:6px 10px;font-size:11px;background:#ef4444;">X</button>
            </div>
          `;

          vpList.appendChild(item);
        });

        // Attach click handlers
        vpList.querySelectorAll('.fly-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            const vp = viewpoints[idx];
            if (vp) {
              flyToViewpoint(vp);
              if (typeof window.toast === 'function') {
                window.toast(`Lecę do: ${vp.name}`);
              }
            }
          });
        });

        vpList.querySelectorAll('.del-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            const vp = viewpoints[idx];
            if (!vp || !vp.id) return;

            try {
              await jpost(API.delete(vp.id), {});
              renderViewpoints(); // Refresh
              if (typeof window.toast === 'function') {
                window.toast('Usunięto ujęcie');
              }
            } catch (err) {
              console.error('[Viewpoints] Delete error:', err);
              if (typeof window.toast === 'function') {
                window.toast('Błąd usuwania');
              }
            }
          });
        });
      }

    } catch (err) {
      console.error('[Viewpoints] Load error:', err);
<<<<<<< HEAD
      vpList.innerHTML = '<div class="list-item" style="color:#f87171;">Błąd ładowania</div>';
=======
      if (err.code === 'AUTH_REQUIRED') {
        vpList.innerHTML = '<div class="list-item" style="color:var(--text-muted);">Zaloguj się, aby zobaczyć swoje viewpointy.</div>';
      } else {
        vpList.innerHTML = '<div class="list-item" style="color:#f87171;">Błąd ładowania</div>';
      }
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
    }

    // Save button handler (re-attach on each render)
    vpSave.onclick = async () => {
      const currentVp = getCurrentViewpoint();
      if (!currentVp) {
        if (typeof window.toast === 'function') {
          window.toast('Nie można pobrać pozycji kamery');
        }
        return;
      }

      const name = (vpName?.value || '').trim();

      try {
        await jpost(API.save, {
          name: name || undefined,
          lat: currentVp.lat,
          lon: currentVp.lon,
          height: currentVp.height,
          heading: currentVp.heading,
          pitch: currentVp.pitch,
          roll: currentVp.roll,
          pos_x: currentVp.pos_x,
          pos_y: currentVp.pos_y,
          pos_z: currentVp.pos_z,
        });

        if (vpName) vpName.value = '';
        renderViewpoints(); // Refresh

        if (typeof window.toast === 'function') {
          window.toast('Zapisano ujęcie');
        }
      } catch (err) {
        console.error('[Viewpoints] Save error:', err);
        if (typeof window.toast === 'function') {
<<<<<<< HEAD
          window.toast('Błąd zapisywania');
=======
          window.toast(err.message || 'Błąd zapisywania');
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
        }
      }
    };
  }

  // Export
  window.renderViewpoints = renderViewpoints;

  console.log('[Viewpoints] Module loaded');

})();
