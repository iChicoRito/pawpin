const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./load-source.cjs');
const liberty = require('../src/lib/map-liberty.json');
const { validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');

function loadMap() {
  const dark = loadSource('src/lib/map-dark.ts', { './map-liberty.json': liberty }).default;
  return loadSource('src/lib/map.ts', {
    './map-dark': dark,
    '../../assets/images/pins/paw-critical.png': 1,
    '../../assets/images/pins/paw-needs_help_soon.png': 2,
    '../../assets/images/pins/paw-just_sighted.png': 3,
  });
}

test('dark map retains light map geometry, building heights, landmarks and zoom detail', () => {
  const before = JSON.stringify(liberty);
  const { mapStyleFor } = loadMap();
  const dark = mapStyleFor(true);
  assert.equal(JSON.stringify(liberty), before, 'recoloring does not mutate the base style');
  assert.deepEqual(validateStyleMin(dark).map((error) => error.message), []);
  assert.deepEqual(dark.layers.map(({ id }) => id), liberty.layers.map(({ id }) => id));
  assert.deepEqual(dark.sources, liberty.sources);
  assert.equal(dark.sprite, liberty.sprite);
  assert.equal(dark.glyphs, liberty.glyphs);
  for (const [index, layer] of dark.layers.entries()) {
    const original = liberty.layers[index];
    const { paint, ...geometry } = layer;
    const { paint: originalPaint, ...originalGeometry } = original;
    assert.deepEqual(geometry, originalGeometry, layer.id);
    for (const [key, value] of Object.entries(originalPaint ?? {})) {
      if (!key.endsWith('-color') && !['raster-opacity', 'text-halo-width', 'text-halo-blur'].includes(key)) {
        assert.deepEqual(paint[key], value, `${layer.id}: ${key}`);
      }
    }
  }
});

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

test('dark labels have readable halos while roads, buildings and water stay distinct', () => {
  const { mapStyleFor } = loadMap();
  const dark = mapStyleFor(true);
  const layer = (id) => dark.layers.find((item) => item.id === id);
  const ground = layer('background').paint['background-color'];
  assert.ok(luminance(ground) < 0.04, 'ground stays dark');
  assert.notEqual(layer('building-3d').paint['fill-extrusion-color'], ground);
  assert.notEqual(layer('water').paint['fill-color'], ground);
  assert.ok(luminance(layer('road_minor').paint['line-color']) > luminance(ground));
  for (const item of dark.layers.filter((item) => item.layout?.['text-field'])) {
    // Shield text sits on the unchanged light sprite, not the dark map.
    if (/shield/.test(item.id)) continue;
    const text = luminance(item.paint['text-color']);
    const halo = luminance(item.paint['text-halo-color']);
    assert.ok((Math.max(text, halo) + 0.05) / (Math.min(text, halo) + 0.05) >= 4.5, item.id);
  }
});

test('light mode and urgency pins stay unchanged, dark style is reused across maps', () => {
  const { mapStyleFor, PAW_IMAGES } = loadMap();
  assert.equal(mapStyleFor(false), 'https://tiles.openfreemap.org/styles/liberty');
  assert.equal(mapStyleFor(true), mapStyleFor(true));
  assert.deepEqual(PAW_IMAGES, { 'paw-critical': 1, 'paw-needs_help_soon': 2, 'paw-just_sighted': 3 });
});
