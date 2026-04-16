'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, Printer, Bluetooth, Usb, Cable, CheckCircle, AlertCircle, Settings, Unplug, Monitor, CreditCard, Wifi, BookOpen, RotateCcw, RefreshCw, Download, ShoppingCart, Power, Save, ChevronDown } from 'lucide-react';
import { usePrinter } from './printer-context';
import type { DeviceInfo } from '@/lib/device-auth';
import { getOrCreateAnzPaymentProvider, downloadPaymentLogs } from '@/lib/payments';
import { downloadTimApiLog } from '@/lib/payments/anz-log-sink';
import type { TimConfig } from '@/lib/payments';

type ConnectionMethod = 'serial' | 'usb' | 'bluetooth';

// Shape returned by /api/proxy/terminal/credentials for ANZ rows
interface AnzTerminalOption {
  id:           string;
  label:        string | null;
  terminalIp:   string;
  terminalPort: number;
  metadata: {
    autoCommit?:           boolean;
    printMerchantReceipt?: boolean;
    printCustomerReceipt?: boolean;
  };
}

interface SettingsModalProps {
  onClose: () => void;
  onConnect: (printerType: 'receipt' | 'order', method: ConnectionMethod) => void;
  deviceInfo?: DeviceInfo | null;
  onUnpair?: () => void;
}

