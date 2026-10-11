const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, effectHooks } = require('./load-source.cjs');

test('visible feedback sounds on opening or a changed message, not every render', () => {
  const state = effectHooks();
  const heard = [];
  const { useSoundOnVisible } = loadSource('src/hooks/use-feedback.ts', {
    react: state.react,
    'heroui-native': {},
    '@/lib/sounds': { playSound: (kind) => heard.push(kind) },
  });
  const render = (trigger, kind = 'error') => state.render(() => useSoundOnVisible(kind, trigger));
  render(false);
  render('Could not load');
  render('Could not load');
  render('Could not save');
  render(false);
  render(true, 'confirmation');
  assert.deepEqual(heard, ['error', 'error', 'confirmation']);
});

test('toast feedback maps success and error variants while preserving explicit sound overrides', () => {
  const heard = [];
  const shown = [];
  const { useFeedbackToast } = loadSource('src/hooks/use-feedback.ts', {
    react: {},
    'heroui-native': { useToast: () => ({ toast: { show: (options) => shown.push(options), hide() {} } }) },
    '@/lib/sounds': { playSound: (kind) => heard.push(kind) },
  });
  const { toast } = useFeedbackToast();
  toast.show({ variant: 'success', label: 'Report sent', sound: 'success' });
  toast.show({ variant: 'danger', label: 'Report not sent' });
  toast.show({ variant: 'success', label: 'Report closed' });
  toast.show({ label: 'Information' });
  toast.show({ variant: 'success', label: 'Confirmation', sound: 'confirmation' });
  assert.deepEqual(heard, ['success', 'error', 'success', 'confirmation']);
  assert.equal(shown.length, 5);
  assert.equal(shown[0].label, 'Report sent');
  assert.equal('sound' in shown[0], false, 'sound option must not leak into HeroUI');
  assert.equal(typeof toast.hide, 'function');
});
