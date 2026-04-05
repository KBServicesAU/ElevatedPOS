'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Stamp, Award, Users, TrendingUp, X, Send, History, ShoppingBag, Minus as MinusIcon } from 'lucide-react';

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

interface StampHistoryEntry {
  id: string;
  type: 'earned' | 'redeemed' | 'expired' | string;
  stamps: number;
  orderId?: string;
  orderReference?: string;
  note?: string;
  createdAt: string;
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

async function issueStamps(payload: { customerId: string; stamps: number; orderId?: string }) {
  const res = await fetch('/api/proxy/loyalty-stamps/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; detail?: string };
    throw new Error(err.message ?? err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchStampHistory(customerId: string): Promise<{ data: StampHistoryEntry[] }> {
  const res = await fetch(`/api/proxy/loyalty-stamps/${customerId}/history`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  const seed = programId.charCodeAt(0) + programId.charCodeAt(1);
  const activeMembers = 50 + (seed % 450);
  const redemptions = Math.floor(activeMembers * 0.15 + (seed % 30));
  const rate = activeMembers > 0 ? ((redemptions / activeMembers) * 100).toFixed(1) : '0.0';
  return { activeMembers, redemptions, rate };
}

// ─── Issue Stamps Modal ───────────────────────────────────────────────────────

interface IssueStampsModalProps {
  onClose: () => void;
}

function IssueStampsModal({ onClose }: IssueStampsModalProps) {
  const [customerId, setCustomerId] = useState('');
  const [stamps, setStamps] = useState(1);
  const [orderId, setOrderId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      issueStamps({
        customerId: customerId.trim(),
        stamps,
        orderId: orderId.trim() || undefined,
      }),
    onSuccess: () => {
      setSuccess(true);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!customerId.trim()) { setError('Customer ID is required'); return; }
    if (stamps < 1) { setError('Stamps must be at least 1'); return; }
    mutation.mutate();
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-gray-900 p-8 text-center">
          <div className="text-5xl mb-3">✅</div>
          <h3 className="text-lg font-bold text-green-600 dark:text-green-400 mb-1">Stamps Issued!</h3>
          <p className="text-sm text-gray-500 mb-6">
            {stamps} stamp{stamps !== 1 ? 's' : ''} issued to customer.
          </p>
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-indigo-500" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Issue Stamps</h3>
          </div>
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
              Customer ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="Enter customer ID or email"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Number of Stamps
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStamps((s) => Math.max(1, s - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <MinusIcon className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-lg font-bold text-gray-900 dark:text-white">{stamps}</span>
              <button
                type="button"
                onClick={() => setStamps((s) => s + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Order ID (optional)
            </label>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Link to an order"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
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
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {mutation.isPending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {mutation.isPending ? 'Issuing…' : 'Issue Stamps'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stamp History Panel ──────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function StampHistoryPanel({ programId, programName, onClose }: { programId: string; programName: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['stamp-history', programId],
    queryFn: () => fetchStampHistory(programId),
  });

  const history = data?.data ?? [];

  function entryIcon(type: string) {
    if (type === 'earned') return <span className="text-green-500">+</span>;
    if (type === 'redeemed') return <Award className="h-3.5 w-3.5 text-amber-500" />;
    if (type === 'expired') return <span className="text-gray-400">×</span>;
    return <Stamp className="h-3.5 w-3.5 text-indigo-400" />;
  }

  function entryColor(type: string) {
    if (type === 'earned') return 'text-green-700 dark:text-green-400';
    if (type === 'redeemed') return 'text-amber-700 dark:text-amber-400';
    if (type === 'expired') return 'text-gray-500';
    return 'text-gray-700 dark:text-gray-300';
  }

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/20 dark:bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed right-0 top-0 z-40 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-indigo-500" />
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Stamp History</p>
              <p className="text-xs text-gray-400">{programName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex animate-pulse gap-3">
                  <div className="mt-1 h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-3/4 rounded bg-gray-100 dark:bg-gray-800" />
                    <div className="h-2.5 w-1/2 rounded bg-gray-100 dark:bg-gray-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <p className="py-8 text-center text-sm text-red-500">Failed to load history.</p>
          ) : history.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No stamp history yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-800/50"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold dark:bg-gray-800">
                    {entryIcon(entry.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium capitalize ${entryColor(entry.type)}`}>
                        {entry.type === 'earned' ? `+${entry.stamps}` : entry.type === 'redeemed' ? `-${entry.stamps}` : `${entry.stamps}`} stamp{Math.abs(entry.stamps) !== 1 ? 's' : ''} {entry.type}
                      </span>
                    </div>
                    {(entry.orderId ?? entry.orderReference) && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                        <ShoppingBag className="h-3 w-3" />
                        Order {entry.orderReference ?? entry.orderId}
                      </div>
                    )}
                    {entry.note && (
                      <p className="mt-0.5 text-xs text-gray-400">{entry.note}</p>
                    )}
                    <time className="mt-1 block text-xs text-gray-400">{formatDate(entry.createdAt)}</time>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
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

function ProgramCard({ program, onViewHistory }: { program: StampProgram; onViewHistory: (programId: string, programName: string) => void }) {
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

      {/* Stamp dots preview */}
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

      {/* View History button */}
      <button
        onClick={() => onViewHistory(program.id, program.name)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
      >
        <History className="h-3.5 w-3.5" />
        View History
      </button>
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function StampsClient() {
  const [showModal, setShowModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [historyPanel, setHistoryPanel] = useState<{ programId: string; programName: string } | null>(null);

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowIssueModal(true)}
            className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/40 transition-colors"
          >
            <Send className="h-4 w-4" />
            Issue Stamps
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Create Stamp Card
          </button>
        </div>
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
            <ProgramCard
              key={program.id}
              program={program}
              onViewHistory={(id, name) => setHistoryPanel({ programId: id, programName: name })}
            />
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

      {/* Issue stamps modal */}
      {showIssueModal && (
        <IssueStampsModal
          onClose={() => setShowIssueModal(false)}
        />
      )}

      {/* History side panel */}
      {historyPanel && (
        <StampHistoryPanel
          programId={historyPanel.programId}
          programName={historyPanel.programName}
          onClose={() => setHistoryPanel(null)}
        />
      )}
    </div>
  );
}
