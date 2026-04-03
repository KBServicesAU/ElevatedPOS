'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Clock, CheckCircle, XCircle, Shield, Download, ChevronLeft, ChevronRight,
  Calendar, Users, Edit2, ToggleLeft, ToggleRight, X, Check, FileDown, KeyRound,
} from 'lucide-react';
import { useEmployees } from '@/lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import type { Employee } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';

// ─── Constants ────────────────────────────────────────────────────────────────

const roleColorMap: Record<string, string> = {
  owner:      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  manager:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  supervisor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  cashier:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  barista:    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  kitchen:    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const ALL_PERMISSIONS = [
  { id: 'orders:read',      label: 'View Orders',        module: 'Orders' },
  { id: 'orders:write',     label: 'Manage Orders',      module: 'Orders' },
  { id: 'catalog:read',     label: 'View Catalog',       module: 'Catalog' },
  { id: 'catalog:write',    label: 'Manage Catalog',     module: 'Catalog' },
  { id: 'inventory:read',   label: 'View Inventory',     module: 'Inventory' },
  { id: 'inventory:write',  label: 'Manage Inventory',   module: 'Inventory' },
  { id: 'customers:read',   label: 'View Customers',     module: 'Customers' },
  { id: 'reports:read',     label: 'View Reports',       module: 'Reports' },
  { id: 'settings:write',   label: 'Manage Settings',    module: 'Settings' },
  { id: 'employees:write',  label: 'Manage Employees',   module: 'Staff' },
];

const MODULES = [...new Set(ALL_PERMISSIONS.map((p) => p.module))];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SHIFT_COLORS = [
  'bg-indigo-200 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  'bg-emerald-200 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-rose-200 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  'bg-violet-200 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  'bg-cyan-200 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_ROLES = [
  { id: 'r1', name: 'Owner',      permissions: { 'orders:read': true, 'orders:write': true, 'catalog:read': true, 'catalog:write': true, 'inventory:read': true, 'inventory:write': true, 'customers:read': true, 'reports:read': true, 'settings:write': true, 'employees:write': true } },
  { id: 'r2', name: 'Manager',    permissions: { 'orders:read': true, 'orders:write': true, 'catalog:read': true, 'inventory:read': true, 'customers:read': true, 'reports:read': true } },
  { id: 'r3', name: 'Cashier',    permissions: { 'orders:read': true, 'orders:write': true, 'catalog:read': true, 'customers:read': true } },
  { id: 'r4', name: 'Supervisor', permissions: { 'orders:read': true, 'orders:write': true, 'catalog:read': true, 'inventory:read': true, 'customers:read': true } },
];

const MOCK_TIMESHEETS: Record<string, Record<string, number>> = {
  emp1: { Mon: 8, Tue: 7.5, Wed: 8, Thu: 0, Fri: 8, Sat: 6, Sun: 0 },
  emp2: { Mon: 0, Tue: 8, Wed: 8, Thu: 8, Fri: 7, Sat: 0, Sun: 0 },
  emp3: { Mon: 6, Tue: 6, Wed: 0, Thu: 6, Fri: 6, Sat: 8, Sun: 4 },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Add Employee Modal ───────────────────────────────────────────────────────

function AddEmployeeModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', pin: '',
    role: '', location: '', hourlyRate: '', employmentType: 'full_time' as const,
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          pin: form.pin || undefined,
          roleId: form.role || undefined,
          employmentType: form.employmentType,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `HTTP ${res.status}`);
      }
      toast({ title: 'Employee added', description: `${form.firstName} ${form.lastName} has been added to the team.`, variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      onClose();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to add employee');
      toast({ title: 'Failed to add employee', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      />
    </div>
  );

  return (
    <Modal title="Add Employee" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {field('First Name', 'firstName', 'text', 'Jane')}
          {field('Last Name', 'lastName', 'text', 'Doe')}
        </div>
        {field('Email', 'email', 'email', 'jane@example.com')}
        {field('Phone', 'phone', 'tel', '+61 4xx xxx xxx')}
        {field('PIN (4–6 digits)', 'pin', 'password', '••••')}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="">Select role…</option>
              {MOCK_ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Main Store"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {field('Hourly Rate ($)', 'hourlyRate', 'number', '25.00')}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Employment Type</label>
            <select
              value={form.employmentType}
              onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value as typeof form.employmentType }))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="casual">Casual</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add Employee'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Employee Side Panel ──────────────────────────────────────────────────────

function EmployeeSidePanel({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const router = useRouter();
  const [active, setActive] = useState(employee.status !== 'inactive');
  const [togglingStatus, setTogglingStatus] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  async function handleToggleStatus() {
    const nextActive = !active;
    setTogglingStatus(true);
    try {
      const res = await fetch(`/api/proxy/employees/${employee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextActive ? 'active' : 'inactive' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `HTTP ${res.status}`);
      }
      setActive(nextActive);
      toast({
        title: nextActive ? 'Employee activated' : 'Employee deactivated',
        description: `${employee.firstName} ${employee.lastName} is now ${nextActive ? 'active' : 'inactive'}.`,
        variant: nextActive ? 'success' : 'default',
      });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch (err) {
      toast({
        title: 'Failed to update status',
        description: getErrorMessage(err, 'Could not update employee status.'),
        variant: 'destructive',
      });
    } finally {
      setTogglingStatus(false);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-96 flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Employee Profile</h3>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      {/* Profile */}
      <div className="border-b border-gray-100 px-5 py-5 dark:border-gray-800">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
            {initials(`${employee.firstName} ${employee.lastName}`)}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 dark:text-white">{employee.firstName} {employee.lastName}</p>
            <p className="text-sm text-gray-500">{employee.email}</p>
            <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${roleColorMap[(typeof employee.role === 'object' ? employee.role?.name : employee.role)?.toLowerCase() ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
              {typeof employee.role === 'object' ? employee.role?.name : employee.role}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Status: {active ? 'Active' : 'Inactive'}</span>
          <button
            onClick={handleToggleStatus}
            disabled={togglingStatus}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${active ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}
          >
            {active ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
            {togglingStatus ? 'Updating…' : active ? 'Active' : 'Inactive'}
          </button>
        </div>
      </div>

      {/* Recent shifts */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent Shifts</h4>
        <div className="space-y-2">
          {[
            { date: 'Today', hours: '8:00 AM – 4:30 PM', duration: '8h 30m' },
            { date: 'Yesterday', hours: '9:00 AM – 5:00 PM', duration: '8h 0m' },
            { date: 'Mon', hours: '7:30 AM – 3:30 PM', duration: '8h 0m' },
          ].map((shift, i) => (
            <div key={i} className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{shift.date}</span>
                <span className="text-xs text-gray-500">{shift.duration}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">{shift.hours}</p>
            </div>
          ))}
        </div>

        {/* Permissions summary */}
        <h4 className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">Permissions</h4>
        <div className="grid grid-cols-2 gap-1.5">
          {['orders:read', 'catalog:read', 'inventory:read', 'customers:read'].map((perm) => (
            <div key={perm} className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-gray-800">
              <Check className="h-3 w-3 text-green-500" />
              <span className="text-xs text-gray-600 dark:text-gray-400">{perm}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/dashboard/staff/${employee.id}`)}
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            View Full Profile
          </button>
          <button className="rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
            <Edit2 className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Change PIN Modal ─────────────────────────────────────────────────────────

function ChangePinModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const handleSave = async () => {
    if (pin.length < 4 || pin.length > 6) {
      setError('PIN must be 4–6 digits.');
      return;
    }
    if (!/^\d+$/.test(pin)) {
      setError('PIN must contain digits only.');
      return;
    }
    if (pin !== confirm) {
      setError('PINs do not match.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/employees/${employee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? 'Failed to update PIN');
      }
      toast({ title: 'PIN updated', description: `New PIN saved for ${employee.firstName}.` });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update PIN. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-indigo-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Change PIN — {employee.firstName} {employee.lastName}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Staff use this PIN to log into the POS terminal. Must be 4–6 digits.
        </p>

        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">New PIN</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError(''); }}
          placeholder="••••"
          className="mb-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />

        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Confirm PIN</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value.replace(/\D/g, '')); setError(''); }}
          placeholder="••••"
          className="mb-4 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />

        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || pin.length < 4}
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save PIN'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Employees Tab ────────────────────────────────────────────────────────────

function EmployeesTab() {
  const { data, isLoading, isError } = useEmployees();
  const employees = data?.data ?? [];
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pinEmployee, setPinEmployee] = useState<Employee | null>(null);

  return (
    <div className="relative">
      {showAdd && <AddEmployeeModal onClose={() => setShowAdd(false)} />}
      {pinEmployee && <ChangePinModal employee={pinEmployee} onClose={() => setPinEmployee(null)} />}
      {selected && <EmployeeSidePanel employee={selected} onClose={() => setSelected(null)} />}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {isLoading ? 'Loading…' : `${employees.length} employees`}
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Add Employee
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {isError ? (
          <div className="p-8 text-center text-sm text-red-500">Failed to load staff.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {['Employee', 'Role', 'Location', 'Status', 'Last Clock-in', 'Actions'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-5 py-3.5">
                          <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: '75%' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : employees.map((emp: Employee) => (
                    <tr
                      key={emp.id}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      onClick={() => setSelected(emp)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                              {initials(`${emp.firstName} ${emp.lastName}`)}
                            </div>
                            {emp.clockedIn && (
                              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-400 dark:border-gray-900" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{emp.firstName} {emp.lastName}</p>
                            <p className="text-xs text-gray-400">{emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${roleColorMap[(typeof emp.role === 'object' ? emp.role?.name : emp.role)?.toLowerCase() ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                          {typeof emp.role === 'object' ? emp.role?.name : emp.role}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                        Main Store
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${emp.clockedIn ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                          {emp.clockedIn ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {emp.clockedIn ? 'Clocked In' : 'Not In'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">
                        {emp.clockedIn ? 'Now' : '—'}
                      </td>
                      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelected(emp)}
                            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400"
                          >
                            View
                          </button>
                          <button
                            onClick={() => setPinEmployee(emp)}
                            title="Change POS PIN"
                            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:border-gray-700 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              {!isLoading && employees.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
                    No employees found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Timesheets Tab ───────────────────────────────────────────────────────────

function TimesheetsTab() {
  const { data, isLoading } = useEmployees();
  const employees = data?.data ?? [];
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [showPayrollExport, setShowPayrollExport] = useState(false);

  const weekDates = DAYS.map((_, i) => addDays(weekStart, i));

  const getHours = (empId: string, dayIdx: number): number | null => {
    const key = Object.keys(MOCK_TIMESHEETS)[employees.findIndex((e) => e.id === empId) % 3] ?? 'emp1';
    const val = MOCK_TIMESHEETS[key]?.[DAYS[dayIdx]];
    return val ?? null;
  };

  const getTotal = (empId: string): number => {
    return DAYS.reduce((sum, _, i) => sum + (getHours(empId, i) ?? 0), 0);
  };

  const getStatus = (empId: string): 'approved' | 'pending' | 'no_shifts' => {
    const total = getTotal(empId);
    if (total === 0) return 'no_shifts';
    const idx = employees.findIndex((e) => e.id === empId);
    return idx % 3 === 0 ? 'approved' : 'pending';
  };

  const handleApprove = async (empId: string) => {
    setApprovingId(empId);
    // In production, would call POST /api/proxy/clock/shifts/:id/approve for each shift
    await new Promise((r) => setTimeout(r, 800));
    setApprovingId(null);
  };

  const handleExport = () => {
    const rows = [
      ['Name', 'Role', 'Pay Rate', 'Regular Hours', 'Overtime Hours', 'Total Pay', 'Period'],
      ...employees.map((emp) => {
        const total = getTotal(emp.id);
        const regular = Math.min(total, 38);
        const overtime = Math.max(0, total - 38);
        const rate = 25;
        return [
          `${emp.firstName} ${emp.lastName}`,
          typeof emp.role === 'object' ? emp.role?.name : emp.role,
          `$${rate.toFixed(2)}`,
          regular.toFixed(1),
          overtime.toFixed(1),
          `$${(regular * rate + overtime * rate * 1.5).toFixed(2)}`,
          `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}`,
        ];
      }),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-${weekStart.toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusBadge = (status: ReturnType<typeof getStatus>) => {
    const map = {
      approved:  'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
      pending:   'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
      no_shifts: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    };
    const labels = { approved: 'Approved', pending: 'Pending', no_shifts: 'No Shifts' };
    return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{labels[status]}</span>;
  };

  return (
    <div>
      {showPayrollExport && <PayrollExportModal onClose={() => setShowPayrollExport(false)} />}

      {/* Week picker + export */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <span className="min-w-[180px] text-center text-sm font-medium text-gray-900 dark:text-white">
            {formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}
          </span>
          <button
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
          <button
            onClick={() => setWeekStart(getWeekStart(new Date()))}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400"
          >
            This Week
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
          >
            <Download className="h-4 w-4" /> Quick CSV
          </button>
          <button
            onClick={() => setShowPayrollExport(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <FileDown className="h-4 w-4" /> Export Payroll
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 w-40">Employee</th>
              {DAYS.map((day, i) => (
                <th key={day} className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
                  <div>{day}</div>
                  <div className="text-gray-400 font-normal normal-case">{formatDate(weekDates[i])}</div>
                </th>
              ))}
              <th className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">Total</th>
              <th className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">Approve</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 11 }).map((__, j) => (
                      <td key={j} className="px-3 py-3.5">
                        <div className="mx-auto h-4 w-10 rounded bg-gray-100 dark:bg-gray-800" />
                      </td>
                    ))}
                  </tr>
                ))
              : employees.map((emp) => {
                  const status = getStatus(emp.id);
                  const total = getTotal(emp.id);
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            {initials(`${emp.firstName} ${emp.lastName}`)}
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{emp.firstName} {emp.lastName}</span>
                        </div>
                      </td>
                      {DAYS.map((_, i) => {
                        const hrs = getHours(emp.id, i);
                        return (
                          <td key={i} className="px-3 py-3.5 text-center text-sm">
                            {hrs !== null && hrs > 0 ? (
                              <span className="font-medium text-gray-900 dark:text-white">{hrs}h</span>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3.5 text-center">
                        <span className={`text-sm font-semibold ${total > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                          {total > 0 ? `${total}h` : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-center">{statusBadge(status)}</td>
                      <td className="px-4 py-3.5 text-center">
                        {status === 'pending' && (
                          <button
                            onClick={() => handleApprove(emp.id)}
                            disabled={approvingId === emp.id}
                            className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:bg-indigo-900/20 dark:text-indigo-400"
                          >
                            {approvingId === emp.id ? '…' : 'Approve'}
                          </button>
                        )}
                        {status === 'approved' && <Check className="mx-auto h-4 w-4 text-green-500" />}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Create Role Modal ────────────────────────────────────────────────────────

function CreateRoleModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [perms, setPerms] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setPerms((p) => ({ ...p, [id]: !p[id] }));

  return (
    <Modal title="Create Role" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Role Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Senior Cashier"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Permissions</p>
          {MODULES.map((mod) => (
            <div key={mod}>
              <p className="mb-1.5 text-xs text-gray-400 uppercase tracking-wide">{mod}</p>
              <div className="space-y-1.5">
                {ALL_PERMISSIONS.filter((p) => p.module === mod).map((perm) => (
                  <label key={perm.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input
                      type="checkbox"
                      checked={!!perms[perm.id]}
                      onChange={() => toggle(perm.id)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{perm.label}</span>
                    <span className="ml-auto text-xs text-gray-400">{perm.id}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300">
            Cancel
          </button>
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Create Role
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Roles Tab ────────────────────────────────────────────────────────────────

function RolesTab() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      {showCreate && <CreateRoleModal onClose={() => setShowCreate(false)} />}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">{MOCK_ROLES.length} roles configured</p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Create Role
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {MOCK_ROLES.map((role) => {
          const permKeys = Object.keys(role.permissions).filter((k) => role.permissions[k as keyof typeof role.permissions]);
          const modules = [...new Set(permKeys.map((k) => ALL_PERMISSIONS.find((p) => p.id === k)?.module).filter(Boolean))];

          return (
            <div key={role.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-indigo-500" />
                  <span className="font-semibold text-gray-900 dark:text-white">{role.name}</span>
                </div>
                <button className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 dark:border-gray-700">
                  Edit
                </button>
              </div>

              <div className="mb-3 flex flex-wrap gap-1">
                {modules.map((mod) => (
                  <span key={mod} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    {mod}
                  </span>
                ))}
              </div>

              <div className="space-y-1">
                {permKeys.slice(0, 4).map((key) => {
                  const perm = ALL_PERMISSIONS.find((p) => p.id === key);
                  return (
                    <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <Check className="h-3 w-3 text-green-500" />
                      {perm?.label ?? key}
                    </div>
                  );
                })}
                {permKeys.length > 4 && (
                  <p className="text-xs text-gray-400">+{permKeys.length - 4} more permissions</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Add Shift Modal ──────────────────────────────────────────────────────────

function AddShiftModal({ onClose, employees }: { onClose: () => void; employees: Employee[] }) {
  const [form, setForm] = useState({ employeeId: '', date: '', startTime: '09:00', endTime: '17:00', notes: '' });
  const { toast } = useToast();

  return (
    <Modal title="Add Shift" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Employee</label>
          <select
            value={form.employeeId}
            onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="">Select employee…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Start Time</label>
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">End Time</label>
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Notes (optional)</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            placeholder="Any special instructions…"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300">
            Cancel
          </button>
          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/proxy/schedules/shifts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    employeeId: form.employeeId,
                    startTime: form.date && form.startTime ? `${form.date}T${form.startTime}:00.000Z` : undefined,
                    endTime: form.date && form.endTime ? `${form.date}T${form.endTime}:00.000Z` : undefined,
                    notes: form.notes || undefined,
                  }),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                toast({ title: 'Shift added', description: 'The shift has been scheduled.', variant: 'success' });
              } catch {
                toast({ title: 'Failed to add shift', description: 'Please try again.', variant: 'destructive' });
              }
              onClose();
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add Shift
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Payroll Export Modal ─────────────────────────────────────────────────────

type PayPeriodType = 'week' | 'fortnight' | 'month';
type ExportFormat = 'csv' | 'myob' | 'xero';

function PayrollExportModal({ onClose }: { onClose: () => void }) {
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(today.getDate() - 6);

  const [periodType, setPeriodType] = useState<PayPeriodType>('week');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [dateFrom, setDateFrom] = useState(defaultFrom.toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(today.toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  // Auto-set date range when period type changes
  const handlePeriodChange = (p: PayPeriodType) => {
    setPeriodType(p);
    const end = new Date();
    const start = new Date();
    if (p === 'week') start.setDate(end.getDate() - 6);
    else if (p === 'fortnight') start.setDate(end.getDate() - 13);
    else start.setDate(1); // first of this month
    setDateFrom(start.toISOString().slice(0, 10));
    setDateTo(end.toISOString().slice(0, 10));
  };

  const handleExport = async () => {
    if (!dateFrom || !dateTo) {
      setError('Please select a date range.');
      return;
    }
    setError('');
    setExporting(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo, format });
      const res = await fetch(`/api/proxy/payroll/export?${params.toString()}`);

      const blob = await res.blob();
      const ext = format === 'myob' ? 'txt' : 'csv';
      triggerDownload(blob, `payroll-${dateFrom}-to-${dateTo}.${ext}`);
      onClose();
    } catch {
      setError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const labelClass = 'mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300';
  const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white';

  return (
    <Modal title="Export Payroll" onClose={onClose}>
      <div className="space-y-4">
        {/* Pay period selector */}
        <div>
          <label className={labelClass}>Pay Period</label>
          <div className="flex gap-2">
            {(['week', 'fortnight', 'month'] as const).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors ${
                  periodType === p
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
          </div>
        </div>

        {/* Format */}
        <div>
          <label className={labelClass}>Export Format</label>
          <div className="flex gap-2">
            {(['csv', 'myob', 'xero'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`flex-1 rounded-lg border py-2 text-sm font-medium uppercase transition-colors ${
                  format === f
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {format === 'myob' ? 'Tab-separated values compatible with MYOB import' : format === 'xero' ? 'CSV formatted for Xero payroll import' : 'Standard CSV — Employee Name, ID, Hours, Rate, Gross Pay'}
          </p>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300">
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" />
            {exporting ? 'Exporting…' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Schedule Tab ─────────────────────────────────────────────────────────────

function ScheduleTab() {
  const { data, isLoading } = useEmployees();
  const employees = data?.data ?? [];
  const [weekStart] = useState(() => getWeekStart(new Date()));
  const [showAddShift, setShowAddShift] = useState(false);

  const weekDates = DAYS.map((_, i) => addDays(weekStart, i));

  // Deterministic mock shifts for display
  const getMockShift = (empIdx: number, dayIdx: number): { label: string } | null => {
    const seed = (empIdx * 7 + dayIdx) % 5;
    if (seed === 0) return null;
    const starts = ['8:00', '9:00', '10:00', '12:00'];
    const ends   = ['4:00', '5:00', '6:00', '8:00'];
    return { label: `${starts[seed % starts.length]}–${ends[seed % ends.length]}` };
  };

  return (
    <div>
      {showAddShift && <AddShiftModal onClose={() => setShowAddShift(false)} employees={employees} />}

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Week of {formatDate(weekStart)}
          </span>
        </div>
        <button
          onClick={() => setShowAddShift(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Add Shift
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 w-36">Employee</th>
              {DAYS.map((day, i) => (
                <th key={day} className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
                  <div>{day}</div>
                  <div className="text-gray-400 font-normal normal-case">{formatDate(weekDates[i])}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-2 py-3">
                        <div className="h-7 rounded bg-gray-100 dark:bg-gray-800" />
                      </td>
                    ))}
                  </tr>
                ))
              : employees.slice(0, 8).map((emp, empIdx) => (
                  <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          {initials(`${emp.firstName} ${emp.lastName}`)}
                        </div>
                        <span className="text-xs font-medium text-gray-900 dark:text-white truncate max-w-[80px]">{emp.firstName}</span>
                      </div>
                    </td>
                    {DAYS.map((_, dayIdx) => {
                      const shift = getMockShift(empIdx, dayIdx);
                      const color = SHIFT_COLORS[empIdx % SHIFT_COLORS.length];
                      return (
                        <td key={dayIdx} className="px-2 py-2 text-center">
                          {shift ? (
                            <div className={`rounded-md px-1 py-1.5 text-xs font-medium ${color}`}>
                              {shift.label}
                            </div>
                          ) : (
                            <div className="h-8 rounded-md border border-dashed border-gray-100 dark:border-gray-800" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'employees' | 'timesheets' | 'roles' | 'schedule';

export function StaffClient() {
  const { data, isLoading } = useEmployees();
  const employees = data?.data ?? [];
  const clockedIn = employees.filter((e) => e.clockedIn).length;
  const [activeTab, setActiveTab] = useState<Tab>('employees');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'employees',  label: 'Employees',  icon: <Users className="h-4 w-4" /> },
    { id: 'timesheets', label: 'Timesheets', icon: <Clock className="h-4 w-4" /> },
    { id: 'roles',      label: 'Roles',      icon: <Shield className="h-4 w-4" /> },
    { id: 'schedule',   label: 'Schedule',   icon: <Calendar className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Staff</h2>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${employees.length} employees · ${clockedIn} clocked in now`}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'employees'  && <EmployeesTab />}
      {activeTab === 'timesheets' && <TimesheetsTab />}
      {activeTab === 'roles'      && <RolesTab />}
      {activeTab === 'schedule'   && <ScheduleTab />}
    </div>
  );
}
