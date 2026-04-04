'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Users,
  Lock,
  LockOpen,
  Pencil,
  RefreshCw,
  Search,
  AlertCircle,
  Loader2,
  CheckCircle,
  X,
  KeyRound,
  Building2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId?: string;
  isActive: boolean;
  failedLoginAttempts: number;
  lockedUntil?: string | null;
  createdAt?: string;
}

interface Organisation {
  id: string;
  businessName: string;
}

type EmployeeStatus = 'active' | 'locked' | 'inactive';

function getStatus(emp: OrgEmployee): EmployeeStatus {
  if (!emp.isActive) return 'inactive';
  if (emp.lockedUntil && new Date(emp.lockedUntil) > new Date()) return 'locked';
  if (emp.failedLoginAttempts >= 5) return 'locked';
  return 'active';
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function apiFetch(path: string, options?: RequestInit) {
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
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ emp }: { emp: OrgEmployee }) {
  const status = getStatus(emp);
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CheckCircle size={11} />
        Active
      </span>
    );
  }
  if (status === 'locked') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <Lock size={11} />
        Locked
        {emp.failedLoginAttempts > 0 && (
          <span className="ml-0.5 opacity-75">· {emp.failedLoginAttempts} attempts</span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      Inactive
    </span>
  );
}

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------

interface EditModalProps {
  emp: OrgEmployee;
  orgId: string;
  onClose: () => void;
  onSaved: () => void;
}

