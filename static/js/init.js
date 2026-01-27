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
});

window.viewer = viewer;
window.__viewer = viewer;
window.dispatchEvent(new Event('cesium-ready'));

viewer.scene.globe.depthTestAgainstTerrain = false;

(async () => {
  try {
    const url = window.TILES_BASE;
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
  } catch (e) {
    console.error("Nie udało się załadować tilesetu:", e);
  }
})();
