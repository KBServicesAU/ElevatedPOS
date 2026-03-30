'use client';

import { useState, useEffect } from 'react';
import { MapPin, Plus, Pencil, Eye, X, Loader2 } from 'lucide-react';
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

const MOCK_LOCATIONS: Location[] = [
  {
    id: '1',
    name: 'Main Store',
    address: '123 George Street',
    suburb: 'Sydney',
    state: 'NSW',
    postcode: '2000',
    phone: '02 9000 0001',
    managerName: 'Jane Doe',
    managerEmail: 'jane@example.com',
    status: 'active',
    revenueToday: 845200,
  },
  {
    id: '2',
    name: 'City Branch',
    address: '456 Collins Street',
    suburb: 'Melbourne',
    state: 'VIC',
    postcode: '3000',
    phone: '03 9000 0002',
    managerName: 'Bob Smith',
    managerEmail: 'bob@example.com',
    status: 'active',
    revenueToday: 612100,
  },
  {
    id: '3',
    name: 'Airport Kiosk',
    address: 'Terminal 1, Sydney Airport',
    suburb: 'Mascot',
    state: 'NSW',
    postcode: '2020',
    phone: '02 9000 0003',
    managerName: 'Alice Lee',
    managerEmail: 'alice@example.com',
    status: 'inactive',
    revenueToday: 0,
  },
];


interface AddLocationForm {
  name: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  phone: string;
  managerEmail: string;
}

const EMPTY_FORM: AddLocationForm = {
  name: '',
  address: '',
  suburb: '',
  state: '',
  postcode: '',
  phone: '',
  managerEmail: '',
};

export function LocationsClient() {
  const { toast } = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Location | null>(null);
  const [form, setForm] = useState<AddLocationForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    apiFetch<{ data?: Location[] } | Location[]>('locations')
      .then((json) => {
        const data: Location[] = Array.isArray(json) ? json : (json as { data?: Location[] }).data ?? [];
        setLocations(data.length > 0 ? data : MOCK_LOCATIONS);
      })
      .catch(() => setLocations(MOCK_LOCATIONS))
      .finally(() => setIsLoading(false));
  }, []);

  const totalRevenue = locations.reduce((s, l) => s + l.revenueToday, 0);
  const activeCount = locations.filter((l) => l.status === 'active').length;

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
              ? { ...l, ...form, managerName: form.managerEmail.split('@')[0] }
              : l,
          ),
        );
        toast({ title: 'Location updated', description: `"${form.name}" has been updated.`, variant: 'success' });
      } else {
        const created: Location = await apiFetch<Location>('locations', {
          method: 'POST',
          body: JSON.stringify(form),
        }).catch(() => ({
          id: String(Date.now()),
          ...form,
          managerName: form.managerEmail.split('@')[0],
          status: 'active' as const,
          revenueToday: 0,
        }));
        setLocations((prev) => [...prev, created]);
        toast({ title: 'Location added', description: `"${form.name}" has been added.`, variant: 'success' });
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: editTarget ? 'Failed to update location' : 'Failed to add location', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
      setShowModal(false);
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
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    loc.status === 'active'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  {loc.status}
                </span>
              </div>

              <div className="mt-4 space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                <p>{loc.address}</p>
                <p>{loc.phone}</p>
                <p className="text-xs">Manager: {loc.managerName}</p>
              </div>

              <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">Today's Revenue</p>
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
                <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                  <Eye className="h-3.5 w-3.5" />
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
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
                onClick={handleSave}
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
