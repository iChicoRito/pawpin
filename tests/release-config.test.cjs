const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./load-source.cjs');

test('production environment explicit; Firebase file env overrides only existing file path', () => {
  const config = require('../app.json').expo;
  assert.equal(require('../eas.json').build.production.environment, 'production');
  const dynamic = loadSource('app.config.ts').default;
  const previous = process.env.GOOGLE_SERVICES_JSON;
  try {
    delete process.env.GOOGLE_SERVICES_JSON;
    assert.deepEqual(dynamic({ config }), config);
    process.env.GOOGLE_SERVICES_JSON = 'C:/fixture/google-services.json';
    assert.deepEqual(dynamic({ config }), {
      ...config,
      android: { ...config.android, googleServicesFile: 'C:/fixture/google-services.json' },
    });
    assert.equal(config.android.googleServicesFile, './google-services.json');
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_SERVICES_JSON;
    else process.env.GOOGLE_SERVICES_JSON = previous;
  }
});
