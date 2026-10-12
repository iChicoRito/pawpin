const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const { compileModsAsync, XML } = require('expo/config-plugins');
const withAndroidBackup = require('../plugins/with-android-backup.js');
const temporaryRoot = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA, 'Temp/opencode')
  : require('node:os').tmpdir();

test('Expo introspection preserves default backup domains and excludes only SecureStore in all modes', () => {
  const root = path.resolve(__dirname, '..');
  const generatedFiles = ['AndroidManifest.xml', 'res/xml/pawpin_backup_rules.xml', 'res/xml/pawpin_data_extraction_rules.xml'].map((file) => path.join(root, 'android/app/src/main', file));
  const before = generatedFiles.map((file) => fs.existsSync(file) ? fs.readFileSync(file) : null);
  const config = JSON.parse(execFileSync(process.execPath, [require.resolve('expo/bin/cli'), 'config', '--type', 'introspect', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  const manifest = config._internal.modResults.android.manifest.manifest;
  const application = manifest.application[0].$;
  assert.equal(application['android:allowBackup'], 'true');
  assert.equal(application['android:fullBackupContent'], '@xml/pawpin_backup_rules');
  assert.equal(application['android:dataExtractionRules'], '@xml/pawpin_data_extraction_rules');
  const legacy = config._internal.modResults.android.pawpin_backup_rules['full-backup-content'];
  const modern = config._internal.modResults.android.pawpin_data_extraction_rules['data-extraction-rules'];
  for (const rules of [legacy, modern['cloud-backup'][0], modern['device-transfer'][0]]) {
    assert.equal(rules.include, undefined, 'include allowlists would change default file/database/root/external/device domains');
    assert.deepEqual(rules.exclude, [{ $: { domain: 'sharedpref', path: 'SecureStore' } }]);
  }
  for (const name of ['pawpin_backup_rules', 'pawpin_data_extraction_rules']) {
    const xml = fs.readFileSync(path.join(root, 'plugins/android-backup', `${name}.xml`), 'utf8');
    assert.ok(!xml.includes('<include'));
    assert.ok(xml.includes('<exclude domain="sharedpref" path="SecureStore"'));
  }
  assert.deepEqual(generatedFiles.map((file) => fs.existsSync(file) ? fs.readFileSync(file) : null), before, 'introspection must not write generated native files');
});

test('backup plugin generates both resources idempotently only in an approved temporary native fixture', async () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, 'pawpin-phase10-backup-'));
  const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:name=".MainApplication" android:allowBackup="true"/></manifest>');
  for (let run = 0; run < 2; run++) {
    await compileModsAsync(withAndroidBackup({ name: 'PawPin', slug: 'PawPin' }), { projectRoot: root, platforms: ['android'] });
    const manifest = await XML.readXMLAsync({ path: manifestPath });
    const attrs = manifest.manifest.application[0].$;
    assert.equal(attrs['android:allowBackup'], 'true');
    assert.equal(attrs['android:fullBackupContent'], '@xml/pawpin_backup_rules');
    assert.equal(attrs['android:dataExtractionRules'], '@xml/pawpin_data_extraction_rules');
    for (const name of ['pawpin_backup_rules', 'pawpin_data_extraction_rules']) {
      const actual = await XML.readXMLAsync({ path: path.join(root, 'android/app/src/main/res/xml', `${name}.xml`) });
      const expected = await XML.readXMLAsync({ path: path.join(__dirname, '../plugins/android-backup', `${name}.xml`) });
      assert.deepEqual(actual, expected);
    }
  }
});

test('backup plugin refuses to replace an unrelated pre-existing policy', async () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, 'pawpin-phase10-policy-'));
  const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  for (const policy of ['@xml/custom_policy', '@xml/secure_store_custom_policy']) {
    fs.writeFileSync(manifestPath, `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:name=".MainApplication" android:fullBackupContent="${policy}"/></manifest>`);
    await assert.rejects(compileModsAsync(withAndroidBackup({ name: 'PawPin', slug: 'PawPin' }), { projectRoot: root, platforms: ['android'] }), /Custom Android backup policy requires review/);
    assert.ok(fs.readFileSync(manifestPath, 'utf8').includes(policy));
  }
});
