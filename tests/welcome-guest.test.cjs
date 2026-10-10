const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, hooks, findElement, ui, native, theme } = require('./load-source.cjs');

function welcome(guest, google = async () => {}) {
  const state = hooks();
  const { GuestSignInError } = loadSource('src/lib/guest-auth.ts', {
    'expo-application': {}, 'react-native': native, '@/lib/supabase': {},
  });
  const module = loadSource('src/app/welcome.tsx', {
    '@hugeicons/core-free-icons/AlertCircleIcon': {},
    '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
    'expo-image': { Image: 'Image' }, 'heroui-native': ui,
    react: state.react, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/brand-icon': { BrandIcon: 'BrandIcon', GOOGLE_LOGO: '' },
    '@/components/themed-text': { ThemedText: 'ThemedText' },
    '@/components/themed-view': { ThemedView: 'ThemedView' },
    '@/constants/theme': theme,
    '@/hooks/use-color-scheme': { useColorScheme: () => 'light' },
    '@/lib/auth': { signInWithGoogle: google },
    '@/lib/guest-auth': { GuestSignInError, signInAsGuest: () => guest(GuestSignInError) },
    '@/lib/supabase': { supabase: { auth: { signInAnonymously: async () => ({ error: null }) } } },
    '../../assets/DarkMode.svg': 'dark-logo', '../../assets/LightMode.svg': 'light-logo',
  });
  const render = () => state.render(module.default);
  const buttons = (tree) => {
    const result = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (node.props?.onPress) result.push(node);
      const children = node.props?.children;
      for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) visit(child);
    }
    visit(tree);
    return result;
  };
  return { render, buttons };
}

test('welcome displays guest cooldown recovery while leaving Google available', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let googleCalls = 0;
  const message = 'Try again after October 14, or continue with Google.';
  const screen = welcome((ErrorType) => { throw new ErrorType(message, '2026-10-14T12:00:00Z'); }, async () => { googleCalls++; });
  await screen.buttons(screen.render())[1].props.onPress();
  const tree = screen.render();
  assert.ok(findElement(tree, (node) => node.props?.children === message));
  assert.ok(findElement(tree, (node) => node.props?.role === 'alert'));
  assert.equal(screen.buttons(tree)[0].props.isDisabled, false);
  await screen.buttons(tree)[0].props.onPress();
  assert.equal(googleCalls, 1);
});

test('welcome blocks captured duplicate taps and releases controls after sign-in fails', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let finish;
  let guestCalls = 0;
  let googleCalls = 0;
  const waiting = new Promise((_, reject) => { finish = reject; });
  const screen = welcome(() => { guestCalls++; return waiting; }, async () => { googleCalls++; });
  const [google, guest] = screen.buttons(screen.render());
  const first = guest.props.onPress();
  await Promise.all([guest.props.onPress(), google.props.onPress()]);
  assert.equal(guestCalls, 1);
  assert.equal(googleCalls, 0);
  finish(new Error('Offline'));
  await first;
  assert.equal(screen.buttons(screen.render())[1].props.isDisabled, false);
  assert.ok(findElement(screen.render(), (node) => node.props?.role === 'alert'));
});