function EditModal({ emp, orgId, onClose, onSaved }: EditModalProps) {
  const [firstName, setFirstName] = useState(emp.firstName);
  const [lastName, setLastName] = useState(emp.lastName);
  const [email, setEmail] = useState(emp.email);
  const [roleId, setRoleId] = useState(emp.roleId ?? '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const body: Record<string, string> = {};
    if (firstName !== emp.firstName) body.firstName = firstName;
    if (lastName !== emp.lastName) body.lastName = lastName;
    if (email !== emp.email) body.email = email;
    if (roleId !== (emp.roleId ?? '')) body.roleId = roleId;
    if (password.length > 0) body.password = password;

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`platform/organisations/${orgId}/employees/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Edit Employee</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSave} className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">First Name</label>
              <input
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
              <input
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Role ID <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              placeholder="Leave blank to keep current"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              New Password <span className="text-gray-400 font-normal">(optional — leave blank to keep current)</span>
            </label>
            <input
              type="password"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={password.length > 0 ? 8 : undefined}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertCircle size={14} />
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reset password modal
// ---------------------------------------------------------------------------

interface ResetPasswordModalProps {
  emp: OrgEmployee;
  orgId: string;
  onClose: () => void;
  onSaved: () => void;
}

function ResetPasswordModal({ emp, orgId, onClose, onSaved }: ResetPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`platform/organisations/${orgId}/employees/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Reset Password</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleReset} className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-500">
            Setting a new password for{' '}
            <span className="font-medium text-gray-800">
              {emp.firstName} {emp.lastName}
            </span>
            .
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">New Password</label>
            <input
              type="password"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              placeholder="Min. 8 characters"
              autoFocus
            />
          </div>
          {error && (
            <p className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertCircle size={14} />
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Reset Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employee row
// ---------------------------------------------------------------------------

interface EmployeeRowProps {
  emp: OrgEmployee;
  orgId: string;
  onAction: () => void;
}

function EmployeeRow({ emp, orgId, onAction }: EmployeeRowProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const status = getStatus(emp);
  const needsUnlock =
    !emp.isActive ||
    emp.failedLoginAttempts >= 5 ||
    (emp.lockedUntil != null && new Date(emp.lockedUntil) > new Date());

  async function handleUnlock() {
    setActionError('');
    setActionLoading('unlock');
    try {
      await apiFetch(`platform/organisations/${orgId}/employees/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ failedLoginAttempts: 0, lockedUntil: null, isActive: true }),
      });
      onAction();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLock() {
    setActionError('');
    setActionLoading('lock');
    try {
      await apiFetch(`platform/organisations/${orgId}/employees/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      });
      onAction();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-5 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
          {emp.firstName} {emp.lastName}
        </td>
        <td className="px-5 py-3 text-sm text-gray-500">{emp.email}</td>
        <td className="px-5 py-3 text-sm text-gray-500">{emp.roleId ?? '—'}</td>
        <td className="px-5 py-3">
          <StatusBadge emp={emp} />
        </td>
        <td className="px-5 py-3 text-sm text-gray-500 text-center">
          {emp.failedLoginAttempts > 0 ? (
            <span className={emp.failedLoginAttempts >= 5 ? 'text-red-600 font-medium' : ''}>
              {emp.failedLoginAttempts}
            </span>
          ) : (
            '—'
          )}
        </td>
        <td className="px-5 py-3 text-sm text-gray-500 whitespace-nowrap">
          {emp.lockedUntil ? (
            <span className={new Date(emp.lockedUntil) > new Date() ? 'text-red-600' : 'text-gray-400'}>
              {new Date(emp.lockedUntil).toLocaleString()}
            </span>
          ) : (
            '—'
          )}
        </td>
        <td className="px-5 py-3">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {actionError && (
              <span className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle size={12} />
                {actionError}
              </span>
            )}

            {/* Unlock */}
            {needsUnlock && (
              <button
                onClick={handleUnlock}
                disabled={actionLoading === 'unlock'}
                title="Unlock account"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors disabled:opacity-60"
              >
                {actionLoading === 'unlock' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <LockOpen size={12} />
                )}
                Unlock
              </button>
            )}

            {/* Lock */}
            {status === 'active' && (
              <button
                onClick={handleLock}
                disabled={actionLoading === 'lock'}
                title="Lock account"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-60"
              >
                {actionLoading === 'lock' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Lock size={12} />
                )}
                Lock
              </button>
            )}

            {/* Reset Password */}
            <button
              onClick={() => setShowReset(true)}
              title="Reset password"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
            >
              <KeyRound size={12} />
              Reset PW
            </button>

            {/* Edit */}
            <button
              onClick={() => setShowEdit(true)}
              title="Edit employee"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
            >
              <Pencil size={12} />
              Edit
            </button>
          </div>
        </td>
      </tr>

      {showEdit && (
        <EditModal
          emp={emp}
          orgId={orgId}
          onClose={() => setShowEdit(false)}
          onSaved={onAction}
        />
      )}

      {showReset && (
        <ResetPasswordModal
          emp={emp}
          orgId={orgId}
          onClose={() => setShowReset(false)}
          onSaved={onAction}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Org name search dropdown
// ---------------------------------------------------------------------------

interface OrgSearchProps {
  onSelect: (org: Organisation) => void;
}

function OrgNameSearch({ onSelect }: OrgSearchProps) {
  const [nameQuery, setNameQuery] = useState('');
  const [results, setResults] = useState<Organisation[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  async function handleNameSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!nameQuery.trim()) return;
    setSearching(true);
    setSearchError('');
    setResults([]);
    try {
      const data = await apiFetch(
        `platform/organisations?search=${encodeURIComponent(nameQuery.trim())}`
      );
      let orgs: Organisation[] = [];
      if (Array.isArray(data)) {
        orgs = data as Organisation[];
      } else if (data && typeof data === 'object') {
        const d = data as { organisations?: Organisation[]; data?: Organisation[] };
        if (Array.isArray(d.organisations)) orgs = d.organisations;
        else if (Array.isArray(d.data)) orgs = d.data;
      }
      setResults(orgs);
      if (orgs.length === 0) setSearchError('No organisations found.');
    } catch (err) {
      setSearchError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleNameSearch} className="flex gap-3 max-w-xl">
        <div className="relative flex-1">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search by org name…"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={!nameQuery.trim() || searching}
          className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : 'Find'}
        </button>
      </form>

      {searchError && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle size={12} />
          {searchError}
        </p>
      )}

      {results.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden max-w-xl">
          {results.map((org) => (
            <button
              key={org.id}
              onClick={() => {
                onSelect(org);
                setResults([]);
                setNameQuery('');
              }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0"
            >
              <span className="font-medium text-gray-900">{org.businessName}</span>
              <span className="text-xs font-mono text-gray-400 truncate ml-3">{org.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function StaffContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [orgIdInput, setOrgIdInput] = useState(searchParams.get('orgId') ?? '');
  const [activeOrgId, setActiveOrgId] = useState(searchParams.get('orgId') ?? '');
  const [activeOrgName, setActiveOrgName] = useState('');
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState<OrgEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [searchMode, setSearchMode] = useState<'id' | 'name'>('id');

  const fetchEmployees = useCallback(async (orgId: string) => {
    if (!orgId) return;
    setLoading(true);
    setFetchError('');
    try {
      const data = await apiFetch(`platform/organisations/${orgId}/employees`);
      if (Array.isArray(data)) {
        setEmployees(data as OrgEmployee[]);
      } else if (
        data &&
        typeof data === 'object' &&
        'employees' in (data as object) &&
        Array.isArray((data as { employees: unknown }).employees)
      ) {
        setEmployees((data as { employees: OrgEmployee[] }).employees);
      } else if (
        data &&
        typeof data === 'object' &&
        'data' in (data as object) &&
        Array.isArray((data as { data: unknown }).data)
      ) {
        setEmployees((data as { data: OrgEmployee[] }).data);
      } else {
        setEmployees([]);
      }
    } catch (err) {
      setFetchError((err as Error).message);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch when page loads with ?orgId=
  useEffect(() => {
    const initial = searchParams.get('orgId');
    if (initial) {
      setActiveOrgId(initial);
      setOrgIdInput(initial);
      void fetchEmployees(initial);
    }
  }, [fetchEmployees, searchParams]);

  function handleLoad(e: React.FormEvent) {
    e.preventDefault();
    const id = orgIdInput.trim();
    if (!id) return;
    setActiveOrgId(id);
    setActiveOrgName('');
    router.replace(`/dashboard/staff?orgId=${encodeURIComponent(id)}`);
    void fetchEmployees(id);
  }

  function handleOrgSelect(org: Organisation) {
    setActiveOrgId(org.id);
    setActiveOrgName(org.businessName);
    setOrgIdInput(org.id);
    router.replace(`/dashboard/staff?orgId=${encodeURIComponent(org.id)}`);
    void fetchEmployees(org.id);
  }

  function handleRefresh() {
    if (activeOrgId) void fetchEmployees(activeOrgId);
  }

  const filtered = employees.filter((emp) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      emp.email.toLowerCase().includes(q) ||
      emp.firstName.toLowerCase().includes(q) ||
      emp.lastName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Users size={24} className="text-blue-700" />
            Staff Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            View and manage employees for any organisation
          </p>
        </div>
        {activeOrgId && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
      </div>

      {/* Org picker */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Organisation
          </p>
          {/* Toggle between ID and name search */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button
              onClick={() => setSearchMode('id')}
              className={`px-3 py-1.5 font-medium transition-colors ${
                searchMode === 'id'
                  ? 'bg-blue-900 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              By ID
            </button>
            <button
              onClick={() => setSearchMode('name')}
              className={`px-3 py-1.5 font-medium transition-colors border-l border-gray-200 ${
                searchMode === 'name'
                  ? 'bg-blue-900 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              By Name
            </button>
          </div>
        </div>

        {searchMode === 'id' ? (
          <form onSubmit={handleLoad} className="flex gap-3 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Enter Organisation UUID…"
                value={orgIdInput}
                onChange={(e) => setOrgIdInput(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent font-mono"
                spellCheck={false}
              />
            </div>
            <button
              type="submit"
              disabled={!orgIdInput.trim() || loading}
              className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Load
            </button>
          </form>
        ) : (
          <OrgNameSearch onSelect={handleOrgSelect} />
        )}

        {activeOrgId && (
          <p className="text-xs text-gray-400">
            {activeOrgName ? (
              <>
                Loaded:{' '}
                <span className="font-medium text-gray-700">{activeOrgName}</span>{' '}
                <span className="font-mono text-gray-400">({activeOrgId})</span>
              </>
            ) : (
              <>
                Loaded: <span className="font-mono text-gray-600">{activeOrgId}</span>
              </>
            )}
          </p>
        )}
      </div>

      {/* Employee table */}
      {activeOrgId && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Search bar inside table header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={16}
              />
              <input
                type="search"
                placeholder="Filter by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white"
              />
            </div>
            {!loading && employees.length > 0 && (
              <span className="text-xs text-gray-400">
                {filtered.length} of {employees.length} employee{employees.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-400">
              <Loader2 size={18} className="animate-spin" />
              Loading employees…
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-sm text-red-500">
              <AlertCircle size={20} />
              <span>{fetchError}</span>
              <button
                onClick={handleRefresh}
                className="mt-1 text-xs text-blue-600 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-14 text-center text-sm text-gray-400">
              {employees.length === 0 ? 'No employees found for this organisation.' : 'No employees match your filter.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Failed Attempts
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Locked Until
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((emp) => (
                    <EmployeeRow
                      key={emp.id}
                      emp={emp}
                      orgId={activeOrgId}
                      onAction={handleRefresh}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Empty state before loading any org */}
      {!activeOrgId && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <Users size={40} className="opacity-30" />
          <p className="text-sm">Enter an organisation ID or search by name above to load its employees.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export (wrapped in Suspense for useSearchParams)
// ---------------------------------------------------------------------------

export default function StaffPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400 p-6">Loading…</div>}>
      <StaffContent />
    </Suspense>
  );
}
