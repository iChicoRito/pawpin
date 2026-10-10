const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { loadSource, native, theme, findElement } = require('./load-source.cjs');

test('history report rows open their own report ID and remain readable without an action', () => {
  const Item = Object.assign(() => {}, { Prefix: 'Prefix', Content: 'Content', Title: 'Title',
    Description: 'Description', Suffix: 'Suffix' });
  const { HistoryList } = loadSource('src/components/profile-history.tsx', {
    'expo-image': { Image: 'Image' },
    'heroui-native': { ListGroup: Object.assign(() => {}, { Item, ItemPrefix: 'Prefix',
      ItemContent: 'Content', ItemTitle: 'Title', ItemDescription: 'Description', ItemSuffix: 'Suffix' }), Separator: 'Separator', Skeleton: 'Skeleton' },
    react: React, 'react-native': native,
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/themed-view': { ThemedView: 'View' }, '@/constants/theme': theme,
    '@/lib/format': { formatAge: () => '1 hour ago' },
    '@/lib/reports': { ANIMAL_TYPES: [], REPORT_STATUSES: [], labelFor: (_, value) => value },
  });
  const report = { id: 'own-report', animalType: 'dog', status: 'reported', createdAt: new Date().toISOString() };
  let opened;
  const tree = HistoryList({ kind: 'reports', reports: [report], onOpen: (id) => { opened = id; } });
  const row = findElement(tree, (node) => node.type === Item);
  assert.equal(row.props.role, 'button');
  assert.notEqual(row.props.pointerEvents, 'none');
  row.props.onPress();
  assert.equal(opened, report.id);
  const rescue = findElement(HistoryList({ kind: 'rescues', reports: [report],
    onOpen: (id) => { opened = `rescue:${id}`; } }), (node) => node.type === Item);
  assert.equal(rescue.props.role, 'button');
  assert.notEqual(rescue.props.pointerEvents, 'none');
  rescue.props.onPress();
  assert.equal(opened, `rescue:${report.id}`);
  const readOnly = findElement(HistoryList({ kind: 'rescues', reports: [report] }), (node) => node.type === Item);
  assert.equal(readOnly.props.onPress, undefined);
  assert.notEqual(readOnly.props.role, 'button');
});
