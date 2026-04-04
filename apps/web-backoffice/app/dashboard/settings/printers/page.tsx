'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Printer, Plus, Pencil, Trash2, Loader2, X,
  Wifi, Usb, AlertCircle, RefreshCw, CheckCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Printer {
  id: string;
  locationId: string;
  name: string;
  brand: 'epson' | 'star' | 'senor' | 'citizen' | 'bixolon' | 'generic';
  connectionType: 'ip' | 'usb';
  host?: string;
  port?: number;
  printerType: 'receipt' | 'kitchen_order';
  destination: 'none' | 'kitchen' | 'bar' | 'front' | 'back' | 'custom';
  customDestination?: string;
  isActive: boolean;
  createdAt: string;
}

interface PrintersResponse {
  data: Printer[];
}

type Brand = Printer['brand'];
type Destination = Printer['destination'];

// ─── Badge helpers ────────────────────────────────────────────────────────────

const BRAND_META: Record<Brand, { label: string; badge: string }> = {
  epson:    { label: 'Epson',          badge: 'bg-blue-900/50   text-blue-300   border-blue-800'   },
  star:     { label: 'Star Micronics', badge: 'bg-purple-900/50 text-purple-300 border-purple-800' },
  senor:    { label: 'Senor',          badge: 'bg-orange-900/50 text-orange-300 border-orange-800' },
  citizen:  { label: 'Citizen',        badge: 'bg-green-900/50  text-green-300  border-green-800'  },
  bixolon:  { label: 'Bixolon',        badge: 'bg-cyan-900/50   text-cyan-300   border-cyan-800'   },
  generic:  { label: 'Generic',        badge: 'bg-gray-800/60   text-gray-400   border-gray-700'   },
};

const DESTINATION_META: Record<Destination, { label: string; badge: string }> = {
  none:    { label: 'None',          badge: 'bg-gray-800/60   text-gray-400   border-gray-700'   },
  kitchen: { label: 'Kitchen',       badge: 'bg-orange-900/50 text-orange-300 border-orange-800' },
  bar:     { label: 'Bar',           badge: 'bg-purple-900/50 text-purple-300 border-purple-800' },
  front:   { label: 'Front of House',badge: 'bg-blue-900/50   text-blue-300   border-blue-800'   },
  back:    { label: 'Back of House', badge: 'bg-gray-800/60   text-gray-400   border-gray-700'   },
  custom:  { label: 'Custom',        badge: 'bg-indigo-900/50 text-indigo-300 border-indigo-800' },
};

function BrandBadge({ brand }: { brand: Brand }) {
  const { label, badge } = BRAND_META[brand];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${badge}`}>
      {label}
    </span>
  );
}

function DestinationBadge({ destination, custom }: { destination: Destination; custom?: string }) {
  const { label, badge } = DESTINATION_META[destination];
  const text = destination === 'custom' && custom ? custom : label;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${badge}`}>
      {text}
    </span>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-800 bg-green-900/50 px-2 py-0.5 text-xs font-semibold text-green-300">
        <CheckCircle className="h-3 w-3" /> Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-800/50 px-2 py-0.5 text-xs font-semibold text-gray-400">
      Inactive
    </span>
  );
}

// ─── Default form state ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  locationId: '',
  brand: 'epson' as Brand,
  connectionType: 'ip' as 'ip' | 'usb',
  host: '',
  port: 9100,
  printerType: 'receipt' as 'receipt' | 'kitchen_order',
  destination: 'none' as Destination,
  customDestination: '',
  isActive: true,
};

type FormState = typeof EMPTY_FORM;

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────

