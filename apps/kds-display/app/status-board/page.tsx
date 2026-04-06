'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BoardOrder {
  orderId: string;
  orderNumber: string;
  channel: string;
  status: 'preparing' | 'ready';
  readyAt?: number; // timestamp ms — set when moved to ready
  flashUntil?: number; // timestamp ms — flash for 3s after becoming ready
}

type WsMessage =
  | { type: 'connected'; locationId: string }
  | { type: 'new_order'; order: { orderId: string; orderNumber: string; channel: string } }
  | { type: 'order_bumped'; orderId: string };

// ─── Config ───────────────────────────────────────────────────────────────────

const ORDERS_API = process.env['NEXT_PUBLIC_ORDERS_API_URL'] ?? 'http://localhost:4004';
const READY_TTL_MS = 3 * 60 * 1000; // 3 minutes
const FLASH_DURATION_MS = 3000;
const STORAGE_KEY = 'kds_status_board_location';

// ─── Connect screen ───────────────────────────────────────────────────────────

function ConnectScreen({ onConnect }: { onConnect: (locationId: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-black text-white gap-6">
      <h1 className="text-4xl font-extrabold tracking-widest">ORDER STATUS</h1>
      <p className="text-gray-400">Enter Location ID to start displaying</p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && value.trim() && onConnect(value.trim())}
        placeholder="Location ID (UUID)"
        className="w-80 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-center font-mono text-sm text-white placeholder-gray-600 focus:border-yellow-400 focus:outline-none"
      />
      <button
        disabled={!value.trim()}
        onClick={() => onConnect(value.trim())}
        className="rounded-lg bg-yellow-400 px-8 py-3 font-bold text-black disabled:opacity-40 hover:bg-yellow-300 transition-colors"
      >
        Connect
      </button>
    </div>
  );
}

// ─── Order chip ───────────────────────────────────────────────────────────────

function OrderChip({ order, now }: { order: BoardOrder; now: number }) {
  const isFlashing = order.flashUntil != null && now < order.flashUntil;
  const baseClass = order.status === 'ready'
    ? 'bg-green-700 text-white'
    : 'bg-gray-800 text-gray-100';
  const flashClass = isFlashing ? 'animate-pulse ring-4 ring-green-400' : '';

  return (
    <div
      className={`flex items-center justify-center rounded-2xl px-6 py-5 text-3xl font-extrabold tracking-widest shadow-lg transition-all ${baseClass} ${flashClass}`}
    >
      #{order.orderNumber}
    </div>
  );
}

// ─── Main status board ────────────────────────────────────────────────────────

export default function StatusBoardPage() {
  const [locationId, setLocationId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return (
        params.get('locationId') ??
        localStorage.getItem(STORAGE_KEY) ??
        process.env['NEXT_PUBLIC_LOCATION_ID'] ??
        null
      );
    }
    return null;
  });

  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(1000);

  // Persist locationId whenever it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (locationId) {
      localStorage.setItem(STORAGE_KEY, locationId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [locationId]);

  // Tick clock every second; purge stale ready orders
  useEffect(() => {
    const id = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      setOrders((prev) => prev.filter((o) => {
        if (o.status === 'ready' && o.readyAt != null && ts - o.readyAt > READY_TTL_MS) return false;
        return true;
      }));
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
        setOrders((prev) => [
          ...prev,
          { orderId: o.orderId, orderNumber: o.orderNumber, channel: o.channel, status: 'preparing' },
        ]);
      } else if (msg.type === 'order_bumped') {
        const bumpedAt = Date.now();
        setOrders((prev) =>
          prev.map((o) =>
            o.orderId === msg.orderId
              ? { ...o, status: 'ready', readyAt: bumpedAt, flashUntil: bumpedAt + FLASH_DURATION_MS }
              : o,
          ),
        );
      }
    };

    ws.onclose = () => {
      setConnected(false);
      const delay = Math.min(retryDelay.current, 30_000);
      retryDelay.current = delay * 2;
      retryRef.current = setTimeout(() => connect(locId), delay);
    };

    ws.onerror = () => { ws.close(); };
  }, []);

  useEffect(() => {
    if (!locationId) return;
    connect(locationId);
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [locationId, connect]);

  const handleDisconnect = () => {
    if (retryRef.current) clearTimeout(retryRef.current);
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    setOrders([]);
    setConnected(false);
    setLocationId(null);
  };

  if (!locationId) {
    return (
      <ConnectScreen
        onConnect={(locId) => {
          setLocationId(locId);
        }}
      />
    );
  }

  const preparing = orders.filter((o) => o.status === 'preparing');
  const ready = orders.filter((o) => o.status === 'ready');

  return (
    <div className="flex h-screen flex-col bg-black text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-8 py-4">
        <h1 className="text-2xl font-extrabold tracking-widest text-white">ORDER STATUS</h1>
        <div className="flex items-center gap-4 text-sm">
          {connected ? (
            <><Wifi className="h-4 w-4 text-green-400" /><span className="text-green-400">Live</span></>
          ) : (
            <><WifiOff className="h-4 w-4 text-red-400 animate-pulse" /><span className="text-red-400">Reconnecting…</span></>
          )}
          <button
            onClick={handleDisconnect}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
          >
            Change Location
          </button>
        </div>
      </div>

      {/* Columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* Preparing */}
        <div className="flex flex-1 flex-col border-r border-gray-800">
          <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-gray-400">
              Preparing
              {preparing.length > 0 && (
                <span className="ml-2 inline-block rounded-full bg-gray-700 px-2 text-xs font-bold text-white">
                  {preparing.length}
                </span>
              )}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 content-start">
            {preparing.map((o) => (
              <OrderChip key={o.orderId} order={o} now={now} />
            ))}
            {preparing.length === 0 && (
              <div className="col-span-2 flex items-center justify-center py-16 text-gray-700 text-lg">
                No orders
              </div>
            )}
          </div>
        </div>

        {/* Ready for Pickup */}
        <div className="flex flex-1 flex-col">
          <div className="border-b border-gray-800 bg-green-950 px-6 py-4 text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-green-400">
              Ready for Pickup
              {ready.length > 0 && (
                <span className="ml-2 inline-block rounded-full bg-green-800 px-2 text-xs font-bold text-white">
                  {ready.length}
                </span>
              )}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 content-start">
            {ready.map((o) => (
              <OrderChip key={o.orderId} order={o} now={now} />
            ))}
            {ready.length === 0 && (
              <div className="col-span-2 flex items-center justify-center py-16 text-gray-700 text-lg">
                None ready yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
