const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, effectHooks } = require('./load-source.cjs');

function fixture(secure = new Map(), legacy = new Map()) {
  const calls = [];
  let fault = () => {};
  const invoke = async (op, key, value, action) => {
    calls.push({ op, key, value });
    const override = await fault(op, key, value, calls.length);
    return override === undefined ? action() : override;
  };
  const secureStore = {
    getItemAsync: (key) => invoke('get', key, undefined, () => secure.get(key) ?? null),
    setItemAsync: (key, value) => invoke('set', key, value, () => {
      assert.match(key, /^[a-zA-Z0-9._-]+$/);
      assert.ok(Buffer.byteLength(value) < 2048);
      secure.set(key, value);
    }),
    deleteItemAsync: (key) => invoke('delete', key, undefined, () => secure.delete(key)),
  };
  const asyncStorage = {
    getItem: (key) => invoke('legacy-get', key, undefined, () => legacy.get(key) ?? null),
    setItem: () => { throw new Error('Plaintext auth writes forbidden'); },
    removeItem: (key) => invoke('legacy-delete', key, undefined, () => legacy.delete(key)),
  };
  const restart = () => loadSource('src/lib/auth-storage.ts', {
    'expo-secure-store': secureStore,
    '@react-native-async-storage/async-storage': asyncStorage,
  }).authStorage;
  return { secure, legacy, calls, restart, get storage() { return restart(); },
    fault(fn) { fault = fn; }, reset() { calls.length = 0; fault = () => {}; } };
}

const key = 'sb-project-auth-token';
const guest = JSON.stringify({ user: { id: 'guest-original-id', is_anonymous: true }, refresh_token: 'original-secret' });
const linked = JSON.stringify({ user: { id: 'guest-original-id', is_anonymous: false, identities: ['google'] }, refresh_token: 'linked-secret' });
const large = JSON.stringify({ user: { id: 'guest-original-id' }, token: '🐾漢é'.repeat(1800) });

test('missing auth values remain missing', async () => {
  const f = fixture();
  assert.equal(await f.storage.getItem(key), null);
  assert.equal(f.secure.size, 0);
});

for (const [name, value] of [['guest', guest], ['Google linked', linked], ['large Unicode', large], ['empty', '']]) {
  test(`${name} migration preserves exact bytes, removes only requested legacy key`, async () => {
    const f = fixture(new Map(), new Map([[key, value], ['pawpin.unsent-report', 'draft'], ['appearance', 'dark']]));
    assert.equal(await f.storage.getItem(key), value);
    assert.equal(f.legacy.has(key), false);
    assert.equal(f.legacy.get('pawpin.unsent-report'), 'draft');
    assert.equal(f.legacy.get('appearance'), 'dark');
    assert.equal(await f.restart().getItem(key), value);
  });
}

test('PKCE and reversible Unicode/punctuation keys do not collide', async () => {
  const f = fixture();
  for (const k of [`${key}-code-verifier`, 'a/b', 'a_b', '漢🐾', '']) await f.storage.setItem(k, `verifier:${k}`);
  for (const k of [`${key}-code-verifier`, 'a/b', 'a_b', '漢🐾', '']) assert.equal(await f.restart().getItem(k), `verifier:${k}`);
});

test('readback mismatch retains legacy account and redacts diagnostics', async (t) => {
  const diagnostics = [];
  t.mock.method(console, 'warn', (...args) => diagnostics.push(args.join(' ')));
  const f = fixture(new Map(), new Map([[key, guest]]));
  f.fault((op, k) => op === 'get' && k.includes('.chunk.') ? 'mismatch' : undefined);
  assert.equal(await f.storage.getItem(key), guest);
  assert.equal(f.legacy.get(key), guest);
  assert.ok(diagnostics.length > 0);
  assert.ok(!diagnostics.join('').includes('original-secret'));
  assert.ok(!diagnostics.join('').includes(key));
});

test('secure read failures reject without falsely reporting signed out', async () => {
  const f = fixture();
  await f.storage.setItem(key, guest);
  f.fault((op) => { if (op === 'get') throw new Error('device unavailable'); });
  await assert.rejects(f.storage.getItem(key));
  f.reset();
  assert.equal(await f.restart().getItem(key), guest);
});

