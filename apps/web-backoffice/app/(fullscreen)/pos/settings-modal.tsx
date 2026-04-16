'use client';

import { useEffect, useState } from 'react';
import { X, Printer, Bluetooth, Usb, Cable, CheckCircle, AlertCircle, Settings, Unplug, Monitor, CreditCard, Wifi, BookOpen, RotateCcw, RefreshCw, Download } from 'lucide-react';
import { usePrinter } from './printer-context';
import type { DeviceInfo } from '@/lib/device-auth';
import { createAnzPaymentProvider, downloadPaymentLogs } from '@/lib/payments';
import type { TimConfig } from '@/lib/payments';

type ConnectionMethod = 'serial' | 'usb' | 'bluetooth';

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

  const [anzFullConfig, setAnzFullConfig] = useState<TimConfig | null>(null);
  const [anzOpStatus, setAnzOpStatus] = useState<string | null>(null);
  const [anzOpLoading, setAnzOpLoading] = useState(false);
  const [anzVoidAmount, setAnzVoidAmount] = useState('');
  const [anzRefundAmount, setAnzRefundAmount] = useState('');

  // Fetch terminal config once on mount
  useEffect(() => {
    const deviceId = deviceInfo?.deviceId ?? null;
    const url = deviceId ? `/api/tyro/config?deviceId=${deviceId}` : '/api/tyro/config';
    fetch(url)
      .then((r) => {
        if (!r.ok || !r.headers.get('content-type')?.includes('application/json')) return null;
        return r.json() as Promise<{ configured?: boolean; provider?: string; terminalIp?: string; terminalPort?: number; integratorId?: string } | null>;
      })
      .then((data) => {
        if (data?.configured && data.provider) {
          setTerminalProvider(data.provider);
          setTerminalIp(data.terminalIp ?? null);
          if (data.provider === 'anz' && data.terminalIp) {
            setAnzFullConfig({
              terminalIp:           data.terminalIp,
              // 7784 is the real ANZ SIXml WebSocket port (validation doc v26-01)
              terminalPort:         data.terminalPort ?? 7784,
              integratorId:         data.integratorId ?? '',
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
      })
      .catch(() => {});
  }, [deviceInfo?.deviceId]);

  // ANZ: Pair Terminal — Connect → Login → Activate (Section 3.1)
  const handleAnzPair = async () => {
    if (!anzFullConfig) return;
    setAnzOpLoading(true);
    setAnzOpStatus('Pairing terminal…');
    try {
      const provider = createAnzPaymentProvider({ config: anzFullConfig });
      await provider.initialize(anzFullConfig);
      await provider.pairTerminal();
      setAnzOpStatus('✅ Terminal paired — Connect → Login → Activate complete');
    } catch (err) {
      setAnzOpStatus(`❌ Pair failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAnzOpLoading(false);
    }
  };

  // ANZ: Reversal/VOID — voids last terminal transaction (Section 3.9)
  // Section 1.4: "A Reversal/Void does not require a Commit"
  const handleAnzVoid = async () => {
    if (!anzFullConfig) return;
    const amount = parseFloat(anzVoidAmount);
    if (!amount || amount <= 0) { setAnzOpStatus('❌ Enter a valid amount to void'); return; }
    setAnzOpLoading(true);
    setAnzOpStatus(`Voiding $${amount.toFixed(2)}…`);
    try {
      const provider = createAnzPaymentProvider({ config: anzFullConfig });
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
    if (!anzFullConfig) return;
    const amount = parseFloat(anzRefundAmount);
    if (!amount || amount <= 0) { setAnzOpStatus('❌ Enter a valid refund amount'); return; }
    setAnzOpLoading(true);
    setAnzOpStatus(`Processing refund of $${amount.toFixed(2)}…`);
    try {
      const provider = createAnzPaymentProvider({ config: anzFullConfig });
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

  // ANZ: End of Day — Deactivate → Balance (Section 3.10)
  const handleAnzEndOfDay = async () => {
    if (!anzFullConfig) return;
    setAnzOpLoading(true);
    setAnzOpStatus('Running end of day…');
    try {
      const provider = createAnzPaymentProvider({ config: anzFullConfig });
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
          {terminalProvider === 'anz' && anzFullConfig && (
            <div className="bg-[#0f0f0f] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard size={15} className="text-blue-400" />
                <span className="text-white text-sm font-medium">ANZ Worldline Terminal</span>
              </div>
              <p className="text-[11px] text-gray-500">
                {terminalIp} — ANZ TIM API lifecycle management
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

              {/* End of Day — Deactivate → Balance */}
              <button
                onClick={handleAnzEndOfDay}
                disabled={anzOpLoading}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-orange-900/40 text-orange-300 hover:bg-orange-900/60 border border-orange-700/40 disabled:opacity-50 transition-colors"
              >
                <BookOpen size={14} />
                {anzOpLoading ? 'Working…' : 'End of Day (Deactivate → Balance)'}
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

              {/* Download Logs — Section 4 submission checklist */}
              <button
                onClick={() => downloadPaymentLogs()}
                className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold bg-[#1a1a2e] text-gray-500 hover:text-gray-300 border border-white/5 hover:border-white/10 transition-colors"
              >
                <Download size={12} />
                Download Payment Logs (ANZ Validation)
              </button>

              {/* Status message */}
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
