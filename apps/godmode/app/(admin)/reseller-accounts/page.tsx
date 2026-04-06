'use client';

import { useEffect, useState, useCallback } from 'react';
import { platformFetch } from '@/lib/api';
import { Plus, X } from 'lucide-react';

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

interface AddResellerForm {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export default function ResellerAccountsPage() {
  const [accounts, setAccounts] = useState<PlatformStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<AddResellerForm>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const data = (await platformFetch('platform/staff')) as StaffResponse;
      setAccounts(data.data.filter((s) => s.role === 'reseller'));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load accounts');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function handleOpenModal() {
    setForm({ firstName: '', lastName: '', email: '', password: '' });
    setFormError('');
    setShowModal(true);
  }

  async function handleAddReseller() {
    if (form.password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await platformFetch('platform/staff', {
        method: 'POST',
        body: JSON.stringify({ ...form, role: 'reseller' }),
      });
      setShowModal(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create reseller account');
    } finally {
      setSubmitting(false);
    }
  }

  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: string; name: string } | null>(null);
  const [actionError, setActionError] = useState('');

  async function handleDeactivate(id: string) {
    setActionError('');
    try {
      await platformFetch(`platform/staff/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      console.error('Failed to deactivate reseller account:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to deactivate reseller account.');
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reseller Accounts</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage reseller accounts who can log into the Reseller Portal
          </p>
        </div>
        <button
          onClick={handleOpenModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Reseller
        </button>
      </div>

      {(fetchError || actionError) && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
          {fetchError || actionError}
        </div>
      )}

      <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e]">
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Last Login</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Created</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#1e1e2e]">
                  <td className="px-6 py-3"><div className="h-4 bg-[#1e1e2e] rounded animate-pulse w-32" /></td>
                  <td className="px-6 py-3"><div className="h-4 bg-[#1e1e2e] rounded animate-pulse w-48" /></td>
                  <td className="px-6 py-3"><div className="h-4 bg-[#1e1e2e] rounded animate-pulse w-16" /></td>
                  <td className="px-6 py-3"><div className="h-4 bg-[#1e1e2e] rounded animate-pulse w-24" /></td>
                  <td className="px-6 py-3"><div className="h-4 bg-[#1e1e2e] rounded animate-pulse w-24" /></td>
                  <td className="px-6 py-3"><div className="h-4 bg-[#1e1e2e] rounded animate-pulse w-20" /></td>
                </tr>
              ))
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-600">
                  No reseller accounts found
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id} className="border-b border-[#1e1e2e] hover:bg-[#1e1e2e]/30">
                  <td className="px-6 py-3 text-white">
                    {account.firstName} {account.lastName}
                  </td>
                  <td className="px-6 py-3 text-gray-400">{account.email}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        account.isActive
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-gray-500/20 text-gray-500'
                      }`}
                    >
                      {account.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-400">
                    {account.lastLoginAt
                      ? new Date(account.lastLoginAt).toLocaleDateString('en-AU')
                      : '—'}
                  </td>
                  <td className="px-6 py-3 text-gray-400">
                    {new Date(account.createdAt).toLocaleDateString('en-AU')}
                  </td>
                  <td className="px-6 py-3">
                    {account.isActive && (
                      <button
                        onClick={() =>
                          setConfirmDeactivate({
                            id: account.id,
                            name: `${account.firstName} ${account.lastName}`,
                          })
                        }
                        className="px-3 py-1 bg-red-600/20 text-red-400 border border-red-600/30 rounded text-xs hover:bg-red-600/30 transition-colors"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Reseller Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">Add Reseller Account</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Min. 8 characters"
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-700"
                />
              </div>

              {formError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
                  {formError}
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
                onClick={handleAddReseller}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
              >
                {submitting ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Confirmation Modal */}
      {confirmDeactivate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-white font-semibold mb-3">Deactivate Reseller Account</h3>
            <p className="text-gray-400 text-sm mb-6">
              Deactivate {confirmDeactivate.name}? They will no longer be able to log in to the Reseller Portal.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeactivate(null)}
                className="flex-1 px-4 py-2.5 border border-[#1e1e2e] text-gray-400 text-sm rounded hover:bg-[#1e1e2e] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const id = confirmDeactivate.id;
                  setConfirmDeactivate(null);
                  await handleDeactivate(id);
                }}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
