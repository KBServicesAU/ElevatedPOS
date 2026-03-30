'use client';

import { Star, TrendingUp, Gift, Plus, Users } from 'lucide-react';
import { useLoyaltyPrograms } from '@/lib/hooks';
import type { LoyaltyProgram, LoyaltyTier } from '@/lib/api';

const tierColors: Record<string, string> = {
  Bronze: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Silver: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  Gold: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  Platinum: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

export function LoyaltyClient() {
  const { data, isLoading, isError } = useLoyaltyPrograms();
  const programs = data?.data ?? [];
  const program = programs[0] as LoyaltyProgram | undefined;
  const tiers: LoyaltyTier[] = program?.tiers ?? [];
  const totalMembers = tiers.reduce((sum, t) => sum + (t.memberCount ?? 0), 0);

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
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Loyalty Program</h2>
          <p className="text-sm text-gray-400">No loyalty program configured yet.</p>
        </div>
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center dark:border-gray-700">
          <Star className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">Create your first loyalty program to start rewarding customers.</p>
          <button className="mt-4 flex items-center gap-2 mx-auto rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> Create Program
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Loyalty Program</h2>
          <p className="text-sm text-gray-500">{totalMembers} active members</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" /> New Reward
        </button>
      </div>

      {/* Program overview */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{program.name}</h3>
            <p className="mt-0.5 text-sm text-gray-500">Earn {program.earnRate} pts per $1 spent</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${program.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
            >
              {program.active ? 'Active' : 'Inactive'}
            </span>
            <button className="text-sm text-indigo-600 hover:text-indigo-700">Edit</button>
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
          { label: 'Earn Rate', value: `${program.earnRate} pts/$`, icon: Gift, color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' },
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
