'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';

// v2.7.51 — per-device pricing replaces the legacy 3-plan picker.
// Display prices in dollars; persisted in cents server-side.
const DEVICE_PRICE: Record<DeviceType, number> = {
  pos:     49,
  kds:     29,
  kiosk:   39,
  signage: 19,
};

type DeviceType = 'pos' | 'kds' | 'kiosk' | 'signage';

interface LocationDevices {
  name: string;
  pos:     number;
  kds:     number;
  kiosk:   number;
  signage: number;
}

const newLocation = (i: number): LocationDevices => ({
  name: i === 0 ? 'Main location' : `Location ${i + 1}`,
  pos:     1,
  kds:     0,
  kiosk:   0,
  signage: 0,
});

function PlanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgId = searchParams?.get('orgId') || '';
  const token = searchParams?.get('token') || '';

  const [locations, setLocations] = useState<LocationDevices[]>([newLocation(0)]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    const t = locations.reduce(
      (acc, l) => ({
        pos:     acc.pos     + (l.pos     || 0),
        kds:     acc.kds     + (l.kds     || 0),
        kiosk:   acc.kiosk   + (l.kiosk   || 0),
        signage: acc.signage + (l.signage || 0),
      }),
      { pos: 0, kds: 0, kiosk: 0, signage: 0 },
    );
    const deviceCount = t.pos + t.kds + t.kiosk + t.signage;
    const monthly =
      t.pos     * DEVICE_PRICE.pos +
      t.kds     * DEVICE_PRICE.kds +
      t.kiosk   * DEVICE_PRICE.kiosk +
      t.signage * DEVICE_PRICE.signage;
    return { ...t, deviceCount, monthly };
  }, [locations]);

  function setLocationCount(n: number) {
    const target = Math.max(1, Math.min(50, n));
    setLocations((prev) => {
      if (prev.length === target) return prev;
      if (prev.length < target) {
        const out = [...prev];
        for (let i = prev.length; i < target; i++) out.push(newLocation(i));
        return out;
      }
      return prev.slice(0, target);
    });
  }

  function updateLocation<K extends keyof LocationDevices>(idx: number, key: K, value: LocationDevices[K]) {
    setLocations((prev) =>
      prev.map((loc, i) => (i === idx ? { ...loc, [key]: value } : loc)),
    );
  }

  async function handleContinue() {
    if (totals.deviceCount === 0) {
      setError('Please add at least one device.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/onboard/device-pricing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-onboarding-token': token } : {}),
        },
        body: JSON.stringify({ locations }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not save your device selection.');
        return;
      }
      const params = new URLSearchParams({ orgId });
      if (token) params.set('token', token);
      router.push(`/onboard/payment-account?${params.toString()}`);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-white mb-2">Tell us about your setup</h1>
          <p className="text-neutral-500">
            Per-device pricing — pay only for what you use. POS ${DEVICE_PRICE.pos}, KDS ${DEVICE_PRICE.kds}, Kiosk ${DEVICE_PRICE.kiosk}, Signage ${DEVICE_PRICE.signage} per device per month.
          </p>
        </div>

        {/* Location count */}
        <div className="mb-6 p-5 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <label className="block text-sm font-medium text-neutral-300 mb-2" htmlFor="locationCount">
            Number of locations
          </label>
          <input
            id="locationCount"
            type="number"
            min={1}
            max={50}
            value={locations.length}
            onChange={(e) => setLocationCount(parseInt(e.target.value || '1', 10))}
            className="w-32 px-4 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.05] text-sm text-white outline-none focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]/20"
          />
        </div>

        {/* Per-location device counts */}
        <div className="space-y-4 mb-6">
          {locations.map((loc, idx) => (
            <div key={idx} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
              <div className="mb-4">
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                  Location {idx + 1}
                </label>
                <input
                  type="text"
                  value={loc.name}
                  onChange={(e) => updateLocation(idx, 'name', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.05] text-sm text-white outline-none focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]/20"
                  placeholder="e.g. Main store"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(Object.keys(DEVICE_PRICE) as DeviceType[]).map((type) => (
                  <div key={type}>
                    <label className="block text-xs font-medium text-neutral-400 mb-1.5 capitalize">
                      {type === 'kds' ? 'KDS' : type === 'pos' ? 'POS' : type}
                      <span className="ml-1 text-neutral-600">${DEVICE_PRICE[type]}</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={loc[type]}
                      onChange={(e) => updateLocation(idx, type, Math.max(0, parseInt(e.target.value || '0', 10)))}
                      className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.05] text-sm text-white outline-none focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]/20"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Live total */}
        <div className="mb-8 rounded-2xl border border-[#7c3aed]/30 bg-[#7c3aed]/[0.05] p-6">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-[#7c3aed] font-semibold">Monthly total</div>
              <div className="text-sm text-neutral-400 mt-1">
                {totals.deviceCount} device{totals.deviceCount === 1 ? '' : 's'} ×{' '}
                {totals.deviceCount > 0
                  ? `$${(totals.monthly / Math.max(1, totals.deviceCount)).toFixed(2)} avg`
                  : '$0'}
                /device/month
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-extrabold text-white">${totals.monthly}</div>
              <div className="text-xs text-neutral-500">/ month</div>
            </div>
          </div>
          {totals.deviceCount > 0 && (
            <div className="mt-4 pt-4 border-t border-white/[0.05] grid grid-cols-4 gap-2 text-xs">
              <div className="text-center">
                <div className="text-neutral-500">POS</div>
                <div className="font-semibold text-white mt-0.5">{totals.pos}</div>
              </div>
              <div className="text-center">
                <div className="text-neutral-500">KDS</div>
                <div className="font-semibold text-white mt-0.5">{totals.kds}</div>
              </div>
              <div className="text-center">
                <div className="text-neutral-500">Kiosk</div>
                <div className="font-semibold text-white mt-0.5">{totals.kiosk}</div>
              </div>
              <div className="text-center">
                <div className="text-neutral-500">Signage</div>
                <div className="font-semibold text-white mt-0.5">{totals.signage}</div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={handleContinue}
          disabled={submitting || totals.deviceCount === 0}
          className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] disabled:bg-[#7c3aed]/40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-colors"
        >
          {submitting ? 'Saving…' : 'Continue'}
        </button>

        <p className="text-xs text-neutral-600 text-center mt-4">
          You can add or remove devices any time from your dashboard. Charges are pro-rated.
        </p>
      </div>
    </div>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-neutral-600">Loading…</div>}>
      <PlanPageContent />
    </Suspense>
  );
}
