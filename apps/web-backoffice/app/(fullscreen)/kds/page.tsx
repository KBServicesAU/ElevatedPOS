'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ChefHat, CheckCircle, Wifi, WifiOff, Clock,
  LayoutDashboard, CreditCard, Tablet,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KdsItem {
  name: string;
  qty: number;
  modifiers: string[];
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
}

type SseMessage =
  | { type: 'connected' }
  | { type: 'new_order'; order: { orderId: string; orderNumber: string; orderType: string; channel: string; tableId?: string; locationId: string; lines: { name: string; qty: number; modifiers: string[]; seatNumber?: number; course?: string }[]; createdAt: string; status: string } }
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
    case 'pos': return 'bg-gray-700 text-gray-200';
    case 'kiosk': return 'bg-blue-800 text-blue-200';
    case 'online': return 'bg-purple-800 text-purple-200';
    case 'qr': return 'bg-teal-800 text-teal-200';
    default: return 'bg-gray-700 text-gray-300';
  }
}

function channelLabel(channel: string) {
  switch (channel) {
    case 'pos': return 'POS';
    case 'kiosk': return 'Kiosk';
    case 'online': return 'Online';
    case 'qr': return 'QR';
    default: return channel.toUpperCase();
  }
}

// ─── App switcher bar ────────────────────────────────────────────────────────

const APPS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'pos',       label: 'POS',       icon: CreditCard,      href: '/pos' },
  { id: 'kds',       label: 'KDS',       icon: ChefHat,         href: '/kds' },
  { id: 'kiosk',     label: 'Kiosk',     icon: Tablet,          href: '/kiosk' },
] as const;

function AppBar({ current }: { current: string }) {
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
      <span className="text-[10px] text-gray-700">NEXUS KDS</span>
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

// ─── Ticket card ──────────────────────────────────────────────────────────────

function TicketCard({ ticket, onBump }: { ticket: KdsTicket; onBump: (orderId: string) => void }) {
  const colorClass = elapsedColor(ticket.elapsedSeconds);
  return (
    <div className={`rounded-xl border-2 ${colorClass} p-4 shadow-lg`}>
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

      <div className="space-y-1.5">
        {ticket.items.map((item, i) => (
          <div key={i} className="rounded-lg bg-black/30 px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-yellow-400">{item.qty}&times;</span>
              <span className="font-semibold text-white">{item.name}</span>
              {item.course && (
                <span className="ml-auto rounded bg-indigo-900 px-1.5 text-xs text-indigo-300">{item.course}</span>
              )}
            </div>
            {item.modifiers.length > 0 && (
              <ul className="mt-0.5 space-y-0.5 pl-6">
                {item.modifiers.map((mod, mi) => (
                  <li key={mi} className="text-xs text-gray-300">+ {mod}</li>
                ))}
              </ul>
            )}
            {item.seatNumber != null && (
              <p className="mt-0.5 pl-6 text-xs text-gray-400">Seat {item.seatNumber}</p>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => onBump(ticket.orderId)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white py-3 text-sm font-extrabold uppercase tracking-widest text-black transition-transform hover:bg-gray-200 active:scale-95"
      >
        <CheckCircle className="h-4 w-4" /> BUMP
      </button>
    </div>
  );
}

// ─── Connect screen ───────────────────────────────────────────────────────────

const DEMO_LOCATION_ID = '00000000-0000-0000-0000-000000000001';

function ConnectScreen({ onConnect }: { onConnect: (locationId: string) => void }) {
  const [value, setValue] = useState(DEMO_LOCATION_ID);
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[#0f0f0f] text-white">
      <ChefHat className="mb-4 h-16 w-16 text-yellow-400" />
      <h1 className="mb-2 text-3xl font-extrabold tracking-wide">NEXUS KDS</h1>
      <p className="mb-6 text-gray-400">Enter your Location ID to connect</p>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && onConnect(value.trim())}
          placeholder="Location ID (UUID)"
          className="rounded-lg border border-gray-600 bg-[#1a1a1a] px-4 py-3 text-center font-mono text-sm text-white placeholder-gray-600 focus:border-yellow-400 focus:outline-none"
        />
        <button
          disabled={!value.trim()}
          onClick={() => onConnect(value.trim())}
          className="rounded-lg bg-yellow-400 py-3 font-bold text-black transition-colors hover:bg-yellow-300 disabled:opacity-40"
        >
          Connect
        </button>
        <p className="text-center text-xs text-gray-600">
          Pre-filled with the demo location ID — just click Connect
        </p>
      </div>
    </div>
  );
}

// ─── Main KDS page ────────────────────────────────────────────────────────────

export default function KDSPage() {
  const [locationId, setLocationId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('locationId');
    if (id) setLocationId(id);
  }, []);

  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

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
          items: o.lines.map((l) => ({ name: l.name, qty: l.qty, modifiers: l.modifiers, seatNumber: l.seatNumber, course: l.course })),
          createdAt: o.createdAt, status: 'new',
          elapsedSeconds: Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 1000),
        };
        setTickets((prev) => [ticket, ...prev]);
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

  const handleBump = useCallback(async (orderId: string) => {
    setTickets((prev) => prev.filter((t) => t.orderId !== orderId));
    try {
      await fetch('/api/kds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'order_bumped', orderId }),
      });
    } catch {}
  }, []);

  return (
    <div className="flex h-full flex-col bg-[#0f0f0f] text-white">
      <AppBar current="kds" />
      {!locationId ? (
        <ConnectScreen onConnect={setLocationId} />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#2a2a2a] px-6 py-3">
            <div className="flex items-center gap-3">
              <ChefHat className="h-6 w-6 text-yellow-400" />
              <span className="text-lg font-bold tracking-wide">NEXUS KDS</span>
              <span className="rounded-full bg-[#2a2a2a] px-3 py-0.5 font-mono text-sm text-gray-400">
                {locationId.slice(0, 8)}…
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {connected ? (
                <><Wifi className="h-4 w-4 text-green-400" /><span className="text-green-400">Live</span></>
              ) : (
                <><WifiOff className="h-4 w-4 animate-pulse text-red-400" /><span className="text-red-400">Reconnecting…</span></>
              )}
            </div>
          </div>

          <StatsBar tickets={tickets} />

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
                  <TicketCard key={ticket.orderId} ticket={ticket} onBump={handleBump} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
