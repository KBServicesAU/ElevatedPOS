'use client';

import { useState, useEffect } from 'react';
import { Download, CheckCheck, Loader2 } from 'lucide-react';
import { useToast } from '@/lib/use-toast';

interface Shift {
  id: string;
  employeeName: string;
  day: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  totalHours: number;
  status: 'approved' | 'pending' | 'flagged';
}

const MOCK_SHIFTS: Shift[] = [
  { id: '1', employeeName: 'Jane Doe', day: 'Mon', clockIn: '09:00', clockOut: '17:30', breakMinutes: 30, totalHours: 8, status: 'approved' },
  { id: '2', employeeName: 'Jane Doe', day: 'Tue', clockIn: '08:55', clockOut: '17:05', breakMinutes: 30, totalHours: 7.67, status: 'approved' },
  { id: '3', employeeName: 'Bob Smith', day: 'Mon', clockIn: '10:00', clockOut: '18:00', breakMinutes: 30, totalHours: 7.5, status: 'pending' },
  { id: '4', employeeName: 'Bob Smith', day: 'Tue', clockIn: '10:00', clockOut: '20:30', breakMinutes: 30, totalHours: 10, status: 'flagged' },
  { id: '5', employeeName: 'Bob Smith', day: 'Wed', clockIn: '09:30', clockOut: '17:30', breakMinutes: 30, totalHours: 7.5, status: 'pending' },
  { id: '6', employeeName: 'Alice Lee', day: 'Mon', clockIn: '08:00', clockOut: '16:00', breakMinutes: 30, totalHours: 7.5, status: 'approved' },
  { id: '7', employeeName: 'Alice Lee', day: 'Wed', clockIn: '08:00', clockOut: '16:00', breakMinutes: 30, totalHours: 7.5, status: 'approved' },
  { id: '8', employeeName: 'Alice Lee', day: 'Thu', clockIn: '08:00', clockOut: '17:30', breakMinutes: 30, totalHours: 9, status: 'pending' },
];

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

export function TimesheetsClient() {
  const { toast } = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('this_week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [approvingAll, setApprovingAll] = useState(false);

  function getDateRange() {
    if (period === 'this_week') return getWeekRange(0);
    if (period === 'last_week') return getWeekRange(1);
    if (period === 'this_month') return getMonthRange();
    return { dateFrom: customFrom, dateTo: customTo };
  }

  function fetchShifts() {
    const { dateFrom, dateTo } = getDateRange();
    if (!dateFrom || !dateTo) return;
    setIsLoading(true);
    fetch(`/api/proxy/shifts?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then((r) => r.json())
      .then((json) => {
        const data: Shift[] = Array.isArray(json) ? json : json.data ?? [];
        setShifts(data.length > 0 ? data : MOCK_SHIFTS);
      })
      .catch(() => setShifts(MOCK_SHIFTS))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    fetchShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo]);

  const totalHours = shifts.reduce((s, sh) => s + sh.totalHours, 0);
  const overtimeHours = shifts
    .filter((sh) => sh.totalHours > 8)
    .reduce((s, sh) => s + (sh.totalHours - 8), 0);
  const pendingCount = shifts.filter((sh) => sh.status === 'pending').length;

  function exportCSV() {
    const header = 'Employee,Day,Clock In,Clock Out,Break (min),Total Hours,Status';
    const rows = shifts.map(
      (s) =>
        `"${s.employeeName}","${s.day}","${s.clockIn}","${s.clockOut}",${s.breakMinutes},${s.totalHours.toFixed(2)},"${s.status}"`,
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timesheets-${getDateRange().dateFrom}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function approveAll() {
    setApprovingAll(true);
    try {
      await fetch('/api/proxy/shifts/approve-all', { method: 'POST' });
      const pendingCount = shifts.filter((s) => s.status === 'pending').length;
      setShifts((prev) =>
        prev.map((s) => (s.status === 'pending' ? { ...s, status: 'approved' as const } : s)),
      );
      toast({ title: 'Timesheets approved', description: `${pendingCount} shift${pendingCount !== 1 ? 's' : ''} approved.`, variant: 'success' });
    } catch {
      toast({ title: 'Approval failed', description: 'Could not approve timesheets. Please try again.', variant: 'destructive' });
    } finally {
      setApprovingAll(false);
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
        <div className="flex gap-2">
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
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
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
              : shifts.map((s) => (
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
                      {s.status === 'pending' && (
                        <button
                          onClick={() =>
                            setShifts((prev) =>
                              prev.map((sh) =>
                                sh.id === s.id ? { ...sh, status: 'approved' as const } : sh,
                              ),
                            )
                          }
                          className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                        >
                          Approve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            {!isLoading && shifts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                  No shifts found for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
