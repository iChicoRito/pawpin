const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('./load-source.cjs');

const loadSounds = () => loadSource('src/lib/sounds.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('rapid successful submissions each play a chime rather than sharing an error deduplication window', async () => {
  const sounds = loadSounds();
  const heard = [];
  const disconnect = sounds.connectSounds(async (kind) => { heard.push(kind); }, () => {});
  sounds.playSound('success');
  sounds.playSound('success');
  await tick();
  assert.deepEqual(heard, ['success', 'success']);
  disconnect();
});

test('distinct report IDs queue separate pops; duplicate delivery does not replay', async () => {
  const sounds = loadSounds();
  const heard = [];
  const finish = [];
  const disconnect = sounds.connectSounds((kind) => {
    heard.push(kind);
    return new Promise((resolve) => finish.push(resolve));
  }, () => {});
  sounds.playSound('notification', 'report:first');
  sounds.playSound('notification', 'report:first');
  sounds.playSound('notification', 'report:second');
  sounds.playSound('notification', 'report:third');
  assert.deepEqual(heard, ['notification']);
  finish.shift()();
  await tick();
  assert.deepEqual(heard, ['notification', 'notification']);
  finish.shift()();
  await tick();
  assert.equal(heard.length, 3);
  finish.shift()();
  disconnect();
});

test('toast and inline error from one action sound once, later error can sound again', async () => {
  const sounds = loadSounds();
  const heard = [];
  const disconnect = sounds.connectSounds(async (kind) => { heard.push(kind); }, () => {});
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    sounds.playSound('error');
    sounds.playSound('error');
    await tick();
    assert.deepEqual(heard, ['error']);
    now += 1000;
    sounds.playSound('error');
    await tick();
    assert.deepEqual(heard, ['error', 'error']);
  } finally {
    Date.now = originalNow;
    disconnect();
  }
});

test('backgrounding stops current feedback, drops queued sounds, and permits fresh foreground events', async () => {
  const sounds = loadSounds();
  const heard = [];
  let finish;
  let stopped = 0;
  const disconnect = sounds.connectSounds((kind) => {
    heard.push(kind);
    return new Promise((resolve) => { finish = resolve; });
  }, () => { stopped++; });
  sounds.playSound('notification', 'report:first');
  sounds.playSound('notification', 'report:second');
  sounds.setSoundsActive(false);
  assert.equal(stopped, 1);
  sounds.playSound('error');
  finish();
  await tick();
  assert.equal(heard.length, 1);
  sounds.setSoundsActive(true);
  sounds.playSound('confirmation');
  assert.deepEqual(heard, ['notification', 'confirmation']);
  finish();
  disconnect();
});

test('failed playback cannot reject a user action or block the next report sound', async () => {
  const sounds = loadSounds();
  const heard = [];
  const disconnect = sounds.connectSounds(async (kind) => {
    heard.push(kind);
    if (kind === 'error') throw new Error('Audio unavailable');
  }, () => {});
  const warn = console.warn;
  console.warn = () => {};
  try {
    sounds.playSound('error');
    sounds.playSound('notification', 'report:next');
    await tick();
    assert.deepEqual(heard, ['error', 'notification']);
  } finally {
    console.warn = warn;
    disconnect();
  }
});

test('disconnect discards old-account queue and resets report deduplication', async () => {
  const sounds = loadSounds();
  let finish;
  const heard = [];
  const disconnect = sounds.connectSounds(() => new Promise((resolve) => { finish = resolve; }), () => {});
  sounds.playSound('notification', 'report:first');
  sounds.playSound('notification', 'report:second');
  disconnect();
  const nextDisconnect = sounds.connectSounds(async (kind) => { heard.push(kind); }, () => {});
  sounds.playSound('notification', 'report:first');
  finish();
  await tick();
  assert.deepEqual(heard, ['notification']);
  nextDisconnect();
});
