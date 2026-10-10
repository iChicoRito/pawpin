const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { loadSource, native, theme, findElement } = require('./load-source.cjs');

test('responding admin reports use shared live dot and text while other statuses keep chips', () => {
  const Item = Object.assign(() => {}, { Prefix: 'Prefix', Content: 'Content', Title: 'Title' });
  const { AdminReportRows } = loadSource('src/components/admin-report-rows.tsx', {
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
