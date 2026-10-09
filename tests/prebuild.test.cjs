const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, hooks, findElement, ui, native, theme } = require('./load-source.cjs');

const insets = { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
const themed = { ThemedText: 'ThemedText', ThemedView: 'ThemedView' };
const reading = { timestamp: Date.now(), coords: { latitude: 14.6, longitude: 121, accuracy: 5 } };

function cameraScreen(location, takePictureAsync) {
  const hookState = hooks([reading, null, true, false], [{ current: { takePictureAsync } }]);
  const module = loadSource('src/components/report-camera.tsx', {
    '@hugeicons/core-free-icons/Cancel01Icon': {}, '@hugeicons/core-free-icons/Location01Icon': {},
    '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
    'expo-camera': { CameraView: 'CameraView' }, 'expo-location': location,
    'expo-router': {}, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'heroui-native': ui, react: hookState.react, 'react-native': native,
    'react-native-safe-area-context': insets, '@/components/app-tabs': {},
    '@/components/report-photo': { PhotoThumb: 'PhotoThumb' },
    '@/components/themed-text': themed, '@/components/themed-view': themed,
    '@/constants/theme': theme, '@/lib/reports': { MAX_PHOTOS: 3 },
  }, ['Viewfinder']);
  const props = { photos: [], isFull: false, onCapture() {}, onRetry() {}, next: null };
  const render = () => hookState.render(module.__test.Viewfinder, props);
  return { render, capture: findElement(render(), (node) => node.props?.['aria-label'] === 'Take photo').props.onPress };
}

test('camera ignores overlapping shutter taps while checking location', async () => {
  let resume;
  const services = new Promise((resolve) => { resume = resolve; });
  let photos = 0;
  const screen = cameraScreen({ hasServicesEnabledAsync: () => services }, async () => {
    photos++;
    return { uri: 'file://photo.jpg' };
  });
  const first = screen.capture();
  const second = screen.capture();
  resume(true);
  await Promise.all([first, second]);
  assert.equal(photos, 1);
});

test('camera shows location failure instead of rejecting shutter handler', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const screen = cameraScreen({ hasServicesEnabledAsync: async () => { throw new Error('Location unavailable'); } }, async () => {
    assert.fail('Must not take a photo without location');
  });
  await assert.doesNotReject(screen.capture());
  assert.ok(findElement(screen.render(), (node) => node.props?.role === 'alert'));
});

test('nearby list gives FlatList individual reports and stable report IDs', () => {
  const reports = Array.from({ length: 300 }, (_, id) => ({ id: String(id), reporterId: 'user' }));
  const state = hooks();
  const screen = loadSource('src/app/(tabs)/list.tsx', {
    '@hugeicons/core-free-icons/MapsSearchIcon': {}, '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
    'expo-router': { useIsFocused: () => true, useRouter: () => ({ push() {} }) },
    'heroui-native': ui, react: state.react, 'react-native': native,
    'react-native-safe-area-context': insets, '@/components/location-gate': {},
    '@/components/list-filter': { ListFilter: 'ListFilter' },
    '@/components/report-card': { ReportListSkeleton: 'Skeleton', ReportRow: 'ReportRow', ReportList: 'ReportList' },
    '@/components/themed-text': themed, '@/components/themed-view': themed,
    '@/constants/theme': theme, '@/hooks/use-nearby-reports': { useNearbyReports: () => ({ reports, radiusM: 5000, status: 'ready' }) },
    '@/hooks/use-session': { useSession: () => ({ session: { user: { id: 'user' } } }) },
    '@/lib/nearby': { RADIUS_CHOICES: [{ value: 5000, label: '5 km' }] },
  }, ['NearbyList']);
  const list = findElement(state.render(screen.__test.NearbyList), (node) => node.type === 'FlatList');
  assert.equal(list.props.data.length, 300);
  assert.equal(list.props.keyExtractor(list.props.data[42]), '42');
  assert.equal(list.props.renderItem({ item: reports[42], index: 42 }).props.report.id, '42');
});

