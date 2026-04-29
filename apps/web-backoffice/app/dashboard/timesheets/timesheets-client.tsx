'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, CheckCheck, Loader2, Plus, Pencil, AlertTriangle, Check } from 'lucide-react';
import { useToast } from '@/lib/use-toast';
import { apiFetch } from '@/lib/api';
import { getErrorMessage } from '@/lib/formatting';
import { downloadCsv } from '@/lib/csv';

interface Shift {
  id: string;
  employeeId?: string;
  employeeName: string;
  hourlyRate?: number;
  day: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  totalHours: number;
  notes?: string;
  status: 'approved' | 'pending' | 'flagged';
}

interface Employee {
  id: string;
  name: string;
  hourlyRate?: number;
}

const STATUS_COLORS: Record<Shift['status'], string> = {
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  flagged: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

type Period = 'this_week' | 'last_week' | 'this_month' | 'custom';

function getWeekRange(offsetWeeks = 0): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset - offsetWeeks * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: fmt(monday), dateTo: fmt(sunday) };
}

function getMonthRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: fmt(first), dateTo: fmt(last) };
}

// ─── Edit Shift Modal ────────────────────────────────────────────────────────

interface EditShiftModalProps {
  shift: Shift;
  onClose: () => void;
  onSaved: (updated: Shift) => void;
}