test('every migration verification mismatch keeps legacy until a verified retry', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const baseline = fixture(new Map(), new Map([[key, large]]));
  await baseline.storage.getItem(key);
  const checks = baseline.calls.flatMap((call, index) => call.op === 'get' && index > 0 ? [index + 1] : []);
  for (const mismatch of checks) {
    const f = fixture(new Map(), new Map([[key, large]]));
    f.fault((op, _k, _v, index) => op === 'get' && index === mismatch ? 'mismatch' : undefined);
    assert.equal(await f.storage.getItem(key), large);
    assert.equal(f.legacy.get(key), large, `verification mismatch ${mismatch}`);
    f.reset();
    assert.equal(await f.restart().getItem(key), large);
    assert.equal(f.legacy.has(key), false);
  }
});

test('capacity rejects oversized replacement before changing prior credential', async () => {
  const f = fixture();
  await f.storage.setItem(key, guest);
  const before = [...f.secure];
  await assert.rejects(f.storage.setItem(key, 'x'.repeat(1536 * 256 + 1)), /capacity/);
  assert.deepEqual([...f.secure], before);
  assert.equal(await f.restart().getItem(key), guest);
});

test('missing active chunk never returns null and keeps prior stored generation', async () => {
  const f = fixture();
  await f.storage.setItem(key, guest);
  await f.storage.setItem(key, large);
  const manifestKey = [...f.secure.keys()].find((k) => k.endsWith('.manifest'));
  const manifest = JSON.parse(f.secure.get(manifestKey));
  const chunkKey = `${manifestKey.slice(0, -'.manifest'.length)}.${manifest.active.slot}.chunk.1`;
  f.secure.delete(chunkKey);
  await assert.rejects(f.restart().getItem(key), /restoration blocked/);
  assert.ok([...f.secure.values()].includes(guest));
});

test('PKCE removal does not delete session, and small values remain raw single chunks', async () => {
  const f = fixture();
  const verifier = `${key}-code-verifier`;
  await f.storage.setItem(key, guest);
  await f.storage.setItem(verifier, 'verifier/exact+bytes=');
  assert.ok([...f.secure.values()].includes('verifier/exact+bytes='));
  await f.storage.removeItem(verifier);
  assert.equal(await f.restart().getItem(verifier), null);
  assert.equal(await f.restart().getItem(key), guest);
});

test('every migration interruption retains original account across restart', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const baseline = fixture(new Map(), new Map([[key, large]]));
  await baseline.storage.getItem(key);
  const steps = baseline.calls.length;
  for (let stop = 1; stop <= steps; stop++) {
    const f = fixture(new Map(), new Map([[key, large]]));
    f.fault((_op, _k, _v, index) => { if (index >= stop) throw new Error('power loss'); });
    try { assert.equal(await f.storage.getItem(key), large); } catch (error) { assert.match(error.message, /power loss|secure|storage/i); }
    f.reset();
    assert.equal(await f.restart().getItem(key), large, `migration interruption ${stop}`);
  }
});

test('every replacement interruption leaves prior or complete next credential usable', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const seed = fixture();
  await seed.storage.setItem(key, guest);
  const original = new Map(seed.secure);
  seed.reset();
  await seed.storage.setItem(key, large);
  for (let stop = 1; stop <= seed.calls.length; stop++) {
    const f = fixture(new Map(original));
    f.fault((_op, _k, _v, index) => { if (index >= stop) throw new Error('power loss'); });
    try { await f.storage.setItem(key, large); } catch (error) { assert.match(error.message, /power loss/); }
    f.reset();
    const restored = await f.restart().getItem(key);
    assert.ok(restored === guest || restored === large, `replacement interruption ${stop}`);
  }
});

test('failed first secure write rejects, never writes plaintext or reports absent credential', async () => {
  const f = fixture();
  f.fault((op, k) => { if (op === 'set' && k.includes('.chunk.')) throw new Error('full'); });
  await assert.rejects(f.storage.setItem(key, large));
  f.reset();
  await assert.rejects(f.restart().getItem(key));
});

test('replacements stay bounded and signout removes both slots plus incomplete chunks', async () => {
  const f = fixture();
  const storage = f.storage;
  for (let i = 0; i < 8; i++) await storage.setItem(key, i % 2 ? guest : large);
  assert.equal(await storage.getItem(key), guest);
  assert.ok(f.secure.size < 40);
  f.fault((op, k) => { if (op === 'set' && k.endsWith('.chunk.1')) throw new Error('interrupted'); });
  await assert.rejects(storage.setItem(key, large));
  f.reset();
  await storage.removeItem(key);
  assert.equal(f.secure.size, 0);
  assert.equal(await f.restart().getItem(key), null);
});