function formScreen(reportApi) {
  const state = hooks();
  const module = loadSource('src/components/report-form.tsx', {
    '@maplibre/maplibre-react-native': { Camera: 'Camera', Map: 'Map' },
    'heroui-native': ui, react: state.react, 'react-native': native,
    'react-native-safe-area-context': insets,
    '@/components/themed-text': themed, '@/components/themed-view': themed,
    '@/components/report-photo': { PhotoThumb: 'PhotoThumb' },
    '@/constants/theme': theme, '@/components/report-sent': { ReportSent: 'ReportSent', ToastIcon: 'ToastIcon' },
    '@/hooks/use-session': { useSession: () => ({ session: { user: { id: 'user' } } }) },
    '@/lib/map': { mapInkFor: () => ({ ink: '#000' }), mapStyleFor: () => '', STREET_ZOOM: 17 },
    '@/lib/reports': { ANIMAL_TYPES: [], COLORS: [], CONDITIONS: [], SIZES: [], URGENCIES: [], GUEST_LIMIT_ERROR: 'guest_report_limit', ...reportApi },
  });
  const props = { draft: {
    id: 'draft', animalType: 'dog', color: '', urgency: 'critical', accuracyM: 5,
    latitude: 14.6, longitude: 121, landmark: '', size: '', condition: '',
    photos: [{ uri: 'file://cache/original.jpg', takenAt: '2026-10-08T00:00:00Z', place: reading.coords }],
  }, onRetake() {}, onUnsent() {} };
  const render = () => state.render(module.ReportForm, props);
  const tree = render();
  const submit = findElement(tree, (node) => node.props?.onPress && findElement(node.props.children, (child) => child.props?.children === 'Submit'));
  const retake = findElement(tree, (node) => node.props?.onPress && node.props.children === 'Retake');
  return { render, send: submit.props.onPress, retake: retake?.props.onPress };
}

test('report is durable before upload starts and stays saved after failed upload', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let saved = null;
  let savedAtUpload;
  let uploadDraft;
  const kept = { id: 'draft', photos: [{ uri: 'file://documents/1.jpg' }] };
  const screen = formScreen({
    saveUnsentReport: async () => { saved = kept; return kept; },
    submitReport: async (draft) => {
      savedAtUpload = saved;
      uploadDraft = draft;
      throw new Error('Offline');
    },
    discardUnsentReport: async () => { saved = null; },
  });
  await screen.send();
  assert.equal(savedAtUpload, kept, 'Draft must be saved before submission');
  assert.equal(uploadDraft.photos[0].uri, 'file://documents/1.jpg');
  assert.equal(saved, kept);
});

test('successful report removes recovery draft without losing success photos', async () => {
  let saved = false;
  let saves = 0;
  const kept = { id: 'draft', photos: [{ uri: 'file://documents/1.jpg' }] };
  const screen = formScreen({
    saveUnsentReport: async () => { saved = true; saves++; return kept; },
    submitReport: async () => {},
    discardUnsentReport: async () => { saved = false; },
  });
  await screen.send();
  assert.equal(saves, 1);
  assert.equal(saved, false);
  assert.equal(screen.render().type, 'ReportSent');
  assert.equal(screen.render().props.draft.photos[0].uri, 'file://cache/original.jpg');
});

test('retaking an unsaved form does not delete another account recovery draft', async () => {
  let discarded = false;
  const screen = formScreen({ discardUnsentReport: async () => { discarded = true; } });
  assert.equal(typeof screen.retake, 'function');
  await screen.retake();
  assert.equal(discarded, false);
});

test('failed local persistence prevents network submission', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let sent = false;
  const screen = formScreen({
    saveUnsentReport: async () => { throw new Error('Disk full'); },
    submitReport: async () => { sent = true; },
  });
  await screen.send();
  assert.equal(sent, false);
  assert.ok(findElement(screen.render(), (node) => node.props?.role === 'alert'));
});
