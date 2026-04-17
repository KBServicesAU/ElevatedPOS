/**
 * ANZ Worldline TIM API — pair-lifecycle runner.
 *
 * Structural mirror of the ANZ simple ECR example (JavaScript/Examples/
 * ExampleECRSimple/app.js). In the ANZ pattern:
 *   • A listener extends timapi.DefaultTerminalListener and its
 *     *Completed methods just RECORD events — they do not drive the flow.
 *   • The flow is driven by the outer code (in the example, user button
 *     clicks — Connect, then Login, then Activate). Each step happens in
 *     an independent event loop tick, never nested inside a previous
 *     step's callback.
 *
 * We reproduce that structure here: the listener resolves per-step
 * Promises; the outer async function awaits them in sequence. Each
 * `terminal.xxxAsync()` call is fired from a fresh await boundary, never
 * re-entered from within a WASM dispatch tick. This is the pattern that
 * works against live Castles S1F2 hardware — chaining xxxAsync() calls
 * synchronously inside a *Completed callback has been observed to make
 * the SDK abandon the session with timCommunicationFailure.
 */

import { getAnzLogSink } from './anz-log-sink';

export const ANZ_DEFAULT_PORT = 7784;
export const ANZ_DEFAULT_INTEGRATOR_ID = 'd23f66c0-546b-482f-b8b6-cb351f94fd31';

/**
 * Lazily loads /timapi/timapi.js into the page.
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
 * Runs the pair lifecycle against a specific terminal.
 * Returns `{ viaBridge }` on success; rejects with a descriptive Error on failure.
 */
export async function runTimPairLifecycle(
  ip: string,
  port: number,
  _opts: { ecrName?: string; integratorId?: string } = {},
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
  if (!tim.DefaultTerminalListener) {
    throw new Error('TIM API SDK missing DefaultTerminalListener — wrong version?');
  }

  // ── Per-step promise resolvers, wired into a single listener ────────
  // The listener *just* records events and resolves whichever promise is
  // currently awaiting. It does NOT call xxxAsync() — that happens in the
  // outer async block below, between awaits.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Resolver = ((event: any) => void) | null;
  let connectResolver:  Resolver = null;
  let loginResolver:    Resolver = null;
  let activateResolver: Resolver = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let disconnectHandler: ((exception?: any) => void) | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = new tim.TerminalSettings();
  settings.connectionIPString = effectiveIp;
  settings.connectionIPPort   = effectivePort;
  settings.fetchBrands        = false;
  settings.autoCommit         = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const terminal: any = new tim.Terminal(settings);
  terminal.setPosId('12');
  terminal.setUserId(1);

  class FlowListener extends tim.DefaultTerminalListener {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connectCompleted(event: any): void {
      super.connectCompleted(event);
      const r = connectResolver;
      connectResolver = null;
      if (r) r(event);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loginCompleted(event: any): void {
      super.loginCompleted(event);
      const r = loginResolver;
      loginResolver = null;
      if (r) r(event);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activateCompleted(event: any, data?: unknown): void {
      super.activateCompleted(event, data);
      const r = activateResolver;
      activateResolver = null;
      if (r) r(event);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    disconnected(t: any, exception?: any): void {
      super.disconnected(t, exception);
      const h = disconnectHandler;
      disconnectHandler = null;
      if (h) h(exception);
    }
  }

  terminal.addListener(new FlowListener());

  /**
   * Helper that wraps a single SDK step as a promise with per-step timeout.
   * When the step's *Completed callback fires (resolve), we inspect the
   * event for an exception and throw the corresponding Error.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runStep = <T>(label: string, timeoutMs: number, setup: (resolve: (event: any) => void) => void): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const done = (event: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (event?.exception !== undefined) {
          reject(new Error(event.exception.message ?? `${label} failed`));
          return;
        }
        resolve(event as T);
      };

      // Unexpected disconnect during this step
      disconnectHandler = (exception) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(exception?.message ?? `Terminal disconnected during ${label}`));
      };

      setup(done);
    });
  };

  try {
    // Connect — Section 1.2
    await runStep('Connect', 15_000, (done) => {
      connectResolver = done;
      terminal.connectAsync();
    });

    // Login — Section 1.2. 60s accommodates the internal FeatureRequest
    // retry observed on Castles S1F2 firmware.
    await runStep('Login', 60_000, (done) => {
      loginResolver = done;
      terminal.loginAsync();
    });

    // Activate — Section 1.2
    await runStep('Activate', 30_000, (done) => {
      activateResolver = done;
      terminal.activateAsync();
    });

    // Capture terminal identity for validation logs
    let terminalId = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let brands: any[] = [];
    try { terminalId = terminal.getTerminalId?.() ?? ''; } catch { /* non-fatal */ }
    try { brands     = terminal.getBrands?.()     ?? []; } catch { /* non-fatal */ }
    try {
      // eslint-disable-next-line no-console
      console.info('[ANZ-PAIR] activateCompleted', {
        terminalId,
        brandsCount: brands.length,
        hasBrands:   brands.length > 0,
      });
    } catch { /* non-fatal */ }

    return { viaBridge };
  } finally {
    // Dispose the Terminal — releases WASM memory. Pair is one-shot.
    if (typeof terminal.dispose === 'function') {
      try { terminal.dispose(); } catch { /* ignore */ }
    }
  }
}
