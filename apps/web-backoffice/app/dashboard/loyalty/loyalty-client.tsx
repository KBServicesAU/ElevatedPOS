'use client';

import { useState } from 'react';
import { Star, TrendingUp, Gift, Plus, Users, X } from 'lucide-react';
import { useLoyaltyPrograms } from '@/lib/hooks';
import type { LoyaltyProgram, LoyaltyTier } from '@/lib/api';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';

const tierColors: Record<string, string> = {
  Bronze: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Silver: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  Gold: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  Platinum: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

// ─── Program Modal (Create or Edit) ──────────────────────────────────────────

interface ProgramModalProps {
  program?: LoyaltyProgram;   // present → edit mode
  onClose: () => void;
  onSaved: () => void;
}

function ProgramModal({ program, onClose, onSaved }: ProgramModalProps) {
  const { toast } = useToast();
  const isEdit = !!program;
  const [name, setName] = useState(program?.name ?? '');
  // v2.7.40 — field flipped from "points per $1 spent" to "dollars per point".
  const [dollarsPerPoint, setDollarsPerPoint] = useState(
    String(program?.dollarsPerPoint ?? program?.earnRate ?? '1'),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const normalised = Math.max(1, Math.round(parseFloat(dollarsPerPoint)) || 1);
      const body = JSON.stringify({ name: name.trim(), dollarsPerPoint: normalised, active: true });
      if (isEdit && program) {
        await apiFetch(`programs/${program.id}`, {
          method: 'PATCH',
          body,
        });
        toast({ title: 'Program updated', description: `"${name.trim()}" has been updated.`, variant: 'success' });
      } else {
        await apiFetch('programs', {
          method: 'POST',
          body,
        });
        toast({ title: 'Program created', description: `"${name.trim()}" has been created.`, variant: 'success' });
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = isEdit ? getErrorMessage(err, 'Failed to update program') : (err instanceof Error ? err.message : 'Failed to create program');
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Loyalty Program' : 'Create Loyalty Program'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSave(e)} className="space-y-5 p-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Program Name <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rewards Club"
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Dollars required to earn 1 point
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={dollarsPerPoint}
              onChange={(e) => setDollarsPerPoint(e.target.value)}
              className="w-32 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Customers earn 1 point for every ${dollarsPerPoint || '1'} spent.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Program')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LoyaltyClient() {
  const { data, isLoading, isError, refetch } = useLoyaltyPrograms();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProgram, setEditingProgram] = useState<LoyaltyProgram | null>(null);
  const programs = data?.data ?? [];
  const program = programs[0] as LoyaltyProgram | undefined;
  const tiers: LoyaltyTier[] = program?.tiers ?? [];
  const totalMembers = tiers.reduce((sum, t) => sum + (t.memberCount ?? 0), 0);

  function handleSaved() {
    void refetch?.();
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Loyalty Program</h2>
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
        <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 h-48" />
      </div>
    );
  }

  if (isError || !program) {
    return (
      <div className="space-y-6">
        {showCreateModal && (
          <ProgramModal
            onClose={() => setShowCreateModal(false)}
            onSaved={handleSaved}
          />
        )}
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Loyalty Program</h2>
          <p className="text-sm text-gray-400">No loyalty program configured yet.</p>
        </div>
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center dark:border-gray-700">
          <Star className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">Create your first loyalty program to start rewarding customers.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 flex items-center gap-2 mx-auto rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> Create Program
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showCreateModal && (
        <ProgramModal
          onClose={() => setShowCreateModal(false)}
          onSaved={handleSaved}
        />
      )}
      {editingProgram && (
        <ProgramModal
          program={editingProgram}
          onClose={() => setEditingProgram(null)}
          onSaved={handleSaved}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Loyalty Program</h2>
          <p className="text-sm text-gray-500">{totalMembers} active members</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> New Reward
        </button>
      </div>

      {/* Program overview */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{program.name}</h3>
            <p className="mt-0.5 text-sm text-gray-500">
              Earn 1 point per ${program.dollarsPerPoint ?? program.earnRate} spent
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${program.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
            >
              {program.active ? 'Active' : 'Inactive'}
            </span>
            <button
              onClick={() => setEditingProgram(program)}
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              Edit
            </button>
          </div>
        </div>
        {tiers.length > 0 && (
          <div className={`mt-4 grid gap-3 grid-cols-${Math.min(tiers.length, 4)}`}>
            {tiers.map((tier) => (
              <div key={tier.id} className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tierColors[tier.name] ?? 'bg-gray-100 text-gray-600'}`}>
                  {tier.name}
                </span>
                <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">
                  {(tier.memberCount ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">members</p>
                <p className="mt-1 text-xs text-gray-400">
                  {tier.maxPoints ? `${tier.minPoints}–${tier.maxPoints} pts` : `${tier.minPoints}+ pts`}
                </p>
                <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  {tier.multiplier}× multiplier
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Members', value: totalMembers.toLocaleString(), icon: Users, color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
          { label: 'Tiers Configured', value: tiers.length.toString(), icon: Star, color: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' },
          { label: 'Earn Rate', value: `$${program.dollarsPerPoint ?? program.earnRate} / point`, icon: Gift, color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' },
          { label: 'Top Tier', value: tiers[tiers.length - 1]?.name ?? '—', icon: TrendingUp, color: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
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
    </div>
  );
}
