'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Printer, Plus, Trash2, Loader2, X,
  Wifi, Usb, Bluetooth, AlertCircle, RefreshCw,
  CheckCircle, WifiOff, Send, FileText, QrCode,
  ToggleLeft, ChevronDown, Monitor, ChefHat, Wine,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrinterDevice {
  id: string;
  name: string;
  connectionType: 'network' | 'usb' | 'bluetooth';
  ipAddress?: string;
  port?: number;
  paperWidth: '58mm' | '80mm';
  interface: 'escpos' | 'star' | 'generic';
  assignedTo: string;
  status?: 'online' | 'offline' | 'unknown';
  createdAt?: string;
}

interface PrintersResponse {
  data: PrinterDevice[];
}

interface ReceiptSettings {
  showLogo: boolean;
  businessName: string;
  headerText: string;
  footerText: string;
  showQrCode: boolean;
  qrCodeUrl: string;
  showSocialHandles: boolean;
  socialHandles: string;
  showItemSku: boolean;
  showItemNotes: boolean;
  printOrderNumberLarge: boolean;
  showLoyaltyPoints: boolean;
  showGstBreakdown: boolean;
  showThankYou: boolean;
}

interface PrinterAssignment {
  station: string;
  stationLabel: string;
  stationIcon: React.ElementType;
  printerId: string;
  copies: number;
}

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
        checked ? 'bg-indigo-600' : 'bg-gray-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: PrinterDevice['status'] }) {
  if (status === 'online') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-800 bg-green-900/50 px-2 py-0.5 text-xs font-semibold text-green-300">
        <CheckCircle className="h-3 w-3" /> Online
      </span>
    );
  }
  if (status === 'offline') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-800 bg-red-900/50 px-2 py-0.5 text-xs font-semibold text-red-300">
        <WifiOff className="h-3 w-3" /> Offline
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-800/50 px-2 py-0.5 text-xs font-semibold text-gray-500">
      Unknown
    </span>
  );
}

// ─── Connection icon ──────────────────────────────────────────────────────────

function ConnectionIcon({ type }: { type: PrinterDevice['connectionType'] }) {
  if (type === 'network') return <Wifi className="h-3.5 w-3.5 text-indigo-400" />;
  if (type === 'usb') return <Usb className="h-3.5 w-3.5 text-orange-400" />;
  return <Bluetooth className="h-3.5 w-3.5 text-blue-400" />;
}

// ─── Add Printer Modal ────────────────────────────────────────────────────────

const EMPTY_PRINTER_FORM = {
  name: '',
  connectionType: 'network' as PrinterDevice['connectionType'],
  ipAddress: '',
  port: 9100,
  paperWidth: '80mm' as PrinterDevice['paperWidth'],
  interface: 'escpos' as PrinterDevice['interface'],
  assignedTo: 'all',
};

type PrinterFormState = typeof EMPTY_PRINTER_FORM;

