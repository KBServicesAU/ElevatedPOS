'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ChefHat, CheckCircle, Wifi, WifiOff, Clock,
  LayoutDashboard, CreditCard, Tablet, RotateCcw, X, Zap,
  AlertTriangle, UtensilsCrossed,
} from 'lucide-react';
import DevicePairingScreen from '@/components/device-pairing-screen';
import { getDeviceToken, getDeviceInfo, type DeviceInfo } from '@/lib/device-auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type CourseType = 'entree' | 'main' | 'dessert' | 'drink' | 'side';

interface KdsItem {
  name: string;
  qty: number;
  modifiers: string[];
  note?: string;
  seatNumber?: number;
  course?: CourseType;
  // Station assignment
  station?: string;
  kdsStation?: string;
  // Dietary / allergen flags
  isGlutenFree?: boolean;
  isVegan?: boolean;
  isVegetarian?: boolean;
  isNutFree?: boolean;
  isDairyFree?: boolean;
}

type Priority = 'normal' | 'rush';

interface KdsTicket {
  orderId: string;
  orderNumber: string;
  orderType: string;
  channel: string;
  tableId?: string;
  locationId: string;
  items: KdsItem[];
  createdAt: string;
  status: 'new' | 'preparing' | 'bumped' | 'pending';
  elapsedSeconds: number;
  doneItems: number[];
  priority: Priority;
  // Which courses have been fired (in-progress)
  firedCourses: CourseType[];
}

interface RecalledEntry {
  order: {
    orderId: string;
    orderNumber: string;
    orderType: string;
    channel: string;
    tableId?: string;
    locationId: string;
    lines: KdsItem[];
    createdAt: string;
    status: string;
  };
  bumpedAt: number;
}

interface KdsStation {
  id: string;
  name: string;
  label: string;
}

