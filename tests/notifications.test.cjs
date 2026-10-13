const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { loadSource } = require('./load-source.cjs');

function notificationsApi(supabase = {}) {
  const dependencies = {
    react: require('react'),
    'react-native': { AppState: {} },
    '@/lib/supabase': { supabase },
    '@/lib/reports': {
      ANIMAL_TYPES: [{ value: 'dog', label: 'Dog' }],
      labelFor: (options, value) => options.find((option) => option.value === value)?.label ?? value ?? '',
    },
  };
  const source = fs.readFileSync('src/lib/notifications.ts', 'utf8');
  for (const [, name] of source.matchAll(/from '(@hugeicons\/core-free-icons\/[^']+)'/g)) {
    dependencies[name] = { name };
  }
  return loadSource('src/lib/notifications.ts', dependencies);
}

test('every kind the database writes has a title, a sentence naming the animal, and an icon', () => {
  const api = notificationsApi();
  // The check in supabase/migrations/0032_notifications.sql.
  const kinds = fs.readFileSync('supabase/migrations/0032_notifications.sql', 'utf8')
    .match(/check \(kind in \(([^)]+)\)/)[1].match(/[a-z_]+/g);
  assert.deepEqual(Object.keys(api.NOTIFICATION_KINDS).sort(), [...kinds].sort());
  for (const kind of kinds) {
    const { title, line, icon, tone } = api.NOTIFICATION_KINDS[kind];
    assert.ok(title && icon, kind);
    assert.match(line('dog'), /\bdog\b/, kind);
    assert.ok(['success', 'danger', 'plain'].includes(tone), kind);
  }
});

test('the animal reads as a word in a sentence, whatever the reporter gave', () => {
  const api = notificationsApi();
  assert.equal(api.animalIn({ animalType: 'dog' }), 'dog');
  assert.equal(api.animalIn({ animalType: 'Goat' }), 'goat');
  assert.equal(api.animalIn({ animalType: null }), 'animal');
});

test('notifications are read newest first for the user, with the report they are about', async () => {
  const calls = [];
  const rows = [{
    id: 'n1', kind: 'closed_by_admin', reason: 'Wrong place', created_at: '2026-10-13T00:00:00Z',
    read_at: null, report_id: 'r1',
    reports: { animal_type: 'cat', landmark: 'Gate', status: 'closed', photos: ['a.jpg', 'b.jpg'] },
  }, {
    id: 'n2', kind: 'from_a_newer_app', reason: null, created_at: '2026-10-12T00:00:00Z',
    read_at: '2026-10-12T01:00:00Z', report_id: 'r2', reports: null,
  }];
  const query = {
    select: (columns) => { calls.push(['select', columns]); return query; },
    eq: (column, value) => { calls.push(['eq', column, value]); return query; },
    order: (column, options) => { calls.push(['order', column, options]); return query; },
    limit: async (count) => { calls.push(['limit', count]); return { data: rows, error: null }; },
  };
  const api = notificationsApi({ from: (table) => { calls.push(['from', table]); return query; } });
  const found = await api.fetchNotifications('user');
  assert.deepEqual(calls[0], ['from', 'notifications']);
  assert.deepEqual(calls[2], ['eq', 'user_id', 'user']);
  assert.deepEqual(calls[3], ['order', 'created_at', { ascending: false }]);
  assert.deepEqual(found[0], {
    id: 'n1', kind: 'closed_by_admin', reason: 'Wrong place', createdAt: '2026-10-13T00:00:00Z',
    readAt: null, reportId: 'r1', animalType: 'cat', landmark: 'Gate', status: 'closed', photo: 'a.jpg',
  });
  // A kind this version does not know still has words to show.
  assert.ok(api.NOTIFICATION_KINDS[found[1].kind]);
  assert.equal(found[1].photo, null);
});
