'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, RefreshCw, Loader2, X, CalendarCheck, Settings,
  Users, Phone, Copy, Check, ChevronDown, Globe,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReservationStatus =
  | 'pending' | 'confirmed' | 'seated' | 'in_progress'
  | 'completed' | 'cancelled' | 'no_show';

type DepositStatus = 'none' | 'pending' | 'paid' | 'refunded' | 'failed';
type BookingType = 'restaurant' | 'service';

interface Reservation {
  id: string;
  bookingType: BookingType;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  scheduledAt: string;
  partySize?: number;
  status: ReservationStatus;
  depositStatus: DepositStatus;
  depositAmountCents: number;
  notes?: string;
  source: string;
  createdAt: string;
}

interface ReservationSettings {
  restaurantEnabled: boolean;
  serviceEnabled: boolean;
  restaurantDepositRequired: boolean;
  restaurantDepositCents: number;
  serviceDepositRequired: boolean;
  serviceDepositCents: number;
  advanceBookingDays: number;
  slotIntervalMinutes: number;
  openingHours: Record<string, { open: string; close: string; closed?: boolean }>;
  widgetPrimaryColor: string;
  widgetLogoUrl?: string | null;
  widgetTitle?: string | null;
  confirmationEmailEnabled: boolean;
  reminderEmailEnabled: boolean;
  reminderHoursBefore: number;
}

