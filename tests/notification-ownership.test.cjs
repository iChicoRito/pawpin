const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, effectHooks } = require('./load-source.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

function ownership() {
  let userId = 'guest';
  let token = 'token-one';
  let granted = true;
  let tokenRead = null;
  let writeWait = null;
  let detachError = null;
  let signOutError = null;
  const rows = new Map();
  const events = [];
  const hook = effectHooks();
  const listeners = new Set();
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null }, error: null }),
      signOut: async () => {
        events.push('signOut');
        if (!signOutError) userId = null;
        return { error: signOutError };
      },
    },
    from: () => ({ update: (values) => ({ eq: async (_, id) => {
      events.push([id, values.push_token]);
      if (writeWait) await writeWait;
      if (values.push_token === null && detachError) return { error: detachError };
      rows.set(id, values.push_token);
      return { error: null };
    } }) }),
  };
  const alerts = loadSource('src/lib/alerts.ts', {
    '@react-native-async-storage/async-storage': {},
    'expo-notifications': {
      setNotificationHandler() {}, AndroidImportance: { HIGH: 4 },
      setNotificationChannelAsync: async () => {},
      getPermissionsAsync: async () => ({ granted, status: granted ? 'granted' : 'denied' }),
      getExpoPushTokenAsync: async () => tokenRead ? tokenRead : { data: token },
    },
    'expo-router': {}, react: hook.react,
    'react-native': { Platform: { OS: 'android' }, AppState: { addEventListener: (_, cb) => {
      listeners.add(cb); return { remove: () => listeners.delete(cb) };
    } } },
    '@/lib/supabase': { supabase },
  });
  let actionApi;
  const actions = () => actionApi ??= loadSource('src/lib/session-actions.ts', {
    '@/lib/alerts': alerts, '@/lib/supabase': { supabase },
  });
  return {
    alerts, actions, events, rows, supabase,
    user: (id) => { userId = id; }, token: (value) => { token = value; },
    permission: (value) => { granted = value; },
    delayToken: (promise) => { tokenRead = promise; }, delayWrite: (promise) => { writeWait = promise; },
    failDetach: (error) => { detachError = error; }, failSignOut: (error) => { signOutError = error; },
    mount: (id = userId) => hook.render(() => alerts.useAlertRegistration(id)),
    unmount: () => hook.unmount(),
    foreground: () => listeners.forEach((cb) => cb('active')),
  };
}

test('late previous-account token cannot write after session changes', async () => {
  const env = ownership();
  const token = deferred();
  env.delayToken(token.promise);
  const pending = env.alerts.registerForAlerts('guest');
  await tick();
  env.user('google');
  token.resolve({ data: 'late' });
  await pending;
  assert.deepEqual(env.events, []);
});

test('unmount invalidates pending registration even while account remains current', async () => {
  const env = ownership();
  const token = deferred();
  env.delayToken(token.promise);
  env.mount();
  await tick();
  env.unmount();
  token.resolve({ data: 'late' });
  await tick();
  assert.deepEqual(env.events, []);
});

test('token and permission changes register again; unchanged foreground does not', async () => {
  const env = ownership();
  await env.alerts.registerForAlerts('guest');
  await env.alerts.registerForAlerts('guest');
  assert.equal(env.events.length, 1);
  env.token('token-two');
  await env.alerts.registerForAlerts('guest');
  assert.equal(env.rows.get('guest'), 'token-two');
  env.permission(false);
  await env.alerts.registerForAlerts('guest');
  env.permission(true);
  await env.alerts.registerForAlerts('guest');
  assert.equal(env.events.filter((event) => event[1] === 'token-two').length, 2);
});

test('foreground request counts stay at one write until token or account changes', async () => {
  const env = ownership();
  env.mount();
  await tick();
  for (let i = 0; i < 5; i++) env.foreground();
  await tick();
  assert.equal(env.events.length, 1);
  env.token('token-two');
  env.foreground();
  await tick();
  assert.equal(env.events.length, 2);
  env.user('google');
  env.mount('google');
  await tick();
  assert.equal(env.events.length, 3);
  assert.equal(env.rows.get('google'), 'token-two');
  env.unmount();
});

