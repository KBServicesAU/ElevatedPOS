'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, RefreshCw, Loader2, X, CalendarCheck, List, Clock,
  Users, Phone, Mail, MessageSquare, Trash2, CheckCircle2,
  AlertCircle, UserCheck, Ban, LayoutGrid,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReservationStatus = 'confirmed' | 'arrived' | 'seated' | 'completed' | 'no-show' | 'cancelled';

interface Reservation {
  id: string;
  guestName: string;
  phone?: string;
  email?: string;
  partySize: number;
  date: string;
  time: string;
  duration: number;
  tableId?: string;
  tableName?: string;
  status: ReservationStatus;
  notes?: string;
}

interface WaitlistEntry {
  id: string;
  guestName: string;
  partySize: number;
  addedAt: string;
  notes?: string;
  phone?: string;
  status: string;
}

interface TableOption {
  id: string;
  name: string;
  capacity: number;
}

interface ReservationSettings {
  bookingWindowDays: number;
  slotDurationMins: number;
  maxPartySize: number;
  autoConfirm: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<ReservationStatus, string> = {
  confirmed:  'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  arrived:    'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  seated:     'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  completed:  'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  'no-show':  'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  cancelled:  'bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-400',
};

const STATUS_LABEL: Record<ReservationStatus, string> = {
  confirmed:  'Confirmed',
  arrived:    'Arrived',
  seated:     'Seated',
  completed:  'Completed',
  'no-show':  'No Show',
  cancelled:  'Cancelled',
};

const DURATION_OPTIONS = [
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
  { label: '90 min', value: 90 },
  { label: '2 hours', value: 120 },
  { label: 'Custom', value: 0 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function waitMinutes(addedAt: string): string {
  const mins = Math.floor((Date.now() - new Date(addedAt).getTime()) / 60_000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 7; h < 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}

// ─── NewReservationModal ──────────────────────────────────────────────────────

interface NewReservationModalProps {
  tables: TableOption[];
  onClose: () => void;
  onSaved: () => void;
}

function NewReservationModal({ tables, onClose, onSaved }: NewReservationModalProps) {
  const { toast } = useToast();
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState('19:00');
  const [durationOption, setDurationOption] = useState(60);
  const [customDuration, setCustomDuration] = useState(60);
  const [tableId, setTableId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const timeSlots = generateTimeSlots();
  const effectiveDuration = durationOption === 0 ? customDuration : durationOption;

  async function handleSave() {
    if (!guestName.trim()) {
      toast({ title: 'Guest name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch('reservations', {
        method: 'POST',
        body: JSON.stringify({
          guestName: guestName.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          partySize,
          date,
          time,
          duration: effectiveDuration,
          tableId: tableId || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      toast({ title: 'Reservation created', variant: 'success' });
      onSaved();
    } catch (err) {
      toast({ title: 'Failed to create reservation', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-gray-900 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Reservation</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {/* Guest name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Guest name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. Sarah Johnson"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
          </div>

          {/* Phone & Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+61 4xx xxx xxx"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="guest@example.com"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
              />
            </div>
          </div>

          {/* Party size */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Party size</label>
            <input
              type="number"
              min={1}
              max={20}
              value={partySize}
              onChange={(e) => setPartySize(Math.min(20, Math.max(1, Number(e.target.value))))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
              <input
                type="date"
                value={date}
                min={todayIso()}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Time</label>
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                {timeSlots.map((slot) => (
                  <option key={slot} value={slot}>{formatTime12(slot)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Duration</label>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDurationOption(opt.value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    durationOption === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {durationOption === 0 && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  value={customDuration}
                  onChange={(e) => setCustomDuration(Number(e.target.value))}
                  className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
                <span className="text-sm text-gray-500">minutes</span>
              </div>
            )}
          </div>

          {/* Table preference */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Table preference</label>
            <select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="">No preference</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (seats {t.capacity})
                </option>
              ))}
            </select>
          </div>

          {/* Special requests */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Special requests</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Allergies, high chair, anniversary, etc."
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Reservation
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AddWaitlistModal ─────────────────────────────────────────────────────────

interface AddWaitlistModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function AddWaitlistModal({ onClose, onSaved }: AddWaitlistModalProps) {
  const { toast } = useToast();
  const [guestName, setGuestName] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!guestName.trim()) {
      toast({ title: 'Guest name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch('reservations/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          guestName: guestName.trim(),
          partySize,
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      toast({ title: 'Added to waitlist', variant: 'success' });
      onSaved();
    } catch (err) {
      toast({ title: 'Failed to add to waitlist', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add to Waitlist</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Guest name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. John Smith"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Party size</label>
            <input
              type="number"
              min={1}
              max={20}
              value={partySize}
              onChange={(e) => setPartySize(Math.min(20, Math.max(1, Number(e.target.value))))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Phone (for SMS)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+61 4xx xxx xxx"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Preferences, allergies, etc."
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Add to Waitlist
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SeatWaitlistModal ────────────────────────────────────────────────────────

interface SeatWaitlistModalProps {
  entry: WaitlistEntry;
  tables: TableOption[];
  onClose: () => void;
  onSeated: () => void;
}

function SeatWaitlistModal({ entry, tables, onClose, onSeated }: SeatWaitlistModalProps) {
  const { toast } = useToast();
  const [tableId, setTableId] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSeat() {
    if (!tableId) {
      toast({ title: 'Please select a table', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`reservations/waitlist/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'seated', tableId }),
      });
      toast({ title: `${entry.guestName} has been seated`, variant: 'success' });
      onSeated();
    } catch (err) {
      toast({ title: 'Failed to seat guest', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-sm rounded-xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Seat Guest</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Assign a table for <span className="font-medium text-gray-900 dark:text-white">{entry.guestName}</span> (party of {entry.partySize})
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Select table</label>
            <select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="">Choose a table...</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>{t.name} (seats {t.capacity})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSeat}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Seat Now
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ReservationCard ──────────────────────────────────────────────────────────

interface ReservationCardProps {
  reservation: Reservation;
  onStatusChange: (id: string, status: ReservationStatus) => Promise<void>;
}

function ReservationCard({ reservation: r, onStatusChange }: ReservationCardProps) {
  const [busy, setBusy] = useState(false);

  async function changeStatus(status: ReservationStatus) {
    setBusy(true);
    try {
      await onStatusChange(r.id, status);
    } finally {
      setBusy(false);
    }
  }

  const actions: { label: string; status: ReservationStatus; icon: React.ReactNode; cls: string }[] = [];
  if (r.status === 'confirmed') {
    actions.push(
      { label: 'Mark Arrived', status: 'arrived', icon: <UserCheck className="h-3.5 w-3.5" />, cls: 'bg-purple-600 hover:bg-purple-700 text-white' },
      { label: 'No Show', status: 'no-show', icon: <AlertCircle className="h-3.5 w-3.5" />, cls: 'bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400' },
      { label: 'Cancel', status: 'cancelled', icon: <Ban className="h-3.5 w-3.5" />, cls: 'bg-gray-100 hover:bg-gray-200 text-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300' },
    );
  } else if (r.status === 'arrived') {
    actions.push(
      { label: 'Seat Now', status: 'seated', icon: <CheckCircle2 className="h-3.5 w-3.5" />, cls: 'bg-amber-600 hover:bg-amber-700 text-white' },
      { label: 'Cancel', status: 'cancelled', icon: <Ban className="h-3.5 w-3.5" />, cls: 'bg-gray-100 hover:bg-gray-200 text-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300' },
    );
  } else if (r.status === 'seated') {
    actions.push(
      { label: 'Complete', status: 'completed', icon: <CheckCircle2 className="h-3.5 w-3.5" />, cls: 'bg-green-600 hover:bg-green-700 text-white' },
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{r.guestName}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>
              {STATUS_LABEL[r.status]}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatTime12(r.time)} · {r.duration}m
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {r.partySize} guests
            </span>
            {r.tableName && (
              <span className="flex items-center gap-1">
                <LayoutGrid className="h-3.5 w-3.5" />
                {r.tableName}
              </span>
            )}
            {r.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {r.phone}
              </span>
            )}
            {r.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {r.email}
              </span>
            )}
          </div>
          {r.notes && (
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 italic">{r.notes}</p>
          )}
        </div>
      </div>
      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a.status}
              onClick={() => changeStatus(a.status)}
              disabled={busy}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${a.cls}`}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TimelineView ─────────────────────────────────────────────────────────────

interface TimelineViewProps {
  reservations: Reservation[];
  onStatusChange: (id: string, status: ReservationStatus) => Promise<void>;
}

function TimelineView({ reservations }: TimelineViewProps) {
  const byDate = reservations.reduce<Record<string, Reservation[]>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = [];
    acc[r.date].push(r);
    return acc;
  }, {});

  const sortedDates = Object.keys(byDate).sort();

  if (sortedDates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
        <CalendarCheck className="h-12 w-12 mb-3" />
        <p className="text-sm">No reservations in the next 7 days</p>
      </div>
    );
  }

  const pixelsPerHour = 80;
  const hours = Array.from({ length: 16 }, (_, i) => i + 7);

  return (
    <div className="space-y-6">
      {sortedDates.map((date) => {
        const label = new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
          weekday: 'long', day: 'numeric', month: 'long',
        });
        const dayReservations = byDate[date].sort((a, b) => a.time.localeCompare(b.time));

        return (
          <div key={date}>
            <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</h3>
            <div className="relative overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
              <div className="flex">
                {/* Time axis */}
                <div className="flex-shrink-0 w-14 border-r border-gray-200 dark:border-gray-700">
                  <div className="h-6" />
                  {hours.map((h) => (
                    <div key={h} style={{ height: pixelsPerHour }} className="flex items-start justify-end pr-2 pt-0.5">
                      <span className="text-[10px] text-gray-400">{formatTime12(`${String(h).padStart(2, '0')}:00`)}</span>
                    </div>
                  ))}
                </div>
                {/* Grid */}
                <div className="relative flex-1" style={{ minWidth: 500 }}>
                  <div className="h-6 border-b border-gray-100 dark:border-gray-700/50" />
                  {hours.map((h) => (
                    <div key={h} style={{ height: pixelsPerHour }} className="border-b border-gray-100 dark:border-gray-700/50" />
                  ))}
                  {dayReservations.map((r) => {
                    const [rh, rm] = r.time.split(':').map(Number);
                    const startMins = (rh - 7) * 60 + rm;
                    const top = (startMins / 60) * pixelsPerHour + 24;
                    const height = Math.max(20, (r.duration / 60) * pixelsPerHour - 4);

                    return (
                      <div
                        key={r.id}
                        className="absolute left-2 right-2 rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 dark:border-blue-700 dark:bg-blue-900/30"
                        style={{ top, height }}
                      >
                        <p className="truncate text-xs font-semibold text-blue-800 dark:text-blue-300">{r.guestName}</p>
                        <p className="truncate text-[10px] text-blue-600 dark:text-blue-400">
                          {formatTime12(r.time)} · {r.partySize}p{r.tableName ? ` · ${r.tableName}` : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ReservationsTab ──────────────────────────────────────────────────────────

interface ReservationsTabProps {
  reservations: Reservation[];
  tables: TableOption[];
  loading: boolean;
  onStatusChange: (id: string, status: ReservationStatus) => Promise<void>;
  onRefresh: () => void;
}

function ReservationsTab({ reservations, tables, loading, onStatusChange, onRefresh }: ReservationsTabProps) {
  const [viewMode, setViewMode] = useState<'timeline' | 'list'>('list');
  const [showModal, setShowModal] = useState(false);

  const byDate = reservations.reduce<Record<string, Reservation[]>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = [];
    acc[r.date].push(r);
    return acc;
  }, {});
  const sortedDates = Object.keys(byDate).sort();

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              viewMode === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'
            }`}
          >
            <List className="h-4 w-4" />
            List
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              viewMode === 'timeline'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'
            }`}
          >
            <Clock className="h-4 w-4" />
            Timeline
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New Reservation
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && reservations.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : viewMode === 'timeline' ? (
        <TimelineView reservations={reservations} onStatusChange={onStatusChange} />
      ) : (
        <div className="space-y-6">
          {sortedDates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
              <CalendarCheck className="h-12 w-12 mb-3" />
              <p className="text-sm">No reservations in the next 7 days</p>
            </div>
          ) : (
            sortedDates.map((date) => {
              const label = new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
                weekday: 'long', day: 'numeric', month: 'long',
              });
              const dayReservations = byDate[date].sort((a, b) => a.time.localeCompare(b.time));
              return (
                <div key={date}>
                  <h3 className="mb-2 text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{label}</h3>
                  <div className="space-y-2">
                    {dayReservations.map((r) => (
                      <ReservationCard key={r.id} reservation={r} onStatusChange={onStatusChange} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {showModal && (
        <NewReservationModal
          tables={tables}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── WaitlistTab ──────────────────────────────────────────────────────────────

interface WaitlistTabProps {
  waitlist: WaitlistEntry[];
  tables: TableOption[];
  loading: boolean;
  onRefresh: () => void;
}

function WaitlistTab({ waitlist, tables, loading, onRefresh }: WaitlistTabProps) {
  const { toast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [seatEntry, setSeatEntry] = useState<WaitlistEntry | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function handleNotify(entry: WaitlistEntry) {
    setBusy(entry.id, true);
    try {
      await apiFetch(`reservations/waitlist/${entry.id}/notify`, { method: 'POST' });
      toast({ title: 'SMS sent', description: `"Your table is ready!" sent to ${entry.guestName}`, variant: 'success' });
    } catch (err) {
      toast({ title: 'Failed to send SMS', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(entry.id, false);
    }
  }

  async function handleRemove(id: string) {
    setBusy(id, true);
    try {
      await apiFetch(`reservations/waitlist/${id}`, { method: 'DELETE' });
      toast({ title: 'Removed from waitlist', variant: 'success' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to remove', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(id, false);
      setConfirmRemoveId(null);
    }
  }

  const active = waitlist.filter((w) => w.status !== 'seated' && w.status !== 'cancelled');

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {active.length} {active.length === 1 ? 'party' : 'parties'} waiting
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add to Waitlist
          </button>
        </div>
      </div>

      {/* List */}
      {loading && waitlist.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : active.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
          <Users className="h-12 w-12 mb-3" />
          <p className="text-sm">Waitlist is empty</p>
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((entry, idx) => (
            <div
              key={entry.id}
              className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              {/* Position badge */}
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                {idx + 1}
              </div>
              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 dark:text-white">{entry.guestName}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {entry.partySize} guests
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {waitMinutes(entry.addedAt)} wait
                  </span>
                </div>
                {entry.phone && (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {entry.phone}
                  </p>
                )}
                {entry.notes && (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 italic">
                    <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
                    {entry.notes}
                  </p>
                )}
                {/* Actions */}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => setSeatEntry(entry)}
                    disabled={busyIds.has(entry.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Seat Now
                  </button>
                  {entry.phone && (
                    <button
                      onClick={() => handleNotify(entry)}
                      disabled={busyIds.has(entry.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-100 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-200 disabled:opacity-60 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                    >
                      {busyIds.has(entry.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                      SMS Notify
                    </button>
                  )}
                  {confirmRemoveId === entry.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">Confirm?</span>
                      <button
                        onClick={() => handleRemove(entry.id)}
                        disabled={busyIds.has(entry.id)}
                        className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmRemoveId(null)}
                        className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemoveId(entry.id)}
                      disabled={busyIds.has(entry.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-60 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddWaitlistModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); onRefresh(); }}
        />
      )}
      {seatEntry && (
        <SeatWaitlistModal
          entry={seatEntry}
          tables={tables}
          onClose={() => setSeatEntry(null)}
          onSeated={() => { setSeatEntry(null); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── SettingsTab ──────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: ReservationSettings = {
  bookingWindowDays: 30,
  slotDurationMins: 60,
  maxPartySize: 20,
  autoConfirm: true,
};

const BOOKING_WINDOW_OPTIONS = [7, 14, 30, 60, 90];
const SLOT_DURATION_OPTIONS = [
  { label: '60 min', value: 60 },
  { label: '90 min', value: 90 },
  { label: '120 min', value: 120 },
];

function SettingsTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ReservationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ data: ReservationSettings }>('settings/reservations')
      .then((res) => setSettings(res.data ?? DEFAULT_SETTINGS))
      .catch(() => setSettings(DEFAULT_SETTINGS))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('settings/reservations', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      toast({ title: 'Settings saved', variant: 'success' });
    } catch (err) {
      toast({ title: 'Failed to save settings', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      {/* Booking window */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Booking window (days in advance)
        </label>
        <div className="flex flex-wrap gap-2">
          {BOOKING_WINDOW_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setSettings((s) => ({ ...s, bookingWindowDays: days }))}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                settings.bookingWindowDays === days
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {days} days
            </button>
          ))}
        </div>
      </div>

      {/* Slot duration */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Default slot duration
        </label>
        <div className="flex flex-wrap gap-2">
          {SLOT_DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSettings((s) => ({ ...s, slotDurationMins: opt.value }))}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                settings.slotDurationMins === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Max party size */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Max party size
        </label>
        <input
          type="number"
          min={1}
          max={100}
          value={settings.maxPartySize}
          onChange={(e) => setSettings((s) => ({ ...s, maxPartySize: Number(e.target.value) }))}
          className="w-32 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
      </div>

      {/* Auto-confirm */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">Auto-confirm reservations</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Automatically confirm new bookings without manual review
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettings((s) => ({ ...s, autoConfirm: !s.autoConfirm }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.autoConfirm ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              settings.autoConfirm ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Save Settings
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'reservations' | 'waitlist' | 'settings';

export function ReservationsClient() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('reservations');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [loadingRes, setLoadingRes] = useState(true);
  const [loadingWait, setLoadingWait] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchReservations = useCallback(async (silent = false) => {
    if (!silent) setLoadingRes(true);
    try {
      const qs = new URLSearchParams({
        dateFrom: todayIso(),
        dateTo: plusDaysIso(7),
      });
      const res = await apiFetch<{ data: Reservation[] }>(`reservations?${qs}`);
      setReservations(res.data ?? []);
    } catch (err) {
      // Only show error toast on manual/initial fetch, not background polls
      if (!silent) {
        toast({ title: 'Failed to load reservations', description: getErrorMessage(err), variant: 'destructive' });
      }
    } finally {
      if (!silent) setLoadingRes(false);
    }
  }, [toast]);

  const fetchWaitlist = useCallback(async (silent = false) => {
    if (!silent) setLoadingWait(true);
    try {
      const res = await apiFetch<{ data: WaitlistEntry[] }>('reservations/waitlist');
      setWaitlist(res.data ?? []);
    } catch (err) {
      // Only show error toast on manual/initial fetch, not background polls
      if (!silent) {
        toast({ title: 'Failed to load waitlist', description: getErrorMessage(err), variant: 'destructive' });
      }
    } finally {
      if (!silent) setLoadingWait(false);
    }
  }, [toast]);

  const fetchTables = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: TableOption[] }>('tables');
      setTables(res.data ?? []);
    } catch {
      // Tables are optional for the UI to function
    }
  }, []);

  useEffect(() => {
    fetchReservations();
    fetchWaitlist();
    fetchTables();

    intervalRef.current = setInterval(() => {
      void fetchReservations(true);
      void fetchWaitlist(true);
    }, 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchReservations, fetchWaitlist, fetchTables]);

  async function handleStatusChange(id: string, status: ReservationStatus) {
    await apiFetch(`reservations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    toast({ title: `Status updated to ${STATUS_LABEL[status]}`, variant: 'success' });
    await fetchReservations();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'reservations', label: 'Reservations' },
    { id: 'waitlist', label: 'Waitlist' },
    { id: 'settings', label: 'Settings' },
  ];

  const activeWaitCount = waitlist.filter((w) => w.status !== 'seated' && w.status !== 'cancelled').length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-6 flex items-center gap-3">
        <CalendarCheck className="h-7 w-7 text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reservations & Waitlist</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage table bookings and walk-in queue</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
              {tab.id === 'waitlist' && activeWaitCount > 0 && (
                <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {activeWaitCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'reservations' && (
        <ReservationsTab
          reservations={reservations}
          tables={tables}
          loading={loadingRes}
          onStatusChange={handleStatusChange}
          onRefresh={fetchReservations}
        />
      )}
      {activeTab === 'waitlist' && (
        <WaitlistTab
          waitlist={waitlist}
          tables={tables}
          loading={loadingWait}
          onRefresh={fetchWaitlist}
        />
      )}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  );
}
