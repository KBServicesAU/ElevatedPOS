'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, Calendar,
  Send, Copy, Users, Clock, Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id:        string;
  firstName: string;
  lastName:  string;
  role?:     string;
}

interface Shift {
  id:         string;
  employeeId: string;
  date:       string; // YYYY-MM-DD
  startTime:  string; // HH:MM
  endTime:    string; // HH:MM
  role?:      string;
  station?:   string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateHeader(date: Date): { day: string; date: string } {
  return {
    day:  date.toLocaleDateString('en-AU', { weekday: 'short' }),
    date: date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
  };
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${monday.toLocaleDateString('en-AU', opts)} – ${sunday.toLocaleDateString('en-AU', { ...opts, year: 'numeric' })}`;
}

const WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6]; // Mon offset indices

// ─── Add Shift Modal ──────────────────────────────────────────────────────────

interface AddShiftModalProps {
  employees: Employee[];
  defaultDate?: string;
  onClose: () => void;
  onSaved: (shift: Shift) => void;
}

function AddShiftModal({ employees, defaultDate, onClose, onSaved }: AddShiftModalProps) {
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState('');
  const [date,       setDate]       = useState(defaultDate ?? toDateStr(new Date()));
  const [startTime,  setStartTime]  = useState('09:00');
  const [endTime,    setEndTime]    = useState('17:00');
  const [role,       setRole]       = useState('');
  const [station,    setStation]    = useState('');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !date || !startTime || !endTime) return;
    setSaving(true); setError(null);
    try {
      const res = await apiFetch<{ data: Shift }>('shifts/roster', {
        method: 'POST',
        body: JSON.stringify({ employeeId, date, startTime, endTime, role: role || undefined, station: station || undefined }),
      });
      toast({ title: 'Shift added', description: 'The shift has been saved to the roster.', variant: 'success' });
      onSaved(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save shift');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1e1e2e] border border-gray-200 dark:border-[#2a2a3a] shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-[#2a2a3a] px-6 py-4">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Add Shift</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-[#2a2a3a] hover:text-gray-900 dark:hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-6">
          {/* Employee */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Employee</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
              className="w-full rounded-xl bg-gray-50 dark:bg-[#2a2a3a] px-3 py-2.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-[#3a3a4a] focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Select employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}{emp.role ? ` — ${emp.role}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full rounded-xl bg-gray-50 dark:bg-[#2a2a3a] px-3 py-2.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-[#3a3a4a] focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full rounded-xl bg-gray-50 dark:bg-[#2a2a3a] px-3 py-2.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-[#3a3a4a] focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full rounded-xl bg-gray-50 dark:bg-[#2a2a3a] px-3 py-2.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-[#3a3a4a] focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Role / Station */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Role <span className="text-gray-400 dark:text-gray-600">(optional)</span></label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Barista"
                className="w-full rounded-xl bg-gray-50 dark:bg-[#2a2a3a] px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-[#3a3a4a] focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Station <span className="text-gray-400 dark:text-gray-600">(optional)</span></label>
              <input
                type="text"
                value={station}
                onChange={(e) => setStation(e.target.value)}
                placeholder="e.g. Front Counter"
                className="w-full rounded-xl bg-gray-50 dark:bg-[#2a2a3a] px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-[#3a3a4a] focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 dark:bg-red-950 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-300 dark:border-[#3a3a4a] py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#2a2a3a] hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !employeeId}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-500 py-2.5 text-sm font-bold text-white hover:bg-indigo-400 transition-colors disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Add Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RosterClient() {
  const { toast } = useToast();

  const [monday,    setMonday]    = useState<Date>(() => getMondayOf(new Date()));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts,    setShifts]    = useState<Shift[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [showAddModal,    setShowAddModal]    = useState(false);
  const [addDefaultDate,  setAddDefaultDate]  = useState<string | undefined>();
  const [publishing,      setPublishing]      = useState(false);
  const [copyingWeek,     setCopyingWeek]     = useState(false);

  // Computed week dates (Mon–Sun)
  const weekDates = WEEK_DAYS.map((i) => addDays(monday, i));
  const sunday    = weekDates[6];

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadEmployees = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: Employee[] }>('employees?limit=100');
      setEmployees(res.data ?? []);
    } catch { /**/ }
  }, []);

  const loadShifts = useCallback(async (mon: Date) => {
    setLoading(true);
    try {
      const from = toDateStr(mon);
      const to   = toDateStr(addDays(mon, 6));
      const res  = await apiFetch<{ data: Shift[] }>(`shifts?dateFrom=${from}&dateTo=${to}`);
      setShifts(res.data ?? []);
    } catch {
      setShifts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    void loadShifts(monday);
  }, [monday, loadShifts]);

  // ── Week navigation ───────────────────────────────────────────────────────

  function prevWeek() { setMonday((m) => addDays(m, -7)); }
  function nextWeek() { setMonday((m) => addDays(m, 7));  }

  // ── Publish ───────────────────────────────────────────────────────────────

  async function handlePublish() {
    setPublishing(true);
    try {
      await apiFetch('shifts/publish', {
        method: 'POST',
        body: JSON.stringify({ dateFrom: toDateStr(monday), dateTo: toDateStr(sunday) }),
      });
      toast({ title: 'Roster published', description: `Shifts for ${formatWeekRange(monday)} have been published.`, variant: 'success' });
    } catch (err) {
      toast({ title: 'Publish failed', description: err instanceof Error ? err.message : 'Could not publish roster.', variant: 'destructive' });
    } finally { setPublishing(false); }
  }

  // ── Copy last week ────────────────────────────────────────────────────────

  async function handleCopyLastWeek() {
    setCopyingWeek(true);
    try {
      const fromMonday = addDays(monday, -7);
      await apiFetch('shifts/copy-week', {
        method: 'POST',
        body: JSON.stringify({ fromWeek: toDateStr(fromMonday), toWeek: toDateStr(monday) }),
      });
      toast({ title: 'Week copied', description: 'Last week\'s shifts have been copied to this week.', variant: 'success' });
      void loadShifts(monday);
    } catch (err) {
      toast({ title: 'Copy failed', description: err instanceof Error ? err.message : 'Could not copy last week.', variant: 'destructive' });
    } finally { setCopyingWeek(false); }
  }

  // ── Shift saved callback ──────────────────────────────────────────────────

  function handleShiftSaved(shift: Shift) {
    setShifts((prev) => [...prev, shift]);
    setShowAddModal(false);
    setAddDefaultDate(undefined);
  }

  // ── Shift lookup ──────────────────────────────────────────────────────────

  function getShiftsFor(employeeId: string, dateStr: string): Shift[] {
    return shifts.filter((s) => s.employeeId === employeeId && s.date === dateStr);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-indigo-400" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Staff Roster</h1>
            <p className="text-sm text-gray-500 dark:text-gray-500">Schedule shifts for your team</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setAddDefaultDate(undefined); setShowAddModal(true); }}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400 transition-colors"
          >
            <Plus className="h-4 w-4" />Add Shift
          </button>

          <button
            onClick={() => void handleCopyLastWeek()}
            disabled={copyingWeek}
            className="flex items-center gap-1.5 rounded-xl border border-gray-300 dark:border-[#3a3a4a] bg-gray-100 dark:bg-[#2a2a3a] px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-40"
          >
            {copyingWeek ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            {copyingWeek ? 'Copying…' : 'Copy Last Week'}
          </button>

          <button
            onClick={() => void handlePublish()}
            disabled={publishing}
            className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-500 transition-colors disabled:opacity-40"
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {publishing ? 'Publishing…' : 'Publish Roster'}
          </button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-4 rounded-2xl border border-gray-200 dark:border-[#2a2a3a] bg-white dark:bg-[#1e1e2e] px-5 py-3">
        <button
          onClick={prevWeek}
          className="rounded-lg p-1.5 text-gray-500 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-[#2a2a3a] hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatWeekRange(monday)}</span>
        </div>
        <button
          onClick={nextWeek}
          className="rounded-lg p-1.5 text-gray-500 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-[#2a2a3a] hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Roster grid */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-[#2a2a3a] bg-white dark:bg-[#1e1e2e]">
        <table className="w-full min-w-[700px] border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-[#2a2a3a]">
              {/* Employee column header */}
              <th className="sticky left-0 z-10 bg-white dark:bg-[#1e1e2e] px-4 py-3 text-left">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-500">
                  <Users className="h-3.5 w-3.5" />Employee
                </div>
              </th>
              {weekDates.map((d) => {
                const { day, date } = formatDateHeader(d);
                const isToday = toDateStr(d) === toDateStr(new Date());
                return (
                  <th key={toDateStr(d)} className="px-3 py-3 text-center">
                    <div className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-indigo-400' : 'text-gray-500 dark:text-gray-500'}`}>{day}</div>
                    <div className={`mt-0.5 text-sm font-bold ${isToday ? 'text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>{date}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-200 dark:border-[#2a2a3a] animate-pulse">
                  <td className="sticky left-0 z-10 bg-white dark:bg-[#1e1e2e] px-4 py-3">
                    <div className="h-8 w-32 rounded-lg bg-gray-100 dark:bg-[#2a2a3a]" />
                  </td>
                  {WEEK_DAYS.map((d) => (
                    <td key={d} className="px-3 py-3">
                      <div className="mx-auto h-8 w-24 rounded-lg bg-gray-100 dark:bg-[#2a2a3a]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <Users className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-700 mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-500">No employees found</p>
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr key={emp.id} className="group border-b border-gray-200 dark:border-[#2a2a3a] last:border-0 hover:bg-gray-50 dark:hover:bg-[#252535] transition-colors">
                  {/* Employee name */}
                  <td className="sticky left-0 z-10 bg-white dark:bg-[#1e1e2e] px-4 py-3 group-hover:bg-gray-50 dark:group-hover:bg-[#252535] transition-colors">
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <div className="h-7 w-7 flex-shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-300">
                        {emp.firstName[0]}{emp.lastName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white leading-none">{emp.firstName} {emp.lastName}</p>
                        {emp.role && <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{emp.role}</p>}
                      </div>
                    </div>
                  </td>

                  {/* Day cells */}
                  {weekDates.map((d) => {
                    const dateStr    = toDateStr(d);
                    const dayShifts  = getShiftsFor(emp.id, dateStr);
                    const isToday    = dateStr === toDateStr(new Date());

                    return (
                      <td
                        key={dateStr}
                        className={`px-2 py-2 text-center align-top ${isToday ? 'bg-indigo-50 dark:bg-indigo-950/20' : ''}`}
                      >
                        <div className="space-y-1 min-h-[40px]">
                          {dayShifts.map((shift) => (
                            <div
                              key={shift.id}
                              className="rounded-lg bg-indigo-50 dark:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/50 px-2 py-1.5 text-left"
                            >
                              <div className="flex items-center gap-1 text-xs font-semibold text-indigo-700 dark:text-indigo-200">
                                <Clock className="h-3 w-3 flex-shrink-0" />
                                {shift.startTime}–{shift.endTime}
                              </div>
                              {(shift.role || shift.station) && (
                                <p className="mt-0.5 text-xs text-indigo-500 dark:text-indigo-400 truncate">
                                  {[shift.role, shift.station].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>
                          ))}
                          {/* Quick add cell button */}
                          <button
                            onClick={() => { setAddDefaultDate(dateStr); setShowAddModal(true); }}
                            className="w-full rounded-lg border border-dashed border-transparent px-2 py-1 text-xs text-gray-400 dark:text-gray-700 opacity-0 transition-all hover:border-indigo-400 dark:hover:border-indigo-800 hover:text-indigo-500 dark:hover:text-indigo-400 group-hover:opacity-100"
                          >
                            + add
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Empty state if no employees */}
      {!loading && employees.length === 0 && shifts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-[#2a2a3a] py-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-700 mb-3" />
          <p className="text-gray-700 dark:text-gray-500 font-medium">No roster data yet</p>
          <p className="text-gray-500 dark:text-gray-600 text-sm mt-1">Add employees first, then schedule shifts.</p>
        </div>
      )}

      {/* Add Shift Modal */}
      {showAddModal && (
        <AddShiftModal
          employees={employees}
          defaultDate={addDefaultDate}
          onClose={() => { setShowAddModal(false); setAddDefaultDate(undefined); }}
          onSaved={handleShiftSaved}
        />
      )}
    </div>
  );
}
