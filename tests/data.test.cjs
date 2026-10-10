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

function reportApi(rows) {
  const calls = [];
  const supabase = new PostgrestClient('https://example.test/rest/v1', {
    fetch: async (url, init) => {
      calls.push({ path: new URL(url).pathname, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  return { api: loadSource('src/lib/nearby.ts', { '@/lib/supabase': { supabase } }), calls };
}

const reportRow = {
  id: 'r1', reporter_id: 'u1', latitude: 14.6, longitude: 121, location_accuracy_m: 12,
  landmark: 'public market', animal_type: 'dog', size: 'small', color: 'cream', condition: 'injured',
  urgency: 'critical', photos: null, status: 'rescued', photo_taken_at: null,
  created_at: '2026-10-09T00:00:00Z', distance_m: null, rescuer_id: null,
};

test('one report is read by its id, from the viewer’s place when there is one', async () => {
  const { api, calls } = reportApi([reportRow]);
  await api.fetchReport('r1', { latitude: 14.61, longitude: 121, accuracyM: 5 });
  assert.deepEqual(calls, [{ path: '/rest/v1/rpc/report_by_id', body: { p_id: 'r1', lat: 14.61, lng: 121 } }]);
});

test('finished report with no place to measure from keeps its status and has no distance', async () => {
  const { api, calls } = reportApi([reportRow]);
  const report = await api.fetchReport('r1', null);
  assert.deepEqual(calls[0].body, { p_id: 'r1', lat: null, lng: null });
  assert.equal(report.status, 'rescued');
  assert.equal(report.distanceM, null);
  assert.equal(report.reporterId, 'u1');
  assert.deepEqual(report.photos, []);
});

test('id that is no report gives null, not an error', async () => {
  const { api } = reportApi([]);
  assert.equal(await api.fetchReport('missing', null), null);
});

function flagsApi(failure) {
  const calls = [];
  const supabase = new PostgrestClient('https://example.test/rest/v1', {
    fetch: async (url, init) => {
      const request = new URL(url);
      calls.push({ path: request.pathname, asksForRow: request.searchParams.has('select'), body: JSON.parse(init.body) });
      return failure
        ? new Response(JSON.stringify(failure), { status: 409, headers: { 'Content-Type': 'application/json' } })
        : new Response(null, { status: 201 });
    },
  });
  return { api: loadSource('src/lib/flags.ts', { '@/lib/supabase': { supabase } }), calls };
}

test('flag is saved with its report, its sender, and its reason, without asking for the row back', async () => {
  const { api, calls } = flagsApi();
  await api.flagReport('r1', 'u1', api.FLAG_REASONS[1]);
  assert.deepEqual(calls, [{
    path: '/rest/v1/flags', asksForRow: false,
    body: { report_id: 'r1', flagged_by: 'u1', reason: 'Wrong place' },
  }]);
});

test('second flag on the same report is told apart from other failures', async () => {
  const duplicate = flagsApi({ code: '23505', message: 'duplicate key value violates unique constraint' });
  const again = await duplicate.api.flagReport('r1', 'u1', 'Wrong place').catch((error) => error);
  assert.equal(duplicate.api.isAlreadyFlagged(again), true);

  const refused = flagsApi({ code: '42501', message: 'new row violates row-level security policy' });
  const other = await refused.api.flagReport('r1', 'u1', 'Wrong place').catch((error) => error);
  assert.equal(other.code, '42501');
  assert.equal(refused.api.isAlreadyFlagged(other), false);
  assert.equal(refused.api.isAlreadyFlagged(new Error('Network request failed')), false);
});

test('guest who has used up their flags is told apart, so the app can offer the sign-in', async () => {
  const limited = flagsApi({ code: 'P0001', message: 'guest_flag_limit' });
  const refusal = await limited.api.flagReport('r1', 'u1', 'Wrong place').catch((error) => error);
  assert.equal(limited.api.isGuestFlagLimit(refusal), true);
  assert.equal(limited.api.isAlreadyFlagged(refusal), false);
  assert.equal(limited.api.isGuestFlagLimit({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(limited.api.isGuestFlagLimit(new Error('Network request failed')), false);
});
