/**
 * Expo config plugin — patch react-native-thermal-receipt-printer
 * for Android 13+ compatibility.
 *
 * Two bugs fixed in USBPrinterAdapter.java:
 *
 * 1. registerReceiver() on Android 13 (API 33) requires RECEIVER_NOT_EXPORTED
 *    or RECEIVER_EXPORTED flag, otherwise throws SecurityException that escapes
 *    the RN bridge and hard-crashes the app.
 *
 * 2. init() registers the BroadcastReceiver every time it is called (on scan
 *    AND on connect). The second registration with the same receiver object
 *    causes IllegalArgumentException on some firmware, also a hard crash.
 *
 * This plugin rewrites the affected method in the compiled Java source before
 * the Gradle build runs, so the native module gets the fixed code.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const RELATIVE_TARGET = path.join(
  'node_modules',
  'react-native-thermal-receipt-printer',
  'android',
  'src',
  'main',
  'java',
  'com',
  'pinmi',
  'react',
  'printer',
  'adapter',
  'USBPrinterAdapter.java',
);

const ORIGINAL_INIT = `    public void init(ReactApplicationContext reactContext, Callback successCallback, Callback errorCallback) {
        this.mContext = reactContext;
        this.mUSBManager = (UsbManager) this.mContext.getSystemService(Context.USB_SERVICE);
        this.mPermissionIndent = PendingIntent.getBroadcast(mContext, 0, new Intent(ACTION_USB_PERMISSION), PendingIntent.FLAG_MUTABLE);
        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        filter.addAction(UsbManager.ACTION_USB_ACCESSORY_ATTACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        mContext.registerReceiver(mUsbDeviceReceiver, filter);
        Log.v(LOG_TAG, "RNUSBPrinter initialized");
        successCallback.invoke();
    }`;

const PATCHED_INIT = `    private boolean mReceiverRegistered = false;

    public void init(ReactApplicationContext reactContext, Callback successCallback, Callback errorCallback) {
        this.mContext = reactContext;
        this.mUSBManager = (UsbManager) this.mContext.getSystemService(Context.USB_SERVICE);
        this.mPermissionIndent = PendingIntent.getBroadcast(mContext, 0, new Intent(ACTION_USB_PERMISSION),
            android.os.Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        if (!mReceiverRegistered) {
            IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
            filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
            filter.addAction(UsbManager.ACTION_USB_ACCESSORY_ATTACHED);
            filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                mContext.registerReceiver(mUsbDeviceReceiver, filter, android.content.Context.RECEIVER_NOT_EXPORTED);
            } else {
                mContext.registerReceiver(mUsbDeviceReceiver, filter);
            }
            mReceiverRegistered = true;
        }
        Log.v(LOG_TAG, "RNUSBPrinter initialized");
        successCallback.invoke();
    }`;

module.exports = function withUsbPrinterPatch(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      // Handle both monorepo-hoisted (../../node_modules) and local installs (node_modules)
      const candidates = [
        path.join(projectRoot, RELATIVE_TARGET),
        path.join(projectRoot, '..', '..', RELATIVE_TARGET),
        path.join(projectRoot, '..', RELATIVE_TARGET),
      ];
      const filePath = candidates.find((p) => fs.existsSync(p));

      if (!filePath) {
        console.warn('[withUsbPrinterPatch] USBPrinterAdapter.java not found — skipping patch');
        return config;
      }

      let content = fs.readFileSync(filePath, 'utf8');

      if (content.includes('mReceiverRegistered')) {
        console.log('[withUsbPrinterPatch] Already patched — skipping');
        return config;
      }

      if (!content.includes('mContext.registerReceiver(mUsbDeviceReceiver, filter);')) {
        console.warn('[withUsbPrinterPatch] Expected patch target not found — library may have changed');
        return config;
      }

      content = content.replace(ORIGINAL_INIT, PATCHED_INIT);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('[withUsbPrinterPatch] Patched USBPrinterAdapter.java for Android 13+ compatibility');

      return config;
    },
  ]);
};
