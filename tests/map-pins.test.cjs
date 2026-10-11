const assert = require('node:assert/strict');
const test = require('node:test');
const { validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const { loadSource, effectHooks, findElement, native, theme } = require('./load-source.cjs');

function pins() {
  const state = effectHooks();
  let focused = true;
  let reduced = false;
  let changeState;
  const { ReportPinLayers } = loadSource('src/components/report-pin-layers.tsx', {
    react: state.react,
    'react-native': { ...native, AppState: {
      currentState: 'active',
      addEventListener(_type, callback) { changeState = callback; return { remove() {} }; },
    } },
    'expo-router': { useIsFocused: () => focused },
    'react-native-reanimated': { useReducedMotion: () => reduced },
    '@maplibre/maplibre-react-native': { Layer: 'Layer' },
    '@/lib/nearby': { URGENCY_COLORS: { critical: '#C62828' } },
  });
  return {
    render: (props = {}) => state.render(ReportPinLayers, { source: 'reports', ...props }),
    unmount: state.unmount,
    focus: (value) => { focused = value; },
    reduce: (value) => { reduced = value; },
    background: () => changeState('background'),
  };
}

const paw = (tree) => findElement(tree, (node) => node.props?.layout?.['icon-image']);

test('paws shake briefly, return upright, rest, then shake again', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const view = pins();
  assert.equal(paw(view.render()).props.layout['icon-rotate'], 0);
  t.mock.timers.tick(120);
  assert.notEqual(paw(view.render()).props.layout['icon-rotate'], 0);
  for (let i = 0; i < 4; i++) { t.mock.timers.tick(120); view.render(); }
  assert.equal(paw(view.render()).props.layout['icon-rotate'], 0);
  t.mock.timers.tick(2000);
  assert.equal(paw(view.render()).props.layout['icon-rotate'], 0);
  t.mock.timers.tick(1500);
  view.render();
  t.mock.timers.tick(120);
  assert.notEqual(paw(view.render()).props.layout['icon-rotate'], 0);
  view.unmount();
});

test('reduced motion, hidden screens, backgrounding, and empty sources keep paws still', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const stop of ['reduce', 'focus', 'background', 'empty']) {
    const view = pins();
    view.render();
    t.mock.timers.tick(120);
    assert.notEqual(paw(view.render()).props.layout['icon-rotate'], 0);
    if (stop === 'reduce') view.reduce(true);
    if (stop === 'focus') view.focus(false);
    if (stop === 'background') view.background();
    const props = stop === 'empty' ? { animate: false } : {};
    assert.equal(paw(view.render(props)).props.layout['icon-rotate'], 0);
    t.mock.timers.tick(10000);
    assert.equal(paw(view.render(props)).props.layout['icon-rotate'], 0);
    view.unmount();
  }
});

test('critical warning layers filter urgency, carry an exclamation mark, and validate as native map styles', () => {
  const view = pins();
  const tree = view.render({ animate: false });
  const layers = tree.props.children.map((node) => node.props);
  const warning = layers.find((layer) => layer.layout?.['text-field'] === '!');
  assert.ok(warning, 'critical is distinguished by a mark, not red alone');
  assert.deepEqual(warning.filter, ['==', ['get', 'urgency'], 'critical']);
  assert.ok(layers.some((layer) => layer.type === 'circle' && layer.filter));
  const style = {
    version: 8, glyphs: 'https://example.com/{fontstack}/{range}.pbf',
    sources: { reports: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
    layers,
  };
  assert.deepEqual(validateStyleMin(style).map((error) => error.message), []);
  view.unmount();
});

test('legend labels all real urgencies plus the distinct user dot and reports measured height', () => {
  let measured;
  const { MapLegend } = loadSource('src/components/map-legend.tsx', {
    'expo-image': { Image: 'Image' }, 'react-native': native,
    'heroui-native': { useThemeColor: () => ['#FFFFFF', '#CCCCCC'] },
    '@/components/themed-text': { ThemedText: 'Text' }, '@/constants/theme': theme,
    '@/lib/map': { PAW_IMAGES: {}, VIEWER_COLOR: '#D32F2F' },
    '@/lib/reports': { URGENCIES: [
      { value: 'critical', label: 'Critical', hint: 'In danger right now' },
      { value: 'needs_help_soon', label: 'Needs help soon', hint: 'Needs help soon' },
      { value: 'just_sighted', label: 'Just sighted', hint: 'Seen nearby' },
    ] },
  });
  const tree = MapLegend({ onHeight: (height) => { measured = height; } });
  for (const text of ['Critical', 'Needs help soon', 'Just sighted', 'You']) {
    assert.ok(findElement(tree, (node) => node.props?.children === text), text);
  }
  tree.props.onLayout({ nativeEvent: { layout: { height: 122 } } });
  assert.equal(measured, 122, 'location control must clear wrapped or scaled legend text');
});

test('detail map keeps urgency for the shared paw and sounds an error if native map loading fails', () => {
  const state = effectHooks();
  const heard = [];
  const { ReportPlaceMap } = loadSource('src/components/report-place-map.tsx', {
    react: state.react, 'react-native': native,
    '@maplibre/maplibre-react-native': { Map: 'Map', Camera: 'Camera', Images: 'Images', GeoJSONSource: 'Source' },
    'heroui-native': { Skeleton: 'Skeleton', useThemeColor: () => '#CCC' },
    '@/constants/theme': theme,
    '@/lib/map': { mapStyleFor: () => ({}), PAW_IMAGES: {}, STREET_ZOOM: 16 },
    '@/components/report-pin-layers': { ReportPinLayers: 'Pins' },
    '@/lib/sounds': { playSound: (kind) => heard.push(kind) },
  });
  const props = { latitude: 14, longitude: 121, urgency: 'critical' };
  const tree = state.render(ReportPlaceMap, props);
  assert.equal(findElement(tree, (node) => node.type === 'Source').props.data.properties.urgency, 'critical');
  findElement(tree, (node) => node.type === 'Map').props.onDidFailLoadingMap();
  assert.deepEqual(heard, ['error']);
  assert.equal(state.render(ReportPlaceMap, props), null);
});
