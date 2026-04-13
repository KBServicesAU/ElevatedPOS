'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Building2,
  MonitorSmartphone,
  ShoppingCart,
  StickyNote,
  ExternalLink,
  RefreshCw,
  KeyRound,
  Trash2,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';

interface OrgDetail {
  id: string;
  businessName: string;
  plan?: string;
  onboardingStep?: string;
  createdAt?: string;
  deviceLimit?: number;
  employees?: { id: string; email: string; firstName?: string; lastName?: string; role?: string }[];
}

interface Device {
  id: string;
  name?: string;
  role?: string;
  status?: string;
  lastSeen?: string;
}

interface ApiDeviceResponse {
  devices?: Device[];
  data?: Device[];
}

interface Note {
  id: string;
  text: string;
  authorName?: string;
  authorId?: string;
  createdAt: string;
}

interface ApiNoteResponse {
  notes?: Note[];
  data?: Note[];
}

const TABS = ['Overview', 'Devices', 'Orders', 'Notes'] as const;
type Tab = (typeof TABS)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch(path: string, options?: RequestInit): Promise<unknown> {
  const res = await fetch(`/api/proxy/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const msg =
      (data as { message?: string; error?: string })?.message ??
      (data as { message?: string; error?: string })?.error ??
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Notes tab
// ---------------------------------------------------------------------------

interface NotesTabProps {
  orgId: string;
}

function NotesTab({ orgId }: NotesTabProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteText, setNoteText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Current user id from /api/auth/me
  const [currentUserId, setCurrentUserId] = useState<string>('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { email?: string } | null) => {
        if (data?.email) setCurrentUserId(data.email);
      })
      .catch(() => {});
  }, []);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`platform/support-notes?orgId=${encodeURIComponent(orgId)}`);
      if (Array.isArray(data)) {
        setNotes(data as Note[]);
      } else if (data && typeof data === 'object') {
        const d = data as ApiNoteResponse;
        if (Array.isArray(d.notes)) setNotes(d.notes);
        else if (Array.isArray(d.data)) setNotes(d.data);
        else setNotes([]);
      } else {
        setNotes([]);
      }
    } catch (err) {
      setError((err as Error).message);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch('platform/support-notes', {
        method: 'POST',
        body: JSON.stringify({ orgId, text: noteText.trim() }),
      });
      setNoteText('');
      await fetchNotes();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    setDeletingId(noteId);
    setError('');
    try {
      await apiFetch(`platform/support-notes/${noteId}`, { method: 'DELETE' });
      await fetchNotes();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Add note */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
          <StickyNote size={16} className="text-blue-600 dark:text-blue-400" /> Add Note
        </h3>
        <form onSubmit={handleAddNote}>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Type your support note here…"
            rows={3}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none"
          />
          {error && (
            <p className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 mt-2">
              <AlertCircle size={14} />
              {error}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={!noteText.trim() || saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Add Note
            </button>
          </div>
        </form>
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400 dark:text-gray-500">
          <Loader2 size={18} className="animate-spin" />
          Loading notes…
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center text-sm text-gray-400 dark:text-gray-500 py-6">No notes yet</div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const isOwn =
              !note.authorId ||
              note.authorId === currentUserId ||
              note.authorName === currentUserId;
            return (
              <div key={note.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap flex-1">{note.text}</p>
                  {isOwn && (
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      disabled={deletingId === note.id}
                      className="text-gray-400 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                      title="Delete note"
                    >
                      {deletingId === note.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {note.authorName && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{note.authorName}</span>
                  )}
                  {note.authorName && <span className="text-xs text-gray-300 dark:text-gray-600">·</span>}
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(note.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reset Password Modal (real API call)
// ---------------------------------------------------------------------------

interface Employee {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface ResetPasswordModalProps {
  orgId: string;
  employees: Employee[];
  onClose: () => void;
}

function ResetPasswordModal({ orgId, employees, onClose }: ResetPasswordModalProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employees[0]?.id ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const mismatch = newPassword.length > 0 && passwordConfirm.length > 0 && newPassword !== passwordConfirm;
  const tooShort = newPassword.length > 0 && newPassword.length < 8;

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployeeId || !newPassword || newPassword !== passwordConfirm) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      await apiFetch(`platform/organisations/${orgId}/employees/${selectedEmployeeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: newPassword }),
      });
      setStatus('success');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Reset Employee Password</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>

        {status === 'success' ? (
          <div className="px-6 py-8 text-center">
            <p className="text-green-600 dark:text-green-400 font-medium">Password reset successfully</p>
          </div>
        ) : (
          <form onSubmit={handleReset} className="px-6 py-4 space-y-4">
            {employees.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Employee
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} — {emp.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
                placeholder="Min. 8 characters"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
              />
            </div>
            {tooShort && (
              <p className="text-sm text-amber-600 dark:text-amber-400">Password must be at least 8 characters</p>
            )}
            {mismatch && (
              <p className="text-sm text-red-600 dark:text-red-400">Passwords do not match</p>
            )}
            {status === 'error' && errorMsg && (
              <p className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                <AlertCircle size={14} />
                {errorMsg}
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={status === 'loading' || !newPassword || newPassword !== passwordConfirm || tooShort}
                className="px-5 py-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
              >
                {status === 'loading' && <Loader2 size={14} className="animate-spin" />}
                Reset Password
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MerchantDetailPage() {
  const rawParams = useParams();
  const orgId = (rawParams?.['id'] ?? '') as string;

  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [orgError, setOrgError] = useState('');

  // Modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Load org
  useEffect(() => {
    setOrgError('');
    fetch(`/api/proxy/platform/organisations/${orgId}`)
      .then((r) => r.json())
      .then((data: OrgDetail | { organisation?: OrgDetail; data?: OrgDetail }) => {
        if (data && 'businessName' in data) {
          setOrg(data as OrgDetail);
        } else if (data && 'organisation' in data && data.organisation) {
          setOrg(data.organisation);
        } else if (data && 'data' in data && data.data) {
          setOrg(data.data);
        } else {
          setOrgError('Merchant not found');
        }
      })
      .catch((err: unknown) => {
        setOrgError((err as Error).message ?? 'Failed to load merchant');
      })
      .finally(() => setLoadingOrg(false));
  }, [orgId]);

  const [devicesError, setDevicesError] = useState('');

  // Load devices when Devices tab active
  const fetchDevices = useCallback(() => {
    setLoadingDevices(true);
    setDevicesError('');
    fetch(`/api/proxy/platform/organisations/${orgId}/devices`)
      .then(async (r) => {
        let data: unknown;
        try { data = await r.json(); } catch { data = {}; }
        if (!r.ok) {
          const msg = (data as { message?: string; error?: string })?.message
            ?? (data as { message?: string; error?: string })?.error
            ?? `HTTP ${r.status}`;
          throw new Error(msg);
        }
        return data as ApiDeviceResponse | Device[];
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setDevices(data);
        } else if (data && 'devices' in data && Array.isArray(data.devices)) {
          setDevices(data.devices);
        } else if (data && 'data' in data && Array.isArray(data.data)) {
          setDevices(data.data);
        } else {
          setDevices([]);
        }
      })
      .catch((err: unknown) => {
        setDevicesError((err as Error).message ?? 'Failed to load devices');
        setDevices([]);
      })
      .finally(() => setLoadingDevices(false));
  }, [orgId]);

  useEffect(() => {
    if (activeTab === 'Devices') {
      fetchDevices();
    }
  }, [activeTab, fetchDevices]);

  if (loadingOrg) {
    return (
      <div className="max-w-6xl mx-auto py-12 text-center text-sm text-gray-400 dark:text-gray-500">Loading…</div>
    );
  }

  if (orgError || !org) {
    return (
      <div className="max-w-6xl mx-auto py-12 text-center text-sm text-red-500 dark:text-red-400">
        {orgError || 'Merchant not found.'}
      </div>
    );
  }

  const employees = org.employees ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{org.businessName}</h1>
          <div className="flex items-center gap-2 mt-1">
            {org.plan && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 capitalize">
                {org.plan}
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500">ID: {org.id}</span>
          </div>
        </div>
        <a
          href={`${process.env.NEXT_PUBLIC_GODMODE_URL ?? 'https://godmode.elevatedpos.com.au'}/merchants/${org.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-sm font-medium rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
        >
          <ExternalLink size={15} />
          View in Godmode
        </a>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Left — Tabs */}
        <div className="flex-1 min-w-0">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 dark:border-gray-800 mb-5">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Overview */}
          {activeTab === 'Overview' && (
            <div className="space-y-5">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <Building2 size={16} className="text-blue-600 dark:text-blue-400" /> Org Details
                </h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <DetailRow label="Business Name" value={org.businessName} />
                  <DetailRow label="Plan" value={org.plan ?? '—'} />
                  <DetailRow label="Onboarding Step" value={org.onboardingStep ?? '—'} />
                  <DetailRow label="Device Limit" value={org.deviceLimit?.toString() ?? '—'} />
                  <DetailRow
                    label="Joined"
                    value={org.createdAt ? new Date(org.createdAt).toLocaleDateString() : '—'}
                  />
                </dl>
              </div>

              {/* Contacts */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Key Contacts</h3>
                {employees.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">No contacts found</p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {employees.map((emp) => (
                      <li key={emp.id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{emp.email}</p>
                        </div>
                        {emp.role && (
                          <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full capitalize">
                            {emp.role}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Devices */}
          {activeTab === 'Devices' && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                <MonitorSmartphone size={16} className="text-blue-600 dark:text-blue-400" />
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">Devices</h3>
                <button
                  onClick={fetchDevices}
                  disabled={loadingDevices}
                  className="ml-auto text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Refresh devices"
                >
                  <RefreshCw size={14} className={loadingDevices ? 'animate-spin' : ''} />
                </button>
              </div>
              {loadingDevices ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Loading…</div>
              ) : devicesError ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-red-500 dark:text-red-400">
                  <AlertCircle size={20} />
                  <span>{devicesError}</span>
                  <button
                    onClick={fetchDevices}
                    className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : devices.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <MonitorSmartphone size={36} className="mx-auto text-gray-200 dark:text-gray-700 mb-3" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">No devices found for this merchant</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Last Seen
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {devices.map((device) => (
                      <tr key={device.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                          {device.name ?? device.id}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">{device.role ?? '—'}</td>
                        <td className="px-5 py-3 text-sm">
                          <StatusBadge status={device.status} />
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-500">
                          {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Orders */}
          {activeTab === 'Orders' && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center">
              <ShoppingCart size={36} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-1">Orders</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                View full order history in the Orders section.
              </p>
              <a
                href={`/dashboard/orders?orgId=${org.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-900 text-white text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors"
              >
                <ShoppingCart size={14} />
                View Orders for this Merchant
              </a>
            </div>
          )}

          {/* Notes */}
          {activeTab === 'Notes' && <NotesTab orgId={orgId} />}
        </div>

        {/* Right — Support Actions */}
        <div className="w-full lg:w-72 flex-shrink-0 space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Support Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => setShowPasswordModal(true)}
                disabled={employees.length === 0}
                className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={employees.length === 0 ? 'No employees to reset password for' : undefined}
              >
                <KeyRound size={16} className="text-blue-600 dark:text-blue-400" />
                Reset Password
              </button>
              <button
                disabled
                className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-400 dark:text-gray-600 cursor-not-allowed"
              >
                <RefreshCw size={16} />
                Regenerate Device Code
                <span className="ml-auto text-xs bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 px-1.5 py-0.5 rounded">
                  soon
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <ResetPasswordModal
          orgId={orgId}
          employees={employees}
          onClose={() => setShowPasswordModal(false)}
        />
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-900 dark:text-gray-100">{value}</dd>
    </>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = status?.toLowerCase() ?? '';
  const classes =
    s === 'active'
      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
      : s === 'inactive'
      ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
      : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${classes}`}
    >
      {status ?? 'unknown'}
    </span>
  );
}
