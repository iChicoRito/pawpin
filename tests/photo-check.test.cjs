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
  assert.deepEqual(await checkPhotos(['file://wall.jpg', 'file://dog.jpg', 'file://road.jpg']), { result: 'animal', animal: 'Dog' });
  assert.deepEqual(await checkPhotos(['file://wall.jpg', 'file://road.jpg']), { result: 'none' });
});

test('a library that throws gives unknown, never a no', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { checkPhotos } = photoCheck(async () => {
    throw new Error('Model missing');
  });
  assert.deepEqual(await checkPhotos(['file://dog.jpg']), { result: 'unknown' });

});

test('the animal named is the surest one the model can put a kind to', async () => {
  const named = async (labels) => (await photoCheck(async () => labels).checkPhotos(['file://a.jpg'])).animal;
  // As the owner's phone answered for a picture of a dog.
  assert.equal(await named([
    { text: 'Dog', confidence: 0.97 }, { text: 'Pet', confidence: 0.92 }, { text: 'Cat', confidence: 0.73 },
  ]), 'Dog');
  // "Pet" says an animal is there, not which. It is not shown as a kind, however sure.
  assert.equal(await named([{ text: 'Pet', confidence: 0.99 }, { text: 'Cat', confidence: 0.6 }]), 'Cat');
  assert.equal(await named([{ text: 'Pet', confidence: 0.9 }]), undefined);
  // An unsure kind is not named either.
  assert.equal(await named([{ text: 'Pet', confidence: 0.9 }, { text: 'Dog', confidence: 0.3 }]), undefined);
});

// The camera's Next button: what the reporter meets after the check answers.
const { hooks, findElement, ui, native, theme } = require('./load-source.cjs');

function cameraNext(answer, photoCount = 1, animal) {
  const photos = Array.from({ length: photoCount }, (_, index) => ({ uri: `file://${index}.jpg` }));
  const draft = { id: 'draft', photos };
  const state = hooks([draft, 0, false, false]);
  const done = [];
  const heard = [];
  const toasts = [];
  const toasting = new Proxy(ui, {
    get: (target, key) => key === 'useToast' ? () => ({ toast: { show: (toast) => toasts.push(toast) } }) : target[key],
  });
  const module = loadSource('src/components/report-camera.tsx', {
    '@hugeicons/core-free-icons/Cancel01Icon': {}, '@hugeicons/core-free-icons/Location01Icon': {},
    '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
    'expo-camera': { CameraView: 'CameraView' }, 'expo-location': {},
    'expo-router': { useIsFocused: () => true, useRouter: () => ({ navigate() {} }) },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'heroui-native': toasting, react: state.react, 'react-native': native,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/components/report-sent': { ToastIcon: 'ToastIcon' },
    '@/components/app-tabs': { useHideTabBar() {} }, '@/components/drawer-backdrop': {},
    '@/components/report-photo': { PhotoThumb: 'PhotoThumb' },
    '@/components/themed-text': {}, '@/components/themed-view': {},
    '@/constants/theme': theme, '@/lib/reports': { MAX_PHOTOS: 3, startDraft: () => draft },
    '@/hooks/use-feedback': { useSoundOnVisible: (kind, on) => { if (on) heard.push(kind); } },
    '@/lib/photo-check': { checkPhotos: async () => ({ result: answer, animal }) },
  });
  const render = () => state.render(module.ReportCamera, { onDone: (sent) => done.push(sent) });
  const button = (label) => findElement(render(), (node) => node.props?.onPress && node.props.children === label);
  const tapNext = () => findElement(render(), (node) => node.props?.next).props.next.props.onPress();
  // The warning is a drawer that is always in the tree; this is whether it is open.
  const isWarned = () => findElement(render(), (node) => 'isOpen' in (node.props ?? {})).props.isOpen;
  return { render, button, tapNext, isWarned, done, heard, toasts };
}

test('an animal, or a check that could not run, goes straight on without the mark', async () => {
  for (const answer of ['animal', 'unknown']) {
    const camera = cameraNext(answer);
    await camera.tapNext();
    assert.equal(camera.done.length, 1);
    assert.equal(camera.done[0].noAnimalSeen, false);
    assert.equal(camera.isWarned(), false);
  }
});

test('no animal brings up the warning and sends nothing on by itself', async () => {
  const camera = cameraNext('none');
  await camera.tapNext();
  assert.equal(camera.done.length, 0);
  assert.equal(camera.isWarned(), true);
  assert.deepEqual([...new Set(camera.heard)], ['confirmation']);
});

test('Continue anyway goes on with the mark', async () => {
  const camera = cameraNext('none');
  await camera.tapNext();
  camera.button('Continue anyway').props.onPress();
  assert.equal(camera.done[0].noAnimalSeen, true);
});

test('the warning offers two choices, and taking one more photo is not one of them', async () => {
  const camera = cameraNext('none');
  await camera.tapNext();
  assert.ok(camera.button('Start over'));
  assert.ok(camera.button('Continue anyway'));
  assert.equal(camera.button('Take another photo'), undefined);
});

test('Start over from the warning drops the photos', async () => {
  const camera = cameraNext('none');
  await camera.tapNext();
  camera.button('Start over').props.onPress();
  assert.equal(camera.isWarned(), false);
  assert.equal(findElement(camera.render(), (node) => 'next' in (node.props ?? {})).props.photos.length, 0);
});

test('closing the drawer keeps the photos, so one more can be taken', async () => {
  const camera = cameraNext('none');
  await camera.tapNext();
  findElement(camera.render(), (node) => node.props?.onOpenChange).props.onOpenChange(false);
  assert.equal(camera.isWarned(), false);
  assert.equal(findElement(camera.render(), (node) => node.props?.next).props.photos.length, 1);
  assert.equal(camera.done.length, 0);
});

test('only a seen animal is announced: not a failed check, and not a photo without one', async () => {
  const shown = {};
  for (const answer of ['animal', 'unknown', 'none']) {
    const camera = cameraNext(answer);
    await camera.tapNext();
    shown[answer] = camera.toasts.map((toast) => toast.label);
  }
  assert.deepEqual(shown, { animal: ['Animal detected'], unknown: [], none: [] });
});

test('the kind of animal is said when the check could name it', async () => {
  const camera = cameraNext('animal', 1, 'Dog');
  await camera.tapNext();
  assert.deepEqual(camera.toasts.map((toast) => toast.label), ['Dog detected']);
});
