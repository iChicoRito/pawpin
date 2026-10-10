const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, hooks, native, ui, theme, findElement, gestureHandler } = require('./load-source.cjs');

test('only the map claims native touches immediately and blocks the page scroll gesture', () => {
  const state = hooks();
  const draft = { photos: [], latitude: 14, longitude: 121, animalType: '', urgency: null };
  const { ReportForm } = loadSource('src/components/report-form.tsx', {
    react: state.react,
    'react-native': native,
    'react-native-gesture-handler': gestureHandler,
    '@maplibre/maplibre-react-native': { Map: 'Map', Camera: 'Camera' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    'heroui-native': ui,
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/themed-view': { ThemedView: 'View' },
    '@/components/drawer-backdrop': { DrawerSelectOverlay: 'Overlay' },
    '@/components/report-photo': { PhotoThumb: 'Photo' },
    '@/components/report-sent': { ReportSent: 'Sent', ToastIcon: 'ToastIcon' },
    '@/constants/theme': theme,
    '@/hooks/use-session': { useSession: () => ({ session: null }) },
    '@/lib/map': { mapStyleFor: () => ({}), mapInkFor: () => ({ ink: '#000' }), STREET_ZOOM: 16 },
    '@/lib/reports': { URGENCIES: [], COLORS: [], POOR_ACCURACY_M: 100 },
  });
  const render = () => state.render(ReportForm, { draft, onRetake() {}, onUnsent() {} });
  const tree = render();
  const page = findElement(tree, (node) => node.type === 'GestureScrollView');
  assert.ok(page, 'page scrolling must participate in native gesture arbitration');
  assert.notEqual(page.props.scrollEnabled, false, 'outside-map touches must scroll normally');
  const detector = findElement(page, (node) => node.type === 'GestureDetector');
  assert.ok(detector, 'map must own a native gesture instead of waiting for React touch state');
  const mapContainer = detector.props.children;
  assert.equal(mapContainer.type, 'View');
  assert.equal(mapContainer.props.collapsable, false);
  assert.ok(findElement(mapContainer, (node) => node.type === 'Map'));
  assert.equal(findElement(mapContainer, (node) => node.props.children === 'Where is the animal?'), undefined);
  assert.equal(findElement(mapContainer, (node) => node.props.children === 'Submit'), undefined);
  const { config, handlerName } = detector.props.gesture;
  assert.equal(handlerName, 'NativeViewGestureHandler');
  assert.equal(config.shouldActivateOnStart, true, 'fast drags must claim the map on touch-down');
  assert.equal(config.disallowInterruption, true, 'page must not steal an active map gesture');
  assert.equal(config.shouldCancelWhenOutside, false, 'dragging past map edge must not hand off to page');
  assert.deepEqual(config.blocksHandlers, [page.props.ref]);
  assert.equal(mapContainer.props.onTouchStart, undefined, 'no asynchronous scroll lock');
});
