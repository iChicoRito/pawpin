const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./load-source.cjs');

function storageApi() {
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
  }
  const api = loadSource('src/lib/reports.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async () => metadata,
      setItem: async (_key, value) => { if (failWrite) throw new Error('Disk full'); metadata = value; },
      removeItem: async () => { metadata = null; },
    },
    'expo-file-system': { Directory, File, Paths: { document: 'file://documents' } },
    'expo-image-manipulator': {}, '@/lib/supabase': { supabase: {} },
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