function EditShiftModal({ shift, onClose, onSaved }: EditShiftModalProps) {
  const { toast } = useToast();
  const [clockIn, setClockIn] = useState(shift.clockIn ? shift.clockIn.slice(0, 16) : '');
  const [clockOut, setClockOut] = useState(shift.clockOut ? shift.clockOut.slice(0, 16) : '');
  const [breakMinutes, setBreakMinutes] = useState(String(shift.breakMinutes ?? 0));
  const [notes, setNotes] = useState(shift.notes ?? '');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!editReason.trim()) {
      toast({ title: 'Reason required', description: 'Please provide a reason for the edit.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ data: Record<string, unknown> }>(`shifts/${shift.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          clockInAt: clockIn ? new Date(clockIn).toISOString() : undefined,
          clockOutAt: clockOut ? new Date(clockOut).toISOString() : undefined,
          breakMinutes: Number(breakMinutes) || 0,
          notes,
          editReason: editReason.trim(),
        }),
      });
      // Map backend fields back to frontend Shift shape
      const d = res.data ?? res;
      const totalMins = Number(d.totalMinutes ?? 0);
      onSaved({
        ...shift,
        clockIn: clockIn ? new Date(clockIn).toISOString() : shift.clockIn,
        clockOut: clockOut ? new Date(clockOut).toISOString() : shift.clockOut,
        breakMinutes: Number(breakMinutes) || 0,
        totalHours: totalMins > 0 ? totalMins / 60 : shift.totalHours,
        notes,
      });
      toast({ title: 'Shift updated', variant: 'success' });
      onClose();
    } catch (err) {
      toast({ title: 'Save failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Shift</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        </div>
        <div className="space-y-4 px-6 py-5">
          {/* Employee (read-only) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Employee</label>
            <input
              type="text"
              value={shift.employeeName}
              readOnly
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            />
          </div>
          {/* Clock In */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Clock In</label>
            <input
              type="datetime-local"
              value={clockIn}
              onChange={(e) => setClockIn(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          {/* Clock Out */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Clock Out</label>
            <input
              type="datetime-local"
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          {/* Break Minutes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Break (minutes)</label>
            <input
              type="number"
              min={0}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          {/* Reason for edit — required by backend */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Reason for Edit <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="e.g. Staff forgot to clock out"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-400">This is recorded in the audit trail for compliance.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !editReason.trim()}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Shift Modal ─────────────────────────────────────────────────────────

interface AddShiftModalProps {
  onClose: () => void;
  onAdded: (shift: Shift) => void;
}

function AddShiftModal({ onClose, onAdded }: AddShiftModalProps) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [clockInTime, setClockInTime] = useState('09:00');
  const [clockOutTime, setClockOutTime] = useState('17:00');
  const [breakMinutes, setBreakMinutes] = useState('30');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<Record<string, unknown>[] | { data: Record<string, unknown>[] }>('employees?limit=100')
      .then((res) => {
        const raw: Record<string, unknown>[] = Array.isArray(res)
          ? (res as Record<string, unknown>[])
          : ((res as { data?: Record<string, unknown>[] }).data ?? []);
        const list: Employee[] = raw.map((e) => ({
          id: String(e.id ?? ''),
          name: String(
            e.name ??
            (e.firstName
              ? `${String(e.firstName)} ${String(e.lastName ?? '')}`.trim()
              : (e.lastName ?? 'Unknown'))
          ),
          hourlyRate: e.hourlyRate != null ? Number(e.hourlyRate) : undefined,
        }));
        setEmployees(list);
        if (list.length > 0) setEmployeeId(list[0].id);
      })
      .catch(() => {/* ignore */})
      .finally(() => setLoadingEmployees(false));
  }, []);

  async function handleSave() {
    if (!employeeId || !date) return;
    setSaving(true);
    try {
      const clockIn = new Date(`${date}T${clockInTime}`).toISOString();
      const clockOut = new Date(`${date}T${clockOutTime}`).toISOString();
      const created = await apiFetch<Shift>('shifts', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          clockIn,
          clockOut,
          breakMinutes: Number(breakMinutes) || 0,
          notes,
        }),
      });
      onAdded(created);
      toast({ title: 'Shift added', variant: 'success' });
      onClose();
    } catch (err) {
      toast({ title: 'Failed to add shift', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add Shift</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        </div>
        <div className="space-y-4 px-6 py-5">
          {/* Employee */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Employee</label>
            {loadingEmployees ? (
              <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : (
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            )}
          </div>
          {/* Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          {/* Clock In */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Clock In</label>
            <input
              type="time"
              value={clockInTime}
              onChange={(e) => setClockInTime(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          {/* Clock Out */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Clock Out</label>
            <input
              type="time"
              value={clockOutTime}
              onChange={(e) => setClockOutTime(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          {/* Break */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Break (minutes)</label>
            <input
              type="number"
              min={0}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Note</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !employeeId}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Add Shift
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TimesheetsClient() {
  const { toast } = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('this_week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [approvingAll, setApprovingAll] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [flaggedFilter, setFlaggedFilter] = useState(false);

  function getDateRange() {
    if (period === 'this_week') return getWeekRange(0);
    if (period === 'last_week') return getWeekRange(1);
    if (period === 'this_month') return getMonthRange();
    return { dateFrom: customFrom, dateTo: customTo };
  }

  const fetchShifts = useCallback(() => {
    let dateFrom: string;
    let dateTo: string;
    if (period === 'this_week') {
      ({ dateFrom, dateTo } = getWeekRange(0));
    } else if (period === 'last_week') {
      ({ dateFrom, dateTo } = getWeekRange(1));
    } else if (period === 'this_month') {
      ({ dateFrom, dateTo } = getMonthRange());
    } else {
      dateFrom = customFrom;
      dateTo = customTo;
    }
    if (!dateFrom || !dateTo) return;
    setIsLoading(true);
    fetch(`/api/proxy/shifts?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then((r) => r.json())
      .then((json) => {
        const raw: Record<string, unknown>[] = Array.isArray(json) ? json : (json as { data?: Record<string, unknown>[] }).data ?? [];
        // Map backend fields (clockInAt/clockOutAt/totalMinutes) to frontend Shift shape
        const mapped: Shift[] = raw.map((r) => {
          const clockInStr = String(r.clockInAt ?? r.clockIn ?? '');
          const clockOutStr = String(r.clockOutAt ?? r.clockOut ?? '');
          const breakMin = Number(r.breakMinutes ?? 0);
          const totalMins = Number(r.totalMinutes ?? 0);
          const clockInDate = clockInStr ? new Date(clockInStr) : null;
          return {
            id: String(r.id ?? ''),
            employeeId: String(r.employeeId ?? ''),
            employeeName: String(r.employeeName ?? r.employeeId ?? 'Unknown'),
            hourlyRate: r.hourlyRate != null ? Number(r.hourlyRate) : undefined,
            day: clockInDate ? clockInDate.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : '',
            clockIn: clockInStr,
            clockOut: clockOutStr,
            breakMinutes: breakMin,
            totalHours: totalMins > 0 ? totalMins / 60 : 0,
            notes: r.notes != null ? String(r.notes) : undefined,
            status: (String(r.status ?? 'pending') === 'open' ? 'pending'
              : String(r.status ?? 'pending') === 'closed' ? 'pending'
              : String(r.status ?? 'pending')) as Shift['status'],
          };
        });
        setShifts(mapped);
      })
      .catch(() => setShifts([]))
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  // Derived counts & sums
  const approvedShifts = shifts.filter((sh) => sh.status === 'approved');
  const totalHours = shifts.reduce((s, sh) => s + sh.totalHours, 0);
  const approvedHours = approvedShifts.reduce((s, sh) => s + sh.totalHours, 0);
  const overtimeHours = shifts
    .filter((sh) => sh.totalHours > 8)
    .reduce((s, sh) => s + (sh.totalHours - 8), 0);
  const pendingCount = shifts.filter((sh) => sh.status === 'pending').length;
  const flaggedCount = shifts.filter((sh) => sh.status === 'flagged').length;
  const staffSet = new Set(shifts.map((sh) => sh.employeeId ?? sh.employeeName));
  const staffCount = staffSet.size;
  const totalWages = approvedShifts.reduce(
    (s, sh) => s + sh.totalHours * (sh.hourlyRate ?? 0),
    0,
  );

  const displayedShifts = flaggedFilter
    ? shifts.filter((sh) => sh.status === 'flagged')
    : shifts;

  function exportPayroll() {
    // v2.7.75 — buildCsv() handles per-cell escaping (commas inside
    // employee names, embedded quotes) and prefixes formula-trigger
    // characters (`=`, `+`, `-`, `@`) with a single quote to defeat
    // CSV formula injection in Excel/Sheets/Numbers.
    const rows: unknown[][] = [
      ['Employee', 'Day', 'Clock In', 'Clock Out', 'Break (min)', 'Hours', 'Hourly Rate', 'Total Pay'],
      ...shifts.map((s) => {
        const rate = s.hourlyRate ?? 0;
        const pay = s.totalHours * rate;
        return [
          s.employeeName,
          s.day,
          s.clockIn,
          s.clockOut,
          s.breakMinutes,
          s.totalHours.toFixed(2),
          rate.toFixed(2),
          pay.toFixed(2),
        ];
      }),
    ];
    downloadCsv(`payroll-${getDateRange().dateFrom}.csv`, rows);
  }

  function exportCSV() {
    const rows: unknown[][] = [
      ['Employee', 'Day', 'Clock In', 'Clock Out', 'Break (min)', 'Total Hours', 'Status'],
      ...shifts.map((s) => [
        s.employeeName,
        s.day,
        s.clockIn,
        s.clockOut,
        s.breakMinutes,
        s.totalHours.toFixed(2),
        s.status,
      ]),
    ];
    downloadCsv(`timesheets-${getDateRange().dateFrom}.csv`, rows);
  }

  async function approveAll() {
    const pending = shifts.filter((s) => s.status === 'pending' || s.status === 'flagged');
    if (pending.length === 0) return;
    setApprovingAll(true);
    let approved = 0;
    let failed = 0;
    for (const s of pending) {
      try {
        await apiFetch(`shifts/${s.id}/approve`, { method: 'POST' });
        approved++;
      } catch {
        failed++;
      }
    }
    setShifts((prev) =>
      prev.map((s) => (s.status === 'pending' || s.status === 'flagged' ? { ...s, status: 'approved' as const } : s)),
    );
    if (failed === 0) {
      toast({
        title: 'Timesheets approved',
        description: `${approved} shift${approved !== 1 ? 's' : ''} approved.`,
        variant: 'success',
      });
    } else {
      toast({
        title: 'Partial approval',
        description: `${approved} approved, ${failed} failed.`,
        variant: 'destructive',
      });
    }
    setApprovingAll(false);
  }

  async function approveShift(id: string) {
    setApprovingId(id);
    try {
      await apiFetch(`shifts/${id}/approve`, { method: 'POST' });
      setShifts((prev) =>
        prev.map((sh) => (sh.id === id ? { ...sh, status: 'approved' as const } : sh)),
      );
      toast({ title: 'Shift approved', variant: 'success' });
    } catch (err) {
      toast({ title: 'Approval failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Timesheets</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isLoading ? 'Loading…' : `${shifts.length} shifts`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Add Shift
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={approveAll}
            disabled={approvingAll || pendingCount === 0}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            {approvingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            Approve All
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
          {(
            [
              { key: 'this_week', label: 'This Week' },
              { key: 'last_week', label: 'Last Week' },
              { key: 'this_month', label: 'This Month' },
              { key: 'custom', label: 'Custom' },
            ] as { key: Period; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === key
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Hours', value: isLoading ? '—' : `${totalHours.toFixed(1)} hrs` },
          { label: 'Total Overtime', value: isLoading ? '—' : `${overtimeHours.toFixed(1)} hrs` },
          { label: 'Pending Approvals', value: isLoading ? '—' : String(pendingCount) },
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

      {/* Payroll Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Approved Hours</p>
            <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">
              {isLoading ? '—' : `${approvedHours.toFixed(1)} hrs`}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Est. Wage Cost</p>
            <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">
              {isLoading ? '—' : `$${totalWages.toFixed(2)}`}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Staff</p>
            <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">
              {isLoading ? '—' : staffCount}
            </p>
          </div>
        </div>
        <button
          onClick={exportPayroll}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <Download className="h-4 w-4" />
          Export Payroll
        </button>
      </div>

      {/* Flagged Shifts Alert */}
      {!isLoading && flaggedCount > 0 && (
        <button
          onClick={() => setFlaggedFilter((f) => !f)}
          className={`flex w-full items-center gap-3 rounded-xl border px-5 py-3 text-left transition-colors ${
            flaggedFilter
              ? 'border-amber-400 bg-amber-100 dark:border-amber-600 dark:bg-amber-900/30'
              : 'border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:hover:bg-amber-900/30'
          }`}
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {flaggedCount} shift{flaggedCount !== 1 ? 's' : ''} flagged for review — possible overtime or missing clock-out
          </span>
          <span className="ml-auto text-xs font-medium text-amber-600 dark:text-amber-400">
            {flaggedFilter ? 'Show all' : 'View flagged'}
          </span>
        </button>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Employee</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Day</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Clock In</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Clock Out</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Break (min)</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Total Hours</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: '70%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              : displayedShifts.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{s.employeeName}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{s.day}</td>
                    <td className="px-5 py-3.5 font-mono text-sm text-gray-600 dark:text-gray-400">{s.clockIn}</td>
                    <td className="px-5 py-3.5 font-mono text-sm text-gray-600 dark:text-gray-400">{s.clockOut}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{s.breakMinutes}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white">
                      {s.totalHours.toFixed(2)}
                      {s.totalHours > 8 && (
                        <span className="ml-1.5 text-xs font-normal text-orange-500">OT</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[s.status]}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {/* Edit button — always visible */}
                        <button
                          onClick={() => setEditingShift(s)}
                          className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                        {/* Approve button — pending or flagged */}
                        {(s.status === 'pending' || s.status === 'flagged') && (
                          <button
                            disabled={approvingId === s.id}
                            onClick={() => approveShift(s.id)}
                            className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                          >
                            {approvingId === s.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            Approve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            {!isLoading && displayedShifts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                  {flaggedFilter ? 'No flagged shifts.' : 'No shifts found for this period.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Shift Modal */}
      {editingShift && (
        <EditShiftModal
          shift={editingShift}
          onClose={() => setEditingShift(null)}
          onSaved={(updated) => {
            setShifts((prev) => prev.map((sh) => (sh.id === updated.id ? updated : sh)));
            setEditingShift(null);
          }}
        />
      )}

      {/* Add Shift Modal */}
      {showAddModal && (
        <AddShiftModal
          onClose={() => setShowAddModal(false)}
          onAdded={(shift) => {
            setShifts((prev) => [shift, ...prev]);
          }}
        />
      )}
    </div>
  );
}