test('logout waits for already-started write, detaches, then signs out', async () => {
  const env = ownership();
  const write = deferred();
  env.delayWrite(write.promise);
  const registration = env.alerts.registerForAlerts('guest');
  await tick();
  const logout = env.actions().signOutWithAlerts();
  await tick();
  assert.deepEqual(env.events, [['guest', 'token-one']]);
  const blocked = env.alerts.registerForAlerts('guest');
  write.resolve();
  await Promise.all([registration, logout, blocked]);
  assert.deepEqual(env.events, [['guest', 'token-one'], ['guest', null], 'signOut']);
  assert.equal(env.rows.get('guest'), null);
});

test('logout invalidates a pending token before detach and blocks another session action', async () => {
  const env = ownership();
  const token = deferred();
  env.delayToken(token.promise);
  const registration = env.alerts.registerForAlerts('guest');
  await tick();
  const actions = env.actions();
  const logout = actions.signOutWithAlerts();
  await tick();
  await assert.rejects(actions.switchAccountWithAlerts(async () => assert.fail('Must not switch')), /already in progress/);
  token.resolve({ data: 'late' });
  await Promise.all([registration, logout]);
  assert.deepEqual(env.events, [['guest', null], 'signOut']);
});

test('old-account last-place request is ignored after account changes', async () => {
  const env = ownership();
  env.user('google');
  await env.alerts.saveLastPlace('guest', { latitude: 14, longitude: 121 });
  assert.deepEqual(env.events, []);
});

test('detach waits for already-started location profile write', async () => {
  const env = ownership();
  const write = deferred();
  env.delayWrite(write.promise);
  const location = env.alerts.saveLastPlace('guest', { latitude: 14, longitude: 121 });
  await tick();
  const logout = env.actions().signOutWithAlerts();
  await tick();
  const before = [...env.events];
  write.resolve();
  await Promise.all([location, logout]);
  assert.deepEqual(before, [['guest', undefined]]);
  assert.deepEqual(env.events, [['guest', undefined], ['guest', null], 'signOut']);
});

test('failed detach keeps session and prevents auth sign-out', async () => {
  const env = ownership();
  await env.alerts.registerForAlerts('guest');
  env.failDetach(new Error('Detach offline'));
  const result = await env.actions().signOutWithAlerts();
  assert.match(result.error.message, /Detach offline/);
  assert.equal(env.events.includes('signOut'), false);
  assert.equal(env.rows.get('guest'), 'token-one');
});

test('failed auth sign-out restores registration and releases guard', async () => {
  const env = ownership();
  env.failSignOut(new Error('Auth offline'));
  const result = await env.actions().signOutWithAlerts();
  assert.match(result.error.message, /Auth offline/);
  assert.equal(env.rows.get('guest'), 'token-one');
  env.token('new');
  await env.alerts.registerForAlerts('guest');
  assert.equal(env.rows.get('guest'), 'new');
});

test('intentional switch detaches guest before action and registers next account', async () => {
  const env = ownership();
  const result = await env.actions().switchAccountWithAlerts(async () => {
    assert.equal(env.rows.get('guest'), null);
    env.user('google');
    return true;
  });
  assert.equal(result, true);
  assert.equal(env.rows.get('guest'), null);
  assert.equal(env.rows.get('google'), 'token-one');
});

test('canceled or failed switch restores only still-current account', async () => {
  for (const throws of [false, true]) {
    const env = ownership();
    const action = env.actions().switchAccountWithAlerts(async () => {
      if (throws) throw new Error('Canceled');
      return false;
    });
    if (throws) await assert.rejects(action, /Canceled/);
    else assert.equal(await action, false);
    assert.equal(env.rows.get('guest'), 'token-one');
  }
});

test('new sign-in with same ID forces registration after hook lifecycle resets', async () => {
  const env = ownership();
  env.mount(); await tick();
  env.mount(null);
  env.mount('guest'); await tick();
  assert.equal(env.events.length, 2);
});

