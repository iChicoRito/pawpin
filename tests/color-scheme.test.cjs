const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToString } = require('react-dom/server');
const { loadSource, hooks } = require('./load-source.cjs');

test('web color scheme renders light on server regardless of client preference', () => {
  const { useColorScheme } = loadSource('src/hooks/use-color-scheme.web.ts', {
    react: React, 'react-native': { useColorScheme: () => 'dark' },
  });
  const Probe = () => React.createElement('span', null, useColorScheme());
  assert.equal(renderToString(React.createElement(Probe)), '<span>light</span>');
});

test('web color scheme reads native scheme after hydration without effect state update', () => {
  const state = hooks();
  let serverSnapshot;
  const { useColorScheme } = loadSource('src/hooks/use-color-scheme.web.ts', {
    react: { ...state.react, useSyncExternalStore: (_subscribe, client, server) => {
      serverSnapshot = server();
      return client();
    } },
    'react-native': { useColorScheme: () => 'dark' },
  });
  assert.equal(useColorScheme(), 'dark');
  assert.equal(serverSnapshot, false);
});