test('signout interruption either preserves credential or leaves resumable non-resurrecting tombstone', async () => {
  const seed = fixture();
  await seed.storage.setItem(key, large);
  await seed.storage.setItem(key, guest);
  const original = new Map(seed.secure);
  seed.reset();
  await seed.storage.removeItem(key);
  for (let stop = 1; stop <= seed.calls.length; stop++) {
    const f = fixture(new Map(original), new Map([[key, 'stale-legacy']]));
    f.fault((_op, _k, _v, index) => { if (index >= stop) throw new Error('interrupted signout'); });
    await assert.rejects(f.storage.removeItem(key));
    f.reset();
    const restored = await f.restart().getItem(key);
    assert.ok(restored === guest || restored === null, `signout interruption ${stop}`);
    await f.restart().removeItem(key);
    assert.equal(f.secure.size, 0);
    assert.equal(f.legacy.size, 0);
  }
});

test('per-key queue orders refresh then signout and survives rejected operation', async () => {
  const f = fixture();
  const storage = f.storage;
  await storage.setItem(key, guest);
  await Promise.all([storage.setItem(key, large), storage.removeItem(key)]);
  assert.equal(await storage.getItem(key), null);
  f.fault((op) => { if (op === 'set') throw new Error('unavailable'); });
  await assert.rejects(storage.setItem(key, linked));
  f.reset();
  await storage.setItem(key, linked);
  assert.equal(await storage.getItem(key), linked);
});

test('web adapter retains browser AsyncStorage and static SSR guard', () => {
  const previous = globalThis.window;
  const asyncStorage = { getItem() {}, setItem() {}, removeItem() {} };
  try {
    delete globalThis.window;
    assert.equal(loadSource('src/lib/auth-storage.web.ts', { '@react-native-async-storage/async-storage': asyncStorage }).authStorage, undefined);
    globalThis.window = {};
    assert.equal(loadSource('src/lib/auth-storage.web.ts', { '@react-native-async-storage/async-storage': asyncStorage }).authStorage, asyncStorage);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('Supabase uses platform adapter without changing PKCE or refresh options', () => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.test';
  process.env.EXPO_PUBLIC_SUPABASE_KEY = 'test-public-key';
  const storage = { getItem() {}, setItem() {}, removeItem() {} };
  let options;
  loadSource('src/lib/supabase.ts', {
    './auth-read-gate': { clientAuthStorage: storage },
    '@supabase/supabase-js': { createClient: (_url, _key, config) => { options = config; return {}; } },
  });
  assert.equal(options.auth.storage, storage);
  assert.equal(options.auth.flowType, 'pkce');
  assert.equal(options.auth.autoRefreshToken, true);
  assert.equal(options.auth.persistSession, true);
  assert.equal(options.auth.detectSessionInUrl, false);
  assert.equal(typeof options.global.fetch, 'function');
});

test('installed Supabase restores guest and linked IDs offline even when migration fails', async (t) => {
  const { createClient } = require('@supabase/supabase-js');
  t.mock.method(console, 'warn', () => {});
  for (const linkedGoogle of [false, true]) {
    for (const failMigration of [false, true]) {
      const saved = JSON.stringify({
        access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
        user: { id: 'guest-original-id', is_anonymous: !linkedGoogle,
          identities: linkedGoogle ? [{ provider: 'google', id: 'linked-google-id' }] : [] },
      });
      const f = fixture(new Map(), new Map([[key, saved]]));
      if (failMigration) f.fault((op) => { if (op === 'set') throw new Error('secure unavailable'); });
      const client = createClient('https://example.test', 'test-public-key', {
        global: { fetch: () => { throw new Error('Restoration must not need network or create guest'); } },
        auth: { storage: f.storage, storageKey: key, persistSession: true,
          autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce' },
      });
      const restored = await client.auth.getSession();
      assert.equal(restored.error, null);
      assert.equal(restored.data.session.user.id, 'guest-original-id');
      assert.equal(restored.data.session.user.is_anonymous, !linkedGoogle);
      assert.equal(restored.data.session.refresh_token, 'test-refresh-token');
      if (failMigration) assert.equal(f.legacy.get(key), saved);
      await client.auth.stopAutoRefresh();
    }
  }
});

const settle = () => new Promise((resolve) => setImmediate(resolve));

function sessionConsumer(auth, retryPendingAuthReads = () => {}) {
  const state = effectHooks();
  let onChange;
  let removed = false;
  const module = loadSource('src/hooks/use-session.tsx', {
    react: state.react,
    '@react-native-async-storage/async-storage': { getItem: async () => null },
    'react-native': { Platform: { OS: 'android' }, AppState: {
      currentState: 'active', addEventListener: (_event, listener) => {
        onChange = listener;
        return { remove() { removed = true; } };
      },
    } },
    '@/lib/supabase': { supabase: { auth, from: () => ({ select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: null }) }),
    }) }) } },
    '@/lib/auth-read-gate': { retryPendingAuthReads },
  });
  // Capture effect cleanups without changing the shared hook test utility.
  const cleanups = [];
  const originalEffect = state.react.useEffect;
  state.react.useEffect = (effect, deps) => originalEffect(() => {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
    return cleanup;
  }, deps);
  const render = () => state.render(module.SessionProvider, { children: null }).props.value;
  render();
  return { render, foreground: () => onChange('active'), background: () => onChange('background'),
    cleanup: () => cleanups.forEach((cleanup) => cleanup()), get removed() { return removed; } };
}

