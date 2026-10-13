const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, hooks, findElement, ui, native, theme } = require('./load-source.cjs');

test('welcome logo is the splash banner, still and centered', () => {
  const state = hooks();
  const { default: Welcome } = loadSource('src/app/welcome.tsx', {
    'expo-image': { Image: 'Image' },
    'heroui-native': ui,
    react: state.react,
    'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/brand-icon': { BrandIcon: 'BrandIcon', GOOGLE_LOGO: '' },
    '@/components/report-sent': { ToastIcon: 'ToastIcon' },
    '@/components/themed-text': { ThemedText: 'ThemedText' },
    '@/components/themed-view': { ThemedView: 'ThemedView' },
    '@/constants/theme': theme,
    '@/lib/auth': { signInWithGoogle() {} },
    '@/components/animated-splash': { Banner: 'Banner' },
    '@/lib/splash-target': { setSplashTarget() {} },
    '@/lib/guest-auth': { signInAsGuest() {}, GuestSignInError: Error },
    '../../assets/DarkMode.svg': 'dark-logo',
    '../../assets/LightMode.svg': 'light-logo',
  });

  // The banner colors itself by theme. The welcome screen only places and labels it.
  const tree = state.render(Welcome);
  const logo = findElement(tree, (element) => element.props?.accessibilityLabel === 'PawPin');
  assert.ok(logo, 'welcome screen renders logo');
  assert.equal(logo.props.style.alignSelf, 'center');
  const banner = findElement(logo, (element) => element.type === 'Banner');
  assert.equal(banner.props.still, true, 'the splash already played the animation');
});
