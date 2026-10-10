const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { loadSource, hooks, native, theme, findElement } = require('./load-source.cjs');

function profile(appearance, colorScheme, isAdmin = false) {
  const dependencies = {};
  const source = fs.readFileSync('src/app/(tabs)/profile.tsx', 'utf8');
  for (const [, name] of source.matchAll(/from '(@hugeicons\/core-free-icons\/[^']+)'/g)) {
    dependencies[name] = {};
  }
  let saved;
  const Item = 'Item';
  const ListGroup = Object.assign(() => {}, {
    Item, ItemPrefix: 'Prefix', ItemContent: 'Content', ItemTitle: 'Title',
    ItemDescription: 'Description', ItemSuffix: 'Suffix',
  });
  const { default: Profile } = loadSource('src/app/(tabs)/profile.tsx', {
    ...dependencies,
    '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
    'expo-router': { useIsFocused: () => false, useRouter: () => ({ push() {} }) },
    'heroui-native': { ListGroup, Switch: 'Switch', Typography: 'Typography',
      Avatar: Object.assign(() => {}, { Fallback: 'Fallback' }),
      useThemeColor: () => ['#111', '#007AFF'] },
    react: hooks().react,
    'react-native': { ...native, useColorScheme: () => colorScheme },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    '@/components/brand-icon': {},
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/themed-view': { ThemedView: 'View' },
    '@/constants/theme': theme,
    '@/hooks/use-session': { useSession: () => ({ isGuest: false, isAdmin, name: 'Tester' }) },
    '@/lib/alerts': { useAlertPermission: () => [null] },
    '@/lib/appearance': { useAppearance: () => appearance,
      setAppearance: (value) => { saved = value; },
      APPEARANCES: [{ value: appearance, label: appearance }] },
    '@/lib/auth': {}, '@/lib/format': { initialsOf: () => 'T' },
    '@/lib/nearby': { RADIUS_CHOICES: [] },
  });
  return { tree: Profile(), saved: () => saved };
}

test('Appearance row switches between dark and light without navigating', () => {
  for (const isAdmin of [false, true]) {
    for (const [appearance, scheme, selected] of [
      ['light', 'light', false], ['dark', 'dark', true],
      ['system', 'light', false], ['system', 'dark', true],
    ]) {
      const { tree, saved } = profile(appearance, scheme, isAdmin);
      const row = findElement(tree, (node) => node.type === 'Item' &&
        !!findElement(node, (child) => child.type === 'Title' && child.props.children === 'Appearance'));
      const toggle = findElement(row, (node) => node.type === 'Switch');
      assert.ok(toggle, 'Appearance must have an inline switch');
      assert.equal(row.props.onPress, undefined);
      assert.notEqual(row.props.role, 'button');
      assert.equal(toggle.props.accessibilityLabel, 'Dark mode');
      assert.equal(toggle.props.isSelected, selected);
      toggle.props.onSelectedChange(true);
      assert.equal(saved(), 'dark');
      toggle.props.onSelectedChange(false);
      assert.equal(saved(), 'light');
    }
  }
});
