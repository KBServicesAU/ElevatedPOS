'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  UserCircle,
  Clock,
  Shield,
  Mail,
  Phone,
  Calendar,
  Briefcase,
  Pencil,
  X,
  Save,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  roleId?: string;
  role?: { id: string; name: string } | string;
  clockedIn?: boolean;
  isActive?: boolean;
  status?: string;
  employmentType?: string;
  hourlyRate?: number;
  hireDate?: string;
  createdAt: string;
}

interface Shift {
  id: string;
  employeeId: string;
  locationId: string;
  orgId: string;
  clockInAt: string;
  clockOutAt: string | null;
  breakMinutes: number;
  status: 'open' | 'closed' | 'approved';
}

interface EmployeePermissions {
  permissions?: string[];
  roleName?: string;
}

interface EditFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  employmentType: string;
  hourlyRate: string;
}

const ROLE_OPTIONS = ['admin', 'manager', 'cashier', 'kitchen', 'driver'] as const;
const EMPLOYMENT_TYPE_OPTIONS = ['full_time', 'part_time', 'casual', 'contractor'] as const;

// ─── Constants ────────────────────────────────────────────────────────────────

const roleColorMap: Record<string, string> = {
  owner:      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  manager:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  supervisor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  cashier:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  barista:    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  kitchen:    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getRoleName(role: EmployeeDetail['role']): string {
  if (!role) return 'Unknown';
  if (typeof role === 'string') return role;
  return role.name ?? 'Unknown';
}

function getRoleColor(role: EmployeeDetail['role']): string {
  const name = getRoleName(role).toLowerCase();
  return roleColorMap[name] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function calcTotalHours(clockInAt: string, clockOutAt: string | null, breakMinutes: number): string {
  if (!clockOutAt) return '—';
  const diffMs = new Date(clockOutAt).getTime() - new Date(clockInAt).getTime();
  const totalMinutes = Math.max(0, diffMs / 60000 - breakMinutes);
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${h}h ${m}m`;
}

function shiftStatusBadge(status: Shift['status']): string {
  switch (status) {
    case 'approved': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'closed':   return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    case 'open':     return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    default:         return 'bg-gray-100 text-gray-600';
  }
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="p-8 max-w-3xl animate-pulse space-y-5">
      <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="h-28 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      <div className="h-56 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [permissions, setPermissions] = useState<EmployeePermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // ── Edit mode ───────────────────────────────────────────────────────────────
  const isEditMode = searchParams.get('edit') === '1';
  const [editForm, setEditForm] = useState<EditFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: '',
    employmentType: '',
    hourlyRate: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(false);

      try {
        // Fetch employee and shifts in parallel
        const [empData, shiftsData] = await Promise.all([
          apiFetch<EmployeeDetail | { data: EmployeeDetail }>(`employees/${id}`),
          apiFetch<{ data: Shift[] } | Shift[]>(`shifts?employeeId=${id}&limit=10`).catch(() => ({ data: [] as Shift[] })),
        ]);

        if (cancelled) return;

        // Normalise employee response (could be wrapped or bare)
        const emp = 'data' in empData && !('id' in empData)
          ? (empData as { data: EmployeeDetail }).data
          : (empData as EmployeeDetail);

        // Normalise shifts response
        const rawShifts = Array.isArray(shiftsData)
          ? shiftsData
          : (shiftsData as { data: Shift[] }).data ?? [];

        setEmployee(emp);
        setShifts(rawShifts);

        // Try fetching permissions — not all backends support this
        try {
          const permsData = await apiFetch<EmployeePermissions>(`employees/${id}/permissions`);
          if (!cancelled) setPermissions(permsData);
        } catch {
          // Permissions endpoint may not exist — that's fine
          if (!cancelled) setPermissions(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(true);
          toast({ title: 'Failed to load employee', variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id, toast]);

  // Populate form when entering edit mode or when employee data arrives
  useEffect(() => {
    if (isEditMode && employee) {
      setEditForm({
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        phone: employee.phone ?? '',
        role: getRoleName(employee.role).toLowerCase(),
        employmentType: employee.employmentType ?? '',
        hourlyRate: employee.hourlyRate != null ? String(employee.hourlyRate) : '',
      });
    }
  }, [isEditMode, employee]);

  function exitEditMode() {
    router.replace(`/dashboard/staff/${id}`);
  }

  function enterEditMode() {
    router.replace(`/dashboard/staff/${id}?edit=1`);
  }

  function handleEditChange(field: keyof EditFormData, value: string) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || undefined,
        role: editForm.role,
        employmentType: editForm.employmentType || undefined,
        hourlyRate: editForm.hourlyRate ? Number(editForm.hourlyRate) : undefined,
      };

      const updated = await apiFetch<EmployeeDetail | { data: EmployeeDetail }>(
        `employees/${id}`,
        { method: 'PATCH', body: JSON.stringify(payload) },
      );

      // Normalise response
      const emp =
        'data' in updated && !('id' in updated)
          ? (updated as { data: EmployeeDetail }).data
          : (updated as EmployeeDetail);

      setEmployee(emp);
      toast({ title: 'Employee updated', variant: 'success' });
      exitEditMode();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update employee';
      toast({ title: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton />;

  if (error || !employee) {
    return (
      <div className="p-8 max-w-3xl">
        <button
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Staff
        </button>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-10 text-center">
          <UserCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Employee not found</p>
          <p className="text-sm text-gray-500 mb-5">
            This employee record could not be loaded.
          </p>
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Staff
          </button>
        </div>
      </div>
    );
  }

  const fullName = `${employee.firstName} ${employee.lastName}`;
  const roleName = getRoleName(employee.role);
  const roleColor = getRoleColor(employee.role);
  const isActive = employee.isActive ?? employee.status === 'active';

  return (
    <div className="p-8 max-w-3xl">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Staff
      </button>

      {/* ── Employee Header ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="flex-shrink-0 h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <span className="text-indigo-700 dark:text-indigo-300 text-xl font-bold">
              {initials(fullName)}
            </span>
          </div>

          {/* Name / email / badges */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{fullName}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${roleColor}`}>
                {roleName}
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isActive
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {employee.email}
            </p>
          </div>

          {/* Edit button */}
          {!isEditMode && (
            <button
              onClick={enterEditMode}
              title="Edit employee"
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </div>
      </div>

      {/* ── Account Details / Edit Form ────────────────────────────────────── */}
      {isEditMode ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Pencil className="h-4 w-4 text-gray-400" />
            Edit Employee
          </h2>

          <form
            onSubmit={(e) => { e.preventDefault(); handleSave(); }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4"
          >
            {/* First Name */}
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-firstName" className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                First Name
              </label>
              <input
                id="edit-firstName"
                type="text"
                required
                value={editForm.firstName}
                onChange={(e) => handleEditChange('firstName', e.target.value)}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Last Name */}
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-lastName" className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Last Name
              </label>
              <input
                id="edit-lastName"
                type="text"
                required
                value={editForm.lastName}
                onChange={(e) => handleEditChange('lastName', e.target.value)}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-email" className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Email
              </label>
              <input
                id="edit-email"
                type="email"
                required
                value={editForm.email}
                onChange={(e) => handleEditChange('email', e.target.value)}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Phone */}
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-phone" className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Phone
              </label>
              <input
                id="edit-phone"
                type="tel"
                value={editForm.phone}
                onChange={(e) => handleEditChange('phone', e.target.value)}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Role */}
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-role" className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Role
              </label>
              <select
                id="edit-role"
                value={editForm.role}
                onChange={(e) => handleEditChange('role', e.target.value)}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select role</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{capitalise(r)}</option>
                ))}
              </select>
            </div>

            {/* Employment Type */}
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-employmentType" className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Employment Type
              </label>
              <select
                id="edit-employmentType"
                value={editForm.employmentType}
                onChange={(e) => handleEditChange('employmentType', e.target.value)}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select type</option>
                {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{capitalise(t.replace(/_/g, ' '))}</option>
                ))}
              </select>
            </div>

            {/* Hourly Rate */}
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-hourlyRate" className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Hourly Rate ($)
              </label>
              <input
                id="edit-hourlyRate"
                type="number"
                min="0"
                step="0.01"
                value={editForm.hourlyRate}
                onChange={(e) => handleEditChange('hourlyRate', e.target.value)}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Actions — spans full row */}
            <div className="sm:col-span-2 flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={exitEditMode}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-gray-400" />
            Account Details
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <DetailRow label="Employee ID" value={employee.id} icon={<UserCircle className="h-4 w-4" />} />
            <DetailRow label="Email" value={employee.email} icon={<Mail className="h-4 w-4" />} />
            <DetailRow label="Phone" value={employee.phone ?? '—'} icon={<Phone className="h-4 w-4" />} />
            <DetailRow
              label="Employment Type"
              value={employee.employmentType ? capitalise(employee.employmentType) : '—'}
              icon={<Briefcase className="h-4 w-4" />}
            />
            <DetailRow
              label="Hourly Rate"
              value={employee.hourlyRate != null ? `$${Number(employee.hourlyRate).toFixed(2)}/hr` : '—'}
              icon={<Clock className="h-4 w-4" />}
            />
            <DetailRow
              label="Hire Date"
              value={employee.hireDate ? formatDate(employee.hireDate) : employee.createdAt ? formatDate(employee.createdAt) : '—'}
              icon={<Calendar className="h-4 w-4" />}
            />
          </dl>
        </div>
      )}

      {/* ── Recent Shifts ───────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          Recent Shifts
        </h2>

        {shifts.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
            No shifts recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Date', 'Clock In', 'Clock Out', 'Break', 'Total Hours', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="pb-2 px-1 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                {shifts.map((shift) => (
                  <tr key={shift.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="py-2.5 px-1 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatDate(shift.clockInAt)}
                    </td>
                    <td className="py-2.5 px-1 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatTime(shift.clockInAt)}
                    </td>
                    <td className="py-2.5 px-1 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {shift.clockOutAt ? formatTime(shift.clockOutAt) : <span className="text-amber-500">Open</span>}
                    </td>
                    <td className="py-2.5 px-1 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {shift.breakMinutes > 0 ? `${shift.breakMinutes}m` : '—'}
                    </td>
                    <td className="py-2.5 px-1 text-gray-700 dark:text-gray-300 whitespace-nowrap font-medium">
                      {calcTotalHours(shift.clockInAt, shift.clockOutAt, shift.breakMinutes)}
                    </td>
                    <td className="py-2.5 px-1 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${shiftStatusBadge(shift.status)}`}>
                        {capitalise(shift.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Permissions ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Shield className="h-4 w-4 text-gray-400" />
          Permissions
        </h2>

        {permissions && permissions.permissions && permissions.permissions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {permissions.permissions.map((perm) => (
              <span
                key={perm}
                className="inline-flex items-center px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300"
              >
                {perm}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
            <Shield className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                Role: <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${roleColor}`}>{roleName}</span>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Permissions are determined by the assigned role.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-1">
        {icon && <span className="text-gray-300 dark:text-gray-600">{icon}</span>}
        {label}
      </dt>
      <dd className="text-sm font-medium text-gray-800 dark:text-gray-200 break-all">{value}</dd>
    </div>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function capitalise(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
