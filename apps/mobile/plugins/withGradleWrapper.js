/**
 * Expo config plugin — patch gradle-wrapper.properties after prebuild.
 *
 * The React Native template always generates gradle-X.X-all.zip which is
 * ~180 MB and frequently times out on EAS build workers with cold caches.
 * This plugin rewrites it to use the -bin distribution (~120 MB, no sources
 * or docs) and raises the networkTimeout to 60 s.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withGradleWrapper(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const propsPath = path.join(
        config.modRequest.projectRoot,
        'android',
        'gradle',
        'wrapper',
        'gradle-wrapper.properties',
      );

      if (!fs.existsSync(propsPath)) return config;

      let contents = fs.readFileSync(propsPath, 'utf8');

      // Switch -all distribution to -bin (smaller, faster to download)
      contents = contents.replace(/-all\.zip/, '-bin.zip');

      // Raise the network timeout from 10 s to 60 s
      contents = contents.replace(/networkTimeout=\d+/, 'networkTimeout=60000');

      fs.writeFileSync(propsPath, contents, 'utf8');
      return config;
    },
  ]);
};