async function failedNativeConsumer(t) {
  const { createClient } = require('@supabase/supabase-js');
  const saved = JSON.stringify({
    access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
    user: { id: 'guest-original-id', is_anonymous: true },
  });
  const f = fixture(new Map(), new Map([[key, saved]]));
  await f.storage.getItem(key);
  assert.equal(f.legacy.size, 0, 'failure occurs after successful migration');
  f.reset();
  f.fault((op) => { if (op === 'get') throw new Error('Keychain temporarily unavailable'); });
  const diagnostics = [];
  t.mock.method(console, 'error', (...args) => diagnostics.push(args));
  t.mock.method(console, 'warn', (...args) => diagnostics.push(args));
  const gate = loadSource('src/lib/auth-read-gate.ts', {
    './auth-storage': { authStorage: f.storage },
    'react-native': { Platform: { OS: 'android' } },
  });
  const client = createClient('https://example.test', 'test-public-key', {
    global: { fetch: () => { throw new Error('No network/guest replacement allowed'); } },
    auth: { storage: gate.clientAuthStorage, storageKey: key, persistSession: true,
      autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce' },
  });
  const events = [];
  const observer = client.auth.onAuthStateChange((event, session) => events.push({ event, session }));
  let reads = 0;
  let subscriptions = 0;
  const consumer = sessionConsumer({
    getSession: () => { reads++; return client.auth.getSession(); },
    onAuthStateChange: (callback) => { subscriptions++; return client.auth.onAuthStateChange(callback); },
    startAutoRefresh() {}, stopAutoRefresh() {},
  }, gate.retryPendingAuthReads);
  const cleanup = consumer.cleanup;
  consumer.cleanup = () => { cleanup(); observer.data.subscription.unsubscribe(); };
  return { f, client, consumer, diagnostics, events, get reads() { return reads; },
    get subscriptions() { return subscriptions; } };
}

test('installed-client consumer retries foreground after migrated native startup failure without false signout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = await failedNativeConsumer(t);
  try {
    await settle();
    assert.ok(h.reads > 0, 'provider explicitly restores session rather than relying on INITIAL_SESSION');
    assert.equal(h.subscriptions, 0, 'do not schedule SDK initial emission against unavailable storage');
    assert.equal(h.consumer.render().isLoading, true);
    assert.equal(h.consumer.render().session, null);
    assert.deepEqual(h.events, [], 'initial and internal SDK reads stay pending, not signed out');
    assert.ok(h.diagnostics.length > 0, 'storage error remains diagnosed');
    h.f.reset();
    h.consumer.background();
    h.consumer.foreground();
    await settle();
    const value = h.consumer.render();
    assert.equal(value.isLoading, false);
    assert.equal(value.session.user.id, 'guest-original-id');
    assert.equal(value.session.refresh_token, 'test-refresh-token');
    assert.equal(h.subscriptions, 1);
    assert.equal(h.f.legacy.size, 0);
    assert.ok(h.events.length > 0);
    assert.ok(h.events.every(({ session }) => session?.user.id === 'guest-original-id'));
  } finally { h.consumer.cleanup(); await h.client.auth.stopAutoRefresh(); }
});

