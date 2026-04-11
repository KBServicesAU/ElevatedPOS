/**
 * Expo config plugin — USB thermal printer support on Android.
 *
 * react-native-thermal-receipt-printer requires a <receiver> element in
 * AndroidManifest.xml to handle the USB permission broadcast. Without it
 * the native module throws an unhandled exception when requesting USB
 * device access, crashing the app before JavaScript can catch it.
 *
 * Also ensures the USB_PERMISSION custom permission is declared so the
 * PendingIntent created by the library resolves correctly on Android 12+.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withUsbPrinter(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const app = manifest.application?.[0];
    if (!app) return config;

    // Ensure receiver array exists
    if (!app.receiver) app.receiver = [];

    // Add the USB permission receiver if not already present
    const ACTION = 'com.pinmi.react.USB_PERMISSION';
    const alreadyAdded = app.receiver.some(
      (r) => r.$?.['android:name'] === 'com.pinmi.react.printer.RNUSBReceiver',
    );
    if (!alreadyAdded) {
      app.receiver.push({
        $: {
          'android:name': 'com.pinmi.react.printer.RNUSBReceiver',
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': ACTION } }],
          },
        ],
      });
    }

    return config;
  });
};
