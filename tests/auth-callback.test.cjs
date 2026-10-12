const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./load-source.cjs');

function authFlow({ redirect = 'pawpin:///', result, links = [], browserError } = {}) {
  const exchanges = [];
  const requests = [];
  let listener;
  let removed = 0;
  let switches = 0;
  const auth = loadSource('src/lib/auth.ts', {
    'expo-linking': {
      createURL: () => redirect,
      addEventListener: (_, callback) => {
        listener = callback;
        return { remove: () => removed++ };
      },
    },
    'expo-web-browser': {
      maybeCompleteAuthSession() {},
      openAuthSessionAsync: async () => {
        for (const url of links) listener({ url });
        if (browserError) throw browserError;
        return result ?? { type: 'success', url: `${redirect}?code=browser-code` };
      },
    },
    '@/lib/supabase': { supabase: { auth: {
      signInWithOAuth: async (request) => {
        requests.push(['signin', request]);
        return { data: { url: 'https://provider.example/authorize' }, error: null };
      },
      linkIdentity: async (request) => {
        requests.push(['link', request]);
        return { data: { url: 'https://provider.example/link' }, error: null };
      },
      exchangeCodeForSession: async (code) => {
        exchanges.push(code);
        return { error: null };
      },
    } } },
    '@/lib/session-actions': { switchAccountWithAlerts: async (action) => {
      switches++;
      return action();
    } },
  });
  return { ...auth, exchanges, requests, get removed() { return removed; }, get switches() { return switches; } };
}

test('browser callbacks accept configured native/web origin and path with query or fragment code', async () => {
  for (const redirect of ['pawpin:///', 'pawpin://', 'https://pawpin.example/auth/return', 'exp://127.0.0.1:8081/--/']) {
    for (const suffix of ['?code=valid-code', '#code=valid-code']) {
      const flow = authFlow({ redirect, result: { type: 'success', url: redirect + suffix } });
      assert.equal(await flow.signInWithGoogle(), true);
      assert.deepEqual(flow.exchanges, ['valid-code']);
      assert.equal(flow.removed, 1);
      assert.equal(flow.requests[0][1].options.redirectTo, redirect);
      assert.equal(flow.requests[0][1].options.skipBrowserRedirect, true);
    }
  }
});

test('unrelated listener callbacks cannot win over configured browser callback', async () => {
  for (const url of ['evil:///?code=bad', 'pawpin://other/?code=bad', 'pawpin:///reports?code=bad', 'not-a-url?error=bad']) {
    const flow = authFlow({ links: [url] });
    assert.equal(await flow.signInWithGoogle(), true);
    assert.deepEqual(flow.exchanges, ['browser-code']);
    assert.equal(flow.removed, 1);
  }
});

test('web listener ignores wrong scheme, host, port, credentials and normalized path aliases', async () => {
  const redirect = 'https://pawpin.example/auth/return';
  for (const target of ['http://pawpin.example/auth/return', 'https://other.example/auth/return', 'https://pawpin.example:444/auth/return', 'https://user@pawpin.example/auth/return', 'https://pawpin.example/auth/other/../return', 'https://pawpin.example/auth/%72eturn', 'https://pawpin.example/auth/return/']) {
    const flow = authFlow({ redirect, links: [`${target}?code=bad`] });
    assert.equal(await flow.signInWithGoogle(), true);
    assert.deepEqual(flow.exchanges, ['browser-code']);
  }
});

test('unrelated browser callback is ignored and valid listener callback can still finish', async () => {
  const flow = authFlow({ links: ['pawpin:///?code=link-code'], result: { type: 'success', url: 'evil:///?code=bad' } });
  assert.equal(await flow.signInWithGoogle(), true);
  assert.deepEqual(flow.exchanges, ['link-code']);
});

test('unrelated browser result and cancellation without a callback never exchange', async () => {
  const flows = [authFlow({ result: { type: 'success', url: 'pawpin:///reports?code=bad' } }), authFlow({ result: { type: 'cancel' }, links: ['evil:///?code=bad'] })];
  assert.deepEqual(await Promise.all(flows.map((flow) => flow.signInWithGoogle())), [false, false]);
  for (const flow of flows) {
    assert.deepEqual(flow.exchanges, []);
    assert.equal(flow.removed, 1);
  }
});

test('guest linking uses linkIdentity and preserves account-switch boundary', async () => {
  const flow = authFlow({ links: ['pawpin:///?code=link-code'], result: { type: 'cancel' } });
  assert.equal(await flow.linkGoogle(), true);
  assert.deepEqual(flow.exchanges, ['link-code']);
  assert.equal(flow.requests[0][0], 'link');
  assert.equal(flow.switches, 0);
  assert.equal(flow.removed, 1);
});

test('malformed callback encoding uses existing failure message and never exchanges code', async () => {
  for (const listener of [false, true]) {
    for (const suffix of ['?code=%E0%A4%A', '?code=valid&error_description=%GG', '?%GG=value&code=valid']) {
      const callback = `pawpin:///${suffix}`;
      const flow = authFlow(listener ? { links: [callback], result: { type: 'cancel' } } : { result: { type: 'success', url: callback } });
      await assert.rejects(flow.signInWithGoogle(), { message: 'Google sign-in did not finish.' });
      assert.deepEqual(flow.exchanges, []);
      assert.equal(flow.removed, 1);
    }
  }
});

test('provider errors retain message/code and browser rejection removes listener', async () => {
  const flow = authFlow({ result: { type: 'success', url: 'pawpin:///?error=denied&error_description=Access+denied&error_code=identity_already_exists' } });
  await assert.rejects(flow.linkGoogle(), { message: 'Access denied', code: 'identity_already_exists' });
  const rejected = authFlow({ browserError: new Error('Browser failed') });
  await assert.rejects(rejected.signInWithGoogle(), { message: 'Browser failed' });
  assert.equal(rejected.removed, 1);
});
