const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PostgrestClient } = require('@supabase/postgrest-js');
const { loadSource, hooks } = require('./load-source.cjs');

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.test';
process.env.EXPO_PUBLIC_SUPABASE_KEY = 'public-test-key';

function historyApi() {
  const requests = [];
  const rows = Array.from({ length: 55 }, (_, id) => ({
    id: String(id), animal_type: 'dog', status: 'rescued',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
    landmark: null, photos: ['https://example.test/photo.jpg'],
  }));
  const supabase = new PostgrestClient('https://example.test/rest/v1', {
    fetch: async (url) => {
      const request = new URL(url);
      requests.push(request);
      const offset = Number(request.searchParams.get('offset') ?? 0);
      const limit = Number(request.searchParams.get('limit') ?? 55);
      const selected = rows.slice(offset, offset + limit);
      return new Response(JSON.stringify(request.pathname.endsWith('/claims')
        ? selected.map((reports) => ({ reports })) : selected), {
        headers: { 'Content-Type': 'application/json', 'Content-Range': `${offset}-${offset + selected.length - 1}/55` },
      });
    },
  });
  const api = loadSource('src/lib/claims.ts', { '@/lib/supabase': { supabase } });
  return { api, requests };
}

test('history returns real total without loading every photo row', async () => {
  const { api } = historyApi();
  const page = await api.fetchMyReports('user');
  assert.equal(page.total, 55);
  assert.equal(page.reports.length, 50);
  assert.equal(page.reports[0].photo, 'https://example.test/photo.jpg');
});

test('rescues use completion date order on matching rescued reports', async () => {
  const { api, requests } = historyApi();
  const page = await api.fetchMyRescues('user');
  assert.equal(page.total, 55);
  assert.equal(page.reports.length, 50);
  assert.ok(requests[0].pathname.endsWith('/reports'));
  assert.equal(requests[0].searchParams.get('order'), 'updated_at.desc,id.desc');
  assert.equal(requests[0].searchParams.get('claims.rescuer_id'), 'eq.user');
  assert.equal(requests[0].searchParams.get('claims.status'), 'eq.completed');
});

function clientOptions() {
  let options;
  loadSource('src/lib/supabase.ts', {
    '@react-native-async-storage/async-storage': {},
    '@supabase/supabase-js': { createClient: (_url, _key, config) => { options = config; return {}; } },
  });
  return options;
}

test('stalled API request aborts and caller cancellation is preserved', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', (_input, init) => new Promise((_, reject) => {
    if (init.signal.aborted) reject(new Error('Aborted'));
    else init.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
  }));
  const options = clientOptions();
  assert.equal(typeof options.global?.fetch, 'function', 'All Supabase requests need a deadline');
  const timeout = assert.rejects(options.global.fetch('https://example.test/rest/v1/reports'), /Aborted/);
  t.mock.timers.tick(30000);
  await timeout;
  const caller = new AbortController();
  const cancelled = assert.rejects(options.global.fetch('https://example.test/rest/v1/reports', { signal: caller.signal }), /Aborted/);
  caller.abort();
  await cancelled;
});

test('photo upload gets longer deadline than database reads', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let aborted = false;
  t.mock.method(globalThis, 'fetch', (_input, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('Aborted')); }, { once: true });
  }));
  const options = clientOptions();
  assert.equal(typeof options.global?.fetch, 'function');
  const upload = assert.rejects(options.global.fetch('https://example.test/storage/v1/object/report-photos/1.jpg', { method: 'POST' }), /Aborted/);
  t.mock.timers.tick(30000);
  assert.equal(aborted, false);
  t.mock.timers.tick(90000);
  await upload;
});

test('native auth refresh stops in background and cleans up listener', () => {
  let onChange;
  let removed = false;
  let started = 0;
  let stopped = 0;
  const effects = [];
  const state = hooks();
  const module = loadSource('src/hooks/use-session.tsx', {
    react: { ...state.react, useEffect: (effect) => effects.push(effect) },
    'react-native': { Platform: { OS: 'android' }, AppState: {
      currentState: 'active', addEventListener: (_event, listener) => { onChange = listener; return { remove: () => { removed = true; } }; },
    } },
    '@/lib/supabase': { supabase: { auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      startAutoRefresh: () => { started++; }, stopAutoRefresh: () => { stopped++; },
    } } },
  });
  state.render(module.SessionProvider, { children: null });
  const cleanups = effects.map((effect) => effect());
  assert.equal(typeof onChange, 'function');
  onChange('background');
  assert.ok(stopped > 0);
  onChange('active');
  assert.ok(started > 0);
  cleanups.forEach((cleanup) => cleanup?.());
  assert.equal(removed, true);
});
