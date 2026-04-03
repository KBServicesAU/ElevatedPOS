'use client';

import { X, Printer, Bluetooth, Usb, CheckCircle, AlertCircle, Settings } from 'lucide-react';
import { useState } from 'react';

interface SettingsModalProps {
  onClose: () => void;
  onConnect: (printerType: 'receipt' | 'order', method: 'serial' | 'bluetooth') => void;
}

type ConnectionStatus = 'connected' | 'not_connected';

interface PrinterState {
  receipt: ConnectionStatus;
  order: ConnectionStatus;
}

export function SettingsModal({ onClose, onConnect }: SettingsModalProps) {
  const [status, setStatus] = useState<PrinterState>({
    receipt: 'not_connected',
    order: 'not_connected',
  });

  const hasSerial = typeof navigator !== 'undefined' && 'serial' in navigator;
  const hasBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  function handleConnect(printerType: 'receipt' | 'order', method: 'serial' | 'bluetooth') {
    onConnect(printerType, method);
    setStatus(prev => ({ ...prev, [printerType]: 'connected' }));
  }

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
            connectionStatus={status.receipt}
            hasSerial={hasSerial}
            hasBluetooth={hasBluetooth}
            onConnect={handleConnect}
          />
          <PrinterSection
            title="Order Printer"
            printerType="order"
            connectionStatus={status.order}
            hasSerial={hasSerial}
            hasBluetooth={hasBluetooth}
            onConnect={handleConnect}
          />

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
  connectionStatus: ConnectionStatus;
  hasSerial: boolean;
  hasBluetooth: boolean;
  onConnect: (printerType: 'receipt' | 'order', method: 'serial' | 'bluetooth') => void;
}

function PrinterSection({
  title,
  printerType,
  connectionStatus,
  hasSerial,
  hasBluetooth,
  onConnect,
}: PrinterSectionProps) {
  const isConnected = connectionStatus === 'connected';

  return (
    <div className="bg-[#0f0f0f] rounded-xl p-4 flex flex-col gap-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Printer size={16} className="text-gray-400" />
          <span className="text-white text-sm font-medium">{title}</span>
        </div>
        <ConnectionBadge connected={isConnected} />
      </div>

      {/* Connect Buttons */}
      <div className="flex flex-col gap-2">
        {/* USB / Serial */}
        {hasSerial ? (
          <button
            onClick={() => onConnect(printerType, 'serial')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isConnected
                ? 'bg-green-900/40 text-green-400 border border-green-700/40 cursor-default'
                : 'bg-[#1a1a2e] hover:bg-[#252545] text-gray-300 hover:text-white border border-white/10'
            }`}
            disabled={isConnected}
          >
            <Usb size={15} />
            {isConnected ? 'Connected via USB/Serial' : 'Connect via USB/Serial'}
          </button>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-gray-600 bg-[#1a1a2e] border border-white/5">
            <Usb size={15} />
            USB/Serial — Not supported
          </div>
        )}

        {/* Bluetooth */}
        {hasBluetooth ? (
          <button
            onClick={() => onConnect(printerType, 'bluetooth')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isConnected
                ? 'bg-blue-900/40 text-blue-400 border border-blue-700/40 cursor-default'
                : 'bg-[#1a1a2e] hover:bg-[#252545] text-gray-300 hover:text-white border border-white/10'
            }`}
            disabled={isConnected}
          >
            <Bluetooth size={15} />
            {isConnected ? 'Connected via Bluetooth' : 'Connect via Bluetooth'}
          </button>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-gray-600 bg-[#1a1a2e] border border-white/5">
            <Bluetooth size={15} />
            Bluetooth — Not supported
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectionBadge({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">
        <CheckCircle size={11} />
        Connected
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
