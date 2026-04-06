'use client';

import { useEffect, useState, useCallback } from 'react';
import { platformFetch } from '@/lib/api';
import { Plus, X, Edit2 } from 'lucide-react';

interface PlatformStaff {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface StaffResponse {
  data: PlatformStaff[];
}

interface AddStaffForm {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: 'support' | 'reseller';
}

interface EditStaffForm {
  firstName: string;
  lastName: string;
  email: string;
  role: 'superadmin' | 'support' | 'reseller';
  password: string;
}

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-red-500/20 text-red-400',
  support: 'bg-indigo-500/20 text-indigo-400',
  reseller: 'bg-yellow-500/20 text-yellow-400',
};

export default function StaffPage() {
  const [staff, setStaff] = useState<PlatformStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<AddStaffForm>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'support',
  });

  // Edit state
  const [editingStaff, setEditingStaff] = useState<PlatformStaff | null>(null);
  const [editForm, setEditForm] = useState<EditStaffForm>({
    firstName: '',
    lastName: '',
    email: '',
    role: 'support',
    password: '',
  });
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Toggle active state
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'toggle'; staff: PlatformStaff } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await platformFetch('platform/staff')) as StaffResponse;
      setStaff(data.data);
    } catch (err) {
      console.error('Failed to load staff:', err);
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAddStaff() {
    setSubmitting(true);
    setError('');
    try {
      await platformFetch('platform/staff', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setShowModal(false);
      setForm({ firstName: '', lastName: '', email: '', password: '', role: 'support' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create staff member');
    } finally {
      setSubmitting(false);
    }
  }

  function requestDelete(s: PlatformStaff) {
    setConfirmAction({ type: 'delete', staff: s });
  }

  async function handleDeactivate(id: string) {
    setActionError('');
    try {
      await platformFetch(`platform/staff/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      console.error('Failed to delete staff member:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to delete staff member.');
    }
  }

  function openEditModal(s: PlatformStaff) {
    setEditingStaff(s);
    setEditForm({
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      role: s.role as EditStaffForm['role'],
      password: '',
    });
    setEditError('');
  }

  async function handleSaveEdit() {
    if (!editingStaff) return;
    setEditSubmitting(true);
    setEditError('');
    try {
      const payload: Record<string, string> = {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        email: editForm.email,
        role: editForm.role,
      };
      if (editForm.password) payload.password = editForm.password;
      await platformFetch(`platform/staff/${editingStaff.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setEditingStaff(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update staff member');
    } finally {
      setEditSubmitting(false);
    }
  }

  function requestToggleActive(s: PlatformStaff) {
    setConfirmAction({ type: 'toggle', staff: s });
  }

  async function handleToggleActive(s: PlatformStaff) {
    const action = s.isActive ? 'Deactivate' : 'Activate';
    setTogglingId(s.id);
    setActionError('');
    try {
      await platformFetch(`platform/staff/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !s.isActive }),
      });
      await load();
    } catch (err) {
      console.error(`Failed to ${action.toLowerCase()} staff member:`, err);
      setActionError(err instanceof Error ? err.message : `Failed to ${action.toLowerCase()} staff member.`);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Staff</h1>
          <p className="text-gray-500 text-sm mt-1">Manage godmode access</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Staff Member
        </button>
      </div>

      {actionError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
          {actionError}
        </div>
      )}

      <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e]">
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Last Login</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-600">Loading...</td>
              </tr>
            ) : staff.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-600">No staff members</td>
              </tr>
            ) : (
              staff.map((s) => (
                <tr key={s.id} className="border-b border-[#1e1e2e] hover:bg-[#1e1e2e]/30">
                  <td className="px-6 py-3 text-white">
                    {s.firstName} {s.lastName}
                  </td>
                  <td className="px-6 py-3 text-gray-400">{s.email}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[s.role] ?? 'bg-gray-500/20 text-gray-400'}`}>
                      {s.role}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-400">
                    {s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${s.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-500'}`}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(s)}
                        className="px-3 py-1 bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 rounded text-xs hover:bg-indigo-600/30 transition-colors"
                      >
                        <Edit2 className="w-3 h-3 inline mr-1" />
                        Edit
                      </button>
                      {s.role !== 'superadmin' && (
                        <>
                          {s.isActive ? (
                            <button
                              onClick={() => requestToggleActive(s)}
                              disabled={togglingId === s.id}
                              className="px-3 py-1 bg-red-600/20 text-red-400 border border-red-600/30 rounded text-xs hover:bg-red-600/30 disabled:opacity-50 transition-colors"
                            >
                              {togglingId === s.id ? '...' : 'Deactivate'}
                            </button>
                          ) : (
                            <button
                              onClick={() => requestToggleActive(s)}
                              disabled={togglingId === s.id}
                              className="px-3 py-1 bg-green-600/20 text-green-400 border border-green-600/30 rounded text-xs hover:bg-green-600/30 disabled:opacity-50 transition-colors"
                            >
                              {togglingId === s.id ? '...' : 'Activate'}
                            </button>
                          )}
                          <button
                            onClick={() => requestDelete(s)}
                            className="px-3 py-1 bg-red-600/20 text-red-400 border border-red-600/30 rounded text-xs hover:bg-red-600/30 transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Staff Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">Add Staff Member</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">First Name</label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Last Name</label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'support' | 'reseller' }))}
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="support">Support</option>
                  <option value="reseller">Reseller</option>
                </select>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 border border-[#1e1e2e] text-gray-400 text-sm rounded hover:bg-[#1e1e2e] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddStaff}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
              >
                {submitting ? 'Creating...' : 'Create Staff'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {editingStaff && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">
                Edit Staff — {editingStaff.firstName} {editingStaff.lastName}
              </h3>
              <button onClick={() => setEditingStaff(null)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">First Name</label>
                  <input
                    type="text"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Last Name</label>
                  <input
                    type="text"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as EditStaffForm['role'] }))}
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="superadmin">Superadmin</option>
                  <option value="support">Support</option>
                  <option value="reseller">Reseller</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                  Password <span className="text-gray-600 normal-case">(leave blank to keep current)</span>
                </label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="New password"
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {editError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
                  {editError}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingStaff(null)}
                className="flex-1 px-4 py-2.5 border border-[#1e1e2e] text-gray-400 text-sm rounded hover:bg-[#1e1e2e] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSubmitting}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
              >
                {editSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-white font-semibold mb-3">
              {confirmAction.type === 'delete' ? 'Delete Staff Member' : (confirmAction.staff.isActive ? 'Deactivate' : 'Activate') + ' Staff Member'}
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              {confirmAction.type === 'delete'
                ? `Permanently delete ${confirmAction.staff.firstName} ${confirmAction.staff.lastName}? This cannot be undone.`
                : `${confirmAction.staff.isActive ? 'Deactivate' : 'Activate'} ${confirmAction.staff.firstName} ${confirmAction.staff.lastName}?`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 px-4 py-2.5 border border-[#1e1e2e] text-gray-400 text-sm rounded hover:bg-[#1e1e2e] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const s = confirmAction.staff;
                  setConfirmAction(null);
                  if (confirmAction.type === 'delete') {
                    await handleDeactivate(s.id);
                  } else {
                    await handleToggleActive(s);
                  }
                }}
                className={`flex-1 px-4 py-2.5 text-white text-sm rounded transition-colors ${
                  confirmAction.type === 'delete' || confirmAction.staff.isActive
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-green-600 hover:bg-green-500'
                }`}
              >
                {confirmAction.type === 'delete' ? 'Delete' : (confirmAction.staff.isActive ? 'Deactivate' : 'Activate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
