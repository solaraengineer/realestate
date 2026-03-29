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

  function escHtml(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  const ERROR_MESSAGES = {
    'AUTH_REQUIRED': 'Log in to save viewpoints',
    'INVALID_JSON': 'Invalid data',
    'BAD_COORDS': 'Unable to retrieve coordinates',
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

  function flyToViewpoint(vp) {
    const viewer = window.__viewer;
    if (!viewer) return;

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

  async function renderViewpoints() {
    const vpList = document.getElementById('vpList');
    const vpName = document.getElementById('vpName');
    const vpSave = document.getElementById('vpSave');

    if (!vpList || !vpSave) return;

    vpList.innerHTML = '<div class="list-item">Loading...</div>';

    try {
      const data = await jget(API.list);
      const viewpoints = data.viewpoints || [];

      if (viewpoints.length === 0) {
        vpList.innerHTML = '<div class="list-item" style="color:var(--text-muted);">No saved viewpoints. Add your first viewpoint!</div>';
      } else {
        vpList.innerHTML = '';
        viewpoints.forEach((vp, i) => {
          const item = document.createElement('div');
          item.className = 'list-item';
          item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:6px;background:var(--glass-light);border:1px solid var(--border);border-radius:8px;';

          const coordsStr = `${vp.lat?.toFixed(4) || '?'}, ${vp.lon?.toFixed(4) || '?'}`;

          item.innerHTML = `
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(vp.name) || 'Viewpoint ' + (i + 1)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${escHtml(coordsStr)}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button class="btn fly-btn" data-idx="${i}" style="padding:6px 12px;font-size:11px;background:var(--accent);">Fly</button>
              <button class="btn del-btn" data-idx="${i}" style="padding:6px 10px;font-size:11px;background:#ef4444;">X</button>
            </div>
          `;

          vpList.appendChild(item);
        });

        vpList.querySelectorAll('.fly-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            const vp = viewpoints[idx];
            if (vp) {
              flyToViewpoint(vp);
              if (typeof window.toast === 'function') {
                window.toast(`Flying to: ${vp.name}`);
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
              renderViewpoints();
              if (typeof window.toast === 'function') {
                window.toast('Viewpoint deleted');
              }
            } catch (err) {
              console.error('[Viewpoints] Delete error:', err);
              if (typeof window.toast === 'function') {
                window.toast('Delete failed');
              }
            }
          });
        });
      }

    } catch (err) {
      console.error('[Viewpoints] Load error:', err);
      if (err.code === 'AUTH_REQUIRED') {
        vpList.innerHTML = '<div class="list-item" style="color:var(--text-muted);">Log in to see your viewpoints.</div>';
      } else {
        vpList.innerHTML = '<div class="list-item" style="color:#f87171;">Loading error</div>';
      }
    }

    vpSave.onclick = async () => {
      const currentVp = getCurrentViewpoint();
      if (!currentVp) {
        if (typeof window.toast === 'function') {
          window.toast('Unable to get camera position');
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
        renderViewpoints();

        if (typeof window.toast === 'function') {
          window.toast('Viewpoint saved');
        }
      } catch (err) {
        console.error('[Viewpoints] Save error:', err);
        if (typeof window.toast === 'function') {
          window.toast(err.message || 'Save failed');
        }
      }
    };
  }

  window.renderViewpoints = renderViewpoints;

  console.log('[Viewpoints] Module loaded');

})();
