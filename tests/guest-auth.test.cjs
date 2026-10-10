const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./load-source.cjs');

function guestAuth({ platform = 'android', deviceId = 'dd96dec43fb81c97', status, signup } = {}) {
  const calls = [];
  const module = loadSource('src/lib/guest-auth.ts', {
    'expo-application': { getAndroidId: () => deviceId },
    'react-native': { Platform: { OS: platform } },
    '@/lib/supabase': { supabase: {
      rpc: async (name, args) => {
        calls.push(['status', name, args]);
        return status ? status() : { data: { retry_at: null }, error: null };
      },
      auth: { signInAnonymously: async (args) => {
        calls.push(['signup', args]);
        return signup ? signup() : { data: {}, error: null };
      } },
    } },
  });
  return { ...module, calls };
}

test('guest signup sends Android ID to backend without using installation storage', async () => {
  const auth = guestAuth();
  await auth.signInAsGuest();
  assert.deepEqual(auth.calls[0], ['status', 'guest_creation_status', { device_id: 'dd96dec43fb81c97' }]);
  const payload = auth.calls[1][1].options.data;
  assert.equal(payload.guest_device_id, 'dd96dec43fb81c97');
  assert.match(payload.full_name, /^Guest\d{4}$/);
});

test('backend cooldown blocks creation regardless of phone clock', async () => {
  // Even a date before the phone's clock must not override the server's blocked decision.
  const retryAt = '2000-01-01T12:00:00+00:00';
  const auth = guestAuth({ status: () => ({ data: { retry_at: retryAt }, error: null }) });
  await assert.rejects(auth.signInAsGuest(), (error) =>
    error instanceof auth.GuestSignInError && error.retryAt === retryAt);
  assert.equal(auth.calls.length, 1);
});

test('unsupported platforms and invalid Android IDs cannot create guests', async () => {
  for (const options of [{ platform: 'web' }, { platform: 'ios' }, { deviceId: '' }, { deviceId: 'not-an-id' }, { deviceId: '0000000000000000' }]) {
    const auth = guestAuth(options);
    await assert.rejects(auth.signInAsGuest(), auth.GuestSignInError);
    assert.equal(auth.calls.length, 0);
  }
});

test('failed or malformed status reads fail closed', async () => {
  for (const response of [{ data: null, error: new Error('Offline') }, { data: {}, error: null }, { data: { retry_at: 'bad-date' }, error: null }]) {
    const auth = guestAuth({ status: () => response });
    await assert.rejects(auth.signInAsGuest());
    assert.equal(auth.calls.length, 1);
  }
});

test('overlapping guest requests share one signup and a later attempt rechecks backend', async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const auth = guestAuth({ signup: () => pending });
  const first = auth.signInAsGuest();
  const second = auth.signInAsGuest();
  await Promise.resolve();
  finish({ data: {}, error: null });
  await Promise.all([first, second]);
  assert.equal(auth.calls.filter(([kind]) => kind === 'signup').length, 1);
  await auth.signInAsGuest();
  assert.equal(auth.calls.filter(([kind]) => kind === 'status').length, 2);
});

test('signup rejection rechecks cooldown to explain a concurrent backend denial', async () => {
  let reads = 0;
  const retryAt = '2026-10-14T12:00:00+00:00';
  const auth = guestAuth({
    status: () => ({ data: { retry_at: reads++ === 0 ? null : retryAt }, error: null }),
    signup: () => ({ data: null, error: new Error('Database error saving new user') }),
  });
  await assert.rejects(auth.signInAsGuest(), (error) => error.retryAt === retryAt);
});

test('ordinary signup failures remain failures and do not claim a cooldown', async () => {
  const failure = new Error('Network unavailable');
  const auth = guestAuth({ signup: () => ({ data: null, error: failure }) });
  await assert.rejects(auth.signInAsGuest(), (error) => error === failure);
});
