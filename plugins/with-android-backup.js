const fs = require('node:fs/promises');
const path = require('node:path');
const { AndroidConfig, BaseMods, XML, withAndroidManifest, withMod } = require('expo/config-plugins');

module.exports = function withAndroidBackup(config) {
  const resources = ['pawpin_backup_rules', 'pawpin_data_extraction_rules'];
  config = withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    for (const [attribute, resource, previousResource] of [
      ['android:fullBackupContent', resources[0], 'secure_store_backup_rules'],
      ['android:dataExtractionRules', resources[1], 'secure_store_data_extraction_rules'],
    ]) {
      const existing = application.$[attribute];
      if (existing && existing !== `@xml/${resource}` && existing !== `@xml/${previousResource}`) {
        throw new Error('Custom Android backup policy requires review before replacement.');
      }
      application.$[attribute] = `@xml/${resource}`;
    }
    return mod;
  });
  for (const resource of resources) {
    config = withMod(config, { platform: 'android', mod: resource, action: (mod) => mod });
    config = BaseMods.withGeneratedBaseMods(config, {
      platform: 'android',
      saveToInternal: true,
      providers: {
        [resource]: BaseMods.provider({
          isIntrospective: true,
          getFilePath: ({ modRequest }) => path.join(modRequest.platformProjectRoot, 'app/src/main/res/xml', `${resource}.xml`),
          read: () => XML.readXMLAsync({ path: path.join(__dirname, 'android-backup', `${resource}.xml`) }),
          write: async (filePath, { modResults, modRequest }) => {
            if (modRequest.introspect) return;
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await XML.writeXMLAsync({ path: filePath, xml: modResults });
          },
        }),
      },
    });
  }
  return config;
};
