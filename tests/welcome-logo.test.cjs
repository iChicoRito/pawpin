const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, hooks, findElement, ui, native, theme } = require('./load-source.cjs');

test('welcome logo follows theme changes and stays centered without stretching', () => {
  let scheme = 'light';
  const state = hooks();
  const { default: Welcome } = loadSource('src/app/welcome.tsx', {
    '@hugeicons/core-free-icons/AlertCircleIcon': {},
    '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
    'expo-image': { Image: 'Image' },
    'heroui-native': ui,
    react: state.react,
    'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/brand-icon': { BrandIcon: 'BrandIcon', GOOGLE_LOGO: '' },
    '@/components/themed-text': { ThemedText: 'ThemedText' },
    '@/components/themed-view': { ThemedView: 'ThemedView' },
    '@/constants/theme': theme,
    '@/hooks/use-color-scheme': { useColorScheme: () => scheme },
    '@/lib/auth': { signInWithGoogle() {} },
    '@/lib/supabase': { supabase: {} },
    '../../assets/DarkMode.svg': 'dark-logo',
    '../../assets/LightMode.svg': 'light-logo',
  });

  for (const [next, expected] of [['light', 'light-logo'], ['dark', 'dark-logo'], [null, 'light-logo']]) {
    scheme = next;
    const tree = state.render(Welcome);
    const logo = findElement(tree, (element) => element.type === 'Image');
    assert.ok(logo, 'welcome screen renders logo');
    assert.equal(logo.props.source, expected);
    assert.equal(logo.props.accessibilityLabel, 'PawPin');
    assert.equal(logo.props.contentFit, 'contain');
    assert.equal(logo.props.style.alignSelf, 'center');
    assert.equal(logo.props.style.width, '100%');
    assert.equal(logo.props.style.maxWidth, 320);
    assert.equal(logo.props.style.aspectRatio, 735 / 253);
  }
});