export function SettingsModal({ onClose, onConnect, deviceInfo, onUnpair }: SettingsModalProps) {
  const {
    receiptConnected, orderConnected,
    receiptMethod, orderMethod,
    disconnectPrinter,
  } = usePrinter();

  const [terminalProvider, setTerminalProvider] = useState<string | null>(null);
  const [terminalIp, setTerminalIp] = useState<string | null>(null);
  const [integratorId, setIntegratorId] = useState<string>('');

  // Multi-terminal selector state
  const [anzTerminals, setAnzTerminals]             = useState<AnzTerminalOption[]>([]);
  const [selectedCredentialId, setSelectedCredentialId] = useState<string | null>(null);
  const [savingSelection, setSavingSelection]       = useState(false);
  const [selectionDirty, setSelectionDirty]         = useState(false);
  const [selectorLoading, setSelectorLoading]       = useState(true);

  const [anzFullConfig, setAnzFullConfig] = useState<TimConfig | null>(null);
  const [anzOpStatus, setAnzOpStatus] = useState<string | null>(null);
  const [anzOpLoading, setAnzOpLoading] = useState(false);
  const [anzVoidAmount, setAnzVoidAmount] = useState('');
  const [anzRefundAmount, setAnzRefundAmount] = useState('');
  const [anzPurchaseAmount, setAnzPurchaseAmount] = useState('');

  // Build a TimConfig from a selected ANZ row, using the org-level integrator ID
  const buildAnzConfig = useCallback((row: AnzTerminalOption, integrator: string): TimConfig => ({
    terminalIp:           row.terminalIp,
    // 7784 is the real ANZ SIXml WebSocket port (validation doc v26-01)
    terminalPort:         row.terminalPort || 7784,
    integratorId:         integrator,
    autoCommit:           row.metadata.autoCommit ?? true,
    fetchBrands:          true,
    dcc:                  false,
    partialApproval:      false,
    tipAllowed:           false,
    printMerchantReceipt: row.metadata.printMerchantReceipt ?? false,
    printCustomerReceipt: row.metadata.printCustomerReceipt ?? false,
  }), []);

  // Fetch terminal config + available org ANZ terminals on mount
  useEffect(() => {
    const deviceId = deviceInfo?.deviceId ?? null;

    // ── 1. Resolve the currently assigned terminal (for the Payment row + default selection)
    const configUrl = deviceId ? `/api/tyro/config?deviceId=${deviceId}` : '/api/tyro/config';
    const configP = fetch(configUrl)
      .then((r) => {
        if (!r.ok || !r.headers.get('content-type')?.includes('application/json')) return null;
        return r.json() as Promise<{ configured?: boolean; provider?: string; terminalIp?: string; terminalPort?: number; integratorId?: string; credentialId?: string } | null>;
      });

    // ── 2. List all ANZ terminals registered for the org so the operator can switch
    const terminalsP = fetch('/api/proxy/terminal/credentials')
      .then((r) => r.ok ? r.json() : Promise.resolve({ data: [] }))
      .then((j: { data?: Array<{ id: string; provider: string; terminalIp?: string; terminalPort?: number; label?: string; isActive?: boolean; metadata?: Record<string, unknown> }> }) => {
        return (j.data ?? [])
          .filter((c) => c.provider === 'anz' && c.isActive !== false && c.terminalIp)
          .map((c): AnzTerminalOption => {
            // Trust the stored port. SIXml-over-WebSocket defaults to 7784 for
            // real Castles terminals but the ANZ EftSimulator can be configured
            // to listen on any port (commonly 80 for its WebSocket mode). The
            // admin picks the port when they register the terminal — don't
            // silently rewrite their choice.
            const port = c.terminalPort && c.terminalPort > 0 ? c.terminalPort : 7784;
            const meta = (c.metadata ?? {}) as AnzTerminalOption['metadata'];
            return {
              id:           c.id,
              label:        c.label ?? null,
              terminalIp:   c.terminalIp!,
              terminalPort: port,
              metadata:     meta,
            };
          });
      })
      .catch(() => [] as AnzTerminalOption[]);

    Promise.all([configP, terminalsP]).then(([data, terminals]) => {
      setAnzTerminals(terminals);
      setSelectorLoading(false);

      const integrator = data?.integratorId ?? '';
      setIntegratorId(integrator);

      if (data?.configured && data.provider) {
        setTerminalProvider(data.provider);
        setTerminalIp(data.terminalIp ?? null);
        if (data.provider === 'anz' && data.terminalIp) {
          const credId = data.credentialId ?? null;
          setSelectedCredentialId(credId);

          // Prefer the row from the credentials list so we pick up its metadata
          const row = terminals.find((t) => t.id === credId) ?? null;
          if (row) {
            setAnzFullConfig(buildAnzConfig(row, integrator));
          } else {
            setAnzFullConfig({
              terminalIp:           data.terminalIp,
              terminalPort:         data.terminalPort ?? 7784,
              integratorId:         integrator,
              autoCommit:           true,
              fetchBrands:          true,
              dcc:                  false,
              partialApproval:      false,
              tipAllowed:           false,
              printMerchantReceipt: false,
              printCustomerReceipt: false,
            });
          }
        }
      } else if (terminals.length > 0) {
        // Device has nothing assigned yet — surface the picker so the operator can choose
        setTerminalProvider('anz');
      }
    }).catch(() => {
      setSelectorLoading(false);
    });
  }, [deviceInfo?.deviceId, buildAnzConfig]);

  // Operator picked a different ANZ terminal from the dropdown — update preview config
  const handleSelectTerminal = (id: string) => {
    setSelectedCredentialId(id || null);
    setSelectionDirty(true);
    const row = anzTerminals.find((t) => t.id === id);
    if (row) {
      setTerminalIp(row.terminalIp);
      setTerminalProvider('anz');
      setAnzFullConfig(buildAnzConfig(row, integratorId));
    }
  };

  // Persist the selection to the device-payment-config row
  const handleSaveSelection = async () => {
    if (!deviceInfo?.deviceId) {
      setAnzOpStatus('❌ No device ID — re-pair this POS before saving a terminal.');
      return;
    }
    setSavingSelection(true);
    setAnzOpStatus('Saving terminal selection…');
    try {
      // Preserve any existing enabledMethods by fetching current config first
      const currentRes = await fetch(`/api/proxy/terminal/device-config/${deviceInfo.deviceId}`);
      const currentJson: { data?: { enabledMethods?: string[] } | null } = currentRes.ok ? await currentRes.json() : {};
      const enabledMethods = currentJson.data?.enabledMethods ?? ['cash', 'card'];

      const res = await fetch(`/api/proxy/terminal/device-config/${deviceInfo.deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabledMethods,
          terminalCredentialId: selectedCredentialId,
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setSelectionDirty(false);
      setAnzOpStatus('✅ Terminal saved for this register — Pair Terminal to activate');
    } catch (err) {
      setAnzOpStatus(`❌ Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingSelection(false);
    }
  };

  // ANZ: Pair Terminal — Connect → Login → Activate (Section 3.1)
  //
  // Uses the shared runTimPairLifecycle from lib/payments/anz-pair-lifecycle
  // which is the SAME implementation the dashboard Payments page uses (proven
  // to connect+login+activate against the real ANZ simulator). Previously POS
  // went through tim-adapter.ts which had a separate, buggy code path — that
  // divergence is why POS pairing silently failed while dashboard worked.
  const handleAnzPair = async () => {
    if (!anzFullConfig) {
      if (anzTerminals.length === 0) {
        setAnzOpStatus('❌ No ANZ terminals registered. Add one in Dashboard → Payments → Terminals first.');
      } else if (!selectedCredentialId) {
        setAnzOpStatus('❌ Pick a terminal from the dropdown above, then click Save Selection, before pairing.');
      } else {
        setAnzOpStatus('❌ Terminal selection not loaded. Click Save Selection and try again.');
      }
      return;
    }
    setAnzOpLoading(true);
    setAnzOpStatus(`Pairing… opening ws://${anzFullConfig.terminalIp}:${anzFullConfig.terminalPort}/SIXml`);
    try {
      const { runTimPairLifecycle } = await import('@/lib/payments/anz-pair-lifecycle');
      const { viaBridge } = await runTimPairLifecycle(
        anzFullConfig.terminalIp,
        anzFullConfig.terminalPort,
        {
          ecrName: 'ElevatedPOS POS',
          integratorId: anzFullConfig.integratorId,
        },
      );
      const route = viaBridge ? ' via Hardware Bridge' : '';
      setAnzOpStatus(`✅ Terminal paired — Connect → Login → Activate complete${route} (${anzFullConfig.terminalIp}:${anzFullConfig.terminalPort})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = /hardware bridge required/i.test(msg)
        ? ''  // message already actionable
        : /timed out|timeout/i.test(msg)
          ? ` — Is the simulator running on ${anzFullConfig.terminalIp}:${anzFullConfig.terminalPort}?`
          : /refused|failed to fetch|network|unreachable/i.test(msg)
            ? ` — Cannot reach ${anzFullConfig.terminalIp}:${anzFullConfig.terminalPort}. Check the simulator/terminal port is open.`
            : '';
      setAnzOpStatus(`❌ Pair failed: ${msg}${hint}`);
    } finally {
      setAnzOpLoading(false);
    }
  };

  // ANZ: Reversal/VOID — voids last terminal transaction (Section 3.9)
  // Section 1.4: "A Reversal/Void does not require a Commit"
  const handleAnzVoid = async () => {
    if (!anzFullConfig) { setAnzOpStatus('❌ No terminal selected — pair one first.'); return; }
    const amount = parseFloat(anzVoidAmount);
    if (!amount || amount <= 0) { setAnzOpStatus('❌ Enter a valid amount to void'); return; }
    setAnzOpLoading(true);
    setAnzOpStatus(`Voiding $${amount.toFixed(2)}…`);
    try {
      const provider = getOrCreateAnzPaymentProvider({ config: anzFullConfig });
      await provider.initialize(anzFullConfig);
      const result = await provider.reversal({
        posOrderId: `void-${Date.now()}`,
        amount,
        onStatusMessage: (msg) => setAnzOpStatus(msg),
      });
      if (result.approved) {
        setAnzOpStatus(`✅ Void approved — Ref: ${result.transactionRef ?? 'N/A'}`);
        setAnzVoidAmount('');
      } else {
        setAnzOpStatus(`❌ Void declined: ${result.declineReason ?? result.errorMessage ?? 'Unknown'}`);
      }
    } catch (err) {
      setAnzOpStatus(`❌ Void failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAnzOpLoading(false);
    }
  };

  // ANZ: Credit/Refund transaction (Section 3.6)
  // Section 1.4: "A Credit/Refund needs a Commit" — handled automatically with autoCommit=true
  const handleAnzRefund = async () => {
    if (!anzFullConfig) { setAnzOpStatus('❌ No terminal selected — pair one first.'); return; }
    const amount = parseFloat(anzRefundAmount);
    if (!amount || amount <= 0) { setAnzOpStatus('❌ Enter a valid refund amount'); return; }
    setAnzOpLoading(true);
    setAnzOpStatus(`Processing refund of $${amount.toFixed(2)}…`);
    try {
      const provider = getOrCreateAnzPaymentProvider({ config: anzFullConfig });
      await provider.initialize(anzFullConfig);
      const result = await provider.refund({
        posOrderId: `refund-${Date.now()}`,
        amount,
        onStatusMessage: (msg) => setAnzOpStatus(msg),
      });
      if (result.approved) {
        setAnzOpStatus(`✅ Refund approved — Auth: ${result.authCode ?? 'N/A'} | Ref: ${result.transactionRef ?? 'N/A'}`);
        setAnzRefundAmount('');
      } else {
        setAnzOpStatus(`❌ Refund declined: ${result.declineReason ?? result.errorMessage ?? 'Unknown'}`);
      }
    } catch (err) {
      setAnzOpStatus(`❌ Refund failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAnzOpLoading(false);
    }
  };

  // ANZ: Test Purchase (Section 3.2) — drives §3.2 validation test amounts
  // without needing a full cart/checkout flow. Covers PIN / Contactless / Signature
  // depending on how the cardholder presents the card at the terminal.
  const handleAnzPurchase = async () => {
    if (!anzFullConfig) { setAnzOpStatus('❌ No terminal selected — pair one first.'); return; }
    const amount = parseFloat(anzPurchaseAmount);
    if (!amount || amount <= 0) { setAnzOpStatus('❌ Enter a valid purchase amount'); return; }
    setAnzOpLoading(true);
    setAnzOpStatus(`Processing purchase of $${amount.toFixed(2)}…`);
    try {
      const provider = getOrCreateAnzPaymentProvider({ config: anzFullConfig });
      await provider.initialize(anzFullConfig);
      const result = await provider.startPurchase({
        posOrderId: `anzval-${Date.now()}`,
        amount,
        currency: 'AUD',
        onStatusMessage: (msg) => setAnzOpStatus(msg),
      });
      if (result.approved) {
        setAnzOpStatus(`✅ Purchase approved — Auth: ${result.authCode ?? 'N/A'} | Ref: ${result.transactionRef ?? 'N/A'} | ${result.cardScheme ?? ''} ${result.cardLast4 ? '••' + result.cardLast4 : ''}`.trim());
        setAnzPurchaseAmount('');
      } else {
        setAnzOpStatus(`❌ Purchase declined: ${result.declineReason ?? result.errorMessage ?? 'Unknown'}`);
      }
    } catch (err) {
      setAnzOpStatus(`❌ Purchase failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAnzOpLoading(false);
    }
  };

  // ANZ: Shutdown (Section 3.13) — Deactivate → Logout → Disconnect → Dispose
  const handleAnzShutdown = async () => {
    if (!anzFullConfig) { setAnzOpStatus('❌ No terminal selected — pair one first.'); return; }
    setAnzOpLoading(true);
    setAnzOpStatus('Shutting down terminal session…');
    try {
      const provider = getOrCreateAnzPaymentProvider({ config: anzFullConfig });
      await provider.initialize(anzFullConfig);
      await provider.shutdown();
      setAnzOpStatus('✅ Shutdown complete — Deactivate → Logout → Disconnect → Dispose');
    } catch (err) {
      setAnzOpStatus(`❌ Shutdown failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAnzOpLoading(false);
    }
  };

  // ANZ: End of Day — Deactivate → Balance (Section 3.10)
  const handleAnzEndOfDay = async () => {
    if (!anzFullConfig) { setAnzOpStatus('❌ No terminal selected — pair one first.'); return; }
    setAnzOpLoading(true);
    setAnzOpStatus('Running end of day…');
    try {
      const provider = getOrCreateAnzPaymentProvider({ config: anzFullConfig });
      await provider.initialize(anzFullConfig);
      const result = await provider.endOfDay();
      const summary = result && typeof result === 'object'
        ? Object.entries(result).map(([k, v]) => `${k}: ${v}`).join(', ')
        : String(result);
      setAnzOpStatus(`✅ Daily closing complete. ${summary || 'Settlement submitted.'}`);
    } catch (err) {
      setAnzOpStatus(`❌ End of day failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAnzOpLoading(false);
    }
  };

  const hasSerial = typeof navigator !== 'undefined' && 'serial' in navigator;
  const hasUsb = typeof navigator !== 'undefined' && 'usb' in navigator;
  const hasBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1a1a2e] rounded-2xl w-full max-w-md mx-4 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-gray-400" />
            <h2 className="text-white text-lg font-semibold">POS Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          <PrinterSection
            title="Receipt Printer (80mm)"
            printerType="receipt"
            isConnected={receiptConnected}
            connectedMethod={receiptMethod ?? undefined}
            hasSerial={hasSerial}
            hasUsb={hasUsb}
            hasBluetooth={hasBluetooth}
            onConnect={onConnect}
            onDisconnect={() => disconnectPrinter('receipt')}
          />
          <PrinterSection
            title="Order Printer"
            printerType="order"
            isConnected={orderConnected}
            connectedMethod={orderMethod ?? undefined}
            hasSerial={hasSerial}
            hasUsb={hasUsb}
            hasBluetooth={hasBluetooth}
            onConnect={onConnect}
            onDisconnect={() => disconnectPrinter('order')}
          />

          {/* Device Info */}
          <div className="bg-[#0f0f0f] rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <Monitor size={15} className="text-gray-400" />
              <span className="text-white text-sm font-medium">Device Info</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <span className="text-gray-500">Role</span>
              <span className="text-white font-mono uppercase">{deviceInfo?.role ?? '—'}</span>
              <span className="text-gray-500">Label</span>
              <span className="text-white font-mono truncate">{deviceInfo?.label ?? '—'}</span>
              <span className="text-gray-500">Device ID</span>
              <span className="text-gray-400 font-mono truncate">{deviceInfo?.deviceId ? deviceInfo.deviceId.slice(0, 8) + '…' : '—'}</span>
              <span className="text-gray-500">Location ID</span>
              <span className="text-gray-400 font-mono truncate">{deviceInfo?.locationId ? deviceInfo.locationId.slice(0, 8) + '…' : '—'}</span>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-white/5">
              <CreditCard size={13} className={terminalProvider ? 'text-green-400' : 'text-gray-600'} />
              <span className="text-xs">
                <span className="text-gray-500">Payment: </span>
                <span className={terminalProvider ? 'text-green-400 font-medium' : 'text-gray-600'}>
                  {terminalProvider === 'anz'
                    ? `ANZ Worldline${terminalIp ? ` (${terminalIp})` : ''}`
                    : terminalProvider === 'tyro'
                      ? 'Tyro'
                      : terminalProvider
                        ? terminalProvider
                        : 'Not configured'}
                </span>
              </span>
            </div>
            {onUnpair && (
              <button
                onClick={() => { if (confirm('Unpair this device? You will need a new pairing code to use the POS again.')) { onUnpair(); } }}
                className="mt-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/30 border border-red-800/30 transition-colors"
              >
                <Unplug size={12} />
                Unpair Device
              </button>
            )}
          </div>

          {/* ANZ Terminal Management (Section 3.1 + 3.10 + 3.13) */}
          {(terminalProvider === 'anz' || anzTerminals.length > 0) && (
            <div className="bg-[#0f0f0f] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard size={15} className="text-blue-400" />
                <span className="text-white text-sm font-medium">ANZ Worldline Terminal</span>
              </div>

              {/* Terminal picker — lists all org-registered ANZ terminals so the operator
                  can point this register at a specific device and save the assignment.
                  Terminals are added in Dashboard → Payments → Terminals. */}
              {selectorLoading ? (
                <p className="text-[11px] text-gray-500">Loading terminals…</p>
              ) : anzTerminals.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-2.5 text-xs text-gray-400">
                  No ANZ terminals registered for this organisation. An admin must add one in{' '}
                  <span className="font-medium text-blue-300">Dashboard → Payments → Terminals</span> first.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] text-gray-500 uppercase tracking-wide">Terminal for this register</label>
                  <div className="relative">
                    <select
                      value={selectedCredentialId ?? ''}
                      onChange={(e) => handleSelectTerminal(e.target.value)}
                      disabled={savingSelection}
                      className="appearance-none w-full rounded-lg bg-[#1a1a2e] border border-white/10 pl-3 pr-9 py-2.5 text-sm text-white focus:outline-none focus:border-blue-600/50 disabled:opacity-50"
                    >
                      <option value="" disabled>— Select a terminal —</option>
                      {anzTerminals.map((t) => (
                        <option key={t.id} value={t.id}>
                          {(t.label ?? 'Terminal')} · {t.terminalIp}:{t.terminalPort}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                  <button
                    onClick={handleSaveSelection}
                    disabled={savingSelection || !selectedCredentialId || !selectionDirty}
                    className="flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Save size={13} />
                    {savingSelection ? 'Saving…' : selectionDirty ? 'Save Selection' : 'Saved'}
                  </button>
                </div>
              )}

              {anzFullConfig && (
              <>
              <p className="text-[11px] text-gray-500 pt-1 border-t border-white/5">
                Active: {anzFullConfig.terminalIp}:{anzFullConfig.terminalPort} — ANZ TIM API lifecycle management
              </p>

              {/* Pair Terminal — Connect → Login → Activate */}
              <button
                onClick={handleAnzPair}
                disabled={anzOpLoading}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-blue-900/40 text-blue-300 hover:bg-blue-900/60 border border-blue-700/40 disabled:opacity-50 transition-colors"
              >
                <Wifi size={14} />
                {anzOpLoading ? 'Working…' : 'Pair Terminal (Connect → Login → Activate)'}
              </button>

              {/* Test Purchase — Section 3.2 (validation helper: drives a raw
                  purchase without going through the cart flow so validation
                  amounts like $1.50, $2.50, $3.50, $7.50 can be run rapidly) */}
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Purchase $"
                  value={anzPurchaseAmount}
                  onChange={(e) => setAnzPurchaseAmount(e.target.value)}
                  className="flex-1 rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-600/50"
                />
                <button
                  onClick={handleAnzPurchase}
                  disabled={anzOpLoading || !anzPurchaseAmount}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-900/40 text-blue-300 hover:bg-blue-900/60 border border-blue-700/40 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <ShoppingCart size={13} />
                  Test Purchase
                </button>
              </div>

              {/* End of Day — Deactivate → Balance */}
              <button
                onClick={handleAnzEndOfDay}
                disabled={anzOpLoading}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-orange-900/40 text-orange-300 hover:bg-orange-900/60 border border-orange-700/40 disabled:opacity-50 transition-colors"
              >
                <BookOpen size={14} />
                {anzOpLoading ? 'Working…' : 'End of Day (Deactivate → Balance)'}
              </button>

              {/* Shutdown — Section 3.13: Deactivate → Logout → Disconnect → Dispose */}
              <button
                onClick={handleAnzShutdown}
                disabled={anzOpLoading}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-gray-800/60 text-gray-300 hover:bg-gray-800 border border-gray-700 disabled:opacity-50 transition-colors"
              >
                <Power size={14} />
                {anzOpLoading ? 'Working…' : 'Shutdown (Deactivate → Logout → Disconnect → Dispose)'}
              </button>

              {/* Void / Reversal — Section 3.9 */}
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Amount $"
                  value={anzVoidAmount}
                  onChange={(e) => setAnzVoidAmount(e.target.value)}
                  className="flex-1 rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-600/50"
                />
                <button
                  onClick={handleAnzVoid}
                  disabled={anzOpLoading || !anzVoidAmount}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-red-900/40 text-red-300 hover:bg-red-900/60 border border-red-700/40 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <RotateCcw size={13} />
                  Void Last
                </button>
              </div>

              {/* Credit / Refund — Section 3.6 */}
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Amount $"
                  value={anzRefundAmount}
                  onChange={(e) => setAnzRefundAmount(e.target.value)}
                  className="flex-1 rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-600/50"
                />
                <button
                  onClick={handleAnzRefund}
                  disabled={anzOpLoading || !anzRefundAmount}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-green-900/40 text-green-300 hover:bg-green-900/60 border border-green-700/40 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <RefreshCw size={13} />
                  Refund
                </button>
              </div>

              {/* Download Logs — §4 submission checklist.
                  Two files per the validation template:
                    • ANZ-PAY-LOG-YYYYMMDD.txt — ElevatedPOS structured events
                    • TimApiYYYYMMDD.log       — raw FINEST SDK records (IDB)  */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => downloadPaymentLogs()}
                  className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold bg-[#1a1a2e] text-gray-500 hover:text-gray-300 border border-white/5 hover:border-white/10 transition-colors"
                >
                  <Download size={12} />
                  Download Payment Logs (ANZ-PAY-LOG)
                </button>
                <button
                  onClick={() => { void downloadTimApiLog({ persisted: true }); }}
                  className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold bg-[#1a1a2e] text-gray-500 hover:text-gray-300 border border-white/5 hover:border-white/10 transition-colors"
                >
                  <Download size={12} />
                  Download TIM API Log (TimApiYYYYMMDD.log)
                </button>
              </div>
              </>
              )}

              {/* Status message — rendered outside the config gate so Save Selection
                  feedback is visible before the operator has paired a terminal. */}
              {anzOpStatus && (
                <p className="text-xs rounded-lg bg-[#1a1a2e] px-3 py-2 text-gray-300 break-words">
                  {anzOpStatus}
                </p>
              )}
            </div>
          )}

          <div className="pt-1">
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/30 font-semibold text-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PrinterSectionProps {
  title: string;
  printerType: 'receipt' | 'order';
  isConnected: boolean;
  connectedMethod?: ConnectionMethod;
  hasSerial: boolean;
  hasUsb: boolean;
  hasBluetooth: boolean;
  onConnect: (printerType: 'receipt' | 'order', method: ConnectionMethod) => void;
  onDisconnect: () => void;
}

function PrinterSection({
  title,
  printerType,
  isConnected,
  connectedMethod,
  hasSerial,
  hasUsb,
  hasBluetooth,
  onConnect,
  onDisconnect,
}: PrinterSectionProps) {
  const methodLabel = (method: ConnectionMethod) => {
    switch (method) {
      case 'usb':       return 'USB';
      case 'serial':    return 'Serial';
      case 'bluetooth': return 'Bluetooth';
    }
  };

  return (
    <div className="bg-[#0f0f0f] rounded-xl p-4 flex flex-col gap-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Printer size={16} className="text-gray-400" />
          <span className="text-white text-sm font-medium">{title}</span>
        </div>
        <ConnectionBadge
          connected={isConnected}
          method={connectedMethod ? methodLabel(connectedMethod) : undefined}
        />
      </div>

      {/* Connect Buttons */}
      <div className="flex flex-col gap-2">
        {/* USB Printer (WebUSB) */}
        {hasUsb ? (
          <button
            onClick={() => onConnect(printerType, 'usb')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isConnected && connectedMethod === 'usb'
                ? 'bg-green-900/40 text-green-400 border border-green-700/40 cursor-default'
                : isConnected
                  ? 'bg-[#1a1a2e] text-gray-600 border border-white/5 cursor-default'
                  : 'bg-[#1a1a2e] hover:bg-[#252545] text-gray-300 hover:text-white border border-white/10'
            }`}
            disabled={isConnected}
          >
            <Usb size={15} />
            {isConnected && connectedMethod === 'usb' ? 'Connected via USB' : 'USB Printer'}
          </button>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-gray-600 bg-[#1a1a2e] border border-white/5">
            <Usb size={15} />
            USB Printer — Not supported
          </div>
        )}

        {/* Serial Port (Web Serial) */}
        {hasSerial ? (
          <button
            onClick={() => onConnect(printerType, 'serial')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isConnected && connectedMethod === 'serial'
                ? 'bg-green-900/40 text-green-400 border border-green-700/40 cursor-default'
                : isConnected
                  ? 'bg-[#1a1a2e] text-gray-600 border border-white/5 cursor-default'
                  : 'bg-[#1a1a2e] hover:bg-[#252545] text-gray-300 hover:text-white border border-white/10'
            }`}
            disabled={isConnected}
          >
            <Cable size={15} />
            {isConnected && connectedMethod === 'serial' ? 'Connected via Serial' : 'Serial Port'}
          </button>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-gray-600 bg-[#1a1a2e] border border-white/5">
            <Cable size={15} />
            Serial Port — Not supported
          </div>
        )}

        {/* Bluetooth */}
        {hasBluetooth ? (
          <button
            onClick={() => onConnect(printerType, 'bluetooth')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isConnected && connectedMethod === 'bluetooth'
                ? 'bg-blue-900/40 text-blue-400 border border-blue-700/40 cursor-default'
                : isConnected
                  ? 'bg-[#1a1a2e] text-gray-600 border border-white/5 cursor-default'
                  : 'bg-[#1a1a2e] hover:bg-[#252545] text-gray-300 hover:text-white border border-white/10'
            }`}
            disabled={isConnected}
          >
            <Bluetooth size={15} />
            {isConnected && connectedMethod === 'bluetooth' ? 'Connected via Bluetooth' : 'Bluetooth'}
          </button>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-gray-600 bg-[#1a1a2e] border border-white/5">
            <Bluetooth size={15} />
            Bluetooth — Not supported
          </div>
        )}
      </div>

      {/* Disconnect button when connected */}
      {isConnected && (
        <button
          onClick={onDisconnect}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/30 border border-red-800/30 transition-colors"
        >
          <Unplug size={13} />
          Disconnect
        </button>
      )}

      {/* Hint text */}
      {!isConnected && (
        <p className="text-xs text-gray-600 leading-relaxed">
          <strong className="text-gray-500">USB Printer</strong> — for printers plugged in directly via USB.{' '}
          <strong className="text-gray-500">Serial Port</strong> — for USB-to-serial adapters or RS232 connections.
        </p>
      )}
    </div>
  );
}

function ConnectionBadge({ connected, method }: { connected: boolean; method?: string }) {
  if (connected) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">
        <CheckCircle size={11} />
        {method ? `Connected (${method})` : 'Connected'}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
      <AlertCircle size={11} />
      Not connected
    </span>
  );
}
