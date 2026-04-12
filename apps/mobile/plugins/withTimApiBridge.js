/**
 * Expo config plugin — copy ANZ TIM API bridge files to Android assets.
 *
 * Copies the contents of apps/mobile/assets/timapi/ into the Android
 * build's assets/timapi/ folder so the hidden WebView can load them
 * via file:///android_asset/timapi/timapi-bridge.html
 *
 * Required files (place in apps/mobile/assets/timapi/):
 *   - timapi-bridge.html  (bundled in this repo)
 *   - timapi.js           (obtain from ANZ Worldline portal)
 *   - timapi.wasm         (obtain from ANZ Worldline portal)
 */
const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

module.exports = function withTimApiBridge(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;

      // Source: apps/mobile/assets/timapi/
      const src = path.join(projectRoot, 'assets', 'timapi');

      // Destination: android/app/src/main/assets/timapi/
      const dst = path.join(
        cfg.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'assets', 'timapi',
      );

      if (!fs.existsSync(src)) {
        console.warn('[withTimApiBridge] assets/timapi/ not found — skipping');
        return cfg;
      }

      fs.mkdirSync(dst, { recursive: true });

      const files = fs.readdirSync(src);
      let copied = 0;
      for (const file of files) {
        const srcFile = path.join(src, file);
        const dstFile = path.join(dst, file);
        fs.copyFileSync(srcFile, dstFile);
        copied++;
      }

      console.log(`[withTimApiBridge] Copied ${copied} file(s) to android assets/timapi/`);
      return cfg;
    },
  ]);
};
