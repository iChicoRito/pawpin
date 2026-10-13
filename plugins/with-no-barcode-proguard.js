const fs = require('node:fs/promises');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

// The camera's barcode scanner is switched off in app.json, so its classes are not in the build.
// The minify step stops on the camera code that still names them unless it is told not to mind.
const RULES = `
# PawPin: barcode scanner is off (expo-camera barcodeScannerEnabled: false)
-dontwarn com.google.mlkit.vision.barcode.**
-dontwarn com.google.mlkit.vision.codescanner.**
`;

module.exports = function withNoBarcodeProguard(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const file = path.join(mod.modRequest.platformProjectRoot, 'app/proguard-rules.pro');
      const current = await fs.readFile(file, 'utf8');
      if (!current.includes(RULES)) await fs.writeFile(file, current + RULES);
      return mod;
    },
  ]);
};
