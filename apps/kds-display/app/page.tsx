'use client';
import { useState, useEffect } from 'react';
import { Clock, CheckCircle, ChefHat, AlertCircle } from 'lucide-react';

type OrderStatus = 'new' | 'preparing' | 'ready';

interface KdsOrder {
  id: string;
  orderNumber: string;
  channel: 'In-Store' | 'Online' | 'Delivery';
  items: { name: string; qty: number; modifiers?: string[] }[];
  placedAt: Date;
  status: OrderStatus;
  table?: string;
}

function useElapsed(date: Date) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - date.getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [date]);
  return elapsed;
}

function ElapsedBadge({ placedAt }: { placedAt: Date }) {
  const sec = useElapsed(placedAt);
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  const isUrgent = mins >= 10;
  return (
    <span className={`flex items-center gap-1 text-xs font-mono font-bold ${isUrgent ? 'text-red-400' : 'text-gray-400'}`}>
      <Clock className="h-3 w-3" />
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  );
}

const now = new Date();
const MOCK_ORDERS: KdsOrder[] = [
  {
    id: '1', orderNumber: '1040', channel: 'Online', table: undefined,
    items: [
      { name: 'Flat White', qty: 2, modifiers: ['Oat Milk', 'Extra Shot'] },
      { name: 'Croissant', qty: 1 },
      { name: 'Avocado Toast', qty: 1, modifiers: ['No Egg'] },
    ],
    placedAt: new Date(now.getTime() - 12 * 60 * 1000),
    status: 'preparing',
  },
  {
    id: '2', orderNumber: '1041', channel: 'In-Store', table: 'T3',
    items: [
      { name: 'Iced Latte', qty: 1, modifiers: ['Almond Milk'] },
    ],
    placedAt: new Date(now.getTime() - 3 * 60 * 1000),
    status: 'new',
  },
  {
    id: '3', orderNumber: '1042', channel: 'Delivery', table: undefined,
    items: [
      { name: 'Cold Brew', qty: 2 },
      { name: 'Banana Bread', qty: 2, modifiers: ['Toasted'] },
      { name: 'Oat Milk Latte', qty: 1 },
    ],
    placedAt: new Date(now.getTime() - 7 * 60 * 1000),
    status: 'new',
  },
  {
    id: '4', orderNumber: '1039', channel: 'In-Store', table: 'T1',
    items: [
      { name: 'Pour Over', qty: 1, modifiers: ['Kenya Roast'] },
    ],
    placedAt: new Date(now.getTime() - 18 * 60 * 1000),
    status: 'ready',
  },
];

const statusLabels: Record<OrderStatus, string> = { new: 'NEW', preparing: 'IN PROGRESS', ready: 'READY' };
const statusBorderColors: Record<OrderStatus, string> = {
  new: 'border-blue-500',
  preparing: 'border-yellow-500',
  ready: 'border-green-500',
};
const channelColors: Record<string, string> = {
  'In-Store': 'bg-gray-700 text-gray-300',
  Online: 'bg-blue-900 text-blue-300',
  Delivery: 'bg-orange-900 text-orange-300',
};

export default function KDSPage() {
  const [orders, setOrders] = useState<KdsOrder[]>(MOCK_ORDERS);

  const advance = (id: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? { ...o, status: o.status === 'new' ? 'preparing' : o.status === 'preparing' ? 'ready' : o.status }
          : o
      )
    );
  };

  const complete = (id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const columns: OrderStatus[] = ['new', 'preparing', 'ready'];

  return (
    <div className="flex h-screen flex-col bg-[#0f0f0f] text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-6 py-3">
        <div className="flex items-center gap-3">
          <ChefHat className="h-6 w-6 text-yellow-400" />
          <span className="text-lg font-bold tracking-wide">NEXUS KDS</span>
          <span className="rounded-full bg-[#2a2a2a] px-3 py-0.5 text-sm text-gray-400">Main Kitchen</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>{orders.length} active orders</span>
          <span className="h-2 w-2 rounded-full bg-green-400" />
          <span className="text-green-400">Connected</span>
        </div>
      </div>

      {/* Board */}
      <div className="flex flex-1 gap-4 overflow-hidden p-4">
        {columns.map((col) => {
          const colOrders = orders.filter((o) => o.status === col);
          return (
            <div key={col} className="flex flex-1 flex-col gap-3">
              {/* Column header */}
              <div className={`rounded-lg border-t-2 ${statusBorderColors[col]} bg-[#1a1a1a] px-4 py-2.5 text-center`}>
                <span className="text-xs font-bold tracking-widest text-gray-400">{statusLabels[col]}</span>
                {colOrders.length > 0 && (
                  <span className="ml-2 rounded-full bg-[#2a2a2a] px-2 py-0.5 text-xs font-bold text-white">
                    {colOrders.length}
                  </span>
                )}
              </div>

              {/* Order cards */}
              <div className="flex-1 space-y-3 overflow-y-auto">
                {colOrders.map((order) => (
                  <div
                    key={order.id}
                    className={`rounded-xl border-l-4 ${statusBorderColors[order.status]} bg-[#1a1a1a] p-4`}
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <span className="text-xl font-bold">#{order.orderNumber}</span>
                        {order.table && (
                          <span className="ml-2 rounded bg-[#2a2a2a] px-2 py-0.5 text-xs text-gray-400">
                            {order.table}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${channelColors[order.channel]}`}>
                          {order.channel}
                        </span>
                        <ElapsedBadge placedAt={order.placedAt} />
                      </div>
                    </div>

                    {/* Items */}
                    <div className="space-y-2">
                      {order.items.map((item, i) => (
                        <div key={i} className="rounded-lg bg-[#0f0f0f] px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-yellow-400">{item.qty}&times;</span>
                            <span className="font-medium">{item.name}</span>
                          </div>
                          {item.modifiers?.map((mod) => (
                            <p key={mod} className="mt-0.5 pl-6 text-xs text-gray-400">+ {mod}</p>
                          ))}
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="mt-3 flex gap-2">
                      {order.status === 'ready' ? (
                        <button
                          onClick={() => complete(order.id)}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-500"
                        >
                          <CheckCircle className="h-4 w-4" /> Mark Complete
                        </button>
                      ) : (
                        <button
                          onClick={() => advance(order.id)}
                          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-white ${
                            order.status === 'new' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-yellow-600 hover:bg-yellow-500'
                          }`}
                        >
                          {order.status === 'new' ? 'Start Preparing' : 'Mark Ready'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {colOrders.length === 0 && (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-[#2a2a2a] text-sm text-gray-600">
                    No orders
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
