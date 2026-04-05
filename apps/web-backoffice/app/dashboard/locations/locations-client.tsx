'use client';

import { useState, useEffect } from 'react';
import { MapPin, Plus, Pencil, Eye, X, Loader2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatCurrency, getErrorMessage } from '@/lib/formatting';
import { useToast } from '@/lib/use-toast';

interface Location {
  id: string;
  name: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  phone: string;
  managerName: string;
  managerEmail: string;
  status: 'active' | 'inactive';
  revenueToday: number;
}


interface AddLocationForm {
  name: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  phone: string;
  managerName: string;
  managerEmail: string;
}

const EMPTY_FORM: AddLocationForm = {
  name: '',
  address: '',
  suburb: '',
  state: '',
  postcode: '',
  phone: '',
  managerName: '',
  managerEmail: '',
};

// ─── Location Detail Panel ────────────────────────────────────────────────────

interface LocationDetailPanelProps {
  loc: Location;
  onClose: () => void;
  onEdit: (loc: Location) => void;
  onDeleted: (id: string) => void;
  onStatusChanged: (id: string, isActive: boolean) => void;
}

function LocationDetailPanel({ loc, onClose, onEdit, onDeleted, onStatusChanged }: LocationDetailPanelProps) {
  const { toast } = useToast();
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleToggleStatus() {
    setToggling(true);
    const newActive = loc.status !== 'active';
    try {
      await apiFetch(`locations/${loc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: newActive }),
      });
      onStatusChanged(loc.id, newActive);
      toast({
        title: newActive ? 'Location activated' : 'Location deactivated',
        description: `"${loc.name}" is now ${newActive ? 'active' : 'inactive'}.`,
        variant: 'success',
      });
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to update status.');
      toast({ title: 'Failed to update status', description: msg, variant: 'destructive' });
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${loc.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await apiFetch(`locations/${loc.id}`, { method: 'DELETE' });
      onDeleted(loc.id);
      toast({ title: 'Location deleted', description: `"${loc.name}" has been deleted.`, variant: 'success' });
      onClose();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to delete location.');
      toast({ title: 'Failed to delete location', description: msg, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Slide-in panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-sm overflow-y-auto bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Location Details</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Name & status */}
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{loc.name}</p>
            <span
              className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                loc.status === 'active'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              {loc.status}
            </span>
          </div>

          {/* Details */}
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Address: </span>
              {loc.address}{loc.suburb ? `, ${loc.suburb}` : ''}{loc.state ? `, ${loc.state}` : ''}{loc.postcode ? ` ${loc.postcode}` : ''}
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Phone: </span>
              {loc.phone || '—'}
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Manager: </span>
              {loc.managerName || '—'}
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Manager Email: </span>
              {loc.managerEmail || '—'}
            </div>
          </div>

          {/* Status toggle */}
          <div className="flex items-center justify-between rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Active Status</p>
              <p className="text-xs text-gray-500">Toggle location on/off</p>
            </div>
            <button
              onClick={() => void handleToggleStatus()}
              disabled={toggling}
              className="text-gray-400 hover:text-indigo-600 disabled:opacity-50"
            >
              {toggling
                ? <Loader2 className="h-6 w-6 animate-spin" />
                : loc.status === 'active'
                  ? <ToggleRight className="h-7 w-7 text-indigo-600" />
                  : <ToggleLeft className="h-7 w-7" />
              }
            </button>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={() => { onEdit(loc); onClose(); }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Pencil className="h-4 w-4" /> Edit Location
            </button>
            <button
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete Location
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LocationsClient() {
  const { toast } = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Location | null>(null);
  const [form, setForm] = useState<AddLocationForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [detailLocation, setDetailLocation] = useState<Location | null>(null);

  useEffect(() => {
    setIsLoading(true);
    apiFetch<{ data?: unknown[] } | unknown[]>('locations')
      .then((json) => {
        const raw: unknown[] = Array.isArray(json) ? json : (json as { data?: unknown[] }).data ?? [];
        const data: Location[] = raw.map((item) => {
          const r = item as Record<string, unknown>;
          // API may return address as a nested object or a flat string
          const addr = r['address'];
          const street = typeof addr === 'object' && addr !== null
            ? String((addr as Record<string, unknown>)['street'] ?? '')
            : String(addr ?? '');
          const suburb = typeof addr === 'object' && addr !== null
            ? String((addr as Record<string, unknown>)['suburb'] ?? '')
            : String(r['suburb'] ?? '');
          const state = typeof addr === 'object' && addr !== null
            ? String((addr as Record<string, unknown>)['state'] ?? '')
            : String(r['state'] ?? '');
          const postcode = typeof addr === 'object' && addr !== null
            ? String((addr as Record<string, unknown>)['postcode'] ?? '')
            : String(r['postcode'] ?? '');
          return {
            id: String(r['id'] ?? ''),
            name: String(r['name'] ?? ''),
            address: street,
            suburb,
            state,
            postcode,
            phone: String(r['phone'] ?? ''),
            managerName: String(r['managerName'] ?? r['manager_name'] ?? ''),
            managerEmail: String(r['managerEmail'] ?? r['manager_email'] ?? ''),
            status: (r['status'] === 'inactive' ? 'inactive' : 'active') as Location['status'],
            revenueToday: Number(r['revenueToday'] ?? r['revenue_today'] ?? 0),
          };
        });
        setLocations(data);
      })
      .catch(() => setLocations([]))
      .finally(() => setIsLoading(false));
  }, []);

  const totalRevenue = locations.reduce((s, l) => s + l.revenueToday, 0);
  const activeCount = locations.filter((l) => l.status === 'active').length;
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleCardToggle(loc: Location) {
    setTogglingId(loc.id);
    const newActive = loc.status !== 'active';
    // Optimistic update
    setLocations((prev) =>
      prev.map((l) => l.id === loc.id ? { ...l, status: newActive ? 'active' : 'inactive' } : l),
    );
    try {
      await apiFetch(`locations/${loc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: newActive }),
      });
      toast({
        title: newActive ? 'Location activated' : 'Location deactivated',
        description: `"${loc.name}" is now ${newActive ? 'active' : 'inactive'}.`,
        variant: 'success',
      });
    } catch (err) {
      // Revert optimistic update
      setLocations((prev) =>
        prev.map((l) => l.id === loc.id ? { ...l, status: loc.status } : l),
      );
      const msg = getErrorMessage(err, 'Failed to update status.');
      toast({ title: 'Failed to update status', description: msg, variant: 'destructive' });
    } finally {
      setTogglingId(null);
    }
  }

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(loc: Location) {
    setEditTarget(loc);
    setForm({
      name: loc.name,
      address: loc.address,
      suburb: loc.suburb,
      state: loc.state,
      postcode: loc.postcode,
      phone: loc.phone,
      managerName: loc.managerName,
      managerEmail: loc.managerEmail,
    });
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editTarget) {
        await apiFetch(`locations/${editTarget.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        setLocations((prev) =>
          prev.map((l) =>
            l.id === editTarget.id
              ? { ...l, ...form }
              : l,
          ),
        );
        toast({ title: 'Location updated', description: `"${form.name}" has been updated.`, variant: 'success' });
        setShowModal(false);
      } else {
        const created = await apiFetch<Location>('locations', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        // Normalise response — API may return address as nested object
        const addr = (created as unknown as Record<string, unknown>)['address'];
        const normalisedLocation: Location = {
          id: String((created as unknown as Record<string, unknown>)['id'] ?? Date.now()),
          name: created.name ?? form.name,
          address: typeof addr === 'object' && addr !== null
            ? String((addr as Record<string, unknown>)['street'] ?? form.address)
            : String(addr ?? form.address),
          suburb: typeof addr === 'object' && addr !== null
            ? String((addr as Record<string, unknown>)['suburb'] ?? form.suburb)
            : (created.suburb ?? form.suburb),
          state: typeof addr === 'object' && addr !== null
            ? String((addr as Record<string, unknown>)['state'] ?? form.state)
            : (created.state ?? form.state),
          postcode: typeof addr === 'object' && addr !== null
            ? String((addr as Record<string, unknown>)['postcode'] ?? form.postcode)
            : (created.postcode ?? form.postcode),
          phone: created.phone ?? form.phone,
          managerName: created.managerName ?? form.managerName,
          managerEmail: created.managerEmail ?? form.managerEmail,
          status: created.status ?? 'active',
          revenueToday: created.revenueToday ?? 0,
        };
        setLocations((prev) => [...prev, normalisedLocation]);
        toast({ title: 'Location added', description: `"${form.name}" has been added.`, variant: 'success' });
        setShowModal(false);
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: editTarget ? 'Failed to update location' : 'Failed to add location', description: msg, variant: 'destructive' });
      // Keep modal open so the merchant can correct and retry
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Locations</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isLoading ? 'Loading…' : `${locations.length} locations`}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Add Location
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Locations', value: isLoading ? '—' : String(locations.length) },
          { label: 'Active', value: isLoading ? '—' : String(activeCount) },
          {
            label: "Total Revenue Today",
            value: isLoading ? '—' : formatCurrency(totalRevenue),
          },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-52 rounded-xl bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
                    <MapPin className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{loc.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {loc.suburb}, {loc.state}
                    </p>
                  </div>
                </div>
                <button
                  title={loc.status === 'active' ? 'Click to deactivate' : 'Click to activate'}
                  onClick={() => void handleCardToggle(loc)}
                  disabled={togglingId === loc.id}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-70 disabled:cursor-wait disabled:opacity-50 ${
                    loc.status === 'active'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  {togglingId === loc.id ? '…' : loc.status}
                </button>
              </div>

              <div className="mt-4 space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                <p>{loc.address}</p>
                <p>{loc.phone}</p>
                <p className="text-xs">Manager: {loc.managerName}</p>
              </div>

              <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">Today&apos;s Revenue</p>
                <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(loc.revenueToday)}
                </p>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => openEdit(loc)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => setDetailLocation(loc)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Location Detail Panel */}
      {detailLocation && (
        <LocationDetailPanel
          loc={detailLocation}
          onClose={() => setDetailLocation(null)}
          onEdit={(loc) => { openEdit(loc); }}
          onDeleted={(id) => {
            setLocations((prev) => prev.filter((l) => l.id !== id));
          }}
          onStatusChanged={(id, isActive) => {
            setLocations((prev) =>
              prev.map((l) => l.id === id ? { ...l, status: isActive ? 'active' : 'inactive' } : l),
            );
            // Update detail panel location so toggle reflects new state
            setDetailLocation((prev) => prev ? { ...prev, status: isActive ? 'active' : 'inactive' } : null);
          }}
        />
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {editTarget ? 'Edit Location' : 'Add Location'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              {(
                [
                  { key: 'name', label: 'Location Name', placeholder: 'Main Store' },
                  { key: 'address', label: 'Street Address', placeholder: '123 George Street' },
                  { key: 'suburb', label: 'Suburb', placeholder: 'Sydney' },
                  { key: 'state', label: 'State', placeholder: 'NSW' },
                  { key: 'postcode', label: 'Postcode', placeholder: '2000' },
                  { key: 'phone', label: 'Phone', placeholder: '02 9000 0001' },
                  { key: 'managerName', label: 'Manager Name', placeholder: 'Jane Smith' },
                  { key: 'managerEmail', label: 'Manager Email', placeholder: 'manager@example.com' },
                ] as { key: keyof AddLocationForm; label: string; placeholder: string }[]
              ).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {label}
                  </label>
                  <input
                    type={key === 'managerEmail' ? 'email' : 'text'}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving || !form.name}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editTarget ? 'Save Changes' : 'Add Location'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