type SseMessage =
  | { type: 'connected' }
  | {
      type: 'new_order';
      order: {
        orderId: string;
        orderNumber: string;
        orderType: string;
        channel: string;
        tableId?: string;
        locationId: string;
        lines: KdsItem[];
        createdAt: string;
        status: string;
        priority?: Priority;
      };
    }
  | { type: 'order_bumped'; orderId: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const COURSE_ORDER: CourseType[] = ['entree', 'main', 'side', 'dessert', 'drink'];

const COURSE_LABELS: Record<CourseType, string> = {
  entree: 'Entrée',
  main: 'Main',
  side: 'Side',
  dessert: 'Dessert',
  drink: 'Drink',
};

const COURSE_COLORS: Record<CourseType, string> = {
  entree:  'bg-orange-900/60 text-orange-300 border-orange-700/40',
  main:    'bg-indigo-900/60 text-indigo-300 border-indigo-700/40',
  side:    'bg-teal-900/60 text-teal-300 border-teal-700/40',
  dessert: 'bg-pink-900/60 text-pink-300 border-pink-700/40',
  drink:   'bg-cyan-900/60 text-cyan-300 border-cyan-700/40',
};

const DIETARY_FLAGS = [
  { key: 'isGlutenFree',   label: 'GF', bg: 'bg-green-700',   text: 'text-green-100',   title: 'Gluten Free' },
  { key: 'isVegan',        label: 'V',  bg: 'bg-emerald-700', text: 'text-emerald-100', title: 'Vegan' },
  { key: 'isVegetarian',   label: 'VG', bg: 'bg-lime-700',    text: 'text-lime-100',    title: 'Vegetarian' },
  { key: 'isNutFree',      label: 'NF', bg: 'bg-orange-700',  text: 'text-orange-100',  title: 'Nut Free' },
  { key: 'isDairyFree',    label: 'DF', bg: 'bg-blue-700',    text: 'text-blue-100',    title: 'Dairy Free' },
] as const;

// ─── Audio ────────────────────────────────────────────────────────────────────

function playBeep(rush = false) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (rush) {
      // Two short high-pitched pulses for rush orders
      [0, 0.18].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 1320;
        gain.gain.setValueAtTime(0.45, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.15);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.15);
      });
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch { /* ignore AudioContext errors */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsedColor(seconds: number, rush: boolean) {
  if (rush) return 'bg-red-950 border-red-500';
  const mins = seconds / 60;
  if (mins < 5) return 'bg-green-900 border-green-600';
  if (mins < 10) return 'bg-yellow-900 border-yellow-600';
  return 'bg-red-900 border-red-600';
}

function elapsedText(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function channelBadge(channel: string) {
  switch (channel) {
    case 'pos':    return 'bg-gray-700 text-gray-200';
    case 'kiosk':  return 'bg-blue-800 text-blue-200';
    case 'online': return 'bg-purple-800 text-purple-200';
    case 'qr':     return 'bg-teal-800 text-teal-200';
    default:       return 'bg-gray-700 text-gray-300';
  }
}

function channelLabel(channel: string) {
  switch (channel) {
    case 'pos':    return 'POS';
    case 'kiosk':  return 'Kiosk';
    case 'online': return 'Online';
    case 'qr':     return 'QR';
    default:       return channel.toUpperCase();
  }
}

/** Return the next unfired course for an order, or null if all fired / no courses. */
function nextUnfiredCourse(ticket: KdsTicket): CourseType | null {
  const courses = Array.from(
    new Set(
      ticket.items
        .map((i) => i.course)
        .filter((c): c is CourseType => !!c),
    ),
  ).sort((a, b) => COURSE_ORDER.indexOf(a) - COURSE_ORDER.indexOf(b));

  return courses.find((c) => !ticket.firedCourses.includes(c)) ?? null;
}

/** Group items by course, preserving COURSE_ORDER sequence. */
function groupByCourse(items: KdsItem[]): Array<{ course: CourseType | null; items: Array<{ item: KdsItem; originalIdx: number }> }> {
  const hasCourses = items.some((i) => i.course);
  if (!hasCourses) {
    return [{ course: null, items: items.map((item, originalIdx) => ({ item, originalIdx })) }];
  }

  const map = new Map<string, Array<{ item: KdsItem; originalIdx: number }>>();
  map.set('__none__', []);
  for (const c of COURSE_ORDER) map.set(c, []);

  items.forEach((item, originalIdx) => {
    const key = item.course ?? '__none__';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ item, originalIdx });
  });

  const result: Array<{ course: CourseType | null; items: Array<{ item: KdsItem; originalIdx: number }> }> = [];
  for (const c of COURSE_ORDER) {
    const group = map.get(c);
    if (group && group.length > 0) result.push({ course: c, items: group });
  }
  const none = map.get('__none__');
  if (none && none.length > 0) result.unshift({ course: null, items: none });
  return result;
}

// ─── App switcher bar ────────────────────────────────────────────────────────

const APPS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'pos',       label: 'POS',       icon: CreditCard,      href: '/pos' },
  { id: 'kds',       label: 'KDS',       icon: ChefHat,         href: '/kds' },
  { id: 'kiosk',     label: 'Kiosk',     icon: Tablet,          href: '/kiosk' },
] as const;

