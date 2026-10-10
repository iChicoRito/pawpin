const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, findElement } = require('./load-source.cjs');

function startup(session, isLoading) {
  const effects = [];
  let hidden = 0;
  const Stack = Object.assign(() => {}, { Protected: 'Protected', Screen: 'Screen' });
  const layout = loadSource('src/app/_layout.tsx', {
    'expo-router': { Stack },
    'expo-splash-screen': { preventAutoHideAsync() {}, hide() { hidden++; } },
    'heroui-native': {},
    react: { useEffect: (effect) => effects.push(effect) },
    'react-native': { useColorScheme: () => 'light' },
    'react-native-gesture-handler': {},
    '@/global.css': {},
    '@/components/animated-icon': { AnimatedSplashOverlay: 'SplashOverlay' },
    '@/components/drawer-backdrop': {},
    '@/hooks/use-nearby-reports': {},
    '@/hooks/use-session': { useSession: () => ({ session, isLoading }) },
    '@/lib/alerts': { useAlertRegistration() {} },
    '@/lib/appearance': { loadAppearance() {} },
  }, ['RootNavigator']);
  const tree = layout.__test.RootNavigator();
  effects.forEach((effect) => effect());
  return { tree, hidden, Stack };
}

test('signed-out startup shows auth without an intervening animated splash', () => {
  const { tree, hidden, Stack } = startup(null, false);
  assert.equal(tree.type, Stack);
  assert.equal(hidden, 1, 'native launch screen must be released when content is ready');
  const auth = findElement(tree, (node) => node.type === 'Protected' && node.props.guard);
  assert.equal(auth.props.children.props.name, 'welcome');
});

test('restored session opens signed-in routes instead of flashing auth', () => {
  const { tree, hidden } = startup({ user: { id: 'saved-user' } }, false);
  assert.equal(hidden, 1);
  const active = findElement(tree, (node) => node.type === 'Protected' && node.props.guard);
  assert.ok(findElement(active, (node) => node.type === 'Screen' && node.props.name === '(tabs)'));
  assert.equal(findElement(active, (node) => node.props?.name === 'welcome'), undefined);
});

test('session restoration keeps native launch screen until route is known', () => {
  const { tree, hidden } = startup(null, true);
  assert.equal(tree, null);
  assert.equal(hidden, 0);
});
