const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { loadSource, native, ui, theme, findElement } = require('./load-source.cjs');

function dashboard(stats, overview = {}) {
  const dependencies = {
    react: React,
    'react-native': native,
    'heroui-native': { ...ui, useThemeColor: (token) => {
      const colors = { 'success-soft-foreground': '#21834b', 'success-soft': '#e4f5ea' };
      return Array.isArray(token) ? token.map((name) => colors[name] ?? '#000') : colors[token] ?? '#000';
    } },
    'expo-router': {},
    'react-native-safe-area-context': {},
    '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
    '@/components/admin-charts': {
      ChartCard: 'ChartCard', StatCard: 'StatCard', DayBars: 'DayBars',
      ShareBar: 'ShareBar', Ring: 'Ring', Tiles: 'Tiles', Columns: 'Columns',
      OUTCOME_COLORS: {}, URGENCY_CHART_COLORS: {}, useSeriesColors: () => ['#123456'],
    },
    '@/components/notice': { Notice: 'Notice' },
    '@/components/admin-report-rows': { AdminReportRows: 'Rows' },
    '@/components/profile-history': {},
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/themed-view': { ThemedView: 'View' },
    '@/constants/theme': theme,
    '@/lib/admin': {},
    '@/lib/flags': { FLAG_REASONS: ['Spam'] },
    '@/lib/reports': { ANIMAL_TYPES: [], labelFor: (_, value) => value, URGENCIES: [] },
  };
  for (const name of ['AlertCircleIcon', 'CheckmarkCircle02Icon', 'Flag02Icon', 'HourglassIcon', 'Megaphone01Icon', 'Route01Icon']) {
    dependencies[`@hugeicons/core-free-icons/${name}`] = { __esModule: true, default: name };
  }
  const { __test: { Widgets, AllClear } } = loadSource('src/components/admin-dashboard.tsx', dependencies, ['Widgets', 'AllClear']);
  const opened = [];
  const tree = Widgets({
    answer: {
      overview: { reported: 0, responding: 0, rescued: 0, notFound: 0, closed: 0, flagged: 0, ...overview },
      stats: { days: [], flagReasons: [], animals: [], closingSoon: [], responseMinutes: null, urgency: {}, thisWeek: 0, ...stats },
      flagged: { reports: [], total: 0 },
    },
    onOpen: (filter) => opened.push(filter), onOpenReport() {},
  });
  return { tree, opened, AllClear };
}

const titles = [
  'How reports ended', 'Urgency of active reports', 'Time until a rescuer is on the way',
  'Why reports are flagged', 'Animals reported',
];
const cardOf = (tree, title) => findElement(tree, (node) => node.type === 'ChartCard' && node.props.title === title);

test('all five analytics cards show contextual empty notices instead of empty summaries or charts', () => {
  const { tree, opened } = dashboard({});
  const messages = new Set();
  for (const title of titles) {
    const card = cardOf(tree, title);
    assert.equal(card.props.summary, undefined, `${title}: empty copy belongs in the notice`);
    const notice = findElement(card, (node) => node.type === 'Notice');
    assert.ok(notice, `${title}: needs a complete empty state`);
    assert.ok(notice.props.icon);
    assert.ok(notice.props.title);
    assert.ok(notice.props.text);
    assert.equal(notice.props.action, undefined, 'analytics should not prompt unnecessary actions');
    messages.add(notice.props.title);
    assert.equal(findElement(card, (node) => ['ShareBar', 'Ring', 'Tiles', 'Columns'].includes(node.type)), undefined);
  }
  assert.equal(messages.size, 5, 'each empty state should describe its own missing data');
  cardOf(tree, titles[0]).props.onPress();
  assert.deepEqual(opened, ['finished']);
});

test('populated analytics keep their charts, including a valid zero-minute response', () => {
  const { tree } = dashboard({
    responseMinutes: 0, flagReasons: [{ label: 'Spam', count: 1 }],
    animals: [{ label: 'dog', count: 1 }], urgency: { critical: 1 },
  }, { rescued: 1, reported: 1 });
  for (const title of titles) {
    assert.equal(findElement(cardOf(tree, title), (node) => node.type === 'Notice'), undefined);
  }
  for (const [title, chart] of [[titles[0], 'ShareBar'], [titles[1], 'Ring'], [titles[3], 'Tiles'], [titles[4], 'Columns']]) {
    assert.ok(findElement(cardOf(tree, title), (node) => node.type === chart));
  }
  assert.equal(cardOf(tree, titles[2]).props.summary, '0 min');
});

test('Needs a look uses the same contextual notice when no active report is flagged', () => {
  const { tree, AllClear } = dashboard({});
  assert.ok(findElement(tree, (node) => node.type === AllClear));
  const notice = findElement(AllClear(), (node) => node.type === 'Notice');
  assert.ok(notice, 'flagged reports need the same centered empty-state layout');
  assert.equal(notice.props.title, 'No flagged reports');
  assert.match(notice.props.text, /active reports/i);
  assert.equal(notice.props.icon, 'CheckmarkCircle02Icon');
  assert.equal(notice.props.iconColor, '#21834b');
  assert.equal(notice.props.iconBackgroundColor, '#e4f5ea');
  assert.equal(notice.props.action, undefined);
});

test('Notice applies success icon colors without changing other empty states', () => {
  const { Notice } = loadSource('src/components/notice.tsx', {
    'react-native': native,
    'heroui-native': { ...ui, useThemeColor: () => '#60646c' },
    '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/themed-view': { ThemedView: 'Surface' },
    '@/constants/theme': theme,
  });
  const props = { icon: 'checkmark', title: 'No flagged reports', text: 'Nothing flagged.' };
  const success = Notice({ ...props, iconColor: '#21834b', iconBackgroundColor: '#e4f5ea' });
  assert.equal(findElement(success, (node) => node.type === 'Icon').props.color, '#21834b');
  const surface = findElement(success, (node) => node.type === 'Surface');
  assert.equal(Object.assign({}, ...surface.props.style).backgroundColor, '#e4f5ea');
  assert.equal(Object.assign({}, ...surface.props.style).borderRadius, 32);
  const regular = Notice(props);
  assert.equal(findElement(regular, (node) => node.type === 'Icon').props.color, '#60646c');
  const defaultSurface = findElement(regular, (node) => node.type === 'Surface');
  assert.equal(Object.assign({}, ...defaultSurface.props.style).backgroundColor, undefined);
});
