const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, effectHooks } = require('./load-source.cjs');

test('realtime INSERTs sound before any location exists; updates and refreshes do not', () => {
  const state = effectHooks();
  let receive;
  let unsubscribed = false;
  const heard = [];
  const channel = {
    on(_type, options, handler) {
      assert.equal(options.table, 'reports');
      assert.equal(options.event, '*');
      receive = handler;
      return this;
    },
    subscribe() { return this; },
  };
  const { NearbyReportsProvider } = loadSource('src/hooks/use-nearby-reports.tsx', {
    react: state.react,
    'expo-location': {},
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
    '@/hooks/use-session': { useSession: () => ({ session: { user: { id: 'viewer' } } }) },
    '@/lib/alerts': {},
    '@/lib/nearby': { DEFAULT_RADIUS_M: 5000 },
    '@/lib/sounds': { playSound: (...args) => heard.push(args) },
    '@/lib/supabase': { supabase: { channel: () => channel, removeChannel() { unsubscribed = true; } } },
  });
  state.render(NearbyReportsProvider, {});
  assert.equal(typeof receive, 'function', 'signed-in users receive reports without opening Map first');
  receive({ eventType: 'INSERT', new: { id: 'one', reporter_id: 'alice' } });
  receive({ eventType: 'INSERT', new: { id: 'two', reporter_id: 'alice' } });
  receive({ eventType: 'INSERT', new: { id: 'three', reporter_id: 'bob' } });
  receive({ eventType: 'INSERT', new: { id: 'own', reporter_id: 'viewer' } });
  receive({ eventType: 'UPDATE', new: { id: 'one' } });
  receive({ eventType: 'DELETE', old: { id: 'two' } });
  assert.deepEqual(heard, [
    ['notification', 'report:one'], ['notification', 'report:two'],
    ['notification', 'report:three'], ['notification', 'report:own'],
  ]);
  state.unmount();
  assert.equal(unsubscribed, true);
});

test('signed-out users do not subscribe to report feedback', () => {
  const state = effectHooks();
  const { NearbyReportsProvider } = loadSource('src/hooks/use-nearby-reports.tsx', {
    react: state.react, 'expo-location': {}, 'react-native': {},
    '@/hooks/use-session': { useSession: () => ({ session: null }) },
    '@/lib/alerts': {}, '@/lib/nearby': { DEFAULT_RADIUS_M: 5000 }, '@/lib/sounds': {},
    '@/lib/supabase': { supabase: { channel() { assert.fail('signed out subscription'); } } },
  });
  state.render(NearbyReportsProvider, {});
  state.unmount();
});
