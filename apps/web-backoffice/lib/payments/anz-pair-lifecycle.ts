/**
 * ANZ Worldline TIM API — shared pair-lifecycle runner.
 *
 * Extracted from the dashboard implementation so the POS settings modal and the
 * backoffice dashboard both exercise the IDENTICAL pair code path (§3.1 of the
 * ANZ Validation Template — 04-JAN-2026). Eliminates the POS vs dashboard
 * divergence that caused POS pairing to fail while dashboard pairing worked.
 *
 * §3.1 Pairing flow:
 *  1. Create TerminalSettings (integratorId, guides=retail, protocolType=sixml,
 *     autoConnect/autoLogin/autoActivate=true, fetchBrands=true)
 *  2. new Terminal(settings) — immutable after construction
 *  3. setPosId + setUserId + addEcrData (ecrApplication + os) + setPrintOptions
 *  4. Subclass DefaultTerminalListener for robust callback handling (SDK calls
 *     every listener callback unconditionally; subclassing gives us safe defaults
 *     and avoids [SEVERE] TypeError spam in ANZ validation logs)
 *  5. transactionAsync($0.01 purchase) to trigger pre-automatisms
 *     (connect → login → activate). Cancel as soon as activateCompleted fires
 *     with brands and terminalId populated (GAP-8 criteria per SIX docs).
 *
 * Mixed-content caveat: browsers block ws:// from https:// origins to non-
 * loopback addresses. For LAN IPs we auto-route through the local Hardware
 * Bridge (ws://127.0.0.1:9999) which proxies to the real terminal. Even
 * loopback goes through the bridge because our ANZ EftSimulator speaks raw
 * TCP, not WebSocket — the bridge transparently bridges transports.
 *
 * Returns { viaBridge } on success, throws a descriptive Error on failure.
 */

import { getAnzLogSink } from './anz-log-sink';

/**
 * SIXml default port per the ANZ Worldline TIM API Integration Validation
 * Template (04-JAN-2026), section 3 — the log extract shows
 * connectionIPPort: 7784 and protocolType: sixml. Both real Castles
 * terminals and the EftSimulator listen on this port.
 */
export const ANZ_DEFAULT_PORT = 7784;

/** Integrator ID fallback when the environment variable is not set. */
export const ANZ_DEFAULT_INTEGRATOR_ID = 'd23f66c0-546b-482f-b8b6-cb351f94fd31';

/** ElevatedPOS software version shipped in EcrInfo. */
const ELEVATEDPOS_VERSION = '1.0.0';

/**
 * Detect a coarse operating system name for the second EcrInfo entry
 * (EcrInfoType.os). Required by the ANZ validation template so the bank
 * can see which OS the ECR is running on.
 */
function detectOsName(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua))  return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Android/i.test(ua))  return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Linux/i.test(ua))    return 'Linux';
  return 'Browser';
}

/**
 * Lazily loads /timapi/timapi.js into the page. Returns a promise that
 * resolves once `window.timapi.Terminal` is available. Subsequent callers
 * reuse the same in-flight promise so the SDK is only loaded once.
 *
 * Also wires FINEST log capture via window.onTimApiPublishLogRecord so
 * every SDK log record is persisted by the ANZ log sink for §4 submission
 * (TimApiYYYYMMDD.log).
 */
export function loadTimApiScript(): Promise<void> {
  const w = window as unknown as {
    timapi?: { Terminal?: unknown };
    onTimApiReady?: () => void;
    onTimApiPublishLogRecord?: (record: unknown) => void;
    __timapiLoading?: Promise<void>;
  };
  if (w.timapi && typeof w.timapi.Terminal === 'function') {
    return Promise.resolve();
  }
  if (w.__timapiLoading) return w.__timapiLoading;

  // GAP-3 / GAP-18: FINEST log wiring — install BEFORE the script loads so
  // we do not miss any early records. The sink persists records to IndexedDB
  // and lets users download them as TimApiYYYYMMDD.log for §4 submission.
  try {
    const sink = getAnzLogSink();
    w.onTimApiPublishLogRecord = (record: unknown) => {
      try { sink.append(record); } catch { /* non-fatal */ }
    };
  } catch { /* non-fatal — log sink is best-effort */ }

  w.__timapiLoading = new Promise<void>((resolve, reject) => {
    const safetyTimer = setTimeout(() => {
      if (w.timapi && typeof w.timapi.Terminal === 'function') {
        resolve();
      } else {
        delete w.__timapiLoading;
        reject(new Error('TIM API SDK took too long to initialize (20s)'));
      }
    }, 20_000);

    w.onTimApiReady = () => {
      clearTimeout(safetyTimer);
      if (w.timapi && typeof w.timapi.Terminal === 'function') {
        resolve();
      } else {
        delete w.__timapiLoading;
        reject(new Error('timapi.js loaded but window.timapi.Terminal is missing'));
      }
    };

    const script = document.createElement('script');
    script.src = '/timapi/timapi.js';
    script.async = true;
    script.onerror = () => {
      clearTimeout(safetyTimer);
      delete w.__timapiLoading;
      reject(new Error('Failed to load /timapi/timapi.js — ensure the file is in public/timapi/'));
    };
    document.head.appendChild(script);
  });
  return w.__timapiLoading;
}

