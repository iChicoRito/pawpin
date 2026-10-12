const assert = require('node:assert/strict');
const test = require('node:test');
const { PostgrestClient } = require('@supabase/postgrest-js');
const { loadSource } = require('./load-source.cjs');

const place = { latitude: 14.6, longitude: 121, accuracyM: 5 };
const rows = (count) => Array.from({ length: count }, (_, i) => ({
  id: String(i).padStart(8, '0'), distance_m: Math.floor(i / 3), reporter_id: 'viewer',
  latitude: 14.6, longitude: 121, urgency: 'just_sighted', status: 'reported', photos: [],
}));
function api(handler) {
  const calls = [];
  const supabase = new PostgrestClient('https://example.test/rest/v1', {
    fetch: async (url, init) => {
      const args = JSON.parse(init.body);
      calls.push({ url, args, signal: init.signal });
      const data = await handler(args, init.signal, calls.length);
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  return { ...loadSource('src/lib/nearby.ts', { '@/lib/supabase': { supabase } }), calls };
}
function page(all, args, size = 200) {
  const after = all.filter((r) => args.after_id == null ||
    r.distance_m > args.after_distance_m || (r.distance_m === args.after_distance_m && r.id > args.after_id));
  const selected = after.slice(0, size);
  const last = selected.at(-1);
  return { rows: selected, next_cursor: after.length > size ? { distance_m: last.distance_m, id: last.id } : null };
}

for (const count of [0, 200, 400, 1207]) {
  test(`complete paging returns uncapped reference order: ${count} rows`, async () => {
    const all = rows(count);
    const env = api((args) => page(all, args));
    const found = await env.fetchNearbyReports(place, 5000);
    assert.deepEqual(found.map((r) => r.id), all.map((r) => r.id));
    assert.equal(env.calls.length, Math.max(1, Math.ceil(count / 200)));
    assert.ok(env.calls.every((c) => c.url.endsWith('/rpc/nearby_report_pages') && c.args.page_size === 200));
  });
}
test('explicit cursor, not short page length, decides exhaustion', async () => {
  const all = rows(19);
  const env = api((args) => page(all, args, 7));
  assert.equal((await env.fetchNearbyReports(place, 5000)).length, 19);
  assert.equal(env.calls.length, 3);
});
test('later-page failure rejects whole retrieval, never partial success', async () => {
  const env = api((args, _, call) => { if (call === 2) throw new Error('offline'); return page(rows(401), args); });
  await assert.rejects(env.fetchNearbyReports(place, 5000), (error) => error.message.includes('offline'));
});
test('duplicate moved row is deduplicated and final server order retained', async () => {
  const all = rows(201);
  const env = api((args, _, call) => call === 1 ? page(all, args) : {
    rows: [{ ...all[0], distance_m: 80 }, all[200]], next_cursor: null,
  });
  const found = await env.fetchNearbyReports(place, 5000);
  assert.equal(found.length, 201);
  assert.equal(found.at(-1).id, all[0].id);
});
test('malformed envelope or nonadvancing cursor fails closed', async () => {
  for (const response of [[], { rows: [], next_cursor: { distance_m: 0, id: 'x' } }, { rows: rows(1) }]) {
    await assert.rejects(api(() => response).fetchNearbyReports(place, 5000), /page/i);
  }
  const env = api(() => ({ rows: rows(1), next_cursor: { distance_m: 0, id: '00000000' } }));
  await assert.rejects(env.fetchNearbyReports(place, 5000), /cursor/i);
});
test('truncated rows with original continuation cannot be mistaken for a complete page', async () => {
  const env = api((args) => {const response=page(rows(401),args);response.rows=response.rows.slice(0,7);return response;});
  await assert.rejects(env.fetchNearbyReports(place,5000),/cursor/i);
});
test('scalar envelope survives simulated max-rows=1, unlike old set-returning RPC',async()=>{
  const all=rows(1207),maxRows=1;
  const env=api((args)=>{
    const response=page(all,args);
    // PostgREST caps top-level SQL row sets, not arrays inside one scalar JSON value.
    return Array.isArray(response)?response.slice(0,maxRows):response;
  });
  assert.equal((await env.fetchNearbyReports(place,5000)).length,1207);
  assert.equal(env.calls.length,7);assert.equal(all.slice(0,maxRows).length,1);
});
test('cancellation signal reaches every page and stops subsequent pages', async () => {
  const controller = new AbortController();
  const env = api((args, signal, call) => {
    assert.equal(signal, controller.signal);
    if (call === 2) controller.abort();
    return page(rows(601), args);
  });
  await assert.rejects(env.fetchNearbyReports(place, 5000, controller.signal), { name: 'AbortError' });
  assert.equal(env.calls.length, 2);
});
test('already cancelled retrieval issues no RPC', async () => {
  const controller = new AbortController(); controller.abort();
  const env = api(() => assert.fail('cancelled RPC'));
  await assert.rejects(env.fetchNearbyReports(place, 5000, controller.signal), { name: 'AbortError' });
  assert.equal(env.calls.length, 0);
});