interface AddPrinterModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function AddPrinterModal({ onClose, onSaved }: AddPrinterModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<PrinterFormState>(EMPTY_PRINTER_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof PrinterFormState>(key: K, value: PrinterFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    try {
      await apiFetch('printers/test', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          connectionType: form.connectionType,
          ipAddress: form.ipAddress,
          port: form.port,
          paperWidth: form.paperWidth,
          interface: form.interface,
          assignedTo: form.assignedTo,
        }),
      });
      toast({ title: 'Test print sent', description: 'Check the printer for the test page.', variant: 'success' });
    } catch (err) {
      setError(getErrorMessage(err, 'Test print failed.'));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Printer name is required.'); return; }
    if (form.connectionType === 'network' && !form.ipAddress.trim()) {
      setError('IP address is required for network printers.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('printers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          connectionType: form.connectionType,
          ipAddress: form.connectionType === 'network' ? form.ipAddress.trim() : undefined,
          port: form.connectionType === 'network' ? form.port : undefined,
          paperWidth: form.paperWidth,
          interface: form.interface,
          assignedTo: form.assignedTo,
        }),
      });
      toast({ title: 'Printer added', variant: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save printer.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-[#1a1a2e] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <h2 className="text-lg font-bold text-white">Add Printer</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-6">
          <div className="space-y-5">
            {/* Name */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Printer Name <span className="text-red-400">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Front Counter Receipt"
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Connection Type */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Connection Type</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'network',   label: 'Network (IP)', Icon: Wifi      },
                  { value: 'usb',       label: 'USB',          Icon: Usb       },
                  { value: 'bluetooth', label: 'Bluetooth',    Icon: Bluetooth },
                ] as const).map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set('connectionType', value)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition-colors ${
                      form.connectionType === value
                        ? 'border-indigo-500 bg-indigo-950 text-white'
                        : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Network fields */}
            {form.connectionType === 'network' && (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-400">
                    IP Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={form.ipAddress}
                    onChange={(e) => set('ipAddress', e.target.value)}
                    placeholder="192.168.1.100"
                    className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 font-mono text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-400">Port</label>
                  <input
                    type="number"
                    value={form.port}
                    onChange={(e) => set('port', Number(e.target.value))}
                    min={1}
                    max={65535}
                    className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 font-mono text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {(form.connectionType === 'usb' || form.connectionType === 'bluetooth') && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-800 bg-blue-950/30 px-3 py-2.5 text-xs text-blue-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                {form.connectionType === 'usb'
                  ? 'USB printers connect from the POS terminal via Web Serial API.'
                  : 'Bluetooth printers connect from the POS terminal via Web Bluetooth API.'}
              </div>
            )}

            {/* Paper width */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Paper Width</label>
              <div className="grid grid-cols-2 gap-2">
                {(['58mm', '80mm'] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => set('paperWidth', w)}
                    className={`rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                      form.paperWidth === w
                        ? 'border-indigo-500 bg-indigo-950 text-white'
                        : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-white'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            {/* Interface */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Printer Interface</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'escpos',  label: 'ESC/POS' },
                  { value: 'star',    label: 'Star'     },
                  { value: 'generic', label: 'Generic'  },
                ] as const).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set('interface', value)}
                    className={`rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                      form.interface === value
                        ? 'border-indigo-500 bg-indigo-950 text-white'
                        : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assigned to */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Assigned To</label>
              <div className="relative">
                <select
                  value={form.assignedTo}
                  onChange={(e) => set('assignedTo', e.target.value)}
                  className="w-full appearance-none rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 pr-8 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="all">All Stations</option>
                  <option value="pos1">POS Terminal 1</option>
                  <option value="pos2">POS Terminal 2</option>
                  <option value="kds_kitchen">KDS Kitchen</option>
                  <option value="kds_bar">KDS Bar</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-700 px-6 py-4">
          <button
            onClick={() => void handleTest()}
            disabled={testing || saving}
            className="flex items-center gap-2 rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-40"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Test Print
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Add Printer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Receipt Preview ──────────────────────────────────────────────────────────

interface ReceiptPreviewProps {
  settings: ReceiptSettings;
}

function ReceiptPreview({ settings }: ReceiptPreviewProps) {
  const SAMPLE_ITEMS = [
    { name: 'Flat White',      qty: 2, price: '$9.00'  },
    { name: 'Eggs Benedict',   qty: 1, price: '$22.00' },
    { name: 'Fresh OJ',        qty: 1, price: '$6.50'  },
  ];
  const subtotal = '$37.50';
  const gst      = '$3.41';
  const total    = '$37.50';

  return (
    <div className="sticky top-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Live Preview</p>
      <div className="mx-auto max-w-[220px] overflow-hidden rounded-lg border border-gray-700 bg-white font-mono text-[10px] leading-tight text-gray-900 shadow-xl">
        {/* Thermal paper top */}
        <div className="h-2 bg-gray-100" />

        <div className="px-3 py-3">
          {/* Header */}
          <div className="mb-2 text-center">
            {settings.showLogo && (
              <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                <Printer className="h-4 w-4" />
              </div>
            )}
            <p className="text-[11px] font-bold uppercase tracking-wide">
              {settings.businessName || 'Your Business'}
            </p>
            {settings.headerText && (
              <p className="mt-1 whitespace-pre-wrap text-[9px] text-gray-600">
                {settings.headerText}
              </p>
            )}
          </div>

          <div className="my-1.5 border-t border-dashed border-gray-400" />

          {/* Order number */}
          {settings.printOrderNumberLarge && (
            <p className="mb-1.5 text-center text-[14px] font-extrabold tracking-widest">#1042</p>
          )}

          {/* Items */}
          <div className="space-y-0.5">
            {SAMPLE_ITEMS.map((item) => (
              <div key={item.name} className="flex justify-between">
                <span className="flex-1 truncate">
                  {item.qty}x {item.name}
                </span>
                <span className="ml-1 tabular-nums">{item.price}</span>
              </div>
            ))}
            {settings.showItemSku && (
              <p className="text-[8px] text-gray-400">SKU: FW-001 / EBN-002 / OJ-001</p>
            )}
          </div>

          <div className="my-1.5 border-t border-dashed border-gray-400" />

          {/* Totals */}
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{subtotal}</span>
            </div>
            {settings.showGstBreakdown && (
              <div className="flex justify-between text-gray-500">
                <span>GST (10%)</span>
                <span>{gst}</span>
              </div>
            )}
            <div className="flex justify-between font-bold">
              <span>TOTAL</span>
              <span>{total}</span>
            </div>
          </div>

          {/* Loyalty */}
          {settings.showLoyaltyPoints && (
            <>
              <div className="my-1.5 border-t border-dashed border-gray-400" />
              <p className="text-center text-[9px] text-gray-600">You earned 37 loyalty points!</p>
            </>
          )}

          <div className="my-1.5 border-t border-dashed border-gray-400" />

          {/* Footer */}
          {settings.footerText && (
            <p className="mb-1.5 whitespace-pre-wrap text-center text-[9px] text-gray-600">
              {settings.footerText}
            </p>
          )}
          {settings.showThankYou && (
            <p className="text-center text-[9px] font-semibold">Thank you!</p>
          )}
          {settings.showSocialHandles && settings.socialHandles && (
            <p className="mt-1 text-center text-[8px] text-gray-500">{settings.socialHandles}</p>
          )}
          {settings.showQrCode && (
            <div className="mt-2 flex flex-col items-center gap-0.5">
              <div className="flex h-12 w-12 items-center justify-center rounded border border-gray-300 bg-gray-50">
                <QrCode className="h-8 w-8 text-gray-600" />
              </div>
              {settings.qrCodeUrl && (
                <p className="text-[7px] text-gray-400 break-all text-center">{settings.qrCodeUrl}</p>
              )}
            </div>
          )}
        </div>

        {/* Thermal paper bottom */}
        <div className="h-4 bg-gradient-to-b from-gray-100 to-transparent" />
      </div>
    </div>
  );
}

// ─── Section Heading ──────────────────────────────────────────────────────────

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-bold text-gray-900 dark:text-white">{title}</h2>
      {description && (
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}
    </div>
  );
}

// ─── Default receipt settings ─────────────────────────────────────────────────

const DEFAULT_RECEIPT: ReceiptSettings = {
  showLogo: true,
  businessName: '',
  headerText: '',
  footerText: '',
  showQrCode: false,
  qrCodeUrl: '',
  showSocialHandles: false,
  socialHandles: '',
  showItemSku: false,
  showItemNotes: true,
  printOrderNumberLarge: false,
  showLoyaltyPoints: true,
  showGstBreakdown: true,
  showThankYou: true,
};

// ─── Default printer assignments ─────────────────────────────────────────────

const DEFAULT_ASSIGNMENTS: PrinterAssignment[] = [
  { station: 'pos',         stationLabel: 'POS Terminal',  stationIcon: Monitor, printerId: '', copies: 1 },
  { station: 'kds_kitchen', stationLabel: 'KDS Kitchen',   stationIcon: ChefHat, printerId: '', copies: 1 },
  { station: 'kds_bar',     stationLabel: 'KDS Bar',       stationIcon: Wine,    printerId: '', copies: 1 },
  { station: 'receipt',     stationLabel: 'Receipt',       stationIcon: FileText, printerId: '', copies: 1 },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PrintersPage() {
  const { toast } = useToast();

  // — Printers —
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [printersLoading, setPrintersLoading] = useState(true);
  const [printersError, setPrintersError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  // — Receipt settings —
  const [receipt, setReceipt] = useState<ReceiptSettings>(DEFAULT_RECEIPT);
  const [receiptLoading, setReceiptLoading] = useState(true);
  const [receiptSaving, setReceiptSaving] = useState(false);

  // — Printer assignments —
  const [assignments, setAssignments] = useState<PrinterAssignment[]>(DEFAULT_ASSIGNMENTS);
  const [assignmentsSaving, setAssignmentsSaving] = useState(false);

  // ─── Loaders ────────────────────────────────────────────────────────────────

  const fetchPrinters = useCallback(async () => {
    setPrintersLoading(true);
    setPrintersError(null);
    try {
      const res = await apiFetch<PrintersResponse>('printers');
      setPrinters(res.data ?? []);
    } catch (err) {
      setPrintersError(getErrorMessage(err, 'Failed to load printers.'));
      setPrinters([]);
    } finally {
      setPrintersLoading(false);
    }
  }, []);

  const fetchReceiptSettings = useCallback(async () => {
    setReceiptLoading(true);
    try {
      const res = await apiFetch<{ data: ReceiptSettings }>('settings/receipt');
      setReceipt((prev) => ({ ...prev, ...res.data }));
    } catch {
      // Use defaults silently — endpoint may not exist yet
    } finally {
      setReceiptLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrinters();
    void fetchReceiptSettings();
  }, [fetchPrinters, fetchReceiptSettings]);

  // ─── Printer actions ─────────────────────────────────────────────────────────

  const handleTestPrinter = async (id: string) => {
    setTestingId(id);
    try {
      await apiFetch(`printers/${id}/test`, { method: 'POST', body: '{}' });
      toast({ title: 'Test print sent', variant: 'success' });
    } catch (err) {
      toast({ title: 'Test failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setTestingId(null);
    }
  };

  const handleDeletePrinter = async (id: string) => {
    setDeleting(id);
    setConfirmDeleteId(null);
    try {
      await apiFetch(`printers/${id}`, { method: 'DELETE' });
      setPrinters((prev) => prev.filter((p) => p.id !== id));
      toast({ title: 'Printer removed', variant: 'success' });
    } catch (err) {
      toast({ title: 'Failed to delete printer', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  // ─── Receipt save ─────────────────────────────────────────────────────────────

  const handleSaveReceipt = async () => {
    setReceiptSaving(true);
    try {
      await apiFetch('settings/receipt', {
        method: 'PUT',
        body: JSON.stringify(receipt),
      });
      toast({ title: 'Receipt settings saved', variant: 'success' });
    } catch (err) {
      toast({ title: 'Failed to save receipt settings', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setReceiptSaving(false);
    }
  };

  // ─── Assignments save ─────────────────────────────────────────────────────────

  const handleSaveAssignments = async () => {
    setAssignmentsSaving(true);
    try {
      await apiFetch('settings/printer-assignments', {
        method: 'PUT',
        body: JSON.stringify(
          assignments.map(({ station, printerId, copies }) => ({ station, printerId, copies }))
        ),
      });
      toast({ title: 'Printer assignments saved', variant: 'success' });
    } catch (err) {
      toast({ title: 'Failed to save assignments', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setAssignmentsSaving(false);
    }
  };

  const setReceiptField = <K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) =>
    setReceipt((prev) => ({ ...prev, [key]: value }));

  const setAssignment = (station: string, field: 'printerId' | 'copies', value: string | number) =>
    setAssignments((prev) =>
      prev.map((a) => (a.station === station ? { ...a, [field]: value } : a))
    );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-gray-50 p-6 dark:bg-[#0f0f18]">
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Printers &amp; Receipts</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure thermal printers, customize receipt templates, and set station assignments.
          </p>
        </div>
        <button
          onClick={() => void fetchPrinters()}
          disabled={printersLoading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <RefreshCw className={`h-4 w-4 ${printersLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Section 1: Printer Configuration ──────────────────────────────── */}
      <section className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1a1a2e]">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Printer Configuration</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Add and manage receipt and kitchen order printers.
            </p>
          </div>
          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            Add Printer
          </button>
        </div>

        {/* Error banner */}
        {printersError && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl border border-yellow-700 bg-yellow-900/30 px-4 py-3 text-sm text-yellow-300">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {printersError} — showing empty state while printers API is unavailable.
          </div>
        )}

        {printersLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : printers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Printer className="mb-3 h-12 w-12 text-gray-500" />
            <p className="text-base font-semibold text-gray-300">No printers configured</p>
            <p className="mt-1 text-sm text-gray-500">Add a receipt or kitchen printer to get started.</p>
            <button
              onClick={() => setAddModalOpen(true)}
              className="mt-5 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              Add Printer
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/30">
                  {['Name', 'Connection', 'IP / Port', 'Paper', 'Interface', 'Assigned To', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {printers.map((printer) => (
                  <tr key={printer.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/20">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{printer.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                        <ConnectionIcon type={printer.connectionType} />
                        <span className="capitalize text-xs">{printer.connectionType}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {printer.connectionType === 'network' && printer.ipAddress ? (
                        <span className="font-mono text-xs text-gray-600 dark:text-gray-300">
                          {printer.ipAddress}:{printer.port ?? 9100}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{printer.paperWidth}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 uppercase">{printer.interface}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {printer.assignedTo === 'all' ? 'All stations' : printer.assignedTo}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={printer.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {/* Test */}
                        <button
                          onClick={() => void handleTestPrinter(printer.id)}
                          disabled={testingId === printer.id}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-600 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-40"
                        >
                          {testingId === printer.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Send className="h-3 w-3" />}
                          Test
                        </button>

                        {/* Delete with inline confirm */}
                        {confirmDeleteId === printer.id ? (
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">Delete?</span>
                            <button
                              onClick={() => void handleDeletePrinter(printer.id)}
                              disabled={deleting === printer.id}
                              className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-50"
                            >
                              {deleting === printer.id ? 'Deleting…' : 'Yes'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs text-gray-500 hover:text-gray-300"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(printer.id)}
                            disabled={!!deleting}
                            className="flex items-center gap-1.5 rounded-lg border border-red-800 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-40"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section 2: Receipt Template ────────────────────────────────────── */}
      <section className="mb-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left: form (3 cols) */}
          <div className="lg:col-span-3">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1a1a2e]">
              <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Receipt Template</h2>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  Customize what appears on printed receipts.
                </p>
              </div>

              {receiptLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                </div>
              ) : (
                <div className="space-y-6 p-6">
                  {/* Header block */}
                  <div>
                    <SectionHeading title="Header" />
                    <div className="space-y-4">
                      {/* Show logo */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Show Logo</p>
                          <p className="text-xs text-gray-500">Display business logo at top of receipt</p>
                        </div>
                        <Toggle
                          checked={receipt.showLogo}
                          onChange={(v) => setReceiptField('showLogo', v)}
                        />
                      </div>

                      {/* Business name */}
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Business Name
                        </label>
                        <input
                          value={receipt.businessName}
                          onChange={(e) => setReceiptField('businessName', e.target.value)}
                          placeholder="Your Business Name"
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
                        />
                      </div>

                      {/* Header text */}
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Header Text
                        </label>
                        <textarea
                          value={receipt.headerText}
                          onChange={(e) => setReceiptField('headerText', e.target.value)}
                          rows={3}
                          placeholder="e.g. 123 Main Street, Sydney NSW 2000&#10;ABN: 12 345 678 901"
                          className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
                        />
                        <p className="mt-1 text-xs text-gray-400">Shown above the item list. Supports line breaks.</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-700" />

                  {/* Footer block */}
                  <div>
                    <SectionHeading title="Footer" />
                    <div className="space-y-4">
                      {/* Footer text */}
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Footer Text
                        </label>
                        <textarea
                          value={receipt.footerText}
                          onChange={(e) => setReceiptField('footerText', e.target.value)}
                          rows={3}
                          placeholder="e.g. Returns accepted within 14 days with receipt."
                          className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
                        />
                        <p className="mt-1 text-xs text-gray-400">Shown below the total.</p>
                      </div>

                      {/* Thank you message */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Show &ldquo;Thank you&rdquo; message</p>
                          <p className="text-xs text-gray-500">Prints a thank-you line at the end</p>
                        </div>
                        <Toggle
                          checked={receipt.showThankYou}
                          onChange={(v) => setReceiptField('showThankYou', v)}
                        />
                      </div>

                      {/* QR code */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Show QR Code</p>
                          <p className="text-xs text-gray-500">Print a QR code linking to your website</p>
                        </div>
                        <Toggle
                          checked={receipt.showQrCode}
                          onChange={(v) => setReceiptField('showQrCode', v)}
                        />
                      </div>
                      {receipt.showQrCode && (
                        <input
                          value={receipt.qrCodeUrl}
                          onChange={(e) => setReceiptField('qrCodeUrl', e.target.value)}
                          placeholder="https://yourbusiness.com"
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
                        />
                      )}

                      {/* Social handles */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Show Social Handles</p>
                          <p className="text-xs text-gray-500">e.g. @yourbusiness on Instagram</p>
                        </div>
                        <Toggle
                          checked={receipt.showSocialHandles}
                          onChange={(v) => setReceiptField('showSocialHandles', v)}
                        />
                      </div>
                      {receipt.showSocialHandles && (
                        <input
                          value={receipt.socialHandles}
                          onChange={(e) => setReceiptField('socialHandles', e.target.value)}
                          placeholder="@yourbusiness  |  fb.com/yourbusiness"
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
                        />
                      )}
                    </div>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-700" />

                  {/* Receipt options */}
                  <div>
                    <SectionHeading title="Receipt Options" />
                    <div className="space-y-4">
                      {([
                        { key: 'showItemSku',           label: 'Show Item SKU',                desc: 'Print SKU code under each line item'           },
                        { key: 'showItemNotes',          label: 'Show Item Notes',              desc: 'Print any item-level notes on the receipt'     },
                        { key: 'printOrderNumberLarge',  label: 'Print Order Number Large',     desc: 'Display the order # in large bold text'        },
                        { key: 'showLoyaltyPoints',      label: 'Show Loyalty Points Earned',   desc: 'Print points earned for this transaction'      },
                        { key: 'showGstBreakdown',       label: 'Show GST Breakdown',           desc: 'Print the GST component separately'            },
                      ] as { key: keyof ReceiptSettings; label: string; desc: string }[]).map(({ key, label, desc }) => (
                        <div key={key} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
                            <p className="text-xs text-gray-500">{desc}</p>
                          </div>
                          <Toggle
                            checked={receipt[key] as boolean}
                            onChange={(v) => setReceiptField(key, v)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Save button */}
              <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                <button
                  onClick={() => void handleSaveReceipt()}
                  disabled={receiptSaving || receiptLoading}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  {receiptSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save Receipt Settings'}
                </button>
              </div>
            </div>
          </div>

          {/* Right: live preview (2 cols) */}
          <div className="lg:col-span-2">
            <ReceiptPreview settings={receipt} />
          </div>
        </div>
      </section>

      {/* ── Section 3: Printer Auto-Assignments ───────────────────────────── */}
      <section className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1a1a2e]">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Printer Auto-Assignments</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Choose which printer each station uses and how many copies to print.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/30">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Station</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Assigned Printer</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Print Copies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {assignments.map((row) => {
                const Icon = row.stationIcon;
                return (
                  <tr key={row.station} className="hover:bg-gray-50 dark:hover:bg-gray-800/20">
                    {/* Station */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-gray-400" />
                        <span className="font-medium text-gray-900 dark:text-white">{row.stationLabel}</span>
                      </div>
                    </td>

                    {/* Printer picker */}
                    <td className="px-6 py-4">
                      <div className="relative w-52">
                        <select
                          value={row.printerId}
                          onChange={(e) => setAssignment(row.station, 'printerId', e.target.value)}
                          className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        >
                          <option value="">— None —</option>
                          {printers.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      </div>
                    </td>

                    {/* Copies */}
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={row.copies}
                        onChange={(e) => setAssignment(row.station, 'copies', Math.max(1, Number(e.target.value)))}
                        className="w-20 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            onClick={() => void handleSaveAssignments()}
            disabled={assignmentsSaving}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {assignmentsSaving
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              : 'Save Assignments'}
          </button>
        </div>
      </section>

      {/* Add Printer Modal */}
      {addModalOpen && (
        <AddPrinterModal
          onClose={() => setAddModalOpen(false)}
          onSaved={() => void fetchPrinters()}
        />
      )}
    </div>
  );
}