interface PrinterModalProps {
  initial: FormState | null; // null = add mode
  editId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

function PrinterModal({ initial, editId, onClose, onSaved }: PrinterModalProps) {
  const [form, setForm] = useState<FormState>(initial ?? EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (!form.locationId.trim()) { setError('Location ID is required.'); return; }
    if (form.connectionType === 'ip' && !form.host.trim()) {
      setError('Host / IP address is required for network printers.');
      return;
    }

    setLoading(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      locationId: form.locationId.trim(),
      brand: form.brand,
      connectionType: form.connectionType,
      printerType: form.printerType,
      destination: form.destination,
      isActive: form.isActive,
    };

    if (form.connectionType === 'ip') {
      payload.host = form.host.trim();
      payload.port = form.port;
    }

    if (form.destination === 'custom') {
      payload.customDestination = form.customDestination.trim();
    }

    try {
      if (editId) {
        await apiFetch(`printers/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('printers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save printer.');
    } finally {
      setLoading(false);
    }
  };

  const isKitchen = form.printerType === 'kitchen_order';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-[#1a1a2e] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <h2 className="text-lg font-bold text-white">
            {editId ? 'Edit Printer' : 'Add Printer'}
          </h2>
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
                Name <span className="text-red-400">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Counter Receipt Printer"
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Location ID */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Location ID <span className="text-red-400">*</span>
              </label>
              <input
                value={form.locationId}
                onChange={(e) => set('locationId', e.target.value)}
                placeholder="e.g. 00000000-0000-0000-0000-000000000001"
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 font-mono text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Brand */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Brand</label>
              <select
                value={form.brand}
                onChange={(e) => set('brand', e.target.value as Brand)}
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                {(Object.keys(BRAND_META) as Brand[]).map((b) => (
                  <option key={b} value={b}>{BRAND_META[b].label}</option>
                ))}
              </select>
            </div>

            {/* Connection Type */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Connection Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(['ip', 'usb'] as const).map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => set('connectionType', ct)}
                    className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-colors ${
                      form.connectionType === ct
                        ? 'border-indigo-500 bg-indigo-950 text-white'
                        : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-white'
                    }`}
                  >
                    {ct === 'ip' ? <Wifi className="h-4 w-4" /> : <Usb className="h-4 w-4" />}
                    {ct === 'ip' ? 'IP / Network' : 'USB'}
                  </button>
                ))}
              </div>

              {form.connectionType === 'ip' && (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-400">
                      Host <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={form.host}
                      onChange={(e) => set('host', e.target.value)}
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
                      className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 font-mono text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {form.connectionType === 'usb' && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-800 bg-blue-950/30 px-3 py-2.5 text-xs text-blue-300">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  USB printers connect directly from the POS terminal browser via Web Serial API.
                </div>
              )}
            </div>

            {/* Printer Type */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Printer Type</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'receipt',       label: 'Receipt Printer'       },
                  { value: 'kitchen_order', label: 'Kitchen Order Printer' },
                ] as const).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      set('printerType', value);
                      if (value === 'receipt') set('destination', 'none');
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-colors ${
                      form.printerType === value
                        ? 'border-indigo-500 bg-indigo-950 text-white'
                        : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-white'
                    }`}
                  >
                    <Printer className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Destination (kitchen_order only) */}
            {isKitchen && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Destination</label>
                <select
                  value={form.destination}
                  onChange={(e) => set('destination', e.target.value as Destination)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="none">None</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="bar">Bar</option>
                  <option value="front">Front of House</option>
                  <option value="back">Back of House</option>
                  <option value="custom">Custom</option>
                </select>
                {form.destination === 'custom' && (
                  <input
                    value={form.customDestination}
                    onChange={(e) => set('customDestination', e.target.value)}
                    placeholder="Custom destination name"
                    className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                  />
                )}
              </div>
            )}

            {/* Active */}
            <label className="flex cursor-pointer items-center gap-3">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => set('isActive', e.target.checked)}
                  className="sr-only"
                />
                <div className={`h-5 w-9 rounded-full transition-colors ${form.isActive ? 'bg-indigo-600' : 'bg-gray-700'}`} />
                <div
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    form.isActive ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </div>
              <span className="text-sm font-medium text-gray-300">Active</span>
            </label>

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
        <div className="flex items-center justify-end gap-3 border-t border-gray-700 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : editId ? 'Save Changes' : 'Add Printer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PrintersPage() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Printer | null>(null);

  const fetchPrinters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<PrintersResponse>('printers');
      setPrinters(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load printers.');
      setPrinters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchPrinters(); }, [fetchPrinters]);

  const openAdd = () => { setEditTarget(null); setModalOpen(true); };
  const openEdit = (printer: Printer) => { setEditTarget(printer); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditTarget(null); };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete printer "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await apiFetch(`printers/${id}`, { method: 'DELETE' });
      setPrinters((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete printer.');
    } finally {
      setDeleting(null);
    }
  };

  // Convert a Printer back into the modal FormState
  const printerToForm = (p: Printer): FormState => ({
    name: p.name,
    locationId: p.locationId,
    brand: p.brand,
    connectionType: p.connectionType,
    host: p.host ?? '',
    port: p.port ?? 9100,
    printerType: p.printerType,
    destination: p.destination,
    customDestination: p.customDestination ?? '',
    isActive: p.isActive,
  });

  return (
    <div className="min-h-full bg-gray-50 p-6 dark:bg-[#0f0f18]">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Printers</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage receipt and kitchen order printers for your locations.
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-500">
            All printers use 80×80 mm thermal paper (48 chars / line)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void fetchPrinters()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            Add Printer
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-yellow-700 bg-yellow-900/30 px-4 py-3 text-sm text-yellow-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error} — showing empty state while printers API is unavailable.
        </div>
      )}

      {/* Printers table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1a1a2e]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : printers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Printer className="mb-3 h-12 w-12 text-gray-500" />
            <p className="text-base font-semibold text-gray-300">No printers configured</p>
            <p className="mt-1 text-sm text-gray-500">
              Add a receipt or kitchen order printer to get started.
            </p>
            <button
              onClick={openAdd}
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
                <tr className="border-b border-gray-700 bg-gray-800/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Name / Brand
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Connection
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Destination
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Status
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {printers.map((printer) => (
                  <tr key={printer.id} className="hover:bg-gray-800/20">
                    {/* Name / Brand */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <p className="font-semibold text-white">{printer.name}</p>
                        <BrandBadge brand={printer.brand} />
                      </div>
                    </td>

                    {/* Connection */}
                    <td className="px-4 py-3">
                      {printer.connectionType === 'ip' ? (
                        <div className="flex items-center gap-1.5 text-gray-300">
                          <Wifi className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
                          <span className="font-mono text-xs">
                            {printer.host}:{printer.port}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-gray-300">
                          <Usb className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                          <span className="text-xs">USB</span>
                        </div>
                      )}
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {printer.printerType === 'receipt' ? 'Receipt' : 'Kitchen Order'}
                    </td>

                    {/* Destination */}
                    <td className="px-4 py-3">
                      <DestinationBadge
                        destination={printer.destination}
                        custom={printer.customDestination}
                      />
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <ActiveBadge active={printer.isActive} />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(printer)}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-800 hover:text-white"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => void handleDelete(printer.id, printer.name)}
                          disabled={deleting === printer.id}
                          className="flex items-center gap-1.5 rounded-lg border border-red-800 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-40"
                        >
                          {deleting === printer.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <PrinterModal
          initial={editTarget ? printerToForm(editTarget) : null}
          editId={editTarget?.id ?? null}
          onClose={closeModal}
          onSaved={() => void fetchPrinters()}
        />
      )}
    </div>
  );
}
