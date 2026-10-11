const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, effectHooks } = require('./load-source.cjs');

const tick = () => new Promise((resolve) => setImmediate(resolve));

function audioRoot() {
  const state = effectHooks();
  const sounds = loadSource('src/lib/sounds.ts');
  const events = [];
  let appChange;
  let userId = 'first-account';
  let rejectPlay = false;
  const players = new Map();
  function createPlayer(name) {
    let status;
    let released = false;
    const player = {
      seekTo: async (time) => { events.push(`${name}:seek:${time}`); },
      play() {
        if (rejectPlay) throw new Error('No audio device');
        events.push(`${name}:play`);
      },
      pause() {
        if (released) throw new Error('Cannot use shared object that was already released');
        events.push(`${name}:pause`);
      },
      release() { released = true; events.push(`${name}:release`); },
      addListener(event, listener) {
        assert.equal(event, 'playbackStatusUpdate');
        status = listener;
        return { remove() { status = undefined; } };
      },
      finish() { status?.({ didJustFinish: true }); },
    };
    players.set(name, player);
    return player;
  }
  const { SoundEffects } = loadSource('src/components/sound-effects.tsx', {
    react: state.react,
    'react-native': { AppState: {
      currentState: 'active',
      addEventListener(_type, listener) { appChange = listener; return { remove() {} }; },
    } },
    'expo-audio': {
      useAudioPlayer: (name) => {
        const player = players.get(name) ?? createPlayer(name);
        state.react.useEffect(() => () => player.release(), []);
        return player;
      },
      createAudioPlayer: createPlayer,
      setAudioModeAsync: async (mode) => {
        assert.equal(mode.shouldPlayInBackground, false);
        assert.equal(mode.playsInSilentMode, false);
        assert.equal(mode.interruptionMode, 'mixWithOthers');
      },
    },
    '@/hooks/use-session': { useSession: () => ({ session: { user: { id: userId } } }) },
    '@/lib/sounds': sounds,
    '../../assets/sounds/success-chime.mp3': 'success',
    '../../assets/sounds/error-003.mp3': 'error',
    '../../assets/sounds/notification-pop.mp3': 'notification',
    '../../assets/sounds/question-001.mp3': 'confirmation',
  });
  return {
    render: () => state.render(SoundEffects), unmount: state.unmount,
    sounds, players, events,
    background: () => appChange('background'),
    switchAccount() { userId = 'second-account'; },
    failPlay() { rejectPlay = true; },
  };
}

test('native feedback rewinds the correct sound and waits for completion before the next one', async () => {
  const root = audioRoot();
  root.render();
  root.sounds.playSound('success');
  root.sounds.playSound('error');
  await tick();
  assert.deepEqual(root.events, ['success:seek:0', 'success:play']);
  root.players.get('success').finish();
  await tick();
  assert.deepEqual(root.events, ['success:seek:0', 'success:play', 'error:seek:0', 'error:play']);
  root.players.get('error').finish();
  root.unmount();
});

test('native background and account changes stop playback and discard pending cues', async () => {
  const root = audioRoot();
  root.render();
  root.sounds.playSound('notification', 'report:one');
  root.sounds.playSound('notification', 'report:two');
  await tick();
  root.background();
  await tick();
  assert.equal(root.events.filter((event) => event.endsWith(':play')).length, 1);
  for (const name of ['success', 'error', 'notification', 'confirmation']) {
    assert.ok(root.events.includes(`${name}:pause`));
  }
  root.switchAccount();
  root.render();
  root.unmount();
});

test('synchronous native playback failure releases the queue and reports the audio problem', async (t) => {
  const warning = t.mock.method(console, 'warn', () => {});
  const root = audioRoot();
  root.render();
  root.failPlay();
  root.sounds.playSound('error');
  await tick();
  assert.equal(warning.mock.callCount(), 1);
  root.unmount();
});

test('feedback stops before releasing native players on unmount and account change', async () => {
  const root = audioRoot();
  root.render();
  root.sounds.playSound('confirmation');
  await tick();
  root.switchAccount();
  assert.doesNotThrow(root.render);
  for (const name of ['success', 'error', 'notification', 'confirmation']) {
    assert.ok(root.events.indexOf(`${name}:pause`) < root.events.indexOf(`${name}:release`), name);
  }
  assert.equal(root.events.filter((event) => event.endsWith(':release')).length, 4);
  assert.doesNotThrow(root.unmount);
  assert.equal(root.events.filter((event) => event.endsWith(':release')).length, 8);
});
