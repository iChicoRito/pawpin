const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, hooks, native, theme, findElement } = require('./load-source.cjs');

function permissionRow(platform = 'android', colors = ['#111111', '#007AFF']) {
  let settingsOpened = 0;
  const { PermissionRow } = loadSource('src/components/report-permissions.tsx', {
    '@hugeicons/core-free-icons/Camera01Icon': {},
    '@hugeicons/core-free-icons/Location01Icon': {},
    '@hugeicons/core-free-icons/Tick02Icon': {},
    '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
    'expo-camera': {}, 'expo-location': {},
    'expo-linking': { openSettings() { settingsOpened++; } },
    'heroui-native': { Button: 'Button', Spinner: 'Spinner', useThemeColor: () => colors },
    react: hooks().react,
    'react-native': { ...native, Platform: { OS: platform } },
    'react-native-safe-area-context': {},
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/themed-view': { ThemedView: 'View' },
    '@/constants/theme': theme,
  });
  return { PermissionRow, settingsOpened: () => settingsOpened };
}

const pending = { status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' };
const styleOf = (node) => Object.assign({}, ...[node.props.style].flat(Infinity));

test('all permission types put a full-width action below their icon and readable heading', async () => {
  for (const colors of [['#111111', '#007AFF'], ['#FFFFFF', '#3399FF']]) {
    const { PermissionRow } = permissionRow('android', colors);
    for (const name of ['camera', 'location', 'notifications']) {
      let requests = 0;
      const reason = `Why ${name} is needed.`;
      const card = PermissionRow({
        icon: {}, name, title: name, reason, permission: pending,
        onAllow: async () => { requests++; return pending; },
      });
      const button = findElement(card, (node) => node.type === 'Button');
      assert.equal(button.props.children, `Allow ${name}`);
      assert.equal(card.props.children[1], button, 'action must span the card below its header');
      assert.equal(styleOf(button).width, '100%');
      assert.ok(styleOf(button).minHeight >= 44);
      const title = findElement(card, (node) => node.props.role === 'heading');
      const description = findElement(card, (node) => node.props.children === reason);
      assert.ok(styleOf(title).fontSize > styleOf(description).fontSize);
      assert.ok(styleOf(title).fontWeight > styleOf(description).fontWeight);
      const icon = findElement(card, (node) => node.type === 'Icon');
      assert.equal(icon.props.color, colors[0]);
      const tile = findElement(card, (node) => node.props.children === icon);
      assert.equal(tile.props['aria-hidden'], true);
      await button.props.onPress();
      assert.equal(requests, 1);
    }
  }
});

test('granted permission shows a centered disabled secondary Allowed button', () => {
  const { PermissionRow } = permissionRow();
  const card = PermissionRow({
    icon: {}, name: 'camera', title: 'Camera', reason: 'Photo access.',
    permission: { ...pending, status: 'granted', granted: true },
    onAllow: () => assert.fail('granted permission must not request again'),
  });
  assert.ok(findElement(card, (node) => node.props.children === 'Allowed'));
  const button = findElement(card, (node) => node.type === 'Button');
  assert.ok(button);
  assert.equal(button.props.variant, 'secondary');
  assert.equal(button.props.isDisabled, true);
  assert.equal(button.props.onPress, undefined);
  assert.equal(styleOf(button).width, '100%');
  assert.equal(styleOf(button).justifyContent, 'center');
  assert.ok(findElement(button, (node) => node.type === 'Icon'));
});

test('blocked native permission opens settings; blocked web permission only explains recovery', () => {
  for (const platform of ['android', 'ios', 'web']) {
    const { PermissionRow, settingsOpened } = permissionRow(platform);
    const card = PermissionRow({
      icon: {}, name: 'location', title: 'Location', reason: 'Nearby animals.',
      permission: { ...pending, status: 'denied', canAskAgain: false },
      onAllow: () => assert.fail('blocked permission must not request again'),
    });
    const alert = findElement(card, (node) => node.props.role === 'alert');
    assert.ok(alert);
    const button = findElement(card, (node) => node.type === 'Button');
    if (platform === 'web') {
      assert.equal(button, undefined);
      assert.match(alert.props.children, /browser's site settings/);
    } else {
      assert.equal(button.props.children, 'Open settings');
      assert.equal(styleOf(button).width, '100%');
      button.props.onPress();
      assert.equal(settingsOpened(), 1);
    }
  }
});