function nearby(t) {
  let userId = 'guest';
  const hook = effectHooks();
  const timers = new Map();
  let timerId = 0;
  t.mock.method(global, 'setTimeout', (fn) => { timers.set(++timerId, fn); return timerId; });
  t.mock.method(global, 'clearTimeout', (id) => timers.delete(id));
  const location = deferred();
  const result = deferred();
  const writes = [];
  const queries = [];
  const events = [];
  const channel = { on: (_, __, cb) => { events.push(cb); return channel; }, subscribe: () => channel };
  const api = loadSource('src/hooks/use-nearby-reports.tsx', {
    react: hook.react,
    'expo-location': {
      Accuracy: { Balanced: 3 }, getCurrentPositionAsync: () => location.promise,
      getLastKnownPositionAsync: async () => null,
    },
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
    '@/hooks/use-session': { useSession: () => ({ session: userId ? { user: { id: userId } } : null }) },
    '@/lib/alerts': { saveLastPlace: (...args) => writes.push(args) },
    '@/lib/nearby': { DEFAULT_RADIUS_M: 10000, fetchNearbyReports: (...args) => {
      queries.push(args); return result.promise;
    } },
    '@/lib/supabase': { supabase: { channel: () => channel, removeChannel() {} } },
  });
  const render = () => hook.render(api.NearbyReportsProvider, {}).props.value;
  return { location, result, writes, queries, timers, events, render,
    switch: () => { userId = 'google'; render(); return render(); }, unmount: () => hook.unmount() };
}

test('old-account location cannot write or query next account; pending timers cleared', async (t) => {
  const env = nearby(t);
  const old = env.render();
  const pending = old.refresh();
  assert.equal(env.timers.size, 1);
  const state = env.switch();
  assert.equal(env.timers.size, 0);
  assert.equal(state.place, null);
  assert.deepEqual(state.reports, []);
  assert.equal(state.failure, null);
  assert.equal(state.status, 'idle');
  env.location.resolve({ coords: { latitude: 14, longitude: 121, accuracy: 5 } });
  env.result.resolve([{ id: 'old' }]);
  await pending;
  assert.deepEqual(env.writes, []);
  assert.deepEqual(env.queries, []);
  assert.equal(env.render().place, null);
  env.unmount();
});

test('old-account query result cannot restore reports, place or failure', async (t) => {
  const env = nearby(t);
  const pending = env.render().refresh();
  env.location.resolve({ coords: { latitude: 14, longitude: 121, accuracy: 5 } });
  await tick();
  assert.equal(env.queries.length, 1);
  env.switch();
  env.result.resolve([{ id: 'old' }]);
  await pending;
  const state = env.render();
  assert.deepEqual(state.reports, []);
  assert.equal(state.place, null);
  assert.equal(state.failure, null);
  assert.equal(state.status, 'idle');
  env.unmount();
});

test('account switch clears ready state and old realtime callback cannot queue work', async (t) => {
  const env = nearby(t);
  const pending = env.render().refresh();
  env.location.resolve({ coords: { latitude: 14, longitude: 121, accuracy: 5 } });
  env.result.resolve([{ id: 'old' }]);
  await pending;
  assert.equal(env.render().reports.length, 1);
  const oldEvent = env.events[0];
  const state = env.switch();
  assert.deepEqual(state.reports, []);
  assert.equal(state.place, null);
  oldEvent();
  assert.equal(env.timers.size, 0);
  env.unmount();
});

test('same-ID guest linking keeps notification registration and does not detach', async () => {
  const env = ownership();
  await env.alerts.registerForAlerts('guest');
  const auth = loadSource('src/lib/auth.ts', {
    'expo-linking': { createURL: () => 'pawpin://', addEventListener: () => ({ remove() {} }) },
    'expo-web-browser': { maybeCompleteAuthSession() {},
      openAuthSessionAsync: async () => ({ type: 'success', url: 'pawpin://?code=link' }) },
    '@/lib/session-actions': env.actions(),
    '@/lib/supabase': { supabase: { auth: {
      ...env.supabase.auth,
      linkIdentity: async () => ({ data: { url: 'https://local.invalid' }, error: null }),
      exchangeCodeForSession: async () => ({ error: null }),
    } } },
  });
  assert.equal(await auth.linkGoogle(), true);
  await env.alerts.registerForAlerts('guest');
  assert.deepEqual(env.events, [['guest', 'token-one']]);
});

test('Google sign-in entry point detaches before browser switch and restores on failure', async () => {
  const env = ownership();
  const failure = new Error('Google failed');
  const auth = loadSource('src/lib/auth.ts', {
    'expo-linking': { createURL: () => 'pawpin://' },
    'expo-web-browser': { maybeCompleteAuthSession() {} },
    '@/lib/session-actions': env.actions(),
    '@/lib/supabase': { supabase: { auth: {
      signInWithOAuth: async () => {
        assert.equal(env.rows.get('guest'), null);
        return { data: null, error: failure };
      },
    } } },
  });
  await assert.rejects(auth.signInWithGoogle(), (error) => error === failure);
  assert.equal(env.rows.get('guest'), 'token-one');
});
