/**
 * Expo config plugin — USB thermal printer support on Android.
 *
 * Does three things:
 *
 * 1. Adds the USB broadcast receiver to AndroidManifest.xml so the library's
 *    PendingIntent resolves correctly when USB permission is granted.
 *
 * 2. Writes res/xml/usb_device_filter.xml covering common thermal printer
 *    VID/PID combinations (iMin M2/D4, Epson, Star, Bixolon, Sunmi, generic
 *    ESC/POS chips). Android auto-grants USB permission for listed devices,
 *    removing the per-session permission dialog.
 *
 * 3. Adds android.hardware.usb.host <uses-feature> and the matching
 *    USB_DEVICE_ATTACHED intent-filter on the main activity so Android
 *    launches the app and grants permission when the printer is plugged in.
 */
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

// ─── Device filter XML ────────────────────────────────────────────────────────
// vendor-id and product-id are DECIMAL (not hex) as required by Android.
// 0x0483 = 1155  (STMicroelectronics — iMin M2 internal printer)
// 0x28e9 = 10473 (GD32 — iMin D3/D4 internal printer)
// 0x04b8 = 1208  (Seiko Epson)
// 0x0519 = 1305  (Star Micronics)
// 0x1504 = 5380  (Bixolon)
// 0x0dd4 = 3540  (Custom Engineering)
// 0x154f = 5455  (Sunmi T2 mini)
// 0x0456 = 1110  (Analog Devices / common ESC/POS chip)
// 0x0416 = 1046  (Winbond / generic)
// 0x20d1 = 8401  (Hoin / generic ESC/POS)
// 0x1fc9 = 8137  (NXP / generic)
// 0xffff = 65535 (wildcard vendor — broad fallback)

const DEVICE_FILTER_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- iMin M2 / M2 Pro internal thermal printer (STM32 USB CDC) -->
    <usb-device vendor-id="1155" product-id="22336" />
    <usb-device vendor-id="1155" product-id="22337" />
    <usb-device vendor-id="1155" />

    <!-- iMin D3 / D4 / Swan1 internal printer (GD32) -->
    <usb-device vendor-id="10473" />

    <!-- Sunmi T2 mini / V2 Pro internal printer -->
    <usb-device vendor-id="5455" />

    <!-- Seiko Epson TM series -->
    <usb-device vendor-id="1208" />

    <!-- Star Micronics TSP/mPOP series -->
    <usb-device vendor-id="1305" />

    <!-- Bixolon SRP series -->
    <usb-device vendor-id="5380" />

    <!-- Custom Engineering (used in many generic ESC/POS printers) -->
    <usb-device vendor-id="3540" />

    <!-- Winbond / generic ESC/POS chipsets -->
    <usb-device vendor-id="1046" />

    <!-- Hoin (common in budget ESC/POS printers) -->
    <usb-device vendor-id="8401" />

    <!-- NXP USB controller -->
    <usb-device vendor-id="8137" />
</resources>
`;

// ─── Plugin ───────────────────────────────────────────────────────────────────

function withUsbDeviceFilter(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const xmlDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');

      // The android/ folder only exists after `expo prebuild`. If it's not there
      // yet (EAS cloud build) we skip — EAS runs prebuild before this plugin.
      if (!fs.existsSync(path.join(projectRoot, 'android'))) {
        console.log('[withUsbPrinter] android/ not found — skipping device filter write (EAS will handle it)');
        return cfg;
      }

      fs.mkdirSync(xmlDir, { recursive: true });
      const dest = path.join(xmlDir, 'usb_device_filter.xml');
      fs.writeFileSync(dest, DEVICE_FILTER_XML, 'utf8');
      console.log('[withUsbPrinter] Wrote usb_device_filter.xml');
      return cfg;
    },
  ]);
}

function withUsbManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // ── 1. <uses-feature android:name="android.hardware.usb.host"> ──────────
    if (!manifest['uses-feature']) manifest['uses-feature'] = [];
    const hasUsbHost = manifest['uses-feature'].some(
      (f) => f.$?.['android:name'] === 'android.hardware.usb.host',
    );
    if (!hasUsbHost) {
      manifest['uses-feature'].push({
        $: { 'android:name': 'android.hardware.usb.host' },
      });
    }

    const app = manifest.application?.[0];
    if (!app) return cfg;

    // ── 2. BroadcastReceiver for USB permission result ───────────────────────
    if (!app.receiver) app.receiver = [];
    const ACTION = 'com.pinmi.react.USB_PERMISSION';
    const hasReceiver = app.receiver.some(
      (r) => r.$?.['android:name'] === 'com.pinmi.react.printer.RNUSBReceiver',
    );
    if (!hasReceiver) {
      app.receiver.push({
        $: {
          'android:name': 'com.pinmi.react.printer.RNUSBReceiver',
          'android:exported': 'false',
        },
        'intent-filter': [
          { action: [{ $: { 'android:name': ACTION } }] },
        ],
      });
    }

    // ── 3. USB_DEVICE_ATTACHED intent-filter on main activity ────────────────
    // This makes Android auto-launch the app AND auto-grant permission when
    // a matching USB device (from device_filter.xml) is plugged in.
    const activities = app.activity ?? [];
    const mainActivity = activities.find(
      (a) =>
        a['intent-filter']?.some((f) =>
          f.action?.some(
            (act) => act.$?.['android:name'] === 'android.intent.action.MAIN',
          ),
        ),
    );

    if (mainActivity) {
      const alreadyHasUsbFilter = mainActivity['intent-filter']?.some((f) =>
        f.action?.some(
          (act) =>
            act.$?.['android:name'] === 'android.hardware.usb.action.USB_DEVICE_ATTACHED',
        ),
      );

      if (!alreadyHasUsbFilter) {
        if (!mainActivity['intent-filter']) mainActivity['intent-filter'] = [];
        mainActivity['intent-filter'].push({
          action: [
            {
              $: {
                'android:name':
                  'android.hardware.usb.action.USB_DEVICE_ATTACHED',
              },
            },
          ],
          'meta-data': [
            {
              $: {
                'android:name':
                  'android.hardware.usb.action.USB_DEVICE_ATTACHED',
                'android:resource': '@xml/usb_device_filter',
              },
            },
          ],
        });
      }
    }

    return cfg;
  });
}

module.exports = function withUsbPrinter(config) {
  config = withUsbDeviceFilter(config);
  config = withUsbManifest(config);
  return config;
};