function AppBar({ current, deviceLabel }: { current: string; deviceLabel?: string }) {
  return (
    <div className="flex h-10 items-center justify-between border-b border-[#2a2a2a] bg-[#111] px-4">
      <div className="flex items-center gap-1">
        {APPS.map((app) => {
          const Icon = app.icon;
          const active = app.id === current;
          return (
            <Link
              key={app.id}
              href={app.href}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? 'bg-[#2a2a2a] text-white' : 'text-gray-600 hover:bg-[#2a2a2a] hover:text-gray-200'
              }`}
            >
              <Icon className="h-3 w-3" />
              {app.label}
            </Link>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        {deviceLabel && (
          <span className="rounded-md bg-[#2a2a2a] px-2 py-0.5 font-mono text-[10px] text-yellow-400">
            Device: {deviceLabel}
          </span>
        )}
        <span className="text-[10px] text-gray-700">ElevatedPOS KDS</span>
      </div>
    </div>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ tickets }: { tickets: KdsTicket[] }) {
  const pending     = tickets.filter((t) => t.status === 'pending' || t.status === 'new').length;
  const preparing   = tickets.filter((t) => t.status === 'preparing').length;
  const inProgress  = tickets.filter((t) => t.status === 'preparing');
  const avgTicketMins =
    inProgress.length > 0
      ? Math.round(inProgress.reduce((s, t) => s + t.elapsedSeconds, 0) / inProgress.length / 60)
      : 0;

  return (
    <div className="flex items-center gap-6 border-b border-[#2a2a2a] bg-gray-950 px-6 py-2 text-xs text-gray-400">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-yellow-400" />
        <span>Waiting: <strong className="text-yellow-300">{pending}</strong></span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-blue-400" />
        <span>In Prep: <strong className="text-blue-300">{preparing}</strong></span>
      </div>
      <div className="flex items-center gap-1.5">
        <Clock className="h-3 w-3" />
        <span>Avg Ticket: <strong className="text-white">{avgTicketMins}min</strong></span>
      </div>
      <div className="flex items-center gap-1.5">
        <span>Total: <strong className="text-white">{tickets.length}</strong></span>
      </div>
    </div>
  );
}

// ─── Station selector ─────────────────────────────────────────────────────────

function StationSelector({
  stations,
  selected,
  onChange,
}: {
  stations: KdsStation[];
  selected: string;
  onChange: (s: string) => void;
}) {
  const all = [{ id: 'all', label: 'All', name: 'All' }, ...stations];
  return (
    <div className="flex items-center gap-2 border-b border-[#2a2a2a] bg-gray-950 px-6 py-2 overflow-x-auto">
      <UtensilsCrossed className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
      <span className="flex-shrink-0 text-xs font-bold uppercase tracking-wider text-gray-500 mr-1">Station:</span>
      {all.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            selected === s.id
              ? 'bg-yellow-500 text-gray-950'
              : 'bg-[#222] text-gray-400 hover:bg-[#333] hover:text-white'
          }`}
        >
          {s.label || s.name}
        </button>
      ))}
    </div>
  );
}

// ─── Dietary badge ────────────────────────────────────────────────────────────

function DietaryBadges({ item }: { item: KdsItem }) {
  const flags = DIETARY_FLAGS.filter((f) => item[f.key]);
  if (flags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5 pl-5">
      {flags.map((f) => (
        <span
          key={f.key}
          title={f.title}
          className={`inline-flex items-center rounded px-1.5 py-0 text-[10px] font-bold leading-4 ${f.bg} ${f.text}`}
        >
          {f.label}
        </span>
      ))}
    </div>
  );
}

// ─── Summary panel ────────────────────────────────────────────────────────────

