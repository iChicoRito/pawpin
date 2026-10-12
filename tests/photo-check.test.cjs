const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('./load-source.cjs');

globalThis.__DEV__ = false;

/** The check, with the library replaced by a stand-in that answers from `labelsByUri`. */
const photoCheck = (label) =>
  loadSource('src/lib/photo-check.ts', {
    '@react-native-ml-kit/image-labeling': { __esModule: true, default: { label } },
  });
const { showsAnimal } = photoCheck(async () => []);

test('a dog label at 0.9 shows an animal', () => {
  assert.equal(showsAnimal([{ text: 'Dog', confidence: 0.9 }]), true);
});

test('a wall and a building do not show an animal', () => {
  assert.equal(
    showsAnimal([
      { text: 'Wall', confidence: 0.95 },
      { text: 'Building', confidence: 0.9 },
    ]),
    false
  );
});

test('a dog label at 0.2 is too unsure to count', () => {
  assert.equal(showsAnimal([{ text: 'Dog', confidence: 0.2 }]), false);
});

test('three photos with one dog pass, and none without', async () => {
  const labels = {
    'file://wall.jpg': [{ text: 'Wall', confidence: 0.9 }],
    'file://dog.jpg': [{ text: 'Dog', confidence: 0.9 }],
    'file://road.jpg': [{ text: 'Road', confidence: 0.9 }],
  };
  const { checkPhotos } = photoCheck(async (uri) => labels[uri]);
  assert.equal(await checkPhotos(['file://wall.jpg', 'file://dog.jpg', 'file://road.jpg']), 'animal');
  assert.equal(await checkPhotos(['file://wall.jpg', 'file://road.jpg']), 'none');
});

test('a library that throws gives unknown, never a no', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { checkPhotos } = photoCheck(async () => {
    throw new Error('Model missing');
  });
  assert.equal(await checkPhotos(['file://dog.jpg']), 'unknown');
});
