// tiles-base.js — „ostatnie słowo ma tileserver”
window.TILES_BASE = "https://newyork.cryptoearthcoin.com/tileset/tileset.json";
const TILES_URL = 'https://tiles.cryptoearthcoin.com/styles/basic-preview/{z}/{x}/{y}.webp';

function makeProvider() {
  return new Cesium.UrlTemplateImageryProvider({
    url: TILES_URL,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    minimumLevel: 0,
    maximumLevel: 15
  });
}

function hardenViewer(v) {
  // minimalne „utwardzenie” (eliminuje błędy WebGL z postprocess)
  if (v.scene?.postProcessStages) {
    v.scene.postProcessStages.fxaa.enabled = false;
    const bloom = v.scene.postProcessStages.bloom;
    if (bloom) bloom.enabled = false;
  }
  if ('highDynamicRange' in v.scene) v.scene.highDynamicRange = false;
  v.scene.requestRenderMode = true;
}

function applyTileserverBase(viewer) {
  const layers = viewer.imageryLayers;

  // usuń wszystko i dodaj naszą bazę
  layers.removeAll(true);
  const base = layers.addImageryProvider(makeProvider());

  // pilnuj, żeby nasza baza była zawsze na index 0, nawet gdy inne skrypty coś dodadzą
  const origAdd = layers.addImageryProvider.bind(layers);
  layers.addImageryProvider = function (...args) {
    const added = origAdd(...args);
    const idxBase = layers.indexOf(base);
    if (idxBase !== 0) layers.lowerToBottom(base);
    return added;
  };
  layers.layerAdded.addEventListener(() => {
    const idxBase = layers.indexOf(base);
    if (idxBase !== 0) layers.lowerToBottom(base);
  });
  layers.layerRemoved.addEventListener(() => {
    if (layers.length === 0) layers.addImageryProvider(makeProvider());
  });

  setTimeout(() => { const i = layers.indexOf(base); if (i !== 0) layers.lowerToBottom(base); }, 500);
  setTimeout(() => { const i = layers.indexOf(base); if (i !== 0) layers.lowerToBottom(base); }, 2000);

  console.log('[tiles] baza z tileservera ustawiona i pilnowana');
}

function bootTiles() {
  // jeśli inny kod już stworzył viewer — użyj go; jeśli nie, stwórz minimalny
  if (!window.viewer) {
    window.viewer = new Cesium.Viewer('cesiumContainer', {
      baseLayerPicker: false,
      imageryProvider: false,
      msaaSamples: 1
    });
  }
  hardenViewer(window.viewer);
  applyTileserverBase(window.viewer);
}

// Odpal na końcu dokumentu
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootTiles, { once: true });
} else {
  bootTiles();
}
