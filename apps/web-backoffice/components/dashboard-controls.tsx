'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Download } from 'lucide-react';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

interface LocationOption {
  id: string;
  name: string;
}

export function DashboardControls({ period, locationId }: { period: string; locationId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const selectedLocation = locationId ?? searchParams?.get('locationId') ?? 'all';

  // v2.7.51 — fetch locations so the dashboard can scope by store, with a
  // default "All locations" option that aggregates across stores.
  useEffect(() => {
    fetch('/api/proxy/locations')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return;
        const list: LocationOption[] = Array.isArray(json) ? json : (json.data ?? json.locations ?? []);
        setLocations(list);
      })
      .catch(() => { /* dropdown stays at "All locations" */ });
  }, []);

  function pushParams(updates: Record<string, string>) {
    const params = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function handlePeriodChange(value: string) {
    pushParams({ period: value });
  }

  function handleLocationChange(value: string) {
    pushParams({ locationId: value === 'all' ? '' : value });
  }

  function handleExport() {
    const periodMap: Record<string, { from: string; to: string }> = {
      today: { from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
      yesterday: (() => { const d = new Date(); d.setDate(d.getDate() - 1); const s = d.toISOString().slice(0, 10); return { from: s, to: s }; })(),
      week: (() => { const to = new Date().toISOString().slice(0, 10); const f = new Date(); f.setDate(f.getDate() - 7); return { from: f.toISOString().slice(0, 10), to }; })(),
      month: (() => { const to = new Date().toISOString().slice(0, 10); const f = new Date(); f.setDate(f.getDate() - 30); return { from: f.toISOString().slice(0, 10), to }; })(),
    };
    const range = periodMap[period] ?? periodMap['today'];
    const locParam = selectedLocation && selectedLocation !== 'all' ? `&locationId=${encodeURIComponent(selectedLocation)}` : '';
    window.open(`/api/proxy/reports/export?format=csv&from=${range.from}&to=${range.to}${locParam}`, '_blank');
  }

  return (
    <div className="flex gap-2">
      <select
        value={selectedLocation}
        onChange={(e) => handleLocationChange(e.target.value)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      >
        <option value="all">All locations</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      <select
        value={period}
        onChange={(e) => handlePeriodChange(e.target.value)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      >
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      <button
        onClick={handleExport}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 flex items-center gap-1.5"
      >
        <Download className="h-4 w-4" />
        Export
      </button>
    </div>
  );
}
