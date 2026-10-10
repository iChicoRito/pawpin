const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { loadSource, native, ui, theme, findElement } = require('./load-source.cjs');

test('each report and loading placeholder has its own card without group dividers', () => {
  for (const border of ['#e5e5e5', '#444444']) {
    const { ReportRow, ReportListSkeleton } = loadSource('src/components/report-card.tsx', {
      'expo-image': { Image: 'Image' }, react: React, 'react-native': native,
      'react-native-reanimated': {},
      uniwind: { useResolveClassNames: () => ({ color: '#000' }) },
      'heroui-native': { ...ui, Card: 'Card', ListGroup: ui.ListGroup, Separator: 'Separator', Chip: 'Chip', Skeleton: 'Skeleton',
        useThemeColor: (token) => token === 'border' ? border : '#000' },
      '@/components/themed-text': { ThemedText: 'Text' },
      '@/components/themed-view': { ThemedView: 'View' }, '@/constants/theme': theme,
      '@/hooks/use-session': { useSession: () => ({ session: null }) },
      '@/lib/format': { formatDistance: () => '100 m', formatAge: () => '1 minute ago' },
      '@/lib/reports': { ANIMAL_TYPES: [], URGENCIES: [] },
    });
    const report = { animalType: 'dog', urgency: 'critical', status: 'open', photos: [] };
    const styleOf = (tree) => Object.assign({}, ...[tree.props.style].flat(Infinity));
    const row = ReportRow({ report, onOpen() {} });
    assert.equal(row.type, 'Card');
    const style = styleOf(row);
    assert.ok(style.borderWidth > 0, 'every card needs its own complete outline');
    assert.equal(style.borderColor, border);
    assert.equal(findElement(row, (node) => node.type === 'Separator'), undefined);
    const skeleton = ReportListSkeleton({ rows: 5 });
    assert.equal(styleOf(skeleton).gap, 8);
    assert.equal(skeleton.props.children.length, 5);
    for (const card of skeleton.props.children) {
      assert.equal(card.type, 'Card');
      assert.ok(styleOf(card).borderWidth > 0);
      assert.equal(styleOf(card).borderColor, border);
    }
  }
});

test('list urgency is plain text with the same secondary-chip label colors', () => {
  const labelColors = {
    'text-danger-soft-foreground': '#a12a35',
    'text-warning-soft-foreground': '#9b681a',
    'text-default-soft-foreground': '#333333',
  };
  const { ReportRow } = loadSource('src/components/report-card.tsx', {
    'expo-image': { Image: 'Image' }, react: React, 'react-native': native,
    'react-native-reanimated': {},
    uniwind: { useResolveClassNames: (className) => ({ color: labelColors[className] }) },
    'heroui-native': { ...ui, Card: 'Card', ListGroup: ui.ListGroup, Separator: 'Separator', Chip: 'Chip', Skeleton: 'Skeleton' },
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/themed-view': { ThemedView: 'View' }, '@/constants/theme': theme,
    '@/hooks/use-session': { useSession: () => ({ session: null }) },
    '@/lib/format': { formatDistance: () => '100 m', formatAge: () => '1 minute ago' },
    '@/lib/reports': { ANIMAL_TYPES: [], URGENCIES: [
      { value: 'critical', label: 'Critical' },
      { value: 'needs_help_soon', label: 'Needs help soon' },
      { value: 'just_sighted', label: 'Just sighted' },
    ] },
  });
  for (const [urgency, label, color] of [
    ['critical', 'Critical', '#a12a35'],
    ['needs_help_soon', 'Needs help soon', '#9b681a'],
    ['just_sighted', 'Just sighted', '#333333'],
  ]) {
    const report = { animalType: 'dog', urgency, status: 'reported', photos: [] };
    let opened;
    const row = ReportRow({ report, onOpen: (value) => { opened = value; } });
    assert.equal(findElement(row, (node) => node.type === 'Chip'), undefined);
    const text = findElement(row, (node) => node.type === 'Text' && node.props.children === label);
    assert.ok(text, 'urgency label must remain readable as text');
    const style = Object.assign({}, ...[text.props.style].flat(Infinity));
    assert.equal(style.color, color);
    findElement(row, (node) => node.props.role === 'button').props.onPress();
    assert.equal(opened, report);
  }
});

test('report someone is going to says so in a footer bar across the card, and no other card has one', () => {
  const load = (userId) => loadSource('src/components/report-card.tsx', {
    'expo-image': { Image: 'Image' }, react: React, 'react-native': native,
    'react-native-reanimated': {},
    uniwind: { useResolveClassNames: () => ({ color: '#000' }) },
    'heroui-native': { ...ui, Card: 'Card', Skeleton: 'Skeleton' },
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/themed-view': { ThemedView: 'View' }, '@/constants/theme': theme,
    '@/hooks/use-session': { useSession: () => ({ session: userId ? { user: { id: userId } } : null }) },
    '@/lib/format': { formatDistance: () => '100 m', formatAge: () => '1 minute ago' },
    '@/lib/reports': { ANIMAL_TYPES: [], URGENCIES: [] },
  }).ReportRow;
  const footerOf = (row) => findElement(row, (node) => node.props?.testID === 'responding-footer');
  const textIn = (tree) => findElement(tree, (node) => node.type === 'Text')?.props.children;
  const going = { animalType: 'dog', urgency: 'critical', status: 'responding', rescuerId: 'r1', photos: [] };

  const someone = load('u1')({ report: going, onOpen() {} });
  assert.equal(textIn(footerOf(someone)), 'Someone is on the way');
  // The bar is inside the one button the card is, so a tap on it opens the report too.
  const button = findElement(someone, (node) => node.props?.role === 'button');
  assert.ok(footerOf(button), 'the footer must be part of what is pressed');
  assert.match(button.props['aria-label'], /someone is on the way/);

  assert.equal(textIn(footerOf(load('r1')({ report: going, onOpen() {} }))), 'You are on the way');
  assert.equal(footerOf(load('u1')({ report: { ...going, status: 'reported' }, onOpen() {} })), undefined);
});
