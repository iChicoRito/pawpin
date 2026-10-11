const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('./load-source.cjs');

test('foreground push uses report-ID feedback without a second system sound; background keeps system alerts', async () => {
  let handler;
  let state = 'active';
  const heard = [];
  loadSource('src/lib/alerts.ts', {
    '@react-native-async-storage/async-storage': {},
    'expo-notifications': { setNotificationHandler(value) { handler = value; } },
    'expo-router': {}, react: require('react'),
    'react-native': { AppState: { get currentState() { return state; } }, Platform: { OS: 'android' } },
    '@/lib/supabase': {},
    '@/lib/sounds': { playSound: (...args) => heard.push(args) },
  });
  const report = { request: { content: { data: { reportId: 'new-report' } } } };
  const foreground = await handler.handleNotification(report);
  assert.equal(foreground.shouldPlaySound, false);
  assert.equal(foreground.shouldShowList, true);
  assert.deepEqual(heard, [['notification', 'report:new-report']]);
  state = 'background';
  const background = await handler.handleNotification(report);
  assert.equal(background.shouldPlaySound, true);
  assert.equal(background.shouldShowBanner, true);
  assert.equal(heard.length, 1);
  state = 'active';
  const unrelated = await handler.handleNotification({ request: { content: { data: {} } } });
  assert.equal(unrelated.shouldPlaySound, true, 'only report alerts replace system audio');
});
