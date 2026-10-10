const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, native, theme, findElement } = require('./load-source.cjs');

test('urgency cards pair each real status with a distinct icon, heading and explanation', () => {
  const options = [
    { value: 'critical', label: 'Critical', hint: 'Badly hurt or in danger right now.' },
    { value: 'needs_help_soon', label: 'Needs help soon', hint: 'Hurt, sick, or weak, but not in danger right now.' },
    { value: 'just_sighted', label: 'Just sighted', hint: 'Looks fine. Sharing where it was seen.' },
  ];
  const colors = { critical: '#C62828', needs_help_soon: '#C2570C', just_sighted: '#1565C0' };
  const { ReportUrgencyCard } = loadSource('src/components/report-urgency.tsx', {
    '@hugeicons/core-free-icons/Alert02Icon': 'warning',
    '@hugeicons/core-free-icons/FirstAidKitIcon': 'first-aid',
    '@hugeicons/core-free-icons/ViewIcon': 'eye',
    '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
    'react-native': native,
    'heroui-native': { ListGroup: { Item: 'ListGroup.Item' } },
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/themed-view': { ThemedView: 'View' },
    '@/constants/theme': theme,
    '@/lib/nearby': { URGENCY_COLORS: colors },
    '@/lib/reports': { URGENCIES: options },
  });
  const styleOf = (node) => Object.assign({}, ...[node.props.style].flat(Infinity));
  for (const [index, iconName] of ['warning', 'first-aid', 'eye'].entries()) {
    const option = options[index];
    const card = ReportUrgencyCard({ urgency: option.value });
    assert.equal(card.type, 'ListGroup.Item', 'urgency belongs inside the animal details group');
    assert.equal(card.props.onPress, undefined, 'urgency is informational, not an action');
    assert.equal(styleOf(card).borderRadius, undefined, 'row must not create a nested card');
    const icon = findElement(card, (node) => node.type === 'Icon');
    assert.equal(icon.props.icon, iconName);
    const tile = findElement(card, (node) => node.props.children === icon);
    assert.equal(styleOf(tile).backgroundColor, colors[option.value]);
    assert.equal(tile.props['aria-hidden'], true, 'icon must not repeat the status for screen readers');
    const heading = findElement(card, (node) => node.props.role === 'heading');
    assert.equal(heading.props.children, option.label);
    const description = findElement(card, (node) => node.props.children === option.hint);
    assert.ok(description, 'reporter-selected urgency explanation must stay visible');
    assert.ok(styleOf(heading).fontSize > styleOf(description).fontSize);
    assert.ok(styleOf(heading).fontWeight > styleOf(description).fontWeight);
    assert.equal(description.props.themeColor, 'textSecondary');
    assert.equal(heading.props.numberOfLines, undefined, 'long titles must wrap, not disappear');
    assert.equal(description.props.numberOfLines, undefined, 'descriptions must remain complete');
  }
});
