import type { Metadata } from 'next';
import { Star, TrendingUp, Gift, Plus, Users } from 'lucide-react';

export const metadata: Metadata = { title: 'Loyalty' };

const program = {
  name: 'NEXUS Rewards',
  earnRate: 10, // points per $1
  tiers: [
    { name: 'Bronze', min: 0, max: 499, multiplier: 1.0, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', members: 342 },
    { name: 'Silver', min: 500, max: 999, multiplier: 1.25, color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', members: 218 },
    { name: 'Gold', min: 1000, max: 2499, multiplier: 1.5, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', members: 198 },
    { name: 'Platinum', min: 2500, max: null, multiplier: 2.0, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', members: 89 },
  ],
};

const recentActivity = [
  { customer: 'Emma Davis', action: 'Earned', points: 120, balance: 2100, time: '5 min ago', tier: 'Platinum' },
  { customer: 'Sarah Chen', action: 'Redeemed', points: -500, balance: 1240, time: '22 min ago', tier: 'Gold' },
  { customer: 'Aisha Patel', action: 'Earned', points: 65, balance: 1580, time: '1h ago', tier: 'Gold' },
  { customer: 'New Member', action: 'Enrolled', points: 0, balance: 0, time: '2h ago', tier: 'Bronze' },
  { customer: 'James Wilson', action: 'Earned', points: 48, balance: 830, time: '3h ago', tier: 'Silver' },
];

export default function LoyaltyPage() {
  const totalMembers = program.tiers.reduce((sum, t) => sum + t.members, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Loyalty Program</h2>
          <p className="text-sm text-gray-500">{totalMembers} active members</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-700">
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
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</span>
            <button className="text-sm text-nexus-600 hover:text-nexus-700">Edit</button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {program.tiers.map((tier) => (
            <div key={tier.name} className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tier.color}`}>
                {tier.name}
              </span>
              <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">{tier.members}</p>
              <p className="text-xs text-gray-500">members</p>
              <p className="mt-1 text-xs text-gray-400">
                {tier.max ? `${tier.min}–${tier.max} pts` : `${tier.min}+ pts`}
              </p>
              <p className="text-xs font-medium text-nexus-600 dark:text-nexus-400">{tier.multiplier}× multiplier</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Stats */}
        <div className="space-y-4">
          {[
            { label: 'Points Issued (MTD)', value: '284,500', icon: Star, color: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' },
            { label: 'Points Redeemed (MTD)', value: '92,800', icon: Gift, color: 'bg-nexus-50 text-nexus-600 dark:bg-nexus-900/30 dark:text-nexus-400' },
            { label: 'Redemption Rate', value: '32.6%', icon: TrendingUp, color: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
            { label: 'New Members (MTD)', value: '47', icon: Users, color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
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

        {/* Recent activity */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500 dark:bg-gray-800">
                    {a.customer.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{a.customer}</p>
                    <p className="text-xs text-gray-400">{a.time}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${
                    a.action === 'Earned' ? 'text-green-600 dark:text-green-400' :
                    a.action === 'Redeemed' ? 'text-red-600 dark:text-red-400' :
                    'text-nexus-600 dark:text-nexus-400'
                  }`}>
                    {a.action === 'Earned' ? '+' : ''}{a.points !== 0 ? `${a.points} pts` : a.action}
                  </p>
                  <p className="text-xs text-gray-400">Balance: {a.balance.toLocaleString()} pts</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
