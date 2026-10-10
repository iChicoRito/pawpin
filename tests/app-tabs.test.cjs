const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, hooks, native, theme, findElement } = require('./load-source.cjs');

test('user and admin tabs use solid glyphs in both selection states without changing labels or routes', () => {
  const paths = new Set();
  for (const isAdmin of [false, true]) {
    const { default: AppTabs, __test } = loadSource('src/components/app-tabs.tsx', {
      '@hugeicons/core-free-icons/Camera01Icon': {},
      '@hugeicons/core-free-icons/DashboardSquare01Icon': {},
      '@hugeicons/core-free-icons/LeftToRightListBulletIcon': {},
      '@hugeicons/core-free-icons/MapsIcon': {},
      '@hugeicons/core-free-icons/UserIcon': {},
      '@hugeicons/react-native': { HugeiconsIcon: 'OutlineIcon' },
      'expo-router': {},
      'expo-router/ui': { Tabs: 'Tabs', TabSlot: 'TabSlot', TabList: 'TabList', TabTrigger: 'TabTrigger' },
      'heroui-native': { useThemeColor: () => ['#0088FF', '#FFFFFF', '#999999'] },
      react: hooks().react,
      'react-native': native,
      'react-native-svg': { default: 'Svg', Svg: 'Svg', Path: 'Path' },
      'react-native-reanimated': {
        default: { View: 'AnimatedView', Text: 'AnimatedText' },
        useDerivedValue: (callback) => ({ value: callback() }),
        useAnimatedStyle: (callback) => callback(), withTiming: (value) => value,
      },
      'react-native-safe-area-context': {},
      '@/constants/theme': theme,
      '@/hooks/use-session': { useSession: () => ({ isAdmin }) },
    }, ['TabButton']);
    const tree = AppTabs();
    const expected = isAdmin
      ? [['index', '/', 'Dashboard'], ['list', '/list', 'Reports'], ['profile', '/profile', 'Profile']]
      : [['index', '/', 'Map'], ['list', '/list', 'List'], ['report', '/report', 'Report'], ['profile', '/profile', 'Profile']];
    for (const [name, href, label] of expected) {
      const trigger = findElement(tree, (node) => node.type === 'TabTrigger' && node.props.name === name);
      assert.equal(trigger.props.href, href);
      assert.equal(trigger.props.children.props.label, label);
      for (const isFocused of [false, true]) {
        const button = __test.TabButton({ ...trigger.props.children.props, isFocused });
        assert.equal(button.props['aria-selected'], isFocused);
        assert.equal(findElement(button, (node) => node.type === 'OutlineIcon'), undefined);
        const glyph = findElement(button, (node) => typeof node.type === 'function' && node.type.name === 'FilledTabIcon');
        assert.ok(glyph, `${label} needs a solid glyph`);
        const svg = glyph.type(glyph.props);
        const path = findElement(svg, (node) => node.type === 'Path');
        assert.equal(path.props.fill, glyph.props.color);
        assert.equal(path.props.stroke, undefined);
        assert.ok(path.props.d.length > 0);
        paths.add(path.props.d);
      }
    }
  }
  assert.equal(paths.size, 5, 'Map, List, Report, Profile and Dashboard must stay distinct');
});
