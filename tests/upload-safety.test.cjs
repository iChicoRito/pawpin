const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./load-source.cjs');

const draft = {
  id: '00000000-0000-4000-8000-000000000001', latitude: 14, longitude: 121, accuracyM: 5,
  animalType: 'dog', size: '', color: '', condition: '', landmark: '', urgency: 'critical',
  photos: [{ uri: 'file://photo.jpg', takenAt: '2026-10-01T00:00:00Z' }],
};
function harness({ saved = false, reservation = { saved: false }, reserveError, releaseError, uploadError, insertError, size = 8, metadata } = {}) {
  const calls = [];
  let stored = metadata ? JSON.stringify(metadata) : null;
  const values = new Map();
  const api = loadSource('src/lib/reports.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => key === 'pawpin.unsent-report' ? stored : values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value); },
      removeItem: async () => { calls.push(['discard']); stored = null; },
    },
    'expo-file-system': {
      Directory: class { get exists() { return false; } }, Paths: { document: 'file://documents' },
      File: class { get size() { return size; } async arrayBuffer() { return new ArrayBuffer(size); } },
    },
    'expo-image-manipulator': {
      ImageManipulator: { manipulate: () => ({ renderAsync: async () => ({ width: 800, saveAsync: async () => ({ uri: 'file://small.jpg' }) }) }) },
      SaveFormat: { JPEG: 'jpeg' },
    },
    '@/lib/supabase': { supabase: {
      rpc: async (name, args) => {
        calls.push([name, args]);
        const error = name === 'release_report_upload' ? releaseError?.() : reserveError;
        return { data: reservation, error };
      },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: saved ? { id: draft.id } : null }) }) }),
        insert: async () => { calls.push(['insert']); return { error: insertError }; },
      }),
      storage: { from: () => ({
        upload: async (path) => { calls.push(['upload', path]); return { error: uploadError }; },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://photos.test/${path}` } }),
      }) },
    } },
  });
  return { api, calls };
}

test('reservation precedes upload; retries renew the same report and reuse paths', async () => {
  const { api, calls } = harness();
  await api.submitReport(draft, 'user');
  await api.submitReport(draft, 'user');
  assert.deepEqual(calls.map(([name]) => name), ['prepare_report_upload', 'upload', 'insert', 'prepare_report_upload', 'upload', 'insert']);
  assert.deepEqual(calls[0][1], { p_report_id: draft.id, p_photo_count: 1 });
  assert.equal(calls[1][1], calls[4][1]);
});
test('saved report detection skips all reservation and upload work', async () => {
  const { api, calls } = harness({ saved: true });
  assert.deepEqual(await api.submitReport(draft, 'user'), []);
  assert.deepEqual(calls, []);
});
test('server-detected successful retry returns without overwriting accepted photos', async () => {
  const { api, calls } = harness({ reservation: { saved: true } });
  assert.deepEqual(await api.submitReport(draft, 'user'), []);
  assert.equal(calls.length, 1);
});
test('reservation failure preserves guest error and prevents upload', async () => {
  const { api, calls } = harness({ reserveError: { message: 'guest_report_limit' } });
  await assert.rejects(api.submitReport(draft, 'user'), /^Error: guest_report_limit$/);
  assert.equal(calls.length, 1);
});
test('failed uploads/inserts do not release a lease or discard recovery metadata', async () => {
  for (const failure of [{ uploadError: new Error('Offline') }, { insertError: { message: 'Offline' } }]) {
    const { api, calls } = harness(failure);
    await assert.rejects(api.submitReport(draft, 'user'), /Offline/);
    assert.equal(calls.some(([name]) => name === 'release_report_upload' || name === 'discard'), false);
  }
});
test('compressed photo above the ceiling is refused before upload without lowering quality', async () => {
  const { api, calls } = harness({ size: 5242881 });
  await assert.rejects(api.submitReport(draft, 'user'), /Photo exceeds upload limit/);
  assert.equal(calls.some(([name]) => name === 'upload'), false);
});
test('explicit discard releases only the current account draft; account mismatch keeps metadata', async () => {
  const { api, calls } = harness({ metadata: { userId: 'owner', draft } });
  await api.discardUnsentReport('other');
  assert.deepEqual(calls, []);
  await api.discardUnsentReport('owner');
  assert.equal(calls[1][0], 'release_report_upload');
  assert.deepEqual(calls[1][1], { p_report_id: draft.id });
});
test('offline explicit discard persists release intent and flushes it before next reservation', async () => {
  let offline = true;
  const { api, calls } = harness({ metadata: { userId: 'owner', draft },
    releaseError: () => offline ? { message: 'Offline' } : null });
  await api.discardUnsentReport('owner');
  assert.deepEqual(calls.map(([name]) => name), ['discard', 'release_report_upload']);
  offline = false;
  await api.submitReport({ ...draft, id: 'new-report' }, 'owner');
  assert.deepEqual(calls.slice(2).map(([name]) => name), ['release_report_upload', 'prepare_report_upload', 'upload', 'insert']);
});
test('unflushed release failure blocks next upload without dropping its durable intent', async () => {
  let offline = true;
  const { api, calls } = harness({ metadata: { userId: 'owner', draft },
    releaseError: () => offline ? { message: 'Offline' } : null });
  await api.discardUnsentReport('owner');
  await assert.rejects(api.submitReport(draft, 'owner'), /Offline/);
  assert.equal(calls.some(([name]) => name === 'prepare_report_upload'), false);
  offline = false;
  await api.submitReport(draft, 'owner');
  assert.equal(calls.filter(([name]) => name === 'release_report_upload').length, 3);
});
