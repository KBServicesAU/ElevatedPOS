'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Stamp, Award, Users, TrendingUp, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StampProgram {
  id: string;
  name: string;
  description?: string;
  stampsRequired: number;
  reward: string;
  rewardValue: string;
  isActive: boolean;
  expiryDays?: number;
  createdAt: string;
  updatedAt: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchStampPrograms(): Promise<{ data: StampProgram[] }> {
  const res = await fetch('/api/proxy/loyalty-stamps/cards', {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function createStampProgram(body: Omit<StampProgram, 'id' | 'createdAt' | 'updatedAt'>) {
  const res = await fetch('/api/proxy/loyalty-stamps/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Stamp visual card ────────────────────────────────────────────────────────

function StampDots({ filled, total }: { filled: number; total: number }) {
  const dots = Array.from({ length: total });
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {dots.map((_, i) => (
        <span
          key={i}
          className={`text-lg leading-none ${
            i < filled
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-gray-200 dark:text-gray-700'
          }`}
        >
          {i < filled ? '●' : '○'}
        </span>
      ))}
    </div>
  );
}

// ─── Mock per-program stats (would come from loyalty accounts endpoint) ───────

function mockStats(programId: string) {
  // Deterministic mock from ID char codes
  const seed = programId.charCodeAt(0) + programId.charCodeAt(1);
  const activeMembers = 50 + (seed % 450);
  const redemptions = Math.floor(activeMembers * 0.15 + (seed % 30));
  const rate = activeMembers > 0 ? ((redemptions / activeMembers) * 100).toFixed(1) : '0.0';
  return { activeMembers, redemptions, rate };
}

// ─── Create modal ─────────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    description: '',
    stampsRequired: 10,
    reward: '',
    rewardValue: 0,
    isActive: true,
    expiryDays: '' as number | '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createStampProgram({
        name: form.name,
        description: form.description || undefined,
        stampsRequired: form.stampsRequired,
        reward: form.reward,
        rewardValue: String(form.rewardValue),
        isActive: form.isActive,
        expiryDays: form.expiryDays !== '' ? Number(form.expiryDays) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stamp-programs'] });
      onCreated();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.reward.trim()) { setError('Reward description is required'); return; }
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Create Stamp Card Program
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Program Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Coffee Loyalty Card"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description (optional)
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Earn a free coffee after 10 stamps"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Stamps Required
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={form.stampsRequired}
                onChange={(e) => setForm((f) => ({ ...f, stampsRequired: Number(e.target.value) }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Expiry Days (optional)
              </label>
              <input
                type="number"
                min={1}
                value={form.expiryDays}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    expiryDays: e.target.value === '' ? '' : Number(e.target.value),
                  }))
                }
                placeholder="No expiry"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Reward Description
            </label>
            <input
              type="text"
              value={form.reward}
              onChange={(e) => setForm((f) => ({ ...f, reward: e.target.value }))}
              placeholder="e.g. Free large coffee"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Reward Value ($)
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.rewardValue}
              onChange={(e) => setForm((f) => ({ ...f, rewardValue: Number(e.target.value) }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="is-active"
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="is-active" className="text-sm text-gray-700 dark:text-gray-300">
              Active (visible to customers)
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Creating…' : 'Create Program'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Program card ─────────────────────────────────────────────────────────────

function ProgramCard({ program }: { program: StampProgram }) {
  const { activeMembers, redemptions, rate } = mockStats(program.id);
  const previewFilled = Math.min(3, program.stampsRequired);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-2.5 dark:bg-indigo-900/30">
            <Stamp className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{program.name}</h3>
            {program.description && (
              <p className="mt-0.5 text-xs text-gray-500">{program.description}</p>
            )}
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            program.isActive
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
          }`}
        >
          {program.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Stamp dots preview (shows first 3 filled, rest empty) */}
      <StampDots filled={previewFilled} total={Math.min(program.stampsRequired, 12)} />
      {program.stampsRequired > 12 && (
        <p className="mt-1 text-xs text-gray-400">+{program.stampsRequired - 12} more stamps</p>
      )}

      {/* Reward */}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-900/20">
        <Award className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-amber-800 dark:text-amber-300">
            {program.reward}
          </p>
          {Number(program.rewardValue) > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ${Number(program.rewardValue).toFixed(2)} value
            </p>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <div className="text-center">
          <p className="text-base font-bold text-gray-900 dark:text-white">
            {program.stampsRequired}
          </p>
          <p className="text-xs text-gray-500">stamps needed</p>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-gray-900 dark:text-white">
            {activeMembers.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">active members</p>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-gray-900 dark:text-white">{rate}%</p>
          <p className="text-xs text-gray-500">redemption rate</p>
        </div>
      </div>

      {program.expiryDays && (
        <p className="mt-2 text-xs text-gray-400">Expires after {program.expiryDays} days</p>
      )}
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function StampsClient() {
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['stamp-programs'],
    queryFn: fetchStampPrograms,
  });

  const programs = data?.data ?? [];
  const activeCount = programs.filter((p) => p.isActive).length;
  const totalMembers = programs.reduce((sum, p) => sum + mockStats(p.id).activeMembers, 0);
  const avgRedemption =
    programs.length > 0
      ? (
          programs.reduce((sum, p) => sum + Number(mockStats(p.id).rate), 0) / programs.length
        ).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Stamp Cards</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Digital punch-card programs that reward repeat customers
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Create Stamp Card
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: 'Active Programs',
            value: activeCount.toString(),
            icon: Stamp,
            color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
          },
          {
            label: 'Active Members',
            value: totalMembers.toLocaleString(),
            icon: Users,
            color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
          },
          {
            label: 'Avg Redemption Rate',
            value: `${avgRedemption}%`,
            icon: TrendingUp,
            color: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <div className={`rounded-xl p-2.5 ${stat.color}`}>
              <stat.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Program grid */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800"
            />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center dark:border-red-900/30 dark:bg-red-900/10">
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to load stamp programs. Please try again.
          </p>
        </div>
      )}

      {!isLoading && !isError && programs.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center dark:border-gray-700">
          <Stamp className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="font-medium text-gray-700 dark:text-gray-300">No stamp card programs yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Create your first digital punch card to reward loyal customers.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Create Stamp Card
          </button>
        </div>
      )}

      {!isLoading && !isError && programs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((program) => (
            <ProgramCard key={program.id} program={program} />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <CreateModal
          onClose={() => setShowModal(false)}
          onCreated={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
