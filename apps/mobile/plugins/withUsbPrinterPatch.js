/**
 * Expo config plugin — patch react-native-thermal-receipt-printer
 * for Android 13+ compatibility and crash safety.
 *
 * Four bugs fixed in USBPrinterAdapter.java:
 *
 * 1. registerReceiver() on Android 13 (API 33) requires RECEIVER_NOT_EXPORTED
 *    or RECEIVER_EXPORTED flag, otherwise throws SecurityException that escapes
 *    the RN bridge and hard-crashes the app.
 *
 * 2. init() registers the BroadcastReceiver every time it is called (on scan
 *    AND on connect). The second registration with the same receiver object
 *    causes IllegalArgumentException on some firmware, also a hard crash.
 *
 * 3. onReceive() dereferences the EXTRA_DEVICE UsbDevice without a null check.
 *    On some devices / Android firmware the extra can be absent, producing an
 *    NPE on the main thread that hard-crashes the app.
 *
 * 4. printRawData() spawns a background thread with no try-catch. If
 *    openConnection() returns true but leaves mEndPoint/mUsbDeviceConnection
 *    null (the function has a bug where it returns true when no bulk-OUT
 *    endpoint is found), the subsequent bulkTransfer() NPEs and the uncaught
 *    exception on the background thread hard-crashes the app.
 *
 * This plugin rewrites the affected methods in the compiled Java source before
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

// ─── Patch 2: onReceive null-check for EXTRA_DEVICE ─────────────────────────
// When the USB permission broadcast fires, EXTRA_DEVICE can occasionally be
// absent (device disconnected between the request and the grant).  Both
// branches of the if/else dereference the variable without a guard, causing
// an NPE on the main thread → hard crash.

const ORIGINAL_ON_RECEIVE = `                    UsbDevice usbDevice = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        Log.i(LOG_TAG, "success to grant permission for device " + usbDevice.getDeviceId() + ", vendor_id: " + usbDevice.getVendorId() + " product_id: " + usbDevice.getProductId());
                        mUsbDevice = usbDevice;
                    } else {
                        Toast.makeText(context, "User refuses to obtain USB device permissions" + usbDevice.getDeviceName(), Toast.LENGTH_LONG).show();
                    }`;

const PATCHED_ON_RECEIVE = `                    UsbDevice usbDevice = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    if (usbDevice == null) {
                        Log.w(LOG_TAG, "USB_PERMISSION broadcast missing EXTRA_DEVICE — ignoring");
                        return;
                    }
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        Log.i(LOG_TAG, "success to grant permission for device " + usbDevice.getDeviceId() + ", vendor_id: " + usbDevice.getVendorId() + " product_id: " + usbDevice.getProductId());
                        mUsbDevice = usbDevice;
                    } else {
                        Toast.makeText(context, "User refuses to obtain USB device permissions" + usbDevice.getDeviceName(), Toast.LENGTH_LONG).show();
                    }`;

// ─── Patch 3: printRawData background thread try-catch ───────────────────────
// The background thread has no error handling.  If openConnection() returns
// true but leaves mUsbDeviceConnection or mEndPoint null (see patch 4 below),
// bulkTransfer() throws NPE on the background thread which is not caught by
// the React Native bridge → hard crash.

const ORIGINAL_PRINT_THREAD = `            new Thread(new Runnable() {
                @Override
                public void run() {
                    byte[] bytes = Base64.decode(rawData, Base64.DEFAULT);
                    int b = mUsbDeviceConnection.bulkTransfer(mEndPoint, bytes, bytes.length, 100000);
                    Log.i(LOG_TAG, "Return Status: b-->" + b);
                }
            }).start();`;

const PATCHED_PRINT_THREAD = `            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        byte[] bytes = Base64.decode(rawData, Base64.DEFAULT);
                        int b = mUsbDeviceConnection.bulkTransfer(mEndPoint, bytes, bytes.length, 100000);
                        Log.i(LOG_TAG, "Return Status: b-->" + b);
                    } catch (Exception e) {
                        Log.e(LOG_TAG, "printRawData thread error: " + e.getMessage());
                    }
                }
            }).start();`;

// ─── Patch 4: openConnection() returns false when no bulk-OUT endpoint found ─
// The method iterates over USB endpoints looking for a bulk-OUT endpoint.  If
// none is found it falls through and returns `true`, leaving mEndPoint and
// mUsbDeviceConnection as null.  The subsequent bulkTransfer(null, …) in the
// background thread NPEs → hard crash.  The correct return value is false.

// Note: only the final `return true` (after the endpoint loop) is matched here.
// The unique anchor after openConnection() is `public void printRawData`.
const ORIGINAL_OPEN_CONN_RETURN = `        return true;
    }


    public void printRawData`;

const PATCHED_OPEN_CONN_RETURN = `        return false; // No bulk OUT endpoint found
    }


    public void printRawData`;

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
      let changed = false;

      // Patch 1: init() — Android 13+ registerReceiver flag + double-registration guard
      if (!content.includes('mReceiverRegistered')) {
        if (!content.includes('mContext.registerReceiver(mUsbDeviceReceiver, filter);')) {
          console.warn('[withUsbPrinterPatch] Patch 1 target not found — library may have changed');
        } else {
          content = content.replace(ORIGINAL_INIT, PATCHED_INIT);
          console.log('[withUsbPrinterPatch] Patch 1 applied: init() Android 13+ compat');
          changed = true;
        }
      }

      // Patch 2: onReceive() — null check for EXTRA_DEVICE
      if (!content.includes('USB_PERMISSION broadcast missing EXTRA_DEVICE')) {
        if (!content.includes('UsbDevice usbDevice = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);')) {
          console.warn('[withUsbPrinterPatch] Patch 2 target not found — library may have changed');
        } else {
          content = content.replace(ORIGINAL_ON_RECEIVE, PATCHED_ON_RECEIVE);
          console.log('[withUsbPrinterPatch] Patch 2 applied: onReceive() null-check');
          changed = true;
        }
      }

      // Patch 3: printRawData() — background thread try-catch
      if (!content.includes('printRawData thread error')) {
        if (!content.includes('mUsbDeviceConnection.bulkTransfer(mEndPoint, bytes, bytes.length, 100000);')) {
          console.warn('[withUsbPrinterPatch] Patch 3 target not found — library may have changed');
        } else {
          content = content.replace(ORIGINAL_PRINT_THREAD, PATCHED_PRINT_THREAD);
          console.log('[withUsbPrinterPatch] Patch 3 applied: printRawData() thread try-catch');
          changed = true;
        }
      }

      // Patch 4: openConnection() — fix incorrect return true when no endpoint found
      if (!content.includes('No bulk OUT endpoint found')) {
        if (!content.includes('public void printRawData')) {
          console.warn('[withUsbPrinterPatch] Patch 4 target not found — library may have changed');
        } else {
          const before = content;
          content = content.replace(ORIGINAL_OPEN_CONN_RETURN, PATCHED_OPEN_CONN_RETURN);
          if (content === before) {
            console.warn('[withUsbPrinterPatch] Patch 4 string not matched — indentation may differ');
          } else {
            console.log('[withUsbPrinterPatch] Patch 4 applied: openConnection() endpoint-not-found returns false');
            changed = true;
          }
        }
      }

      if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('[withUsbPrinterPatch] USBPrinterAdapter.java patched successfully (all applicable patches)');
      } else {
        console.log('[withUsbPrinterPatch] All patches already applied — skipping');
      }

      return config;
    },
  ]);
};
