'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { Truck, Clock, CheckCircle, Package, AlertCircle } from 'lucide-react';

interface FulfillmentItem {
  id: string;
  orderNumber: string;
  customerName: string;
  itemsSummary: string;
  itemCount: number;
  status: 'pending' | 'ready' | 'collected';
  readyAt: string | null;
  createdAt: string;
  locationName: string;
}

interface FulfillmentResponse {
  data: FulfillmentItem[];
}

const MOCK_DATA: FulfillmentItem[] = [
  { id: 'f1', orderNumber: '#CC-4821', customerName: 'Emma Johnson', itemsSummary: 'Flat White × 2, Banana Bread', itemCount: 3, status: 'ready', readyAt: new Date(Date.now() - 7 * 60 * 1000).toISOString(), createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(), locationName: 'Sydney CBD' },
  { id: 'f2', orderNumber: '#CC-4820', customerName: 'Marcus Lee', itemsSummary: 'Grilled Salmon, Caesar Salad', itemCount: 2, status: 'ready', readyAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), locationName: 'Sydney CBD' },
  { id: 'f3', orderNumber: '#CC-4819', customerName: 'Sophie Wilson', itemsSummary: 'Chicken Burger, Fries, Diet Coke', itemCount: 3, status: 'pending', readyAt: null, createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), locationName: 'Sydney CBD' },
  { id: 'f4', orderNumber: '#CC-4818', customerName: 'David Chen', itemsSummary: 'Beef Brisket Sandwich × 2', itemCount: 2, status: 'ready', readyAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(), createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(), locationName: 'Sydney CBD' },
  { id: 'f5', orderNumber: '#CC-4817', customerName: 'Anika Patel', itemsSummary: 'Veggie Bowl, Sparkling Water', itemCount: 2, status: 'collected', readyAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(), createdAt: new Date(Date.now() - 70 * 60 * 1000).toISOString(), locationName: 'Sydney CBD' },
  { id: 'f6', orderNumber: '#CC-4816', customerName: 'James O\'Brien', itemsSummary: 'Eggs Benedict, Orange Juice', itemCount: 2, status: 'collected', readyAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(), locationName: 'Sydney CBD' },
];

type FilterTab = 'all' | 'pending' | 'ready' | 'collected';

function elapsed(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

const STATUS_STYLES: Record<FulfillmentItem['status'], string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  collected: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_LABELS: Record<FulfillmentItem['status'], string> = {
  pending: 'Preparing',
  ready: 'Ready for Pickup',
  collected: 'Collected',
};

export default function FulfillmentClient() {
  const { toast } = useToast();
  const [items, setItems] = useState<FulfillmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [collectingId, setCollectingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<FulfillmentResponse>(
        'fulfillment?type=click_and_collect&status=ready',
      );
      setItems(res.data ?? MOCK_DATA);
    } catch {
      // Fall back to mock data when the service is unavailable
      setItems(MOCK_DATA);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMarkCollected(id: string) {
    setCollectingId(id);
    try {
      await apiFetch(`fulfillment/${id}/collect`, { method: 'POST' });
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: 'collected' } : item)),
      );
    } catch {
      toast({ title: 'Failed to mark as collected', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setCollectingId(null);
    }
  }

  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'all', label: `All (${items.length})` },
    { id: 'pending', label: `Pending (${items.filter((i) => i.status === 'pending').length})` },
    { id: 'ready', label: `Ready (${items.filter((i) => i.status === 'ready').length})` },
    { id: 'collected', label: `Collected (${items.filter((i) => i.status === 'collected').length})` },
  ];

  const filtered = activeTab === 'all' ? items : items.filter((i) => i.status === activeTab);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Click & Collect</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Manage orders ready for customer pickup
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="mb-5 flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-elevatedpos-500 text-elevatedpos-600 dark:text-elevatedpos-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-16 dark:border-gray-700 dark:bg-gray-800/40">
          <CheckCircle className="mb-3 h-10 w-10 text-emerald-400" />
          <p className="text-base font-medium text-gray-700 dark:text-gray-300">All clear!</p>
          <p className="mt-1 text-sm text-gray-400">No {activeTab !== 'all' ? activeTab : ''} orders in the queue.</p>
        </div>
      )}

      {/* Order cards */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                <Package className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 dark:text-white text-sm">{item.orderNumber}</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">— {item.customerName}</span>
                  <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[item.status]}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 truncate">{item.itemsSummary}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                  <span>{item.itemCount} item{item.itemCount !== 1 ? 's' : ''}</span>
                  {item.readyAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Ready {elapsed(item.readyAt)}
                    </span>
                  )}
                  <span>{item.locationName}</span>
                </div>
              </div>

              {item.status === 'ready' && (
                <button
                  onClick={() => handleMarkCollected(item.id)}
                  disabled={collectingId === item.id}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-60 transition-colors"
                >
                  {collectingId === item.id ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <Truck className="h-3.5 w-3.5" />
                  )}
                  Mark Collected
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
