'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ChefHat, CheckCircle, Wifi, WifiOff, Clock,
  LayoutDashboard, CreditCard, Tablet, RotateCcw, X,
} from 'lucide-react';
import DevicePairingScreen from '@/components/device-pairing-screen';
import { getDeviceToken, getDeviceInfo, type DeviceInfo } from '@/lib/device-auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KdsItem {
  name: string;
  qty: number;
  modifiers: string[];
  note?: string;
  seatNumber?: number;
  course?: string;
}

interface KdsTicket {
  orderId: string;
  orderNumber: string;
  orderType: string;
  channel: string;
  tableId?: string;
  locationId: string;
  items: KdsItem[];
  createdAt: string;
  status: 'new' | 'preparing' | 'bumped';
  elapsedSeconds: number;
  doneItems: number[]; // indices of items marked done
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

type SseMessage =
  | { type: 'connected' }
  | { type: 'new_order'; order: { orderId: string; orderNumber: string; orderType: string; channel: string; tableId?: string; locationId: string; lines: { name: string; qty: number; modifiers: string[]; note?: string; seatNumber?: number; course?: string }[]; createdAt: string; status: string } }
  | { type: 'order_bumped'; orderId: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsedColor(seconds: number) {
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
  if (tickets.length === 0) return null;
  const avg = Math.floor(tickets.reduce((s, t) => s + t.elapsedSeconds, 0) / tickets.length / 60);
  const longest = Math.floor(Math.max(...tickets.map((t) => t.elapsedSeconds)) / 60);
  return (
    <div className="flex items-center gap-6 border-b border-[#2a2a2a] bg-[#111] px-6 py-2 text-sm text-gray-400">
      <span className="font-semibold text-white">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</span>
      <span>Avg: <strong className="text-yellow-400">{avg}min</strong></span>
      <span>Longest: <strong className="text-red-400">{longest}min</strong></span>
    </div>
  );
}

// ─── Summary panel ────────────────────────────────────────────────────────────

function SummaryPanel({ tickets }: { tickets: KdsTicket[] }) {
  // Aggregate all pending items across tickets (exclude done items)
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
    <div className="flex w-52 flex-shrink-0 flex-col border-r border-[#2a2a2a] bg-[#0a0a0a]">
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

// ─── Ticket card ──────────────────────────────────────────────────────────────

function TicketCard({
  ticket,
  onBumpItem,
  onBumpAll,
}: {
  ticket: KdsTicket;
  onBumpItem: (orderId: string, itemIdx: number) => void;
  onBumpAll: (orderId: string) => void;
}) {
  const colorClass = elapsedColor(ticket.elapsedSeconds);
  const allDone = ticket.items.every((_, i) => ticket.doneItems.includes(i));

  return (
    <div className={`rounded-xl border-2 ${colorClass} p-4 shadow-lg`}>
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
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

      {/* Items with per-item Done buttons */}
      <div className="space-y-1.5">
        {ticket.items.map((item, i) => {
          const done = ticket.doneItems.includes(i);
          return (
            <div
              key={i}
              className={`rounded-lg px-3 py-2 transition-opacity ${done ? 'bg-black/10 opacity-40' : 'bg-black/30'}`}
            >
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={`font-bold ${done ? 'text-gray-500' : 'text-yellow-400'}`}>{item.qty}&times;</span>
                    <span className={`font-semibold ${done ? 'text-gray-500 line-through' : 'text-white'}`}>{item.name}</span>
                    {item.course && (
                      <span className="ml-auto rounded bg-indigo-900 px-1.5 text-xs text-indigo-300">{item.course}</span>
                    )}
                  </div>
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
                  onClick={() => onBumpItem(ticket.orderId, i)}
                  className={`ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-all ${
                    done
                      ? 'bg-green-700 text-white'
                      : 'border border-white/20 bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                  title={done ? 'Done' : 'Mark done'}
                >
                  <CheckCircle className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* BUMP button */}
      <button
        onClick={() => onBumpAll(ticket.orderId)}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-extrabold uppercase tracking-widest transition-transform active:scale-95 ${
          allDone
            ? 'bg-green-400 text-green-950 hover:bg-green-300'
            : 'bg-white text-black hover:bg-gray-200'
        }`}
      >
        <CheckCircle className="h-4 w-4" /> {allDone ? 'COMPLETE ✓' : 'BUMP ALL'}
      </button>
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
    const id = setInterval(load, 10_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0a] text-white">
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
  const esRef = useRef<EventSource | null>(null);

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
        const ticket: KdsTicket = {
          orderId: o.orderId, orderNumber: o.orderNumber, orderType: o.orderType,
          channel: o.channel, tableId: o.tableId, locationId: o.locationId,
          items: o.lines.map((l) => ({
            name: l.name, qty: l.qty, modifiers: l.modifiers ?? [],
            note: l.note, seatNumber: l.seatNumber, course: l.course,
          })),
          createdAt: o.createdAt, status: 'new',
          elapsedSeconds: Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 1000),
          doneItems: [],
        };
        setTickets((prev) => {
          // Avoid duplicates on reconnect replay
          if (prev.some((t) => t.orderId === ticket.orderId)) return prev;
          return [ticket, ...prev];
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

  // Mark a single item done; auto-bump if all items done
  const handleBumpItem = useCallback((orderId: string, itemIdx: number) => {
    setTickets((prev) =>
      prev.map((t) => {
        if (t.orderId !== orderId) return t;
        const doneItems = t.doneItems.includes(itemIdx)
          ? t.doneItems.filter((i) => i !== itemIdx) // toggle off
          : [...t.doneItems, itemIdx];
        return { ...t, doneItems };
      }),
    );
  }, []);

  const handleBumpAll = useCallback(async (orderId: string) => {
    setTickets((prev) => prev.filter((t) => t.orderId !== orderId));
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

  return (
    <div className="flex h-full flex-col bg-[#0f0f0f] text-white">
      <AppBar current="kds" deviceLabel={deviceInfo?.label ?? deviceInfo?.deviceId?.slice(0, 8)} />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-6 py-3">
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

      <StatsBar tickets={tickets} />

      {/* Main body — summary panel + ticket grid */}
      <div className="flex flex-1 overflow-hidden">
        <SummaryPanel tickets={tickets} />

        {tickets.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <CheckCircle className="h-24 w-24 text-green-500 opacity-60" />
            <p className="text-3xl font-extrabold tracking-widest text-green-400">Kitchen Clear</p>
            <p className="text-gray-600">No pending tickets</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tickets.map((ticket) => (
                <TicketCard
                  key={ticket.orderId}
                  ticket={ticket}
                  onBumpItem={handleBumpItem}
                  onBumpAll={handleBumpAll}
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
