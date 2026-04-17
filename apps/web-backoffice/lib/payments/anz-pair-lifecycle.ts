/**
 * ANZ Worldline TIM API — pair-lifecycle runner.
 *
 * This module mirrors the ANZ-supplied JavaScript SDK simple ECR example
 * (`Examples/ExampleECRSimple/app.js`) VERBATIM. The ANZ example is what
 * works end-to-end against live Castles S1F2 hardware; any deviation from
 * it (extra settings, custom integratorId, a phantom transactionAsync to
 * kick off pre-automatisms, wrapping the listener as a plain object
 * instead of a DefaultTerminalListener subclass, etc.) has proven to stall
 * the pair flow. The only thing we add on top is a bridge-routing wrapper
 * so an HTTPS-origin browser can reach the terminal through the local
 * Hardware Bridge.
 *
 * Flow mirrors the ANZ example:
 *  1. new TerminalSettings() — only IP + port + fetchBrands=false +
 *     autoCommit=false, nothing else.
 *  2. new Terminal(settings) — immutable after construction.
 *  3. setPosId("12") + setUserId(1) — matching the example values.
 *  4. Listener extends `timapi.DefaultTerminalListener` so every callback
 *     the WASM layer may invoke has a sensible default. We override the
 *     callbacks needed to chain Connect → Login → Activate.
 *  5. connectAsync() → loginAsync() → activateAsync() — explicit, driven
 *     from each *Completed callback. No phantom transaction.
 */

import { getAnzLogSink } from './anz-log-sink';

/** Default SIXml port for the ANZ Worldline TIM API. */
export const ANZ_DEFAULT_PORT = 7784;

/** Integrator ID fallback (not set on TerminalSettings — the ANZ simple
 *  example doesn't set one, and the live terminal doesn't require it). */
export const ANZ_DEFAULT_INTEGRATOR_ID = 'd23f66c0-546b-482f-b8b6-cb351f94fd31';

/**
 * Lazily loads /timapi/timapi.js into the page. Returns a promise that
 * resolves once `window.timapi.Terminal` is available.
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

  // Wire FINEST log capture before loading the script so we don't miss
  // any early records.
  try {
    const sink = getAnzLogSink();
    w.onTimApiPublishLogRecord = (record: unknown) => {
      try { sink.append(record); } catch { /* non-fatal */ }
    };
  } catch { /* non-fatal */ }

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
 * Runs the ANZ-example pair lifecycle against a specific terminal.
 * Returns `{ viaBridge }` on success; rejects with a descriptive Error on
 * failure.
 */
export async function runTimPairLifecycle(
  ip: string,
  port: number,
  _opts: { ecrName?: string; integratorId?: string } = {},
): Promise<{ viaBridge: boolean }> {
  // ── Bridge routing ────────────────────────────────────────────────────
  // HTTPS origins cannot open ws:// to non-loopback addresses, and our
  // EftSimulator + real Castles S1F2 terminals both speak raw TCP SIXml
  // (not WebSocket). The local Hardware Bridge translates both transport
  // boundaries: it accepts ws://127.0.0.1:9999 from the browser and
  // forwards the bytes to whatever TCP target the operator configured.
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
  if (!tim.DefaultTerminalListener) {
    throw new Error('TIM API SDK missing DefaultTerminalListener — wrong version?');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let terminalRef: any = null;

  try {
    await new Promise<void>((resolve, reject) => {
      try {
        // ── 1. TerminalSettings — EXACTLY what the ANZ simple example does.
        // Only IP, port, fetchBrands=false, autoCommit=false. Anything else
        // (integratorId, guides, protocolType, autoConnect, enableKeepAlive,
        // etc.) has been verified to cause the live terminal to stall.
        const settings = new tim.TerminalSettings();
        settings.connectionIPString = effectiveIp;
        settings.connectionIPPort   = effectivePort;
        settings.fetchBrands        = false;
        settings.autoCommit         = false;

        // ── 2. Terminal
        terminalRef = new tim.Terminal(settings);
        const t = terminalRef;

        // ── 3. User data — matches ANZ example.
        t.setPosId('12');
        t.setUserId(1);

        let paired = false;
        let pairFailed = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        // 60s pair budget. The Castles S1F2 firmware takes one internal
        // Login retry (FeatureRequest phase times out at ~30s, SDK auto-
        // retries, second attempt succeeds). 30s was too tight.
        timeoutId = setTimeout(() => {
          if (paired || pairFailed) return;
          pairFailed = true;
          reject(new Error(
            `Pair timed out — no activateCompleted from ${ip}:${port} after 60s`,
          ));
        }, 60_000);

        // ── 4. Listener — subclass DefaultTerminalListener EXACTLY like the
        // ANZ example. The SDK relies on inherited no-op behaviour for every
        // callback the WASM may invoke; a plain object misses those defaults
        // and causes [SEVERE] TypeError spam in the log.
        //
        // Each *Completed handler fires the NEXT lifecycle call via
        // setTimeout(0), NOT synchronously from inside the callback. The
        // WASM SDK dispatches completion events from inside its own state
        // machine; calling loginAsync()/activateAsync() re-entrantly inside
        // connectCompleted has been observed to make the SDK abandon the
        // session with timCommunicationFailure on live Castles S1F2
        // firmware. Deferring with setTimeout lets the WASM callback stack
        // unwind before we initiate the next step.
        class PairListener extends tim.DefaultTerminalListener {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          connectCompleted(event: any) {
            super.connectCompleted(event);
            if (pairFailed || paired) return;
            if (event?.exception !== undefined) {
              pairFailed = true;
              if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
              reject(new Error(event.exception.message ?? 'Connect failed'));
              return;
            }
            setTimeout(() => {
              if (pairFailed || paired) return;
              try { t.loginAsync(); } catch (err) {
                pairFailed = true;
                if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
                reject(err instanceof Error ? err : new Error(String(err)));
              }
            }, 0);
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          loginCompleted(event: any) {
            super.loginCompleted(event);
            if (pairFailed || paired) return;
            if (event?.exception !== undefined) {
              pairFailed = true;
              if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
              reject(new Error(event.exception.message ?? 'Login failed'));
              return;
            }
            setTimeout(() => {
              if (pairFailed || paired) return;
              try { t.activateAsync(); } catch (err) {
                pairFailed = true;
                if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
                reject(err instanceof Error ? err : new Error(String(err)));
              }
            }, 0);
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          activateCompleted(event: any, data?: unknown) {
            super.activateCompleted(event, data);
            if (pairFailed || paired) return;
            if (event?.exception !== undefined) {
              pairFailed = true;
              if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
              reject(new Error(event.exception.message ?? 'Activate failed'));
              return;
            }

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
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          disconnected(terminal: any, exception?: any) {
            super.disconnected(terminal, exception);
            if (paired || pairFailed) return;
            pairFailed = true;
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            reject(new Error(exception?.message ?? 'Terminal disconnected before pair completed'));
          }
        }

        t.addListener(new PairListener());

        // ── 5. Explicit Connect — each subsequent step (login, activate)
        // fires from the listener callback on success.
        t.connectAsync();
      } catch (innerErr) {
        reject(innerErr instanceof Error ? innerErr : new Error(String(innerErr)));
      }
    });

    return { viaBridge };
  } finally {
    // GAP-13 (§3.13): dispose the Terminal to release WASM memory. The pair
    // lifecycle is one-shot; holding the Terminal would leak on every retry.
    if (terminalRef && typeof terminalRef.dispose === 'function') {
      try { terminalRef.dispose(); } catch { /* ignore */ }
    }
  }
}
