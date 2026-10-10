const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { loadSource, hooks, native, theme, findElement } = require('./load-source.cjs');

test('About PawPin opens from Profile for guests, users, and admins', () => {
  for (const account of [{ isGuest: true }, { isGuest: false }, { isAdmin: true }]) {
    const icons = {};
    for (const [, name] of fs.readFileSync('src/app/(tabs)/profile.tsx', 'utf8').matchAll(/from '(@hugeicons\/core-free-icons\/[^']+)'/g)) {
      icons[name] = {};
    }
    const Item = Object.assign(() => {}, {
      Prefix: 'Prefix', Content: 'Content', Title: 'Title', Description: 'Description', Suffix: 'Suffix',
    });
    const pushed = [];
    const { default: Profile } = loadSource('src/app/(tabs)/profile.tsx', {
      ...icons,
      '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
      'expo-router': { useIsFocused: () => false, useRouter: () => ({ push: (path) => pushed.push(path) }) },
      'heroui-native': { ListGroup: Object.assign(() => {}, { Item,
        ItemPrefix: 'Prefix', ItemContent: 'Content', ItemTitle: 'Title',
        ItemDescription: 'Description', ItemSuffix: 'Suffix' }), Switch: 'Switch', Typography: 'Typography',
        Avatar: Object.assign(() => {}, { Fallback: 'Fallback' }), useThemeColor: () => ['#111', '#007AFF'] },
      react: hooks().react,
      'react-native': native,
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
      '@/components/brand-icon': {},
      '@/components/themed-text': { ThemedText: 'Text' },
      '@/components/themed-view': { ThemedView: 'View' },
      '@/constants/theme': theme,
      '@/hooks/use-session': { useSession: () => ({ name: 'Tester', ...account }) },
      '@/lib/alerts': { useAlertPermission: () => [null] },
      '@/lib/appearance': { useAppearance: () => 'light' },
      '@/lib/auth': {}, '@/lib/format': { initialsOf: () => 'T' },
      '@/lib/nearby': { RADIUS_CHOICES: [] },
    });
    const tree = Profile();
    const row = findElement(tree, (node) => node.type === Item &&
      !!findElement(node, (child) => child.type === 'Title' && child.props.children === 'About PawPin'));
    assert.ok(row, 'every account type should see About PawPin');
    assert.equal(row.props.role, 'button');
    row.props.onPress();
    assert.deepEqual(pushed, ['/about']);
  }
});

test('About uses existing theme logos, real version, and developer credit with description in one card', () => {
  for (const scheme of ['light', 'dark']) {
    const { default: About } = loadSource('src/app/about.tsx', {
      'expo-constants': { __esModule: true, default: { expoConfig: { version: '2.3.4' } } },
      'expo-image': { Image: 'Image' },
      '@hugeicons/core-free-icons/Megaphone01Icon': 'report',
      '@hugeicons/core-free-icons/Location01Icon': 'location',
      '@hugeicons/core-free-icons/HeartCheckIcon': 'rescue',
      '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
      'heroui-native': { Card: 'Card' },
      'react-native': native,
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 20 }) },
      '@/components/themed-text': { ThemedText: 'Text' },
      '@/components/themed-view': { ThemedView: 'View' },
      '@/constants/theme': theme,
      '@/hooks/use-color-scheme': { useColorScheme: () => scheme },
      '@/hooks/use-theme': { useTheme: () => ({ text: scheme === 'dark' ? '#fff' : '#000' }) },
      '../../assets/LightMode.svg': 'light-logo', '../../assets/DarkMode.svg': 'dark-logo',
    });
    const tree = About();
    const logo = findElement(tree, (node) => node.type === 'Image');
    assert.equal(logo.props.source, `${scheme}-logo`);
    assert.equal(logo.props.contentFit, 'contain');
    assert.equal(logo.props.accessibilityLabel, 'PawPin');
    assert.ok(findElement(tree, (node) => node.type === 'Text' && node.props.children === 'Mark Adrianne Salunga'));
    assert.ok(findElement(tree, (node) => node.type === 'Text' && node.props.children === 'Developed by'));
    const aboutLabel = findElement(tree, (node) => node.type === 'Text' && node.props.children === 'About PawPin');
    const developerLabel = findElement(tree, (node) => node.type === 'Text' && node.props.children === 'Developed by');
    assert.equal(aboutLabel.props.role, 'heading');
    assert.equal(aboutLabel.props.themeColor, undefined);
    assert.equal(aboutLabel.props.style.fontSize, 20);
    assert.equal(aboutLabel.props.style.fontWeight, 600);
    assert.equal(developerLabel.props.type, 'small');
    assert.equal(developerLabel.props.themeColor, 'textSecondary');
    assert.ok(findElement(tree, (node) => node.type === 'Text' && [node.props.children].flat().join('') === 'Version 2.3.4'));
    const card = findElement(tree, (node) => node.type === 'Card');
    assert.ok(card);
    assert.ok(findElement(card, (node) => node === aboutLabel));
    for (const title of ['Report a stray', 'Find nearby reports', 'Follow rescue progress']) {
      const feature = findElement(card, (node) => node.type === 'Text' && node.props.children === title);
      assert.ok(feature, `${title} needs a readable feature heading`);
    }
    for (const iconName of ['report', 'location', 'rescue']) {
      assert.ok(findElement(card, (node) => node.type === 'Icon' && node.props.icon === iconName));
    }
    assert.equal(findElement(card, (node) => node.type === 'Card' && node !== card), undefined);
    const credit = findElement(tree, (node) => node.type === 'View' &&
      !!findElement(node, (child) => child === developerLabel));
    assert.ok(credit);
    assert.notEqual(credit, card);
    const creditContainer = findElement(credit, (node) => node.type === 'View' && node.props.style?.marginTop === 'auto');
    assert.ok(creditContainer);
    assert.equal(creditContainer.props.style.alignItems, 'center');
    assert.equal(developerLabel.props.style.textAlign, 'center');
    assert.equal(findElement(tree, (node) => node.type === 'Pressable'), undefined);
    const scroll = findElement(tree, (node) => node.type === 'ScrollView');
    const style = Object.assign({}, ...scroll.props.contentContainerStyle);
    assert.equal(style.paddingBottom, 20 + theme.Spacing.four);
    assert.equal(style.width, '100%');
    assert.equal(style.flexGrow, 1);
  }
});
