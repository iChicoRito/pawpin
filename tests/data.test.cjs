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
    '@react-native-async-storage/async-storage': { getItem: async () => null },
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

function flaggedApi(rows, failure) {
  const requests = [];
  const supabase = new PostgrestClient('https://example.test/rest/v1', {
    fetch: async (url) => {
      requests.push(new URL(url));
      return new Response(JSON.stringify(failure ?? rows), {
        status: failure ? 500 : 200, headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  return { api: loadSource('src/lib/flags.ts', { '@/lib/supabase': { supabase } }), requests };
}

// Newest flag first, as the database hands them back.
const flagRow = (reportId, reason, minute, status = 'reported') => ({
  reason, created_at: `2026-10-10T00:${String(minute).padStart(2, '0')}:00Z`,
  reports: {
    id: reportId, animal_type: 'dog', status, landmark: 'public market',
    photos: ['https://example.test/photo.jpg'], created_at: '2026-10-01T00:00:00Z',
  },
});

test('flags on the same report come back as one row, with the count, the reasons, and the newest time', async () => {
  const { api, requests } = flaggedApi([
    flagRow('r2', 'Wrong place', 30, 'closed'),
    flagRow('r1', 'Offensive photo or words', 20),
    flagRow('r2', 'Wrong place', 10, 'closed'),
    flagRow('r1', 'Wrong place', 5),
  ]);
  const page = await api.fetchFlaggedReports();
  assert.ok(requests[0].pathname.endsWith('/flags'));
  assert.equal(requests[0].searchParams.get('order'), 'created_at.desc');
  assert.equal(page.total, 2);
  assert.deepEqual(page.reports.map((report) => report.id), ['r2', 'r1']);
  assert.equal(page.reports[0].flagCount, 2);
  assert.deepEqual(page.reports[0].reasons, ['Wrong place']);
  assert.equal(page.reports[0].status, 'closed');
  assert.equal(page.reports[0].changedAt, '2026-10-10T00:30:00Z');
  assert.equal(page.reports[1].flagCount, 2);
  assert.deepEqual(page.reports[1].reasons, ['Offensive photo or words', 'Wrong place']);
  assert.equal(page.reports[1].changedAt, '2026-10-10T00:20:00Z');
  assert.equal(page.reports[1].photo, 'https://example.test/photo.jpg');
});

test('flagged reports stop at 50, and a failed read throws', async () => {
  const many = flaggedApi(Array.from({ length: 60 }, (_, n) => flagRow(`r${n}`, 'Wrong place', 59 - n)));
  const page = await many.api.fetchFlaggedReports();
  assert.equal(page.reports.length, 50);
  assert.equal(page.total, 60);
  await assert.rejects(flaggedApi(null, { code: '500', message: 'boom' }).api.fetchFlaggedReports());
});

function adminApi(answer, status = 200) {
  const requests = [];
  const supabase = new PostgrestClient('https://example.test/rest/v1', {
    fetch: async (url, init) => {
      const request = new URL(url);
      requests.push({ path: request.pathname, query: request.searchParams, body: init.body && JSON.parse(init.body) });
      return new Response(JSON.stringify(answer), {
        status, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-1/42' },
      });
    },
  });
  return { api: loadSource('src/lib/admin.ts', { '@/lib/supabase': { supabase } }), requests };
}

const adminRow = (id, flags = []) => ({
  id, animal_type: 'cat', status: 'reported', landmark: null, photos: null,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', flags,
});

test('admin reads every report a page at a time, with its flags counted and the reasons once each', async () => {
  const { api, requests } = adminApi([
    adminRow('r1', [{ reason: 'Wrong place' }, { reason: 'Wrong place' }, { reason: 'Something else' }]),
    adminRow('r2'),
  ]);
  const page = await api.fetchAdminReports('all', 30);
  assert.ok(requests[0].path.endsWith('/reports'));
  assert.equal(requests[0].query.get('order'), 'created_at.desc,id.desc');
  assert.equal(requests[0].query.get('offset'), '30');
  assert.equal(requests[0].query.get('limit'), String(api.ADMIN_PAGE));
  assert.equal(requests[0].query.get('status'), null);
  assert.ok(!requests[0].query.get('select').includes('!inner'));
  assert.equal(page.total, 42);
  assert.equal(page.reports[0].flagCount, 3);
  assert.deepEqual(page.reports[0].reasons, ['Wrong place', 'Something else']);
  assert.equal(page.reports[1].flagCount, 0);
  assert.equal(page.reports[1].photo, null);
});

test('admin filters ask the database, not the phone, for open, finished, and flagged reports', async () => {
  const open = adminApi([]);
  await open.api.fetchAdminReports('open', 0);
  assert.equal(open.requests[0].query.get('status'), 'in.(reported,responding)');
  const finished = adminApi([]);
  await finished.api.fetchAdminReports('finished', 0);
  assert.equal(finished.requests[0].query.get('status'), 'in.(rescued,not_found,closed)');
  const flagged = adminApi([]);
  await flagged.api.fetchAdminReports('flagged', 0);
  assert.ok(flagged.requests[0].query.get('select').includes('flags!inner'));
  await assert.rejects(adminApi({ message: 'boom' }, 500).api.fetchAdminReports('all', 0));
});

test('admin overview, a report’s flags, and the admin’s close each make one call', async () => {
  const counts = { reported: 5, responding: 1, rescued: 3, not_found: 1, closed: 2, new_today: 4, flagged: 2 };
  const overview = adminApi([counts]);
  assert.deepEqual(await overview.api.fetchAdminOverview(), {
    reported: 5, responding: 1, rescued: 3, notFound: 1, closed: 2, newToday: 4, flagged: 2,
  });
  assert.equal(overview.requests[0].path, '/rest/v1/rpc/admin_overview');

  const flags = adminApi([{ reason: 'Wrong place', created_at: '2026-10-10T00:00:00Z' }]);
  assert.deepEqual(await flags.api.fetchReportFlags('r1'), [{ reason: 'Wrong place', createdAt: '2026-10-10T00:00:00Z' }]);
  assert.equal(flags.requests[0].query.get('report_id'), 'eq.r1');

  const close = adminApi(null);
  await close.api.adminCloseReport('r1');
  assert.deepEqual(close.requests[0].body, { p_report_id: 'r1' });
  assert.equal(close.requests[0].path, '/rest/v1/rpc/admin_close_report');
  const refused = await adminApi({ code: 'P0001', message: 'cannot_close' }, 400).api.adminCloseReport('r1').catch((error) => error);
  assert.equal(refused.message, 'cannot_close');
});

test('flagged reports that need a look are asked for as active ones only', async () => {
  const { api, requests } = flaggedApi([]);
  await api.fetchFlaggedReports(true);
  assert.equal(requests[0].searchParams.get('reports.status'), 'in.(reported,responding)');
});

test('admin chart numbers are asked for in the phone’s own time zone and read into the app’s names', async () => {
  const { api, requests } = adminApi({
    days: [{ day: '2026-10-09', count: 2 }, { day: '2026-10-10', count: 1 }],
    this_week: 13, last_week: 4, urgency: { critical: 3 }, response_minutes: null,
    closing_soon: [{ id: 'r9', animal_type: 'dog', status: 'reported', landmark: null, photos: null,
      created_at: '2026-10-07T00:00:00Z', updated_at: '2026-10-07T01:00:00Z' }],
    flag_reasons: [{ label: 'Wrong place', count: 1 }], animals: [{ label: 'dog', count: 4 }],
  });
  const stats = await api.fetchAdminStats();
  assert.equal(requests[0].path, '/rest/v1/rpc/admin_stats');
  assert.equal(requests[0].body.p_tz, Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.equal(stats.thisWeek, 13);
  assert.equal(stats.lastWeek, 4);
  assert.deepEqual(stats.urgency, { critical: 3, needs_help_soon: 0, just_sighted: 0 });
  assert.equal(stats.responseMinutes, null);
  assert.equal(stats.closingSoon[0].changedAt, '2026-10-07T01:00:00Z');
  assert.equal(stats.closingSoon[0].flagCount, 0);
  assert.equal(stats.days.length, 2);
  await assert.rejects(adminApi({ code: 'P0001', message: 'not_admin' }, 400).api.fetchAdminStats());
});