function SummaryPanel({ tickets }: { tickets: KdsTicket[] }) {
  const totals = new Map<string, number>();
  for (const ticket of tickets) {
    ticket.items.forEach((item, idx) => {
      if (!ticket.doneItems.includes(idx)) {
        totals.set(item.name, (totals.get(item.name) ?? 0) + item.qty);
      }
    });
  }
  const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex w-52 flex-shrink-0 flex-col border-r border-[#2a2a2a] bg-gray-950">
      <div className="border-b border-[#2a2a2a] px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">To Make</p>
      </div>
      {sorted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-gray-700">
          All clear
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {sorted.map(([name, qty]) => (
            <div key={name} className="flex items-center justify-between rounded-lg bg-[#111] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-white">{name}</span>
              <span className="ml-2 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-yellow-500 text-xs font-extrabold text-black">
                {qty}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Course section within a ticket ──────────────────────────────────────────

function CourseSection({
  course,
  items,
  fired,
  ticket,
  onBumpItem,
}: {
  course: CourseType | null;
  items: Array<{ item: KdsItem; originalIdx: number }>;
  fired: boolean;
  ticket: KdsTicket;
  onBumpItem: (orderId: string, itemIdx: number) => void;
}) {
  const waiting = course !== null && !fired;

  return (
    <div className={`rounded-lg overflow-hidden ${waiting ? 'opacity-50' : ''}`}>
      {/* Course header */}
      {course !== null && (
        <div className={`flex items-center gap-2 px-3 py-1.5 border ${COURSE_COLORS[course]} rounded-t-lg`}>
          <span className="text-xs font-bold uppercase tracking-wider">{COURSE_LABELS[course]}</span>
          {waiting && (
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              Waiting
            </span>
          )}
        </div>
      )}

      {/* Items */}
      <div className={`space-y-1.5 ${course !== null ? 'pt-1.5' : ''}`}>
        {items.map(({ item, originalIdx }) => {
          const done = ticket.doneItems.includes(originalIdx);
          return (
            <div
              key={originalIdx}
              className={`rounded-lg px-3 py-2 transition-opacity ${done ? 'bg-black/10 opacity-40' : 'bg-black/30'}`}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={`font-bold ${done ? 'text-gray-500' : 'text-yellow-400'}`}>
                      {item.qty}&times;
                    </span>
                    <span className={`font-semibold ${done ? 'text-gray-500 line-through' : 'text-white'}`}>
                      {item.name}
                    </span>
                  </div>
                  <DietaryBadges item={item} />
                  {item.modifiers.length > 0 && (
                    <ul className="mt-0.5 space-y-0.5 pl-5">
                      {item.modifiers.map((mod, mi) => (
                        <li key={mi} className="text-xs text-gray-300">+ {mod}</li>
                      ))}
                    </ul>
                  )}
                  {item.note && (
                    <p className="mt-0.5 pl-5 text-xs italic text-amber-300/80">📝 {item.note}</p>
                  )}
                  {item.seatNumber != null && (
                    <p className="mt-0.5 pl-5 text-xs text-gray-400">Seat {item.seatNumber}</p>
                  )}
                </div>
                {/* Per-item Done button */}
                <button
                  onClick={() => onBumpItem(ticket.orderId, originalIdx)}
                  disabled={waiting}
                  className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-all ${
                    done
                      ? 'bg-green-700 text-white'
                      : waiting
                        ? 'cursor-not-allowed border border-white/10 bg-white/5 text-white/20'
                        : 'border border-white/20 bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                  title={done ? 'Done' : waiting ? 'Course not fired yet' : 'Mark done'}
                >
                  <CheckCircle className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Ticket card ──────────────────────────────────────────────────────────────

function TicketCard({
  ticket,
  onBumpItem,
  onBumpAll,
  onRush,
  onFireCourse,
}: {
  ticket: KdsTicket;
  onBumpItem: (orderId: string, itemIdx: number) => void;
  onBumpAll: (orderId: string) => void;
  onRush: (orderId: string) => void;
  onFireCourse: (orderId: string, course: CourseType) => void;
}) {
  const isRush = ticket.priority === 'rush';
  const colorClass = elapsedColor(ticket.elapsedSeconds, isRush);
  const allDone = ticket.items.every((_, i) => ticket.doneItems.includes(i));
  const courseGroups = groupByCourse(ticket.items);
  const hasCourses = courseGroups.some((g) => g.course !== null);
  const nextCourse = nextUnfiredCourse(ticket);

  return (
    <div className={`rounded-xl border-2 ${colorClass} p-4 shadow-lg relative`}>
      {/* RUSH overlay badge */}
      {isRush && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span className="flex items-center gap-1 rounded-full bg-red-600 px-3 py-0.5 text-xs font-extrabold uppercase tracking-widest text-white shadow-lg animate-pulse">
            <AlertTriangle className="h-3 w-3" /> RUSH
          </span>
        </div>
      )}

      {/* Header */}
      <div className={`mb-3 flex items-start justify-between gap-2 ${isRush ? 'mt-2' : ''}`}>
        <div>
          <span className="text-2xl font-extrabold text-white">#{ticket.orderNumber}</span>
          {ticket.tableId && (
            <span className="ml-2 rounded bg-[#333] px-2 py-0.5 text-xs text-gray-300">
              Table {ticket.tableId}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${channelBadge(ticket.channel)}`}>
            {channelLabel(ticket.channel)}
          </span>
          <span className="flex items-center gap-1 font-mono text-sm font-bold text-white">
            <Clock className="h-3 w-3" />
            {elapsedText(ticket.elapsedSeconds)}
          </span>
        </div>
      </div>

      {/* Course-grouped items */}
      <div className="space-y-3">
        {courseGroups.map((group, gi) => (
          <div key={gi}>
            <CourseSection
              course={group.course}
              items={group.items}
              fired={group.course === null || ticket.firedCourses.includes(group.course)}
              ticket={ticket}
              onBumpItem={onBumpItem}
            />
            {/* Visual separator between courses */}
            {gi < courseGroups.length - 1 && (
              <div className="my-2 border-t border-white/10" />
            )}
          </div>
        ))}
      </div>

      {/* Fire Next Course button */}
      {hasCourses && nextCourse && (
        <button
          onClick={() => onFireCourse(ticket.orderId, nextCourse)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-orange-600 bg-orange-900/30 py-2 text-xs font-bold uppercase tracking-widest text-orange-300 hover:bg-orange-900/50 transition-colors"
        >
          <Zap className="h-3.5 w-3.5" />
          Fire {COURSE_LABELS[nextCourse]}
        </button>
      )}

      {/* Action row: Rush + Bump */}
      <div className="mt-3 flex gap-2">
        {/* Rush toggle */}
        <button
          onClick={() => onRush(ticket.orderId)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
            isRush
              ? 'border-red-600 bg-red-900/40 text-red-300 hover:bg-red-900/60'
              : 'border-[#333] bg-[#222] text-gray-500 hover:border-red-700 hover:text-red-400'
          }`}
          title={isRush ? 'Rush — click to cancel' : 'Mark as Rush'}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {isRush ? 'RUSH' : 'Rush'}
        </button>

        {/* Bump ALL */}
        <button
          onClick={() => onBumpAll(ticket.orderId)}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-extrabold uppercase tracking-widest transition-transform active:scale-95 ${
            allDone
              ? 'bg-green-400 text-green-950 hover:bg-green-300'
              : 'bg-white text-black hover:bg-gray-200'
          }`}
        >
          <CheckCircle className="h-4 w-4" /> {allDone ? 'COMPLETE ✓' : 'BUMP ALL'}
        </button>
      </div>
    </div>
  );
}

// ─── Recall panel ────────────────────────────────────────────────────────────

function RecallPanel({
  onClose,
  onUnbump,
}: {
  onClose: () => void;
  onUnbump: (orderId: string) => void;
}) {
  const [entries, setEntries] = useState<RecalledEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch('/api/kds?recalled=true')
        .then((r) => r.json())
        .then((d: { orders?: RecalledEntry[] }) => {
          if (active) setEntries(d.orders ?? []);
        })
        .catch(() => {})
        .finally(() => { if (active) setLoading(false); });
    };
    load();
    const id = setInterval(load, 5_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white">
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-6 py-4">
        <div className="flex items-center gap-3">
          <RotateCcw className="h-5 w-5 text-yellow-400" />
          <span className="text-lg font-bold">Recalled Orders (last 60 min)</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="h-6 w-6" />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-gray-500">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-gray-600">No recalled orders</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {entries.map(({ order, bumpedAt }) => (
              <div key={order.orderId} className="rounded-xl border-2 border-gray-700 bg-[#111] p-4 opacity-80">
                <div className="mb-2 flex items-start justify-between">
                  <span className="text-xl font-extrabold text-gray-300">#{order.orderNumber}</span>
                  <span className="text-xs text-gray-600">
                    Bumped {Math.round((Date.now() - bumpedAt) / 60000)}min ago
                  </span>
                </div>
                <div className="mb-3 space-y-1">
                  {order.lines.map((l, i) => (
                    <div key={i} className="text-sm text-gray-400">
                      <span className="font-bold text-gray-300">{l.qty}&times;</span> {l.name}
                      {l.note && <span className="ml-1 text-xs italic text-amber-400/70"> — {l.note}</span>}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => { onUnbump(order.orderId); setEntries((prev) => prev.filter((e) => e.order.orderId !== order.orderId)); }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-yellow-600 bg-yellow-900/20 py-2 text-sm font-bold text-yellow-400 hover:bg-yellow-900/40"
                >
                  <RotateCcw className="h-4 w-4" /> Recall to Kitchen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KDS terminal ────────────────────────────────────────────────────────────

function KDSTerminal({ deviceInfo }: { deviceInfo: DeviceInfo | null }) {
  const [locationId, setLocationId] = useState<string | null>(deviceInfo?.locationId ?? null);

  useEffect(() => {
    if (locationId) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('locationId');
    if (id) setLocationId(id);
  }, [locationId]);

  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [connected, setConnected] = useState(false);
  const [showRecall, setShowRecall] = useState(false);
  const [recentlyBumped, setRecentlyBumped] = useState<KdsTicket[]>([]);
  const [stations, setStations] = useState<KdsStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>('all');
  const esRef = useRef<EventSource | null>(null);
  const prevTicketCountRef = useRef<number>(0);

  // Load stations once
  useEffect(() => {
    fetch('/api/proxy/kds/stations')
      .then((r) => r.json())
      .then((d: { stations?: KdsStation[] } | KdsStation[]) => {
        const list = Array.isArray(d) ? d : (d.stations ?? []);
        setStations(list);
      })
      .catch(() => {});
  }, []);

  // Tick elapsed seconds every second
  useEffect(() => {
    const id = setInterval(() => {
      setTickets((prev) =>
        prev.map((t) => ({
          ...t,
          elapsedSeconds: Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 1000),
        })),
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close();
    const es = new EventSource('/api/kds');
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onmessage = (ev: MessageEvent<string>) => {
      let msg: SseMessage;
      try { msg = JSON.parse(ev.data) as SseMessage; } catch { return; }
      if (msg.type === 'connected') {
        setConnected(true);
      } else if (msg.type === 'new_order') {
        const o = msg.order;
        const isRush = o.priority === 'rush';
        const ticket: KdsTicket = {
          orderId: o.orderId, orderNumber: o.orderNumber, orderType: o.orderType,
          channel: o.channel, tableId: o.tableId, locationId: o.locationId,
          items: o.lines.map((l) => ({
            name: l.name, qty: l.qty, modifiers: l.modifiers ?? [],
            note: l.note, seatNumber: l.seatNumber, course: l.course,
            station: l.station, kdsStation: l.kdsStation,
            isGlutenFree: l.isGlutenFree, isVegan: l.isVegan,
            isVegetarian: l.isVegetarian, isNutFree: l.isNutFree,
            isDairyFree: l.isDairyFree,
          })),
          createdAt: o.createdAt,
          status: (o.status as KdsTicket['status']) ?? 'new',
          elapsedSeconds: Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 1000),
          doneItems: [],
          priority: isRush ? 'rush' : 'normal',
          firedCourses: [],
        };
        setTickets((prev) => {
          if (prev.some((t) => t.orderId === ticket.orderId)) return prev;
          const next = [ticket, ...prev];
          if (next.length > prevTicketCountRef.current) {
            prevTicketCountRef.current = next.length;
            playBeep(isRush);
          }
          return next;
        });
      } else if (msg.type === 'order_bumped') {
        setTickets((prev) => prev.filter((t) => t.orderId !== msg.orderId));
      }
    };
    es.onerror = () => setConnected(false);
  }, []);

  useEffect(() => {
    if (!locationId) return;
    connect();
    return () => { if (esRef.current) esRef.current.close(); };
  }, [locationId, connect]);

  // Mark a single item done
  const handleBumpItem = useCallback((orderId: string, itemIdx: number) => {
    setTickets((prev) =>
      prev.map((t) => {
        if (t.orderId !== orderId) return t;
        const doneItems = t.doneItems.includes(itemIdx)
          ? t.doneItems.filter((i) => i !== itemIdx)
          : [...t.doneItems, itemIdx];
        return { ...t, doneItems };
      }),
    );
  }, []);

  const handleBumpAll = useCallback(async (orderId: string) => {
    setTickets((prev) => {
      const bumped = prev.find((t) => t.orderId === orderId);
      if (bumped) {
        setRecentlyBumped((rb) => [bumped, ...rb].slice(0, 5));
        prevTicketCountRef.current = Math.max(0, prevTicketCountRef.current - 1);
      }
      return prev.filter((t) => t.orderId !== orderId);
    });
    try {
      await fetch('/api/kds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'order_bumped', orderId }),
      });
    } catch {}
  }, []);

  const handleUnbump = useCallback(async (orderId: string) => {
    try {
      await fetch('/api/kds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'order_unbumped', orderId }),
      });
    } catch {}
  }, []);

  const handleRecallLocal = useCallback(async (orderId: string) => {
    setRecentlyBumped((prev) => {
      const ticket = prev.find((t) => t.orderId === orderId);
      if (ticket) {
        const restored: KdsTicket = { ...ticket, status: 'new', doneItems: [] };
        setTickets((t) => [restored, ...t]);
        prevTicketCountRef.current += 1;
      }
      return prev.filter((t) => t.orderId !== orderId);
    });
    try {
      await fetch(`/api/proxy/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'new' }),
      });
    } catch {}
  }, []);

  // Rush: toggle priority and move to top
  const handleRush = useCallback(async (orderId: string) => {
    setTickets((prev) => {
      const ticket = prev.find((t) => t.orderId === orderId);
      if (!ticket) return prev;
      const newPriority: Priority = ticket.priority === 'rush' ? 'normal' : 'rush';
      const updated = prev.map((t) =>
        t.orderId === orderId ? { ...t, priority: newPriority } : t,
      );
      if (newPriority === 'rush') playBeep(true);
      return updated;
    });
    try {
      await fetch(`/api/proxy/kds/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: 'rush' }),
      });
    } catch {}
  }, []);

  // Fire next course
  const handleFireCourse = useCallback(async (orderId: string, course: CourseType) => {
    setTickets((prev) =>
      prev.map((t) =>
        t.orderId === orderId && !t.firedCourses.includes(course)
          ? { ...t, firedCourses: [...t.firedCourses, course] }
          : t,
      ),
    );
    try {
      await fetch(`/api/proxy/kds/orders/${orderId}/fire-course`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course }),
      });
    } catch {}
  }, []);

  // Sort: rush first, then by elapsed time (oldest first)
  const sortedTickets = [...tickets].sort((a, b) => {
    if (a.priority === 'rush' && b.priority !== 'rush') return -1;
    if (b.priority === 'rush' && a.priority !== 'rush') return 1;
    return b.elapsedSeconds - a.elapsedSeconds;
  });

  // Station filter
  const filteredTickets =
    selectedStation === 'all'
      ? sortedTickets
      : sortedTickets.filter((t) =>
          t.items.some(
            (item) =>
              item.kdsStation === selectedStation ||
              item.station === selectedStation,
          ),
        );

  return (
    <div className="flex h-full flex-col bg-gray-950 text-white">
      <AppBar current="kds" deviceLabel={deviceInfo?.label ?? deviceInfo?.deviceId?.slice(0, 8)} />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#2a2a2a] bg-gray-950 px-6 py-3">
        <div className="flex items-center gap-3">
          <ChefHat className="h-6 w-6 text-yellow-400" />
          <span className="text-lg font-bold tracking-wide">ElevatedPOS KDS</span>
          {locationId && (
            <span className="rounded-full bg-[#2a2a2a] px-3 py-0.5 font-mono text-sm text-gray-400">
              {locationId.slice(0, 8)}…
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRecall(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs font-medium text-gray-400 hover:border-yellow-600 hover:text-yellow-400"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Recall
          </button>
          {connected ? (
            <div className="flex items-center gap-2 text-sm">
              <Wifi className="h-4 w-4 text-green-400" /><span className="text-green-400">Live</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <WifiOff className="h-4 w-4 animate-pulse text-red-400" /><span className="text-red-400">Reconnecting…</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar tickets={tickets} />

      {/* Station selector */}
      <StationSelector
        stations={stations}
        selected={selectedStation}
        onChange={setSelectedStation}
      />

      {/* Recently Bumped strip */}
      {recentlyBumped.length > 0 && (
        <div className="flex items-center gap-3 border-b border-[#2a2a2a] bg-gray-950 px-4 py-2 overflow-x-auto">
          <span className="flex-shrink-0 text-xs font-bold uppercase tracking-wider text-gray-600">Recently Completed:</span>
          {recentlyBumped.map((t) => (
            <div key={t.orderId} className="flex flex-shrink-0 items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-1.5">
              <span className="text-sm font-bold text-gray-400">#{t.orderNumber}</span>
              <button
                onClick={() => { void handleRecallLocal(t.orderId); }}
                className="flex items-center gap-1 rounded-md border border-yellow-700 bg-yellow-900/20 px-2 py-0.5 text-xs font-medium text-yellow-400 hover:bg-yellow-900/40"
              >
                <RotateCcw className="h-3 w-3" /> Recall
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main body — summary panel + ticket grid */}
      <div className="flex flex-1 overflow-hidden">
        <SummaryPanel tickets={filteredTickets} />

        {filteredTickets.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <CheckCircle className="h-24 w-24 text-green-500 opacity-60" />
            <p className="text-3xl font-extrabold tracking-widest text-green-400">Kitchen Clear</p>
            <p className="text-gray-600">
              {selectedStation !== 'all'
                ? `No tickets for station: ${stations.find((s) => s.id === selectedStation)?.label ?? selectedStation}`
                : 'No pending tickets'}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredTickets.map((ticket) => (
                <TicketCard
                  key={ticket.orderId}
                  ticket={ticket}
                  onBumpItem={handleBumpItem}
                  onBumpAll={handleBumpAll}
                  onRush={handleRush}
                  onFireCourse={handleFireCourse}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {showRecall && (
        <RecallPanel
          onClose={() => setShowRecall(false)}
          onUnbump={handleUnbump}
        />
      )}
    </div>
  );
}

// ─── Page — device pairing gate ───────────────────────────────────────────────

export default function KDSPage() {
  const [mounted, setMounted] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [paired, setPaired] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = getDeviceToken();
    if (token) {
      setDeviceInfo(getDeviceInfo());
      setPaired(true);
    }
  }, []);

  if (!mounted) return null;

  if (!paired) {
    return (
      <DevicePairingScreen
        role="kds"
        onPaired={(info) => {
          setDeviceInfo(info);
          setPaired(true);
        }}
      />
    );
  }

  return <KDSTerminal deviceInfo={deviceInfo} />;
}
