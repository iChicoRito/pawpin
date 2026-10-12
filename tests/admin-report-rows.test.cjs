const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { loadSource, native, theme, findElement } = require('./load-source.cjs');

const Item = Object.assign(() => {}, { Prefix: 'Prefix', Content: 'Content', Title: 'Title' });
const loadRows = () => loadSource('src/components/admin-report-rows.tsx', {
    '@hugeicons/core-free-icons/Flag02Icon': {}, '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
    'expo-image': { Image: 'Image' },
    'heroui-native': { Chip: 'Chip', ListGroup: Object.assign(() => {}, { Item, ItemPrefix: 'Prefix',
      ItemContent: 'Content', ItemTitle: 'Title' }), Separator: 'Separator', useThemeColor: () => '#21834b' },
    react: React, 'react-native': native,
    '@/components/profile-history': { monthOf: () => 'This month' },
    '@/components/report-card': { LiveDot: 'LiveDot' },
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/themed-view': { ThemedView: 'View' }, '@/constants/theme': theme,
    '@/lib/format': { formatAge: () => '1 hour ago' },
    '@/lib/reports': { ANIMAL_TYPES: [], labelFor: (_, value) => value },
  });

test('responding admin reports use shared live dot and text while other statuses keep chips', () => {
  const { AdminReportRows } = loadRows();
  for (const status of ['responding', 'reported', 'rescued', 'not_found', 'closed']) {
    let opened;
    const tree = AdminReportRows({ datedBy: 'sent', onPress: (id) => { opened = id; },
      reports: [{ id: 'report-1', animalType: 'dog', status, flagCount: 0, reasons: [] }] });
    if (status === 'responding') {
      assert.ok(findElement(tree, (node) => node.type === 'LiveDot'));
      assert.ok(findElement(tree, (node) => node.type === 'Text' && node.props.children === 'On the way'));
      assert.equal(findElement(tree, (node) => node.type === 'Chip'), undefined);
    } else {
      assert.equal(findElement(tree, (node) => node.type === 'LiveDot'), undefined);
      assert.ok(findElement(tree, (node) => node.type === 'Chip'));
    }
    findElement(tree, (node) => node.type === Item).props.onPress();
    assert.equal(opened, 'report-1');
  }
});

test('a report sent with no animal seen says so, in a chip and aloud; other reports do not', () => {
  const { AdminReportRows } = loadRows();
  const row = (noAnimalSeen) => AdminReportRows({ datedBy: 'sent', onPress() {},
    reports: [{ id: 'report-1', animalType: 'dog', status: 'reported', flagCount: 0, reasons: [], noAnimalSeen }] });
  const chipOf = (tree) => findElement(tree, (node) => node.type === 'Chip' && node.props.children === 'No animal seen');
  const spokenOf = (tree) => findElement(tree, (node) => node.type === Item).props['aria-label'];

  assert.ok(chipOf(row(true)));
  assert.match(spokenOf(row(true)), /no animal seen/);
  for (const unmarked of [false, undefined]) {
    assert.equal(chipOf(row(unmarked)), undefined);
    assert.doesNotMatch(spokenOf(row(unmarked)), /no animal/i);
  }
});
