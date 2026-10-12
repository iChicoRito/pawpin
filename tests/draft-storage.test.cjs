const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./load-source.cjs');

function storageApi(supabase = {}) {
  const files = new Map([['file://cache/photo.jpg', 'photo bytes']]);
  const directories = new Set();
  let metadata = null;
  let failWrite = false;
  const uriOf = (parts) => parts.map((part) => typeof part === 'string' ? part : part.uri).join('/');
  class Directory {
    constructor(...parts) { this.uri = uriOf(parts); }
    get exists() { return directories.has(this.uri); }
    create(options) {
      directories.add(this.uri);
      if (options?.intermediates) directories.add(this.uri.slice(0, this.uri.lastIndexOf('/')));
    }
    delete() {
      for (const uri of files.keys()) if (uri.startsWith(`${this.uri}/`)) files.delete(uri);
      directories.delete(this.uri);
    }
  }
  class File {
    constructor(...parts) { this.uri = uriOf(parts); }
    async copy(to, options) {
      assert.notEqual(this.uri, to.uri, 'A file cannot be copied onto itself');
      if (!files.has(this.uri)) throw new Error('Source photo missing');
      if (files.has(to.uri) && !options?.overwrite) throw new Error('Destination exists');
      files.set(to.uri, files.get(this.uri));
    }
    async arrayBuffer() { return new ArrayBuffer(8); }
    get size() { return 8; }
  }
  // Hands the photo back untouched: shrinking is not what these tests are about.
  const rendered = (uri) => ({ width: 800, saveAsync: async () => ({ uri }) });
  const ImageManipulator = { manipulate: (uri) => ({ renderAsync: async () => rendered(uri) }) };
  const api = loadSource('src/lib/reports.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async () => metadata,
      setItem: async (_key, value) => { if (failWrite) throw new Error('Disk full'); metadata = value; },
      removeItem: async () => { metadata = null; },
    },
    'expo-file-system': { Directory, File, Paths: { document: 'file://documents' } },
    'expo-image-manipulator': { ImageManipulator, SaveFormat: { JPEG: 'jpeg' } },
    '@/lib/supabase': { supabase },
  });
  return { api, files, failWrite: () => { failWrite = true; } };
}

const draft = {
  id: 'first', latitude: 14.6, longitude: 121, accuracyM: 5,
  animalType: 'dog', size: '', color: '', condition: '', landmark: '', urgency: 'critical',
  photos: [{ uri: 'file://cache/photo.jpg', takenAt: '2026-10-08T00:00:00Z', place: { latitude: 14.6, longitude: 121, accuracyM: 5 } }],
};

test('recovery draft reloads after temporary camera photo is removed', async () => {
  const { api, files } = storageApi();
  const kept = await api.saveUnsentReport(draft, 'user');
  files.delete('file://cache/photo.jpg');
  const loaded = await api.loadUnsentReport('user');
  assert.deepEqual(loaded, kept);
  assert.equal(files.get(loaded.photos[0].uri), 'photo bytes');
  assert.equal(await api.loadUnsentReport('another-user'), null);
});

test('retrying saved draft keeps its photo without copying it onto itself', async () => {
  const { api, files } = storageApi();
  const first = await api.saveUnsentReport(draft, 'user');
  const second = await api.saveUnsentReport(first, 'user');
  assert.deepEqual(second, first);
  assert.equal(files.get(second.photos[0].uri), 'photo bytes');
});

test('failed replacement leaves previous recovery metadata and photos readable', async () => {
  const { api, files, failWrite } = storageApi();
  const first = await api.saveUnsentReport(draft, 'user');
  failWrite();
  await assert.rejects(api.saveUnsentReport({ ...draft, id: 'second' }, 'user'), /Disk full/);
  assert.deepEqual(await api.loadUnsentReport('user'), first);
  assert.equal(files.get(first.photos[0].uri), 'photo bytes');
});

test('discard removes recovery metadata and durable copies, not camera originals', async () => {
  const { api, files } = storageApi();
  const kept = await api.saveUnsentReport(draft, 'user');
  await api.discardUnsentReport();
  assert.equal(await api.loadUnsentReport('user'), null);
  assert.equal(files.has(kept.photos[0].uri), false);
  assert.equal(files.get('file://cache/photo.jpg'), 'photo bytes');
});

/** A stand-in database that takes every photo and remembers the rows it was given. */
function sendingApi() {
  const rows = [];
  const supabase = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: async (row) => { rows.push(row); return { error: null }; },
    }),
    storage: { from: () => ({
      upload: async () => ({ error: null }),
      getPublicUrl: (path) => ({ data: { publicUrl: `https://photos.test/${path}` } }),
    }) },
  };
  return { api: storageApi(supabase).api, rows };
}

test('a kept draft keeps its no-animal mark', async () => {
  const { api } = storageApi();
  await api.saveUnsentReport({ ...draft, noAnimalSeen: true }, 'user');
  assert.equal((await api.loadUnsentReport('user')).noAnimalSeen, true);
});

test('a marked draft is sent with the mark, and a draft from an older build without it', async () => {
  const { api, rows } = sendingApi();
  await api.submitReport({ ...draft, noAnimalSeen: true }, 'user');
  await api.submitReport({ ...draft, id: 'second' }, 'user');
  assert.deepEqual(rows.map((row) => row.no_animal_seen), [true, false]);
});