test('installed-client consumer automatically retries temporary initial storage failure', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = await failedNativeConsumer(t);
  try {
    await settle();
    h.f.reset();
    t.mock.timers.tick(2000);
    await settle();
    assert.equal(h.consumer.render().session?.user.id, 'guest-original-id');
    assert.equal(h.consumer.render().isLoading, false);
  } finally { h.consumer.cleanup(); await h.client.auth.stopAutoRefresh(); }
});

test('initial storage retry is bounded, stays fail closed, and cleanup cancels further attempts', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = await failedNativeConsumer(t);
  try {
    await settle();
    for (let i = 0; i < 5; i++) { t.mock.timers.tick(10000); await settle(); }
    const nativeReads = h.f.calls.filter((call) => call.op === 'get').length;
    assert.equal(nativeReads, 3, 'initial native storage attempts bounded at three');
    const reads = h.reads;
    t.mock.timers.tick(100000);
    await settle();
    assert.equal(h.reads, reads);
    assert.equal(h.consumer.render().isLoading, true);
    assert.equal(h.consumer.render().session, null);
    h.consumer.cleanup();
    h.f.reset();
    t.mock.timers.tick(100000);
    await settle();
    assert.equal(h.reads, reads);
    assert.equal(h.consumer.removed, true);
  } finally { h.consumer.cleanup(); await h.client.auth.stopAutoRefresh(); }
});

test('foreground restoration cannot overwrite newer signed-out/account event', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let callback;
  let resolveRead;
  const original = { user: { id: 'original-account' } };
  let pending = false;
  const consumer = sessionConsumer({
    getSession: () => pending ? new Promise((resolve) => { resolveRead = resolve; })
      : Promise.resolve({ data: { session: original }, error: null }),
    onAuthStateChange: (cb) => { callback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    startAutoRefresh() {}, stopAutoRefresh() {},
  });
  try {
    await settle();
    assert.equal(consumer.render().session?.user.id, 'original-account');
    pending = true;
    consumer.foreground();
    await settle();
    callback('SIGNED_OUT', null);
    callback('SIGNED_IN', { user: { id: 'new-account' } });
    resolveRead({ data: { session: original }, error: null });
    await settle();
    assert.equal(consumer.render().session?.user.id, 'new-account');
  } finally { consumer.cleanup(); }
});

test('unmounted consumer ignores pending restoration and does not subscribe', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveRead;
  let subscriptions = 0;
  const consumer = sessionConsumer({
    getSession: () => new Promise((resolve) => { resolveRead = resolve; }),
    onAuthStateChange: () => { subscriptions++; return { data: { subscription: { unsubscribe() {} } } }; },
    startAutoRefresh() {}, stopAutoRefresh() {},
  });
  await settle();
  consumer.cleanup();
  assert.equal(typeof resolveRead, 'function');
  resolveRead({ data: { session: { user: { id: 'stale-account' } } }, error: null });
  await settle();
  assert.equal(consumer.render().session, null);
  assert.equal(subscriptions, 0);
});

test('consumer catches restoration rejection and returned auth error before directly applying successful retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  let attempts = 0;
  let subscriptions = 0;
  const original = { user: { id: 'retained-original-account' } };
  const consumer = sessionConsumer({
    getSession: async () => {
      attempts++;
      if (attempts === 1) throw new Error('initialization failed');
      if (attempts === 2) return { data: { session: null }, error: new Error('restoration failed') };
      return { data: { session: original }, error: null };
    },
    onAuthStateChange: () => { subscriptions++; return { data: { subscription: { unsubscribe() {} } } }; },
    startAutoRefresh() {}, stopAutoRefresh() {},
  });
  try {
    await settle();
    assert.equal(consumer.render().isLoading, true);
    assert.equal(subscriptions, 0);
    t.mock.timers.tick(1000);
    await settle();
    assert.equal(consumer.render().isLoading, true);
    assert.equal(subscriptions, 0);
    t.mock.timers.tick(1000);
    await settle();
    assert.equal(consumer.render().session?.user.id, 'retained-original-account');
    assert.equal(consumer.render().isLoading, false);
    assert.equal(subscriptions, 1);
    assert.equal(errors.length, 2);
  } finally { consumer.cleanup(); }
});

