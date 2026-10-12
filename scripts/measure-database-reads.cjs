const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createClient } = require('./database-test-client.cjs');

const prefix = '8f080009-0000-4000-8000-';
const user = `${prefix}000000000001`;
const id = (i) => `${prefix}${String(i).padStart(12, '0')}`;
const migration = 'supabase/migrations/0031_nearby_report_pages.sql';
const indexCandidates = [
  ['reports_reporter_history_idx', 'public.reports (reporter_id, created_at desc, id desc)'],
  ['flags_user_created_idx', 'public.flags (flagged_by, created_at)'],
  ['claims_completed_rescuer_idx', "public.claims (rescuer_id, report_id) where status = 'completed'"],
  ['profiles_push_token_idx', 'public.profiles (push_token) where push_token is not null'],
];
const queries = {
  nearby: `select * from public.nearby_reports(-40, -140, 5000)`,
  nearby_page: `select public.nearby_report_pages(-40,-140,5000,200)`,
  nearby_inner: `select r.id,r.photos,c.rescuer_id,extensions.st_distance(r.location,here.point) as distance_m
    from public.reports r cross join (select 'SRID=4326;POINT(-140 -40)'::extensions.geography as point) here
    left join public.claims c on c.report_id=r.id and c.status='on_the_way'
    where r.status in ('reported','responding') and extensions.st_dwithin(r.location,here.point,5000)
    order by distance_m,r.id`,
  history: `select id,photos from public.reports where reporter_id='${user}' order by created_at desc,id desc limit 50`,
  completed_rescues: `select r.id,r.photos from public.reports r where r.status='rescued' and exists
    (select 1 from public.claims c where c.report_id=r.id and c.rescuer_id='${user}' and c.status='completed')
    order by r.updated_at desc,r.id desc limit 50`,
  guest_reports: `select count(*) from public.reports where reporter_id='${user}' and created_at>now()-interval '24 hours'`,
  guest_flags: `select count(*) from public.flags where flagged_by='${user}' and created_at>now()-interval '24 hours'`,
  token_reassignment_lookup: `select id from public.profiles where push_token='PawPinRollbackFixture:1' and id<>'${user}'`,
  admin_page: 'select id,photos from public.reports order by created_at desc,id desc limit 30 offset 30',
  stale_closure_lookup: `select id from public.reports where status in ('reported','responding') and updated_at<now()-interval '72 hours'`,
};
async function plans(client, label, output) {
  output[label] = {};
  for (const [name, sql] of Object.entries(queries)) {
    const { rows } = await client.query(`explain (analyze,buffers,format json) ${sql}`);
    output[label][name] = rows[0]['QUERY PLAN'][0];
  }
  const retained = ['history','completed_rescues','guest_reports','guest_flags','token_reassignment_lookup'];
  output[`${label}_repeatTimesMs`] = {};
  for (const name of retained) {
    const times=[];
    for(let i=0;i<5;i++) times.push((await client.query(`explain (analyze,buffers,format json) ${queries[name]}`)).rows[0]['QUERY PLAN'][0]['Execution Time']);
    output[`${label}_repeatTimesMs`][name] = {times,median:[...times].sort((a,b)=>a-b)[2]};
  }
}
async function fixture(client, count) {
  await client.query(`insert into auth.users(id,is_anonymous)
    select ('${prefix}'||lpad(i::text,12,'0'))::uuid,false from generate_series(1,$1::integer) i on conflict do nothing`, [count === 40 ? 100 : 12000]);
  // Tokens are fixture-only strings, never sent: report alert/outcome triggers are disabled below.
  await client.query(`update public.profiles set push_token='PawPinRollbackFixture:'||right(id::text,12)::integer
    where id::text like '${prefix}%' and right(id::text,12)::integer<=100`);
  await client.query(`insert into public.reports(id,reporter_id,location,urgency,animal_type,photos,status)
    select ('${prefix}'||lpad(i::text,12,'0'))::uuid,
      ('${prefix}'||lpad((1+((i-1)%100))::text,12,'0'))::uuid,
      extensions.st_setsrid(extensions.st_makepoint(-140,case when i<=1207 then -40+(i%10)*0.0001 else 20 end),4326)::extensions.geography,
      'just_sighted','dog',array['https://example.invalid/rollback-fixture.jpg'],
      case when i<=1207 then 'reported'::public.report_status else 'rescued'::public.report_status end
    from generate_series($1::integer,$2::integer) i`, [count === 40 ? 1 : 41, count]);
  await client.query(`insert into public.claims(report_id,rescuer_id,status)
    select id,reporter_id,'completed' from public.reports where id::text like '${prefix}%'
      and status='rescued' and not exists(select 1 from public.claims c where c.report_id=reports.id)`);
  await client.query(`insert into public.flags(report_id,flagged_by,reason)
    select id,('${prefix}'||lpad((1+(right(id::text,12)::integer%100))::text,12,'0'))::uuid,'rollback fixture'
    from public.reports where id::text like '${prefix}%'
      and not exists(select 1 from public.flags f where f.report_id=reports.id)`);
}
async function paging(client, output) {
  await client.query('set local role authenticated');
  await client.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: user, role: 'authenticated', is_anonymous: false })]);
  const referenceStart=performance.now();
  const reference = (await client.query('select id from public.nearby_reports(-40,-140,5000) order by distance_m,id')).rows.map((r) => r.id);
  const referenceWallMs=performance.now()-referenceStart;
  let cursor = null;
  const found = [];
  let pages = 0;
  const pagingStart=performance.now();
  do {
    const { rows } = await client.query('select public.nearby_report_pages(-40,-140,5000,200,$1,$2) as page', [cursor?.distance_m ?? null,cursor?.id ?? null]);
    const page = rows[0].page;
    assert.ok(page.rows.length <= 200);
    found.push(...page.rows.map((r) => r.id)); cursor = page.next_cursor; pages++;
  } while (cursor);
  assert.deepEqual(found, reference);
  assert.ok(found.length >= 1207);
  output.paging = { referenceRows: reference.length, returnedRows: found.length, pages, pageSize: 200,
    referenceWallMs,pagedWallMs:performance.now()-pagingStart,
    timingNote:'SQL driver round trips, not HTTP/mobile timing. Paging prevents truncation, not a latency speedup.' };
  const empty = (await client.query('select public.nearby_report_pages(-80,0,0,200) as page')).rows[0].page;
  assert.deepEqual(empty, { rows: [], next_cursor: null });
  const one = (await client.query('select public.nearby_report_pages(-40,-140,5000,1) as page')).rows[0].page;
  assert.equal(one.rows.length, 1); assert.ok(one.next_cursor);
  const bounded = (await client.query('select public.nearby_report_pages(-40,-140,500000,10000) as page')).rows[0].page;
  assert.equal(bounded.rows.length,200);
  const anchor = (await client.query('select distance_m,id from public.nearby_reports(-40,-140,5000) order by distance_m,id offset 1189 limit 1')).rows[0];
  const full = (await client.query('select public.nearby_report_pages(-40,-140,5000,17,$1,$2) as page', [anchor.distance_m,anchor.id])).rows[0].page;
  // Equal-distance ties exercise UUID cursor ordering, including the final exact-full page.
  assert.equal(full.rows.length,17); assert.equal(full.next_cursor,null);
  await client.query('reset role');
}
async function run() {
  const client = createClient();
  const output = { fixture: { small: 40, large: 12000, note: 'Rollback only; no ANALYZE on live tables, no production write benchmark.' } };
  let baseline;
  try {
    await client.connect();
    baseline = (await client.query(`select pg_get_functiondef('public.nearby_reports(double precision,double precision,integer)'::regprocedure) as old_rpc,
      (select jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled) order by tgname) from pg_trigger where tgrelid='public.reports'::regclass) as triggers,
      to_regprocedure('public.nearby_report_pages(double precision,double precision,integer,integer,double precision,uuid)')::text as paging`)).rows[0];
    const originalIndexes = (await client.query("select indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('reports','claims','flags','profiles') order by indexname")).rows;
    assert.equal(baseline.paging,null,'New RPC must not already be deployed');
    await client.query('begin');
    await client.query("set local lock_timeout='5s'");
    const collision = (await client.query(`select exists(select 1 from auth.users where id::text like '${prefix}%')
      or exists(select 1 from public.reports where id::text like '${prefix}%')
      or exists(select 1 from public.profiles where push_token like 'PawPinRollbackFixture:%') as collision`)).rows[0];
    assert.equal(collision.collision,false,'Fixture collision; refusing inserts');
    await client.query('alter table public.reports disable trigger on_report_alert');
    await client.query('alter table public.reports disable trigger on_report_outcome');
    await client.query(fs.readFileSync(migration,'utf8'));
    await client.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: user, role: 'authenticated', is_anonymous: false })]);
    await fixture(client,40);
    await plans(client,'small_before',output);
    await client.query('savepoint small_indexes');
    for (const [name,definition] of indexCandidates) await client.query(`create index ${name} on ${definition}`);
    await plans(client,'small_candidates',output);
    await client.query('rollback to savepoint small_indexes');
    await fixture(client,12000);
    await plans(client,'large_before',output);
    for (const table of ['reports','claims','flags','profiles']) {
      await client.query(`create temporary table fixture_write_${table} (like public.${table} including defaults including constraints including indexes)`);
    }
    await client.query('savepoint measured_candidates');
    output.indexBuildMs = {};
    for (const [name, definition] of indexCandidates) {
      const existing = (await client.query('select to_regclass($1) as idx',[`public.${name}`])).rows[0].idx;
      assert.equal(existing,null,`Candidate ${name} already exists; inspect duplicates before measuring`);
      const start=performance.now();
      await client.query(`create index ${name} on ${definition}`);
      output.indexBuildMs[name] = performance.now()-start;
    }
    await plans(client,'large_candidates',output);
    // Clones were made before candidates: baseline cannot accidentally inherit proposed indexes.
    output.writeOverhead = {};
    for (const table of ['reports','claims','flags','profiles']) {
      output.writeOverhead[table] = {};
      for (const label of ['baseline','candidate']) {
        if (label === 'candidate') {
          const definition = indexCandidates.find(([,def]) => def.startsWith(`public.${table} `))[1];
          await client.query(`create index on ${definition.replace(`public.${table}`,`fixture_write_${table}`)}`);
        }
        const samples = [];
        for (let i=0;i<5;i++) {
          const q = (await client.query(`explain (analyze,buffers,format json) insert into fixture_write_${table}
            select * from public.${table} where ${table === 'reports' || table === 'profiles' ? 'id' : 'report_id'}::text like '${prefix}%' limit 1000`)).rows[0]['QUERY PLAN'][0];
          samples.push(q['Execution Time']);
          await client.query(`truncate fixture_write_${table}`);
        }
        output.writeOverhead[table][label] = { timesMs:samples,medianMs:[...samples].sort((a,b)=>a-b)[2],rows:1000 };
      }
    }
    // Discard exploratory indexes, then exercise the actual retained migration file.
    await client.query('rollback to savepoint measured_candidates');
    await client.query(fs.readFileSync('supabase/migrations/0030_production_query_indexes.sql','utf8'));
    await paging(client,output);
    await client.query(`update public.profiles set role='admin' where id='${user}'`);
    await client.query('set local role authenticated');
    output.authenticatedPlans = {};
    for (const name of ['nearby','nearby_page','nearby_inner','history','completed_rescues','admin_page']) {
      output.authenticatedPlans[name] = (await client.query(`explain (analyze,buffers,format json) ${queries[name]}`)).rows[0]['QUERY PLAN'][0];
    }
    await client.query('reset role');
    await client.query(fs.readFileSync('supabase/tests/production-query-plans.sql','utf8').replace(/^begin;$/m,'').replace(/^rollback;$/m,''));
    const queue = (await client.query("select to_regclass('push_private.notification_jobs')::text as jobs")).rows[0].jobs;
    output.push_polling = queue ? 'Requires staged push phase-specific plans; not measured here' : 'BLOCKED: push preparation not deployed; no polling relation';
    output.inventory = (await client.query(`select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('profiles','reports','claims','flags') order by tablename,indexname`)).rows;
    output.permissions = (await client.query(`select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in ('reports','claims','flags','profiles') order by tablename,policyname`)).rows;
    output.foreignKeys = (await client.query(`select conrelid::regclass::text as child,confrelid::regclass::text as parent,pg_get_constraintdef(oid) as definition
      from pg_constraint where contype='f' and conrelid in ('public.reports'::regclass,'public.claims'::regclass,'public.flags'::regclass,'public.profiles'::regclass) order by child,definition`)).rows;
    output.grants = (await client.query(`select grantee,table_name,privilege_type,column_name from information_schema.column_privileges
      where table_schema='public' and table_name in ('profiles','reports','claims','flags') and grantee in ('authenticated','anon')
      order by grantee,table_name,column_name,privilege_type`)).rows;
    output.maxRowsSetting = (await client.query("select current_setting('pgrst.db_max_rows',true) as session_setting")).rows[0];
    await client.query('rollback');
    const restored = (await client.query(`select pg_get_functiondef('public.nearby_reports(double precision,double precision,integer)'::regprocedure) as old_rpc,
      (select jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled) order by tgname) from pg_trigger where tgrelid='public.reports'::regclass) as triggers,
      to_regprocedure('public.nearby_report_pages(double precision,double precision,integer,integer,double precision,uuid)')::text as paging`)).rows[0];
    assert.deepEqual(restored,baseline,'Triggers and both RPC contracts restored');
    assert.deepEqual((await client.query("select indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('reports','claims','flags','profiles') order by indexname")).rows,originalIndexes,'All candidate indexes rolled back, original indexes unchanged');
    assert.equal((await client.query(`select count(*)::int as n from auth.users where id::text like '${prefix}%'`)).rows[0].n,0);
    assert.equal((await client.query(`select count(*)::int as n from public.reports where id::text like '${prefix}%'`)).rows[0].n,0);
    assert.equal((await client.query("select count(*)::int as n from public.profiles where push_token like 'PawPinRollbackFixture:%'")).rows[0].n,0);
    output.rollback = 'PASS: old RPC unchanged, new RPC absent, fixtures absent, triggers restored; verified TLS';
    fs.mkdirSync('.superpowers/sdd/production-hardening',{ recursive:true });
    fs.writeFileSync('.superpowers/sdd/production-hardening/phase-8-query-plans.json',JSON.stringify(output,null,2));
    console.log(JSON.stringify({ paging:output.paging,rollback:output.rollback,push_polling:output.push_polling }));
  } finally { await client.query('rollback').catch(() => {}); await client.end(); }
}
module.exports = { run };
if (require.main === module) run().catch((error) => { console.error('Read measurement failed:',error.code || error.name,error.message);process.exitCode=1; });
