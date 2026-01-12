function renderViewpoints() {
  const vpList = document.getElementById('vpList');
  const vpName = document.getElementById('vpName');
  const vpSave = document.getElementById('vpSave');
  if (!vpList || !vpSave) return;

  // Helpers to get/set viewpoints from localStorage
  const getVP = () => {
    try {
      return JSON.parse(localStorage.getItem('my_viewpoints') || '[]');
    } catch {
      return [];
    }
  };
  const setVP = (arr) => {
    localStorage.setItem('my_viewpoints', JSON.stringify(arr));
  };

  // Odświeżenie listy zapisanych ujęć
  const refresh = () => {
    const vps = getVP();
    vpList.innerHTML = vps.length ? '' : '<div class="list-item">Brak zapisanych ujęć.</div>';
    vps.forEach((vp, i) => {
      const it = document.createElement('div');
      it.className = 'list-item';
      it.innerHTML = `
        <div>
          <div style="font-weight:700">${vp.name || ('Ujęcie ' + (i + 1))}</div>
          <div style="font-size:12px;color:${getComputedStyle(document.documentElement).getPropertyValue('--muted')}">
            h:${(vp.heading || 0).toFixed?.(2) || 0}
            p:${(vp.pitch || 0).toFixed?.(2) || 0}
            r:${(vp.roll || 0).toFixed?.(2) || 0}
          </div>
        </div>
        <div class="row">
          <button class="btn" data-act="fly" data-i="${i}" style="width:auto">Lataj</button>
          <button class="btn" data-act="del" data-i="${i}" style="background:#ef4444;width:auto">Usuń</button>
        </div>`;
      vpList.appendChild(it);
    });
  };

  // Kliknięcia na liście viewpointów
  vpList.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    const vps = getVP();
    const vp = vps[i];
    if (!vp) return;
    if (btn.dataset.act === 'fly' && window.__viewer) {
      // Przelot kamery do wybranego ujęcia
      window.__viewer.camera.flyTo({
        destination: new Cesium.Cartesian3(vp.pos.x, vp.pos.y, vp.pos.z),
        orientation: {
          heading: vp.heading,
          pitch: vp.pitch,
          roll: vp.roll
        }
      });
    } else if (btn.dataset.act === 'del') {
      // Usunięcie wybranego ujęcia
      vps.splice(i, 1);
      setVP(vps);
      refresh();
    }
  };

  // Zapisanie aktualnego widoku jako nowego viewpointa
  vpSave.onclick = () => {
    if (!window.__viewer) return;
    const c = window.__viewer.camera;
    const vp = {
      name: vpName.value.trim(),
      pos: { x: c.position.x, y: c.position.y, z: c.position.z },
      heading: c.heading,
      pitch: c.pitch,
      roll: c.roll,
      ts: Date.now()
    };
    const vps = getVP();
    vps.unshift(vp);
    setVP(vps);
    vpName.value = '';
    refresh();
  };

  // Inicjalne odświeżenie listy przy pierwszym otwarciu panelu
  refresh();
}
