const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, findElement } = require('./load-source.cjs');

function startup(session, isLoading, splashDone = false) {
  const Stack = Object.assign(() => {}, { Protected: 'Protected', Screen: 'Screen' });
  const layout = loadSource('src/app/_layout.tsx', {
    'expo-router': { Stack },
    'expo-splash-screen': { preventAutoHideAsync() {} },
    'heroui-native': {},
    react: { useState: () => [splashDone, () => {}] },
    'react-native': { useColorScheme: () => 'light' },
    'react-native-gesture-handler': {},
    '@/global.css': {},
    '@/components/animated-splash': { AnimatedSplash: 'AnimatedSplash' },
    '@/components/drawer-backdrop': {},
    '@/components/sound-effects': {},
    '@/hooks/use-nearby-reports': {},
    '@/hooks/use-session': { useSession: () => ({ session, isLoading }) },
    '@/lib/alerts': { useAlertRegistration() {} },
    '@/lib/appearance': { loadAppearance() {} },
  }, ['RootNavigator', 'Screens']);
  const tree = layout.__test.RootNavigator();
  const screens = findElement(tree, (node) => node.type === layout.__test.Screens);
  return {
    splash: findElement(tree, (node) => node.type === 'AnimatedSplash'),
    routes: screens && layout.__test.Screens(screens.props),
  };
}

test('signed-out startup shows auth under the splash', () => {
  const { splash, routes } = startup(null, false);
  assert.equal(splash.props.ready, true, 'the splash may leave once the route is known');
  assert.equal(splash.props.toLogo, true, 'signed out, the banner moves onto the welcome logo');
  const auth = findElement(routes, (node) => node.type === 'Protected' && node.props.guard);
  assert.equal(auth.props.children.props.name, 'welcome');
});

test('restored session opens signed-in routes instead of flashing auth', () => {
  const { routes } = startup({ user: { id: 'saved-user' } }, false);
  const active = findElement(routes, (node) => node.type === 'Protected' && node.props.guard);
  assert.ok(findElement(active, (node) => node.type === 'Screen' && node.props.name === '(tabs)'));
  assert.equal(findElement(active, (node) => node.props?.name === 'welcome'), undefined);
});

test('session restoration keeps the splash up and shows no route until it is known', () => {
  const { splash, routes } = startup(null, true);
  assert.equal(routes, undefined);
  assert.equal(splash.props.ready, false);
});

test('the splash is gone once it has played', () => {
  const { splash, routes } = startup(null, false, true);
  assert.equal(splash, undefined);
  assert.ok(routes);
});
