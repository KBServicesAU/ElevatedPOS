/**
 * ANZ Worldline TIM API — shared pair-lifecycle runner.
 *
 * Extracted from the dashboard implementation (previously in
 * app/dashboard/payments/page.tsx) so that the POS settings modal and the
 * backoffice dashboard both exercise the IDENTICAL pair code path. This
 * eliminates the POS vs dashboard divergence that caused POS pairing to fail
 * while dashboard pairing worked.
 *
 * What it does:
 *  1. On HTTPS, routes through the local Hardware Bridge (ws://127.0.0.1:9999)
 *     because browsers block ws:// from HTTPS pages to LAN IPs.
 *  2. Lazily loads the TIM API JS SDK from /timapi/timapi.js.
 *  3. Starts a $0.01 phantom transaction purely to trigger the TIM SDK
 *     pre-automatisms (connect → login → activate). Cancels as soon as
 *     activateCompleted fires.
 *  4. Wires ALL listener callbacks as no-ops — the SDK's WASM layer calls
 *     every callback via `forEach(each => each.xxxCompleted(...))`, so missing
 *     methods throw TypeError which spams [SEVERE] in ANZ validation logs.
 *  5. 30-second timeout.
 *
 * Returns { viaBridge } on success, throws a descriptive Error on failure.
 */

/**
 * SIXml default port per the ANZ Worldline TIM API Integration Validation
 * Template (04-JAN-2026), section 3 — the log extract shows
 * connectionIPPort: 7784 and protocolType: sixml. Both real Castles
 * terminals and the EftSimulator listen on this port.
 */
export const ANZ_DEFAULT_PORT = 7784;

/** Integrator ID fallback when the environment variable is not set. */
export const ANZ_DEFAULT_INTEGRATOR_ID = 'd23f66c0-546b-482f-b8b6-cb351f94fd31';

/**
 * Lazily loads /timapi/timapi.js into the page. Returns a promise that
 * resolves once `window.timapi.Terminal` is available. Subsequent callers
 * reuse the same in-flight promise so the SDK is only loaded once.
 */
export function loadTimApiScript(): Promise<void> {
  const w = window as unknown as {
    timapi?: { Terminal?: unknown };
    onTimApiReady?: () => void;
    __timapiLoading?: Promise<void>;
  };
  if (w.timapi && typeof w.timapi.Terminal === 'function') {
    return Promise.resolve();
  }
  if (w.__timapiLoading) return w.__timapiLoading;

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
 * Runs a real TIM API pair lifecycle against a specific terminal. Returns
 * on success or rejects with a descriptive error. Loads the ANZ Worldline
 * JavaScript SDK, wires up the Terminal, and starts a 1-cent dummy purchase
 * purely to trigger the pre-automatisms (connect → login → activate) — as
 * soon as `activateCompleted` fires we cancel the transaction.
 *
 * Mixed content caveat: browsers block ws:// from an https:// origin unless
 * the target is loopback. For LAN IPs we auto-route through the local
 * Hardware Bridge (ws://127.0.0.1:9999) which proxies to the real terminal.
 * Even loopback goes through the bridge because our ANZ EftSimulator speaks
 * raw TCP (not WebSocket) — the bridge transparently bridges transports.
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

        terminalRef = new tim.Terminal(settings);
        const t = terminalRef;
        t.setPosId('1');
        t.setUserId(1);

        const ecrInfo = new tim.EcrInfo();
        ecrInfo.type               = tim.constants.EcrInfoType.ecrApplication;
        ecrInfo.name               = opts.ecrName ?? 'ElevatedPOS';
        ecrInfo.manufacturerName   = 'ElevatedPOS Pty Ltd';
        ecrInfo.version            = '1.0';
        ecrInfo.integratorSolution = 'ElevatedPOS-ANZ-v26-01';
        t.addEcrData(ecrInfo);

        // PrintOption is frozen after construction — all options must pass
        // via the constructor. Signature: (recipient, format, width, flags)
        t.setPrintOptions([
          new tim.PrintOption(tim.constants.Recipient.merchant,   tim.constants.PrintFormat.normal, 40, []),
          new tim.PrintOption(tim.constants.Recipient.cardholder, tim.constants.PrintFormat.normal, 40, []),
        ]);

        let paired = false;
        timeoutId = setTimeout(() => {
          if (paired) return;
          try { t.cancel(); } catch { /* ignore */ }
          reject(new Error(`Connection timed out — no response from ${ip}:${port} after 30s`));
        }, 30_000);

        // SDK WASM layer calls every listener callback unconditionally via
        // forEach(each => each.xxxCompleted(...)). Missing methods throw
        // TypeError which spams [SEVERE] in ANZ validation logs.
        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
        const noop = (_e?: any) => {};
        t.addListener({
          activateCompleted: (event: any) => {
            if (event?.exception === undefined && !paired) {
              paired = true;
              if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
              try { t.cancel(); } catch { /* ignore */ }
              resolve();
            }
          },
          transactionCompleted: (event: any) => {
            if (paired) return;
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            const exc = event?.exception;
            const code = exc?.resultCode;
            const codeStr = typeof code === 'string' ? code : (code?.name ?? '');
            const msg = exc?.message
              ?? (codeStr ? `Terminal unreachable (${codeStr})` : 'Terminal unreachable');
            reject(new Error(msg));
          },
          connectCompleted:                noop,
          disconnectCompleted:             noop,
          loginCompleted:                  noop,
          logoutCompleted:                 noop,
          terminalStatusChanged:           noop,
          applicationInformationCompleted: noop,
          applicationInformation:          noop,
          systemInformationCompleted:      noop,
          balanceCompleted:                noop,
          reconciliationCompleted:         noop,
          reservationCompleted:            noop,
          reconfigCompleted:               noop,
          counterRequestCompleted:         noop,
          deactivateCompleted:             noop,
          hardwareInformationCompleted:    noop,
          softwareUpdateCompleted:         noop,
          commitCompleted:                 noop,
          rollbackCompleted:               noop,
          cancelCompleted:                 noop,
          printReceipts:                   noop,
          referenceNumberRequest:          noop,
        } as any);
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */

        t.transactionAsync(
          tim.constants.TransactionType.purchase,
          new tim.Amount(1, tim.constants.Currency.AUD),
        );
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
  }
}