test('native read gate retries boundedly, shares pending reads, preserves strict writes and web SSR', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'error', () => {});
  let unavailable = true;
  let reads = 0;
  const storage = {
    getItem: async () => { reads++; if (unavailable) throw new Error('locked'); return guest; },
    setItem: async () => { throw new Error('write failure'); },
    removeItem: async () => { throw new Error('remove failure'); },
  };
  const gate = loadSource('src/lib/auth-read-gate.ts', {
    './auth-storage': { authStorage: storage }, 'react-native': { Platform: { OS: 'android' } },
  });
  const first = gate.clientAuthStorage.getItem(key);
  const second = gate.clientAuthStorage.getItem(key);
  let settled = false;
  first.then(() => { settled = true; });
  await settle();
  for (let i = 0; i < 5; i++) { t.mock.timers.tick(10000); await settle(); }
  assert.equal(reads, 3);
  assert.equal(settled, false);
  await assert.rejects(gate.clientAuthStorage.setItem('other', 'value'), /write failure/);
  await assert.rejects(gate.clientAuthStorage.removeItem('other'), /remove failure/);
  unavailable = false;
  gate.retryPendingAuthReads();
  assert.equal(await first, guest);
  assert.equal(await second, guest);
  for (const webStorage of [storage, undefined]) {
    const web = loadSource('src/lib/auth-read-gate.ts', {
      './auth-storage': { authStorage: webStorage }, 'react-native': { Platform: { OS: 'web' } },
    });
    assert.equal(web.clientAuthStorage, webStorage);
  }
});

test('gate does not return old pending read after signout or account replacement', async (t) => {
  for (const replacement of [null, linked]) {
    let resolveRead;
    let current = guest;
    let pause = true;
    const storage = {
      getItem: () => pause ? new Promise((resolve) => { resolveRead = resolve; }) : Promise.resolve(current),
      setItem: async (_key, value) => { current = value; pause = false; },
      removeItem: async () => { current = null; pause = false; },
    };
    const gate = loadSource('src/lib/auth-read-gate.ts', {
      './auth-storage': { authStorage: storage }, 'react-native': { Platform: { OS: 'android' } },
    });
    const read = gate.clientAuthStorage.getItem(key);
    await settle();
    if (replacement === null) await gate.clientAuthStorage.removeItem(key);
    else await gate.clientAuthStorage.setItem(key, replacement);
    resolveRead(guest);
    assert.equal(await read, replacement);
  }
});

test('installed SDK subscription read outage after successful initialize waits instead of emitting false signout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'error', () => {});
  const { createClient } = require('@supabase/supabase-js');
  const saved = JSON.stringify({ access_token: 'access', refresh_token: 'refresh', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'original-linked-id', is_anonymous: false } });
  const f = fixture(new Map(), new Map([[key, saved]]));
  await f.storage.getItem(key);
  let count = 0;
  let fail = true;
  const underlying = f.storage;
  const gate = loadSource('src/lib/auth-read-gate.ts', {
    './auth-storage': { authStorage: { ...underlying, getItem: async (k) => {
      count++;
      if (count > 1 && fail) throw new Error('locked after initialize');
      return underlying.getItem(k);
    } } },
    'react-native': { Platform: { OS: 'android' } },
  });
  const client = createClient('https://example.test', 'public-test-key', {
    global: { fetch: () => { throw new Error('No network allowed'); } },
    auth: { storage: gate.clientAuthStorage, storageKey: key, autoRefreshToken: false,
      persistSession: true, detectSessionInUrl: false },
  });
  const events = [];
  const { data } = client.auth.onAuthStateChange((event, session) => events.push({ event, session }));
  try {
    await settle();
    assert.ok(count > 1, 'SDK internal/user initial subscriber reads happen after successful initialization');
    assert.ok(events.every(({ event, session }) => event !== 'INITIAL_SESSION' && session?.user.id === 'original-linked-id'));
    fail = false;
    gate.retryPendingAuthReads();
    await settle();
    const initial = events.filter(({ event }) => event === 'INITIAL_SESSION');
    assert.equal(initial.length, 1);
    assert.equal(initial[0].session.user.id, 'original-linked-id');
    assert.ok(events.every(({ session }) => session?.user.id === 'original-linked-id'));
    const restored = await client.auth.getSession();
    assert.equal(restored.data.session.user.id, 'original-linked-id');
  } finally { data.subscription.unsubscribe(); await client.auth.stopAutoRefresh(); }
});
