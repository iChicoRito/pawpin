const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('./load-source.cjs');

function messagesApi(supabase = {}) {
  const dependencies = { react: require('react'), '@/lib/supabase': { supabase } };
  const source = require('node:fs').readFileSync('src/lib/messages.ts', 'utf8');
  for (const [, name] of source.matchAll(/from '(@hugeicons\/core-free-icons\/[^']+)'/g)) {
    dependencies[name] = { name };
  }
  return loadSource('src/lib/messages.ts', dependencies);
}

test('a refused message is named by the database word for it, and anything else is not', () => {
  const api = messagesApi();
  for (const word of ['chat_closed', 'not_in_chat', 'too_fast', 'empty_message']) {
    assert.equal(api.chatRefusalOf({ message: word }), word);
  }
  assert.equal(api.chatRefusalOf(new Error('Network request failed')), null);
  assert.equal(api.chatRefusalOf(null), null);
});

test('a message is sent through the database function, never written to the table', async () => {
  const calls = [];
  const api = messagesApi({ rpc: async (name, args) => { calls.push([name, args]); return { error: null }; } });
  await api.sendMessage('claim-1', 'On my way');
  assert.deepEqual(calls, [['send_message', { p_claim_id: 'claim-1', p_body: 'On my way' }]]);
  const refused = messagesApi({ rpc: async () => ({ error: { message: 'chat_closed' } }) });
  await assert.rejects(refused.sendMessage('claim-1', 'hello'), (error) => api.chatRefusalOf(error) === 'chat_closed');
});

test('the Chats tab reads its rows from one database function', async () => {
  const api = messagesApi({
    rpc: async (name) => ({
      error: null,
      data: name === 'my_chats' && [{
        claim_id: 'c1', report_id: 'r1', animal_type: 'dog', photo: 'a.jpg', is_open: true,
        other_name: 'Sam', other_avatar: null, other_is_rescuer: true, last_body: null, last_at: null,
        last_from_me: null, unread: false, ended: null,
      }, {
        claim_id: 'c2', report_id: 'r2', animal_type: 'cat', photo: null, is_open: false,
        other_name: null, other_avatar: null, other_is_rescuer: false, last_body: 'Thanks', last_at: '2026-10-13T00:00:00Z',
        last_from_me: true, unread: false, ended: 'from_a_newer_app',
      }],
    }),
  });
  const chats = await api.fetchChats();
  // An ended chat always has words for why, even for a reason this version does not know.
  assert.equal(chats[1].ended, 'closed');
  assert.ok(api.CHAT_ENDS[chats[1].ended].title);
  assert.deepEqual(chats.slice(0, 1), [{
    claimId: 'c1', reportId: 'r1', animalType: 'dog', photo: 'a.jpg', isOpen: true, ended: null, otherName: 'Sam',
    otherAvatarUrl: null, otherIsRescuer: true, lastBody: null, lastAt: null, lastFromMe: false, isUnread: false,
  }]);
  await assert.rejects(messagesApi({ rpc: async () => ({ error: new Error('Offline') }) }).fetchChats(), /Offline/);
});

test('every way a chat can end, as the database names it, has words', () => {
  const api = messagesApi();
  const sql = require('node:fs').readFileSync('supabase/migrations/0036_chat_end.sql', 'utf8');
  const named = [...new Set(sql.split('create function public.chat_end')[1].split('$;')[0]
    .match(/then '([a-z_]+)'|else '([a-z_]+)'/g).map((found) => found.match(/'([a-z_]+)'/)[1]))];
  // 'rescued' and 'not_found' come from the report's own status.
  assert.deepEqual([...named, 'rescued', 'not_found'].sort(), Object.keys(api.CHAT_ENDS).sort());
  for (const end of Object.values(api.CHAT_ENDS)) {
    assert.ok(end.label && end.title && end.text && end.icon);
    assert.ok(['success', 'danger', 'plain'].includes(end.tone));
  }
});

// One answer per table, for the two reads `claimForChat` may make.
function claimsThen(active, last) {
  const asked = [];
  const chain = (table, answer) => {
    const query = {
      select: () => query, eq: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => { asked.push(table); return { data: answer, error: null }; },
    };
    return query;
  };
  return { asked, supabase: { from: (table) => chain(table, table === 'claims' ? active : last) } };
}

test('the chat of a report is the claim on the way, else the last one with messages, else none', async () => {
  const going = claimsThen({ id: 'claim-now' }, { claim_id: 'claim-old' });
  assert.equal(await messagesApi(going.supabase).claimForChat('r1'), 'claim-now');
  assert.deepEqual(going.asked, ['claims']);
  const ended = claimsThen(null, { claim_id: 'claim-old' });
  assert.equal(await messagesApi(ended.supabase).claimForChat('r1'), 'claim-old');
  assert.equal(await messagesApi(claimsThen(null, null).supabase).claimForChat('r1'), null);
});
