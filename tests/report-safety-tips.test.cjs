const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, hooks, native, ui, theme, findElement } = require('./load-source.cjs');

test('current rescuer opens safety tips inside animal details card, not footer or Reporter tab', () => {
  const state = hooks();
  const routes = [];
  const report = {
    id: 'report-1', reporterId: 'reporter', rescuerId: 'viewer', status: 'responding',
    animalType: 'dog', urgency: 'critical', photos: [], distanceM: null,
    latitude: 14, longitude: 121, createdAt: '2026-10-11T00:00:00Z',
  };
  const dependencies = {
    react: state.react,
    'react-native': { ...native, useWindowDimensions: () => ({ width: 390, height: 844 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    'heroui-native': ui,
    'expo-router': {
      Stack: { Screen: 'Screen' }, useLocalSearchParams: () => ({ id: report.id }),
      useRouter: () => ({ push: (route) => routes.push(route), back() {} }),
    },
    'expo-blur': { BlurTargetView: 'BlurTargetView' },
    'expo-image': { Image: 'Image' },
    '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
    'thesvg/google-maps': { svg: '' },
    'thesvg/waze': { svg: '' },
    '@/constants/theme': theme,
    '@/hooks/use-nearby-reports': { useNearbyReports: () => ({ reports: [report], place: null, reload() {} }) },
    '@/hooks/use-session': { useSession: () => ({ session: { user: { id: 'viewer' } }, isGuest: false, isAdmin: false }) },
    '@/hooks/use-theme': { useTheme: () => ({ background: '#fff' }) },
    '@/hooks/use-directions': { useDirections: () => ({}) },
    '@/lib/admin': {}, '@/lib/claims': {}, '@/lib/nearby': {}, '@/lib/supabase': {},
    '@/lib/messages': { useChatClaim: () => null },
    '@/lib/flags': { FLAG_REASONS: ['Other'] },
    '@/lib/format': { formatAge: () => 'Today' },
    '@/lib/reports': { labelFor: (_, value) => value },
  };
  for (const name of ['ArrowUpRight01', 'BubbleChat', 'Calendar03', 'CancelCircle', 'CheckmarkCircle02',
    'FirstAidKit', 'Flag02', 'InformationCircle', 'Megaphone01', 'PaintBoard', 'PawPrint', 'Ruler',
    'SearchRemove', 'Undo02', 'User']) {
    dependencies[`@hugeicons/core-free-icons/${name}Icon`] = {};
  }
  for (const [file, names] of Object.entries({
    'brand-icon': ['BrandIcon'], 'drawer-backdrop': ['AppDialogOverlay', 'PageVeil'],
    'google-sign-in-dialog': ['GoogleSignInDialog'], 'report-place-map': ['ReportPlaceMap'],
    'report-urgency': ['ReportUrgencyCard'], 'report-sent': ['ToastIcon'],
    'themed-text': ['ThemedText'], 'themed-view': ['ThemedView'],
  })) {
    dependencies[`@/components/${file}`] = Object.fromEntries(names.map((name) => [name, name]));
  }
  const { default: Screen } = loadSource('src/app/report/[id].tsx', dependencies);
  const isSafetyButton = (node) => node.props?.onPress &&
    findElement(node, (child) => child.props?.children === 'Read the safety tips');
  const tree = state.render(Screen);
  const about = findElement(tree, (node) => node.props?.title === 'About the animal');
  const card = findElement(about, (node) => node.type?.displayName === 'ListGroup');
  const button = findElement(card, isSafetyButton);
  assert.ok(button, 'safety tips belong inside animal details card');
  const safetyFooter = findElement(card, (node) => node.type === 'View' &&
    node.props.children === button);
  assert.ok(safetyFooter, 'button needs an inset footer, not edge-to-edge card placement');
  assert.equal(safetyFooter.props.style.padding, 16);
  assert.ok(button.props.style.minHeight >= 48, 'button must have a usable touch target');
  button.props.onPress();
  assert.deepEqual(routes, ['/safety']);
  const footer = findElement(tree, (node) => Array.isArray(node.props?.style) &&
    node.props.style.some((style) => style?.paddingBottom === 16));
  assert.ok(footer);
  assert.equal(findElement(footer, isSafetyButton), undefined);
  const tabs = findElement(tree, (node) => node.props?.['aria-label'] === 'What to show');
  tabs.props.onValueChange('reporter');
  assert.equal(findElement(state.render(Screen), isSafetyButton), undefined);
  tabs.props.onValueChange('report');
  report.rescuerId = 'someone-else';
  assert.equal(findElement(state.render(Screen), isSafetyButton), undefined);
  report.rescuerId = 'viewer';
  report.status = 'rescued';
  assert.equal(findElement(state.render(Screen), isSafetyButton), undefined);
});
