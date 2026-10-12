const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./load-source.cjs');

function api(saved = false) {
  let uploads = 0;
  const rows = [];
  const report = loadSource('src/lib/reports.ts', {
    '@react-native-async-storage/async-storage': { getItem: async () => null },
    'expo-file-system': { File: class { get size() { return 8; } async arrayBuffer() { return new ArrayBuffer(8); } } },
    'expo-image-manipulator': {
      ImageManipulator: { manipulate: () => ({ renderAsync: async () => ({ width: 800, saveAsync: async () => ({ uri: 'file://small.jpg' }) }) }) },
      SaveFormat: { JPEG: 'jpeg' },
    },
    '@/lib/supabase': { supabase: {
      rpc: async () => ({ data: { saved: false }, error: null }),
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: saved ? { id: 'saved' } : null }) }) }),
        insert: async (row) => { rows.push(row); return {}; },
      }),
      storage: { from: () => ({ upload: async () => { uploads++; return {}; }, getPublicUrl: () => ({ data: { publicUrl: 'https://example.invalid/photo.jpg' } }) }) },
    } },
  });
  return { report, rows, uploads: () => uploads };
}
const draft = {
  id: 'test', latitude: 14, longitude: 121, accuracyM: null,
  animalType: 'dog', size: '', color: '', condition: '', landmark: '', urgency: 'critical',
  photos: [{ uri: 'file://photo.jpg', takenAt: '2026-10-01T00:00:00Z' }],
};

test('invalid unsaved report inputs fail before uploading photos', async () => {
  for (const change of [
    { photos: [] }, { photos: Array(4).fill(draft.photos[0]) },
    { animalType: '' }, { animalType: 'other', otherAnimal: ' ' },
    { otherAnimal: 'x'.repeat(41), animalType: 'other' },
    { color: 'x'.repeat(41) }, { color: 'other', otherColor: ' ' },
    { landmark: 'x'.repeat(121) }, { urgency: 'unknown' },
    { size: 'giant' }, { condition: 'unknown' },
    { latitude: 91 }, { longitude: -181 }, { accuracyM: -1 },
    { accuracyM: NaN }, { accuracyM: Infinity },
  ]) {
    const { report, uploads } = api();
    await assert.rejects(report.submitReport({ ...draft, ...change }, 'user'), /Invalid report input/);
    assert.equal(uploads(), 0);
  }
});

test('one or three photos and typed values retain normalized submission behavior', async () => {
  for (const count of [1, 3]) {
    const { report, rows, uploads } = api();
    await report.submitReport({ ...draft, photos: Array(count).fill(draft.photos[0]), animalType: 'other', otherAnimal: ' rabbit ', color: 'other', otherColor: ' spotted ', landmark: ' market ' }, 'user');
    assert.equal(uploads(), count);
    assert.equal(rows[0].animal_type, 'rabbit');
    assert.equal(rows[0].color, 'spotted');
    assert.equal(rows[0].landmark, 'market');
  }
});

test('already saved legacy draft returns without uploads or another insert', async () => {
  const { report, rows, uploads } = api(true);
  assert.deepEqual(await report.submitReport({ ...draft, photos: [] }, 'user'), []);
  assert.equal(uploads(), 0);
  assert.equal(rows.length, 0);
});

test('older Other draft without typed-animal metadata retains its fallback value', async () => {
  const { report, rows } = api();
  await report.submitReport({ ...draft, animalType: 'other' }, 'user');
  assert.equal(rows[0].animal_type, 'other');
});
