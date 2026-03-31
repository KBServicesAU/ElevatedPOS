'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChefHat, CheckCircle, Wifi, WifiOff, Clock } from 'lucide-react';

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

type WsMessage =
  | { type: 'connected'; locationId: string }
  | { type: 'new_order'; order: { orderId: string; orderNumber: string; orderType: string; channel: string; tableId?: string; locationId: string; lines: { name: string; qty: number; modifiers: string[]; seatNumber?: number; course?: string }[]; createdAt: string; status: string } }
  | { type: 'order_bumped'; orderId: string; locationId: string; timestamp: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsedColor(seconds: number): string {
  const mins = seconds / 60;
  if (mins < 5) return 'bg-green-900 border-green-600';
  if (mins < 10) return 'bg-yellow-900 border-yellow-600';
  return 'bg-red-900 border-red-600';
}

function elapsedText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function channelBadge(channel: string): string {
  switch (channel) {
    case 'pos': return 'bg-gray-700 text-gray-200';
    case 'kiosk': return 'bg-blue-800 text-blue-200';
    case 'online': return 'bg-purple-800 text-purple-200';
    case 'qr': return 'bg-teal-800 text-teal-200';
    default: return 'bg-gray-700 text-gray-300';
  }
}

function channelLabel(channel: string): string {
  switch (channel) {
    case 'pos': return 'POS';
    case 'kiosk': return 'Kiosk';
    case 'online': return 'Online';
    case 'qr': return 'QR';
    default: return channel.toUpperCase();
  }
}

// ─── Stats bar ───────────────────────────────────────────────────────────────

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

// ─── Ticket card ─────────────────────────────────────────────────────────────

function TicketCard({ ticket, onBump }: { ticket: KdsTicket; onBump: (orderId: string) => void }) {
  const colorClass = elapsedColor(ticket.elapsedSeconds);
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

      {/* Items */}
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

      {/* Bump button */}
      <button
        onClick={() => onBump(ticket.orderId)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white py-3 text-sm font-extrabold uppercase tracking-widest text-black hover:bg-gray-200 active:scale-95 transition-transform"
      >
        <CheckCircle className="h-4 w-4" /> BUMP
      </button>
    </div>
  );
}

// ─── Connect screen ───────────────────────────────────────────────────────────

function ConnectScreen({ onConnect }: { onConnect: (locationId: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#0f0f0f] text-white">
      <ChefHat className="mb-4 h-16 w-16 text-yellow-400" />
      <h1 className="mb-2 text-3xl font-extrabold tracking-wide">NEXUS KDS</h1>
      <p className="mb-8 text-gray-400">Enter your Location ID to connect</p>
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
          className="rounded-lg bg-yellow-400 py-3 font-bold text-black disabled:opacity-40 hover:bg-yellow-300 transition-colors"
        >
          Connect
        </button>
      </div>
    </div>
  );
}

// ─── Main KDS page ────────────────────────────────────────────────────────────

const ORDERS_API = process.env['NEXT_PUBLIC_ORDERS_API_URL'] ?? 'http://localhost:4004';

export default function KDSPage() {
  const [locationId, setLocationId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('locationId') ?? process.env['NEXT_PUBLIC_LOCATION_ID'] ?? null;
    }
    return null;
  });

  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(1000);

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

  const connect = useCallback((locId: string) => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const wsUrl = `${ORDERS_API.replace(/^http/, 'ws')}/api/v1/kds/stream?locationId=${encodeURIComponent(locId)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryDelay.current = 1000;
    };

    ws.onmessage = (ev: MessageEvent<string>) => {
      let msg: WsMessage;
      try { msg = JSON.parse(ev.data) as WsMessage; } catch { return; }

      if (msg.type === 'new_order') {
        const o = msg.order;
        const now = Date.now();
        const ticket: KdsTicket = {
          orderId: o.orderId,
          orderNumber: o.orderNumber,
          orderType: o.orderType,
          channel: o.channel,
          tableId: o.tableId,
          locationId: o.locationId,
          items: o.lines.map((l) => ({
            name: l.name,
            qty: l.qty,
            modifiers: l.modifiers,
            seatNumber: l.seatNumber,
            course: l.course,
          })),
          createdAt: o.createdAt,
          status: 'new',
          elapsedSeconds: Math.floor((now - new Date(o.createdAt).getTime()) / 1000),
        };
        setTickets((prev) => [ticket, ...prev]);
      } else if (msg.type === 'order_bumped') {
        setTickets((prev) => prev.filter((t) => t.orderId !== msg.orderId));
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Exponential backoff reconnect
      const delay = Math.min(retryDelay.current, 30_000);
      retryDelay.current = delay * 2;
      retryRef.current = setTimeout(() => connect(locId), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    if (!locationId) return;
    connect(locationId);
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [locationId, connect]);

  const handleBump = useCallback(async (orderId: string) => {
    // Optimistic removal
    setTickets((prev) => prev.filter((t) => t.orderId !== orderId));
    try {
      // Route through the local Next.js proxy so INTERNAL_SECRET is never
      // exposed to the browser.  The proxy adds the header server-side and
      // forwards the request to the orders service.
      await fetch(`/api/bump/${encodeURIComponent(orderId)}`, { method: 'POST' });
    } catch {
      // Bump is best-effort from KDS; server will broadcast to all connected KDS
    }
  }, []);

  if (!locationId) {
    return <ConnectScreen onConnect={setLocationId} />;
  }

  return (
    <div className="flex h-screen flex-col bg-[#0f0f0f] text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-6 py-3">
        <div className="flex items-center gap-3">
          <ChefHat className="h-6 w-6 text-yellow-400" />
          <span className="text-lg font-bold tracking-wide">NEXUS KDS</span>
          <span className="rounded-full bg-[#2a2a2a] px-3 py-0.5 text-sm text-gray-400 font-mono">
            {locationId.slice(0, 8)}…
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {connected ? (
            <>
              <Wifi className="h-4 w-4 text-green-400" />
              <span className="text-green-400">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-red-400 animate-pulse" />
              <span className="text-red-400">Reconnecting…</span>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <StatsBar tickets={tickets} />

      {/* Board */}
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
    </div>
  );
}
