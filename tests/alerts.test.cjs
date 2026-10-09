const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./load-source.cjs');

// The profile row, as the database would hold it after each update.
function alertsApi({ granted = true, token = async () => ({ data: 'ExponentPushToken[abc]' }), saveError = null } = {}) {
  const updates = [];
  const supabase = {
    from: (table) => ({
      update: (values) => ({
        eq: async (column, value) => {
          updates.push({ table, values, column, value });
          return { error: saveError };
        },
      }),
    }),
  };
  const api = loadSource('src/lib/alerts.ts', {
    '@react-native-async-storage/async-storage': {},
    'expo-notifications': {
      AndroidImportance: { HIGH: 4 },
      setNotificationHandler() {},
      setNotificationChannelAsync: async () => {},
      getPermissionsAsync: async () => ({ granted, canAskAgain: true }),
      getExpoPushTokenAsync: token,
    },
    'expo-router': {},
    react: require('react'),
    'react-native': { Platform: { OS: 'android' }, AppState: {} },
    '@/lib/supabase': { supabase },
  });
  return { api, updates };
}

test('last place is saved longitude first, on the user’s own row', async () => {
  const { api, updates } = alertsApi();
  await api.saveLastPlace('user', { latitude: 14.6, longitude: 121, accuracyM: 5 });
  assert.deepEqual(updates, [{
    table: 'profiles', values: { last_location: 'SRID=4326;POINT(121 14.6)' }, column: 'id', value: 'user',
  }]);
});

test('no push token is saved while notifications are not allowed', async () => {
  const { api, updates } = alertsApi({ granted: false, token: async () => assert.fail('Must not ask for a token') });
  await api.registerForAlerts('user');
  assert.equal(updates.length, 0);
});

test('push token is saved on the user’s own row once notifications are allowed', async () => {
  const { api, updates } = alertsApi();
  await api.registerForAlerts('user');
  assert.deepEqual(updates, [{
    table: 'profiles', values: { push_token: 'ExponentPushToken[abc]' }, column: 'id', value: 'user',
  }]);
});

test('failing token read does not reject, so it cannot break app start', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const { api, updates } = alertsApi({ token: async () => { throw new Error('No project id'); } });
  await assert.doesNotReject(api.registerForAlerts('user'));
  assert.equal(updates.length, 0);
  assert.equal(warn.mock.callCount(), 1);
});

test('failing last-place save does not reject, so it cannot break the nearby search', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const { api } = alertsApi({ saveError: new Error('Offline') });
  await assert.doesNotReject(api.saveLastPlace('user', { latitude: 14.6, longitude: 121, accuracyM: null }));
  assert.equal(warn.mock.callCount(), 1);
});

test('failing alert-distance save rejects, so the screen can say so', async () => {
  const { api } = alertsApi({ saveError: new Error('Offline') });
  await assert.rejects(api.saveAlertRadius('user', 10000), /Offline/);
});

// A tap on an alert, as the phone hands it over.
const tapped = (data) => ({ notification: { request: { identifier: 'n1', content: { data } } } });

test('tapped alert names its report', () => {
  const { api } = alertsApi();
  assert.equal(api.reportIdOf(tapped({ reportId: 'abc' })), 'abc');
});

test('alert without a report id opens nothing', () => {
  const { api } = alertsApi();
  assert.equal(api.reportIdOf(tapped({})), null);
  assert.equal(api.reportIdOf(tapped(null)), null);
  assert.equal(api.reportIdOf(tapped({ reportId: 42 })), null);
  assert.equal(api.reportIdOf(null), null);
  assert.equal(api.reportIdOf(undefined), null);
});