// ─── Status / deposit config ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<ReservationStatus, { label: string; badge: string; dot: string }> = {
  pending:     { label: 'Pending',     badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300', dot: 'bg-yellow-400' },
  confirmed:   { label: 'Confirmed',   badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',         dot: 'bg-blue-500' },
  seated:      { label: 'Seated',      badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300', dot: 'bg-purple-500' },
  in_progress: { label: 'In Progress', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',     dot: 'bg-amber-500' },
  completed:   { label: 'Completed',   badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',     dot: 'bg-green-500' },
  cancelled:   { label: 'Cancelled',   badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-400',         dot: 'bg-gray-400' },
  no_show:     { label: 'No Show',     badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',             dot: 'bg-red-500' },
};

const DEPOSIT_CONFIG: Record<DepositStatus, { label: string; badge: string }> = {
  none:     { label: 'No Deposit', badge: 'bg-gray-50 text-gray-500 dark:bg-gray-700/40 dark:text-gray-400' },
  pending:  { label: 'Unpaid',     badge: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  paid:     { label: 'Paid',       badge: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  refunded: { label: 'Refunded',   badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  failed:   { label: 'Failed',     badge: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

// Next allowed statuses for each current status
const NEXT_STATUSES: Partial<Record<ReservationStatus, ReservationStatus[]>> = {
  pending:     ['confirmed', 'cancelled'],
  confirmed:   ['seated', 'in_progress', 'no_show', 'cancelled'],
  seated:      ['completed', 'no_show', 'cancelled'],
  in_progress: ['completed', 'no_show', 'cancelled'],
};

const DAYS     = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string)  { return new Date(iso).toLocaleDateString('en-AU', { dateStyle: 'medium' }); }
function formatTime(iso: string)  { return new Date(iso).toLocaleTimeString('en-AU', { timeStyle: 'short' }); }
function todayIso()               { return new Date().toISOString().slice(0, 10); }
function formatCents(c: number)   { return `$${(c / 100).toFixed(2)}`; }

function generateTimeSlots() {
  const s: string[] = [];
  for (let h = 7; h < 23; h++)
    for (let m = 0; m < 60; m += 15)
      s.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  return s;
}

const TIME_SLOTS = generateTimeSlots();

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      className={`relative h-6 w-11 cursor-pointer rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </div>
  );
}

// ─── Action dropdown ──────────────────────────────────────────────────────────

function ActionMenu({
  reservation,
  onUpdate,
}: {
  reservation: Reservation;
  onUpdate: (id: string, s: ReservationStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const next = NEXT_STATUSES[reservation.status];
  if (!next?.length) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        Actions <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 min-w-[140px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
            {next.map((s) => (
              <button
                key={s}
                onClick={() => { onUpdate(reservation.id, s); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <span className={`h-2 w-2 rounded-full ${STATUS_CONFIG[s].dot}`} />
                {STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── New Reservation Modal ────────────────────────────────────────────────────

function NewReservationModal({
  onClose,
  onSaved,
  restaurantEnabled,
  serviceEnabled,
}: {
  onClose: () => void;
  onSaved: () => void;
  restaurantEnabled: boolean;
  serviceEnabled: boolean;
}) {
  const { toast } = useToast();
  const [bookingType, setBookingType] = useState<BookingType>(restaurantEnabled ? 'restaurant' : 'service');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState('19:00');
  const [partySize, setPartySize] = useState(2);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim() || !email.trim()) {
      toast({ title: 'Name and email are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
      await apiFetch('reservations', {
        method: 'POST',
        body: JSON.stringify({
          bookingType,
          customerName: name.trim(),
          customerEmail: email.trim(),
          customerPhone: phone.trim() || undefined,
          scheduledAt,
          partySize: bookingType === 'restaurant' ? partySize : undefined,
          notes: notes.trim() || undefined,
          source: 'dashboard',
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
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Reservation</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Booking type selector */}
          {restaurantEnabled && serviceEnabled && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(['restaurant', 'service'] as BookingType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setBookingType(t)}
                    className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                      bookingType === t
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {t === 'restaurant' ? '🍽️ Table' : '✂️ Appointment'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0412 345 678" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
              <input type="date" value={date} min={todayIso()} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Time</label>
              <select value={time} onChange={(e) => setTime(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white">
                {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {bookingType === 'restaurant' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Party Size</label>
              <select value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white">
                {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Special requests…" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Reservation
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({ orgSlug }: { orgSlug: string }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ReservationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<ReservationSettings>('reservations/settings')
      .then((d) => setSettings(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      await apiFetch('reservations/settings', { method: 'PUT', body: JSON.stringify(settings) });
      toast({ title: 'Settings saved', variant: 'success' });
    } catch (err) {
      toast({ title: 'Failed to save', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  function copyEmbed() {
    const code = `<div id="elevatedpos-booking"></div>\n<script src="https://app.elevatedpos.com.au/api/widget/${orgSlug}"></script>`;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function setField<K extends keyof ReservationSettings>(key: K, val: ReservationSettings[K]) {
    setSettings((s) => s ? { ...s, [key]: val } : s);
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>;
  if (!settings) return <p className="py-8 text-center text-sm text-gray-500">Unable to load settings.</p>;

  return (
    <div className="max-w-2xl space-y-10">

      {/* ── Booking Types ─────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Booking Types</h3>
        <div className="space-y-3">
          {[
            { key: 'restaurantEnabled' as const, label: 'Restaurant / Table Reservations', icon: '🍽️' },
            { key: 'serviceEnabled'    as const, label: 'Service / Appointment Bookings',  icon: '✂️' },
          ].map(({ key, label, icon }) => (
            <div key={key} className="flex items-center justify-between rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{icon}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
              </div>
              <Toggle checked={settings[key]} onChange={() => setField(key, !settings[key])} />
            </div>
          ))}
        </div>
      </section>

      {/* ── Deposits ──────────────────────────────────────────────────────── */}
      {(settings.restaurantEnabled || settings.serviceEnabled) && (
        <section>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Deposit Requirements</h3>
          <div className="space-y-4">
            {settings.restaurantEnabled && (
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <p className="mb-3 text-sm font-medium text-gray-900 dark:text-white">🍽️ Restaurant Deposit</p>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={settings.restaurantDepositRequired} onChange={(e) => setField('restaurantDepositRequired', e.target.checked)} className="rounded" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Require deposit</span>
                  </label>
                  {settings.restaurantDepositRequired && (
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500">$</span>
                      <input
                        type="number" min="0" step="0.50"
                        value={settings.restaurantDepositCents / 100}
                        onChange={(e) => setField('restaurantDepositCents', Math.round(Number(e.target.value) * 100))}
                        className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
            {settings.serviceEnabled && (
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <p className="mb-3 text-sm font-medium text-gray-900 dark:text-white">✂️ Service Deposit</p>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={settings.serviceDepositRequired} onChange={(e) => setField('serviceDepositRequired', e.target.checked)} className="rounded" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Require deposit</span>
                  </label>
                  {settings.serviceDepositRequired && (
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500">$</span>
                      <input
                        type="number" min="0" step="0.50"
                        value={settings.serviceDepositCents / 100}
                        onChange={(e) => setField('serviceDepositCents', Math.round(Number(e.target.value) * 100))}
                        className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Availability ──────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Availability</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Advance booking (days)</label>
            <input type="number" min="1" max="365" value={settings.advanceBookingDays} onChange={(e) => setField('advanceBookingDays', Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Slot interval</label>
            <select value={settings.slotIntervalMinutes} onChange={(e) => setField('slotIntervalMinutes', Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white">
              {[15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} min</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* ── Opening Hours ─────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Opening Hours</h3>
        <div className="space-y-2">
          {DAYS.map((day, i) => {
            const key = DAY_KEYS[i]!;
            const h = (settings.openingHours[key] as { open: string; close: string; closed?: boolean } | undefined) ?? { open: '09:00', close: '17:00', closed: false };
            const closed = h.closed ?? false;
            return (
              <div key={key} className="flex flex-wrap items-center gap-3">
                <span className="w-24 text-sm font-medium text-gray-700 dark:text-gray-300">{day}</span>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!closed}
                    onChange={(e) => setField('openingHours', { ...settings.openingHours, [key]: { ...h, closed: !e.target.checked } })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-500">Open</span>
                </label>
                {!closed ? (
                  <>
                    <input type="time" value={h.open}  onChange={(e) => setField('openingHours', { ...settings.openingHours, [key]: { ...h, open: e.target.value } })}  className="rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
                    <span className="text-gray-400">–</span>
                    <input type="time" value={h.close} onChange={(e) => setField('openingHours', { ...settings.openingHours, [key]: { ...h, close: e.target.value } })} className="rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
                  </>
                ) : (
                  <span className="text-sm italic text-gray-400">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Widget Branding ───────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Widget Branding</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Widget Title</label>
            <input value={settings.widgetTitle ?? ''} onChange={(e) => setField('widgetTitle', e.target.value)} placeholder="Make a Booking" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Primary Colour</label>
            <div className="flex items-center gap-3">
              <input type="color" value={settings.widgetPrimaryColor} onChange={(e) => setField('widgetPrimaryColor', e.target.value)} className="h-9 w-16 cursor-pointer rounded-lg border border-gray-300" />
              <input value={settings.widgetPrimaryColor} onChange={(e) => setField('widgetPrimaryColor', e.target.value)} placeholder="#6366f1" className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Embed Code ────────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Embed on Your Website</h3>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5 dark:border-indigo-900/40 dark:bg-indigo-950/30">
          <div className="mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
              Paste this into any webpage to add the booking widget
            </p>
          </div>
          <pre className="mb-4 overflow-x-auto rounded-lg bg-white p-4 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
{`<div id="elevatedpos-booking"></div>
<script src="https://app.elevatedpos.com.au/api/widget/${orgSlug || 'YOUR-SLUG'}"></script>`}
          </pre>
          <button
            onClick={copyEmbed}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Copy Embed Code'}
          </button>
        </div>
      </section>

      {/* ── Email Notifications ───────────────────────────────────────────── */}
      <section>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Email Notifications</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            <span className="text-sm text-gray-900 dark:text-white">Send confirmation emails to customers</span>
            <Toggle checked={settings.confirmationEmailEnabled} onChange={() => setField('confirmationEmailEnabled', !settings.confirmationEmailEnabled)} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            <span className="text-sm text-gray-900 dark:text-white">Send reminder emails</span>
            <Toggle checked={settings.reminderEmailEnabled} onChange={() => setField('reminderEmailEnabled', !settings.reminderEmailEnabled)} />
          </div>
          {settings.reminderEmailEnabled && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Send reminder how many hours before?</label>
              <select
                value={settings.reminderHoursBefore}
                onChange={(e) => setField('reminderHoursBefore', Number(e.target.value))}
                className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                {[1, 2, 4, 6, 12, 24, 48].map((n) => (
                  <option key={n} value={n}>{n} hour{n > 1 ? 's' : ''} before</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Settings
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReservationsClient() {
  const { toast } = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'settings'>('list');
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | 'all'>('all');
  const [filterDate, setFilterDate] = useState(todayIso());
  const [filterType, setFilterType] = useState<BookingType | 'all'>('all');
  const [bookingSettings, setBookingSettings] = useState({ restaurantEnabled: true, serviceEnabled: false });
  const [orgSlug, setOrgSlug] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ date: filterDate });
      if (filterStatus !== 'all') qs.set('status', filterStatus);
      const data = await apiFetch<{ data: Reservation[] }>(`reservations?${qs}`);
      setReservations(data.data ?? []);
    } catch {
      setReservations([]);
    } finally {
      setLoading(false);
    }
  }, [filterDate, filterStatus]);

  // Load org slug + booking type flags once
  useEffect(() => {
    apiFetch<{ slug: string }>('organisations/me')
      .then((r) => setOrgSlug(r.slug ?? ''))
      .catch(() => {});
    apiFetch<ReservationSettings>('reservations/settings')
      .then((s) => setBookingSettings({ restaurantEnabled: s.restaurantEnabled, serviceEnabled: s.serviceEnabled }))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: string, status: ReservationStatus) {
    try {
      await apiFetch(`reservations/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast({ title: `Marked as ${STATUS_CONFIG[status].label}`, variant: 'success' });
      load();
    } catch (err) {
      toast({ title: 'Failed to update', description: getErrorMessage(err), variant: 'destructive' });
    }
  }

  const filtered = filterType === 'all'
    ? reservations
    : reservations.filter((r) => r.bookingType === filterType);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reservations</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage table bookings and service appointments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New Reservation
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6">
          {([
            { key: 'list',     label: 'Bookings',         Icon: CalendarCheck },
            { key: 'settings', label: 'Settings & Widget', Icon: Settings },
          ] as const).map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 border-b-2 pb-3 text-sm font-medium transition-colors ${
                tab === key
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Settings tab */}
      {tab === 'settings' && <SettingsTab orgSlug={orgSlug} />}

      {/* Bookings list tab */}
      {tab === 'list' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as ReservationStatus | 'all')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="all">All Statuses</option>
              {(Object.keys(STATUS_CONFIG) as ReservationStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as BookingType | 'all')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="all">All Types</option>
              <option value="restaurant">🍽️ Restaurant</option>
              <option value="service">✂️ Service</option>
            </select>
            <span className="ml-auto text-sm text-gray-400 dark:text-gray-500">
              {filtered.length} {filtered.length === 1 ? 'booking' : 'bookings'}
            </span>
          </div>

          {/* List */}
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white py-16 text-center dark:border-gray-700 dark:bg-gray-900">
              <CalendarCheck className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                No reservations for {filterDate}
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                + Create a reservation
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    {['Time', 'Customer', 'Type', 'Status', 'Deposit', 'Notes', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                      {/* Time */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 dark:text-white">{formatTime(r.scheduledAt)}</div>
                        <div className="text-xs text-gray-400">{formatDate(r.scheduledAt)}</div>
                      </td>
                      {/* Customer */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{r.customerName}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {r.customerPhone && (
                            <span className="flex items-center gap-0.5 text-xs text-gray-400">
                              <Phone className="h-3 w-3" />{r.customerPhone}
                            </span>
                          )}
                          {r.partySize && (
                            <span className="flex items-center gap-0.5 text-xs text-gray-400">
                              <Users className="h-3 w-3" />{r.partySize}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Type */}
                      <td className="px-4 py-3 text-sm">
                        {r.bookingType === 'restaurant' ? '🍽️ Table' : '✂️ Service'}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CONFIG[r.status].badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CONFIG[r.status].dot}`} />
                          {STATUS_CONFIG[r.status].label}
                        </span>
                      </td>
                      {/* Deposit */}
                      <td className="px-4 py-3">
                        {r.depositStatus !== 'none' ? (
                          <div>
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${DEPOSIT_CONFIG[r.depositStatus].badge}`}>
                              {DEPOSIT_CONFIG[r.depositStatus].label}
                            </span>
                            {r.depositAmountCents > 0 && (
                              <div className="mt-0.5 text-xs text-gray-400">{formatCents(r.depositAmountCents)}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>
                      {/* Notes */}
                      <td className="max-w-[160px] px-4 py-3">
                        {r.notes
                          ? <span className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{r.notes}</span>
                          : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <ActionMenu reservation={r} onUpdate={updateStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Create modal */}
      {showCreate && (
        <NewReservationModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
          restaurantEnabled={bookingSettings.restaurantEnabled}
          serviceEnabled={bookingSettings.serviceEnabled}
        />
      )}
    </div>
  );
}
