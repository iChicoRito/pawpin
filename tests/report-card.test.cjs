const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { loadSource, native, ui, theme, findElement } = require('./load-source.cjs');

test('each report and loading placeholder has its own borderless card without group dividers', () => {
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
    assert.equal(style.borderWidth, 0, 'reference cards use a solid surface, not an outline');
    assert.equal(style.borderRadius, 24);
    assert.equal(findElement(row, (node) => node.type === 'Separator'), undefined);
    const skeleton = ReportListSkeleton({ rows: 5 });
    assert.equal(styleOf(skeleton).gap, 8);
    assert.equal(skeleton.props.children.length, 5);
    for (const card of skeleton.props.children) {
      assert.equal(card.type, 'Card');
      assert.equal(styleOf(card).borderWidth, 0);
      assert.equal(styleOf(card).borderRadius, 24);
    }
  }
});

test('list urgency sits in a soft pill beside the animal with distance and time below', () => {
  const labelColors = {
    'text-danger-soft-foreground': '#a12a35',
    'text-warning-soft-foreground': '#9b681a',
    'text-default-soft-foreground': '#333333',
  };
  const { ReportRow } = loadSource('src/components/report-card.tsx', {
    'expo-image': { Image: 'Image' }, react: React, 'react-native': native,
    'react-native-reanimated': {},
    uniwind: { useResolveClassNames: (className) => ({ color: labelColors[className], backgroundColor: '#402929' }) },
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
    const pill = findElement(row, (node) => node.type === 'View' && node.props.children === text);
    assert.ok(pill, 'urgency text needs its own soft pill');
    assert.equal(Object.assign({}, ...[pill.props.style].flat(Infinity)).backgroundColor, '#402929');
    const titleRow = findElement(row, (node) => Array.isArray(node.props?.children) && node.props.children.includes(pill));
    assert.equal(titleRow.props.children[0].props.children, 'dog');
    assert.ok(findElement(row, (node) => node.type === 'Text' && node.props.children === '100 m away • 1 minute ago'));
    assert.equal(findElement(row, (node) => node.type === 'Text' && node.props.children === 'View report'), undefined);
    findElement(row, (node) => node.props.role === 'button').props.onPress();
    assert.equal(opened, report);
  }
});

test('compact cards put a square thumbnail beside details and match missing-photo and loading layouts', () => {
  const { ReportRow, ReportListSkeleton } = loadSource('src/components/report-card.tsx', {
    'expo-image': { Image: 'Image' }, react: React, 'react-native': native,
    'react-native-reanimated': {},
    uniwind: { useResolveClassNames: () => ({ color: '#000' }) },
    'heroui-native': { ...ui, Card: 'Card', Skeleton: 'Skeleton' },
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/themed-view': { ThemedView: 'View' }, '@/constants/theme': theme,
    '@/hooks/use-session': { useSession: () => ({ session: null }) },
    '@/lib/format': { formatDistance: () => '100 m', formatAge: () => '1 minute ago' },
    '@/lib/reports': { ANIMAL_TYPES: [], URGENCIES: [] },
  });
  const styleOf = (node) => Object.assign({}, ...[node.props.style].flat(Infinity));
  const report = { animalType: 'cat', urgency: 'just_sighted', status: 'reported', photos: ['https://example.com/cat.jpg'] };
  const row = ReportRow({ report, onOpen() {} });
  const press = findElement(row, (node) => node.props.role === 'button');
  const photo = findElement(press, (node) => node.type === 'Image');
  const content = press.props.children[0];
  assert.equal(styleOf(content).flexDirection, 'row');
  assert.equal(content.props.children[0], photo, 'thumbnail must sit left of the details');
  assert.equal(styleOf(photo).width, 66);
  assert.equal(styleOf(photo).height, 66);
  assert.equal(styleOf(photo).borderRadius, 24);
  assert.equal(photo.props.contentFit, 'cover');
  assert.equal(photo.props.source.uri, report.photos[0]);

  const missing = ReportRow({ report: { ...report, photos: [] }, onOpen() {} });
  const fallback = findElement(missing, (node) => node.props.role === 'button').props.children[0].props.children[0];
  assert.equal(styleOf(fallback).width, 66);
  assert.equal(styleOf(fallback).height, 66);
  assert.equal(findElement(fallback, (node) => node.type === 'Text').props.children, 'No photo');

  const skeleton = ReportListSkeleton({ rows: 2 });
  for (const card of skeleton.props.children) {
    const placeholder = findElement(card, (node) => node.type === 'Skeleton');
    assert.equal(styleOf(placeholder).width, 66);
    assert.equal(styleOf(placeholder).height, 66);
  }
});

test('only responding reports have a footer, which stays inside the card action and names the rescuer', () => {
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
  assert.equal(findElement(someone, (node) => node.type === 'Text' && node.props.children === 'View report'), undefined);
  // The bar is inside the one button the card is, so a tap on it opens the report too.
  const button = findElement(someone, (node) => node.props?.role === 'button');
  assert.ok(footerOf(button), 'the footer must be part of what is pressed');
  assert.match(button.props['aria-label'], /someone is on the way/);

  assert.equal(textIn(footerOf(load('r1')({ report: going, onOpen() {} }))), 'You are on the way');
  let opened;
  const report = { ...going, status: 'reported' };
  const available = load('u1')({ report, onOpen(value) { opened = value; } });
  assert.equal(footerOf(available), undefined);
  const action = findElement(available, (node) => node.props?.role === 'button');
  assert.equal(findElement(action, (node) => node.type === 'Text' && node.props.children === 'View report'), undefined);
  action.props.onPress();
  assert.equal(opened, report);
});
