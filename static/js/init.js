// init.js

// Token Ion (jeśli korzystasz z Ion World Terrain / imagery)
// Jeżeli używasz tylko własnych danych, możesz to pominąć
// Cesium.Ion.defaultAccessToken = 'TU_WSTAW_SWÓJ_TOKEN_JEŚLI_KORZYSTASZ_Z_ION';

// Utwórz viewer
const viewer = new Cesium.Viewer("cesiumContainer", {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  selectionIndicator: false,
  // Jeśli chcesz teren z Ion, odkomentuj linię poniżej:
  // terrain: Cesium.Terrain.fromWorldTerrain(),
});

// Udostępnij viewer globalnie (łatwiej debugować w konsoli)
window.viewer = viewer;
window.__viewer = viewer;
window.dispatchEvent(new Event('cesium-ready'));

// Wyłącz „chowanie” obiektów pod teren
viewer.scene.globe.depthTestAgainstTerrain = false;

// Doładuj Twój tileset z domkami
(async () => {
  try {
    const url = window.TILES_BASE;            // ustawione w tiles-base.js
    if (!url) {
      console.error("[3D Tiles] Brak window.TILES_BASE — ustaw w tiles-base.js");
    } else {
      const tileset = await Cesium.Cesium3DTileset.fromUrl(url);
      viewer.scene.primitives.add(tileset);
      await tileset.readyPromise;
      const R = tileset.boundingSphere?.radius || 1500;
      viewer.camera.flyToBoundingSphere(tileset.boundingSphere, {
        duration: 0,
        offset: new Cesium.HeadingPitchRange(0, -0.6, R)
      });
      console.log("[3D Tiles] OK:", url);
    }

    // Debug: pokaż obrysy kafli
    // tileset.debugShowBoundingVolume = true;

    
  } catch (e) {
    console.error("Nie udało się załadować tilesetu:", e);
  }
})();
