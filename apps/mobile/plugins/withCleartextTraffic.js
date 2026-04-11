/**
 * Expo config plugin — allow cleartext (plain HTTP) traffic on Android.
 *
 * Required for ANZ Worldline TIM integration: the terminal runs a local
 * HTTP server (not HTTPS) on the LAN, and Android 9+ blocks all
 * cleartext traffic by default.
 *
 * Sets android:usesCleartextTraffic="true" on the <application> element.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:usesCleartextTraffic'] = 'true';
    }
    return config;
  });
};
