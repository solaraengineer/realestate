// js/featurePanel.js — panel właściwości (kompatybilny z 1.132)
(function() {
  if (!window.__viewer) return;
  const viewer = window.__viewer;

  const panel    = document.getElementById('featurePanel');
  const titleEl  = document.getElementById('featureTitle');
  const propsEl  = document.getElementById('featureProps');
  const btnClose = document.getElementById('featureClose');
  if (!panel || !titleEl || !propsEl || !btnClose) return;

  const openPanel  = () => { panel.style.display = 'block'; };
  const closePanel = () => { panel.style.display = 'none'; propsEl.innerHTML = ''; };
  btnClose.addEventListener('click', closePanel);

  function listProps(obj){
    let h = '';
    const add = (k,v)=>{ h += `<div class="prop"><div class="k">${k}</div><div>${v==null?'':String(v)}</div></div>`; };

    // Feature z tilesetu (stare i nowe formaty) — sprawdzaj po obecności getProperty
    if (obj && typeof obj.getProperty === 'function') {
      try {
        const names = obj.getPropertyNames ? obj.getPropertyNames() : [];
        if (names.length) {
          names.forEach(n => add(n, obj.getProperty(n)));
        } else {
          // brak listy nazw? spróbuj parę typowych
          ['name','id','height','class','type'].forEach(n => {
            try { const v = obj.getProperty(n); if (v!=null) add(n,v); } catch(e){}
          });
        }
      } catch(_) {}
    }

    // Entity (gdyby pick trafił w entity)
    if (!h && obj && obj.id && obj.id.properties) {
      try{
        const now = Cesium.JulianDate.now();
        const vals = obj.id.properties.getValue ? obj.id.properties.getValue(now) : obj.id.properties;
        Object.keys(vals||{}).forEach(k => add(k, vals[k]));
      }catch(_){}
    }

    // Fallback
    if (!h){
      try { add('type', obj?.constructor?.name); } catch(_){}
      try { add('id', obj?.id?.id || obj?.id); } catch(_){}
    }

    return h || '<div class="prop"><div class="k">Brak właściwości</div><div></div></div>';
  }

  // Stabilny pick z obsługą obiektów o różnym typie
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);
    if (!Cesium.defined(picked)) { closePanel(); return; }

    let title = 'Wybrany obiekt';
    try {
      if (typeof picked.getProperty === 'function') {
        title = picked.getProperty('name') ?? title;
      } else if (picked.id && picked.id.name) {
        title = picked.id.name;
      }
    } catch(_) {}

    titleEl.textContent = title;
    propsEl.innerHTML   = listProps(picked);
    openPanel();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
})();
