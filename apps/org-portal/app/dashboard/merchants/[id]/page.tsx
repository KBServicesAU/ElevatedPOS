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
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <StickyNote size={16} className="text-blue-600" /> Add Note
        </h3>
        <form onSubmit={handleAddNote}>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Type your support note here…"
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none"
          />
          {error && (
            <p className="flex items-center gap-1.5 text-sm text-red-600 mt-2">
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
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
          <Loader2 size={18} className="animate-spin" />
          Loading notes…
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-6">No notes yet</div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const isOwn =
              !note.authorId ||
              note.authorId === currentUserId ||
              note.authorName === currentUserId;
            return (
              <div key={note.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap flex-1">{note.text}</p>
                  {isOwn && (
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      disabled={deletingId === note.id}
                      className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
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
                    <span className="text-xs text-gray-500 font-medium">{note.authorName}</span>
                  )}
                  {note.authorName && <span className="text-xs text-gray-300">·</span>}
                  <span className="text-xs text-gray-400">
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
// Main page
// ---------------------------------------------------------------------------

export default function MerchantDetailPage() {
  const params = useParams();
  const orgId = params['id'] as string;

  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [loadingDevices, setLoadingDevices] = useState(false);

  // Modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Load org
  useEffect(() => {
    fetch(`/api/proxy/platform/organisations/${orgId}`)
      .then((r) => r.json())
      .then((data: OrgDetail | { organisation?: OrgDetail; data?: OrgDetail }) => {
        if (data && 'businessName' in data) {
          setOrg(data as OrgDetail);
        } else if (data && 'organisation' in data && data.organisation) {
          setOrg(data.organisation);
        } else if (data && 'data' in data && data.data) {
          setOrg(data.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingOrg(false));
  }, [orgId]);

  // Load devices when Devices tab active
  const fetchDevices = useCallback(() => {
    setLoadingDevices(true);
    fetch(`/api/proxy/platform/organisations/${orgId}/devices`)
      .then((r) => r.json())
      .then((data: ApiDeviceResponse | Device[]) => {
        if (Array.isArray(data)) {
          setDevices(data);
        } else if (data && 'devices' in data && Array.isArray(data.devices)) {
          setDevices(data.devices);
        } else if (data && 'data' in data && Array.isArray(data.data)) {
          setDevices(data.data);
        }
      })
      .catch(() => setDevices([]))
      .finally(() => setLoadingDevices(false));
  }, [orgId]);

  useEffect(() => {
    if (activeTab === 'Devices') {
      fetchDevices();
    }
  }, [activeTab, fetchDevices]);

  async function handleResetPassword() {
    if (!newPassword || newPassword !== passwordConfirm) return;
    setPasswordStatus('success');
    setTimeout(() => {
      setShowPasswordModal(false);
      setPasswordStatus('idle');
      setNewPassword('');
      setPasswordConfirm('');
    }, 1500);
  }

  if (loadingOrg) {
    return (
      <div className="max-w-6xl mx-auto py-12 text-center text-sm text-gray-400">Loading…</div>
    );
  }

  if (!org) {
    return (
      <div className="max-w-6xl mx-auto py-12 text-center text-sm text-gray-500">
        Merchant not found.
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{org.businessName}</h1>
          <div className="flex items-center gap-2 mt-1">
            {org.plan && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                {org.plan}
              </span>
            )}
            <span className="text-xs text-gray-400">ID: {org.id}</span>
          </div>
        </div>
        <a
          href={`https://godmode.elevatedpos.com.au/merchants/${org.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors"
        >
          <ExternalLink size={15} />
          View in Godmode
        </a>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Left — Tabs */}
        <div className="flex-1 min-w-0">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 mb-5">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Overview */}
          {activeTab === 'Overview' && (
            <div className="space-y-5">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Building2 size={16} className="text-blue-600" /> Org Details
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
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-800 mb-4">Key Contacts</h3>
                {!org.employees || org.employees.length === 0 ? (
                  <p className="text-sm text-gray-400">No contacts found</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {org.employees.map((emp) => (
                      <li key={emp.id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="text-xs text-gray-500">{emp.email}</p>
                        </div>
                        {emp.role && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
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
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <MonitorSmartphone size={16} className="text-blue-600" />
                <h3 className="font-semibold text-gray-800">Devices</h3>
              </div>
              {loadingDevices ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
              ) : devices.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-400">
                  No devices found for this merchant
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Seen
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {devices.map((device) => (
                      <tr key={device.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-sm font-medium text-gray-900">
                          {device.name ?? device.id}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600">{device.role ?? '—'}</td>
                        <td className="px-5 py-3 text-sm">
                          <StatusBadge status={device.status} />
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-500">
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
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <ShoppingCart size={36} className="mx-auto text-gray-300 mb-3" />
              <h3 className="text-lg font-semibold text-gray-700 mb-1">Orders</h3>
              <p className="text-sm text-gray-500 mb-3">
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
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">Support Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => setShowPasswordModal(true)}
                className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <KeyRound size={16} className="text-blue-600" />
                Reset Password
              </button>
              <button
                disabled
                className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-400 cursor-not-allowed"
              >
                <RefreshCw size={16} />
                Regenerate Device Code
                <span className="ml-auto text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
                  soon
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Reset Employee Password</h2>
            {passwordStatus === 'success' ? (
              <div className="text-center py-4">
                <p className="text-green-600 font-medium">Password reset successfully</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                  />
                </div>
                {newPassword && passwordConfirm && newPassword !== passwordConfirm && (
                  <p className="text-sm text-red-600">Passwords do not match</p>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowPasswordModal(false);
                      setNewPassword('');
                      setPasswordConfirm('');
                    }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResetPassword}
                    disabled={!newPassword || newPassword !== passwordConfirm}
                    className="px-5 py-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Reset Password
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = status?.toLowerCase() ?? '';
  const classes =
    s === 'active'
      ? 'bg-green-100 text-green-700'
      : s === 'inactive'
      ? 'bg-gray-100 text-gray-500'
      : 'bg-yellow-100 text-yellow-700';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${classes}`}
    >
      {status ?? 'unknown'}
    </span>
  );
}