/**
 * Safely assign a setting key that MAY or MAY NOT exist on this SDK build.
 * The 25_10/26_01 SDKs differ in which optional fields they accept; we try
 * to set them all and silently swallow "property not writable" errors.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function trySet(settings: any, key: string, value: unknown): void {
  try { settings[key] = value; } catch { /* ignore */ }
}

/**
 * Runs a real TIM API pair lifecycle against a specific terminal. Returns
 * on success or rejects with a descriptive error.
 *
 * §3.1 Pair validation criteria (ANZ Validation Template):
 *   - ECR connects to terminal on connectionIPPort=7784 with protocolType=sixml
 *   - integratorId is present in SystemInformation log record
 *   - fetchBrands=true so brands are populated after login
 *   - terminalId is reported after login
 *   - pre-automatism chain reaches activateCompleted without exception
 *
 * §3.13 Shutdown:
 *   - We cancel the phantom transaction as soon as activate succeeds, and
 *     dispose the Terminal instance in the finally block to release the
 *     WASM layer cleanly.
 */
export async function runTimPairLifecycle(
  ip: string,
  port: number,
  opts: { ecrName?: string; integratorId?: string } = {},
): Promise<{ viaBridge: boolean }> {
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  let effectiveIp   = ip;
  let effectivePort = port;
  let viaBridge     = false;

  if (isHttps) {
    const { isBridgeProxyReady, getBridgePort } = await import('@/lib/bridge-health');
    const bridgeReady = await isBridgeProxyReady(/* force */ true);
    if (bridgeReady) {
      effectiveIp   = '127.0.0.1';
      effectivePort = getBridgePort();
      viaBridge     = true;
    } else {
      throw new Error(
        'Hardware Bridge required — browsers block ws:// from HTTPS pages. ' +
        'Install the ElevatedPOS Hardware Bridge, or test from the POS device.',
      );
    }
  }

  await loadTimApiScript();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tim = (window as any).timapi;
  if (!tim || typeof tim.Terminal !== 'function') {
    throw new Error('TIM API SDK loaded but window.timapi.Terminal is missing');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let terminalRef: any = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      try {
        // ── 1. TerminalSettings ────────────────────────────────────────────
        const settings = new tim.TerminalSettings();
        settings.connectionIPString = effectiveIp;
        settings.connectionIPPort   = effectivePort;
        settings.integratorId       = opts.integratorId?.trim() || ANZ_DEFAULT_INTEGRATOR_ID;
        settings.autoCommit         = true;
        settings.fetchBrands        = true;
        settings.dcc                = false;
        settings.partialApproval    = false;
        settings.tipAllowed         = false;
        settings.enableKeepAlive    = true;

        // GAP-2: Explicit protocol type (sixml per ANZ validation log extract).
        // Note: we no longer enable autoConnect/autoLogin/autoActivate + rely on
        // a phantom transactionAsync to fire the pre-automatisms. That pattern
        // fails against real Castles S1F2 firmware (terminal ignores the
        // FeatureRequest that pre-automatisms wrap Login in). The ANZ-supplied
        // simple ECR example uses explicit connectAsync → loginAsync → activateAsync
        // and that is what works end-to-end on the live hardware. Do the same.
        trySet(settings, 'protocolType', tim.constants?.ProtocolType?.sixml);

        // Guides: retail is required for standard POS (SDK throws
        // invalidArgument if guides is undefined/empty).
        settings.guides = new Set([tim.constants.Guides.retail]);

        // ── 2. Terminal ────────────────────────────────────────────────────
        terminalRef = new tim.Terminal(settings);
        const t = terminalRef;

        // POS ID — max 6 digits per EP2 standard. Single-register deployment → "1"
        t.setPosId('1');
        t.setUserId(1);

        // ── 3. EcrInfo — TWO entries per ANZ validation (ecrApplication + os)
        const ecrApp = new tim.EcrInfo();
        ecrApp.type               = tim.constants.EcrInfoType.ecrApplication;
        ecrApp.name               = opts.ecrName ?? 'ElevatedPOS';
        ecrApp.manufacturerName   = 'ElevatedPOS Pty Ltd';
        ecrApp.version            = ELEVATEDPOS_VERSION;
        ecrApp.integratorSolution = 'ElevatedPOS-ANZ-v26-01';
        t.addEcrData(ecrApp);

        // GAP-7: second EcrInfo of type `os` — ANZ validation §3.1 requires
        // the ECR operating system to be reported in SystemInformation so
        // the bank can verify the deployment environment.
        try {
          const ecrOs = new tim.EcrInfo();
          ecrOs.type             = tim.constants.EcrInfoType.os;
          ecrOs.name             = detectOsName();
          ecrOs.manufacturerName = 'Browser';
          ecrOs.version          = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : 'unknown';
          t.addEcrData(ecrOs);
        } catch { /* non-fatal — os EcrInfo is best-effort */ }

        // ── 4. PrintOptions ────────────────────────────────────────────────
        // Frozen after construction — must pass all 4 constructor args.
        // Signature: new PrintOption(recipient, format, width, flags)
        t.setPrintOptions([
          new tim.PrintOption(tim.constants.Recipient.merchant,   tim.constants.PrintFormat.normal, 40, []),
          new tim.PrintOption(tim.constants.Recipient.cardholder, tim.constants.PrintFormat.normal, 40, []),
        ]);

        // ── 5. Listener — extend DefaultTerminalListener (GAP-4) ───────────
        // The WASM layer calls every listener callback via
        // forEach(each => each.xxxCompleted(...)); missing methods throw
        // TypeError and spam [SEVERE] in ANZ validation logs. Extending
        // DefaultTerminalListener inherits safe no-op defaults for every
        // callback, so we only need to override the ones we care about.
        let paired = false;
        timeoutId = setTimeout(() => {
          if (paired) return;
          try { t.cancel(); } catch { /* ignore */ }
          reject(new Error(`Connection timed out — no response from ${ip}:${port} after 30s`));
        }, 30_000);

        const DefaultBase = tim.DefaultTerminalListener;
        // eslint-disable-next-line @typescript-eslint/no-empty-function,@typescript-eslint/no-unused-vars
        const noop = (..._args: unknown[]) => {};
        // Build listener with safe no-op defaults for EVERY callback the
        // WASM layer may invoke. Two distinct patterns exist:
        //
        //   DefaultTerminalListener route: instantiate, then override. We
        //   copy methods from the prototype onto an own-property object so
        //   the WASM forEach(each => each.xxx(...)) always finds them.
        //
        //   Fallback route: explicit noop dict. Must include `disconnected`
        //   (NOT the same as `disconnectCompleted`) — the WASM fires
        //   TAWATerminalDisconnected → each.disconnected(...) on unexpected
        //   socket close, and a missing handler throws a [SEVERE] TypeError.
        //
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const listener: Record<string, any> = {};
        if (DefaultBase) {
          // Copy all methods from a fresh instance + its prototype chain
          // into own properties so they survive the WASM forEach.
          const base = new DefaultBase();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const allKeys = new Set<string>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let obj: any = base;
          while (obj && obj !== Object.prototype) {
            for (const key of Object.getOwnPropertyNames(obj)) {
              if (key !== 'constructor' && typeof obj[key] === 'function') {
                allKeys.add(key);
              }
            }
            obj = Object.getPrototypeOf(obj);
          }
          for (const key of allKeys) {
            listener[key] = base[key].bind(base);
          }
        }
        // Ensure every known callback is present (covers both SDK builds
        // that omit DefaultTerminalListener AND callbacks that it might
        // miss, e.g. `disconnected`).
        const requiredCallbacks = [
          'connectCompleted', 'disconnected', 'disconnectCompleted',
          'loginCompleted', 'logoutCompleted',
          'activateCompleted', 'deactivateCompleted',
          'transactionCompleted', 'commitCompleted', 'rollbackCompleted',
          'cancelCompleted', 'balanceCompleted',
          'terminalStatusChanged', 'applicationInformationCompleted',
          'applicationInformation', 'systemInformationCompleted',
          'reconciliationCompleted', 'reservationCompleted',
          'reconfigCompleted', 'counterRequestCompleted',
          'hardwareInformationCompleted', 'softwareUpdateCompleted',
          'printReceipts', 'referenceNumberRequest',
          'transactionInformationCompleted', 'errorNotification',
          'keyPressed',
        ];
        for (const cb of requiredCallbacks) {
          if (typeof listener[cb] !== 'function') listener[cb] = noop;
        }

        // ── Explicit lifecycle step handlers ─────────────────────────────────
        // Mirror the ANZ-supplied simple ECR example flow: connect → login →
        // activate, chained through listener callbacks. Each step's
        // `*Completed` callback either fires the next step or rejects with
        // the terminal-returned error. No phantom transaction is required.
        //
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rejectWith = (step: string, event: any): void => {
          if (paired) return;
          if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
          const exc = event?.exception;
          const code = exc?.resultCode;
          const codeStr = typeof code === 'string' ? code : (code?.name ?? '');
          const msg = exc?.message
            ?? (codeStr ? `${step} failed (${codeStr})` : `${step} failed`);
          reject(new Error(msg));
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        listener.connectCompleted = (event: any): void => {
          if (event?.exception !== undefined) { rejectWith('Connect', event); return; }
          try {
            if (typeof t.loginAsync === 'function') t.loginAsync();
            else rejectWith('Login', { exception: { message: 'loginAsync not available' } });
          } catch (err) {
            rejectWith('Login', { exception: { message: String(err) } });
          }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        listener.loginCompleted = (event: any): void => {
          if (event?.exception !== undefined) { rejectWith('Login', event); return; }
          try {
            if (typeof t.activateAsync === 'function') t.activateAsync();
            else rejectWith('Activate', { exception: { message: 'activateAsync not available' } });
          } catch (err) {
            rejectWith('Activate', { exception: { message: String(err) } });
          }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        listener.activateCompleted = (event: any, _data?: unknown): void => {
          if (event?.exception !== undefined) { rejectWith('Activate', event); return; }
          if (paired) return;

          // GAP-8: capture brands + terminalId for ANZ §3.1 validation evidence.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let terminalId = '';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let brands: any[] = [];
          try { terminalId = t.getTerminalId?.() ?? ''; } catch { /* non-fatal */ }
          try { brands     = t.getBrands?.()     ?? []; } catch { /* non-fatal */ }

          paired = true;
          if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }

          try {
            // eslint-disable-next-line no-console
            console.info('[ANZ-PAIR] activateCompleted', {
              terminalId,
              brandsCount: brands.length,
              hasBrands:   brands.length > 0,
            });
          } catch { /* non-fatal */ }

          resolve();
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        listener.disconnected = (_terminal: unknown, exception?: any): void => {
          if (paired) return;
          if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
          const msg = exception?.message ?? 'Terminal disconnected before pair completed';
          reject(new Error(msg));
        };

        t.addListener(listener);

        // ── 6. Explicit Connect → Login → Activate chain ─────────────────────
        // connectAsync() opens the WebSocket. Each subsequent step is fired
        // from the corresponding listener callback above when the prior step
        // completes successfully. This matches the ANZ simple ECR example
        // and is the flow that works against live Castles S1F2 hardware.
        if (typeof t.connectAsync === 'function') {
          t.connectAsync();
        } else {
          reject(new Error('connectAsync not available on this SDK build'));
        }
      } catch (innerErr) {
        reject(innerErr instanceof Error ? innerErr : new Error(String(innerErr)));
      }
    });

    return { viaBridge };
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (terminalRef && typeof terminalRef.cancel === 'function') {
      try { terminalRef.cancel(); } catch { /* ignore */ }
    }
    throw err;
  } finally {
    // GAP-13 (§3.13): Always dispose the Terminal to release WASM memory.
    // The pair lifecycle is a one-shot — holding the Terminal would leak on
    // every retry.
    if (terminalRef && typeof terminalRef.dispose === 'function') {
      try { terminalRef.dispose(); } catch { /* ignore */ }
    }
  }
}
