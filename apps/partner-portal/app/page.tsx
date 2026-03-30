import Link from 'next/link';
import { Sidebar } from './components/Sidebar';
import {
  TrendingUp,
  Users,
  MapPin,
  DollarSign,
  ArrowRight,
  Activity,
} from 'lucide-react';

const stats = [
  { label: 'Total Tenants', value: '24', icon: Users, trend: '+2 this month', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { label: 'Monthly Revenue', value: '$18,400', icon: DollarSign, trend: '+12% vs last month', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { label: 'Active Locations', value: '67', icon: MapPin, trend: '+5 this month', color: 'text-amber-600', bg: 'bg-amber-50' },
  { label: 'Avg MRR / Tenant', value: '$767', icon: TrendingUp, trend: '+$43 vs last month', color: 'text-purple-600', bg: 'bg-purple-50' },
];

const recentActivity = [
  { time: '2h ago', event: 'New tenant provisioned', detail: 'Brew & Bean Coffee Co — Growth plan', type: 'provision' },
  { time: '5h ago', event: 'Invoice generated', detail: 'September billing cycle — $18,400', type: 'billing' },
  { time: '1d ago', event: 'Tenant upgraded plan', detail: 'Sunrise Bakery — Starter → Growth', type: 'upgrade' },
  { time: '2d ago', event: 'Support ticket resolved', detail: 'Metro Grill — POS connectivity issue', type: 'support' },
  { time: '3d ago', event: 'New tenant provisioned', detail: 'Harborview Bistro — Pro plan', type: 'provision' },
  { time: '5d ago', event: 'Tenant suspended', detail: 'Old Riverside Bar — Payment overdue', type: 'suspend' },
];

const TYPE_BADGES: Record<string, string> = {
  provision: 'bg-emerald-100 text-emerald-700',
  billing: 'bg-blue-100 text-blue-700',
  upgrade: 'bg-indigo-100 text-indigo-700',
  support: 'bg-amber-100 text-amber-700',
  suspend: 'bg-red-100 text-red-700',
};

const quickActions = [
  { href: '/tenants/new', label: 'Provision New Tenant', icon: Users, color: 'bg-indigo-600 hover:bg-indigo-500 text-white' },
  { href: '/tenants', label: 'View All Tenants', icon: ArrowRight, color: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200' },
  { href: '/billing', label: 'Billing Overview', icon: DollarSign, color: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200' },
];

export default function PartnerDashboard() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Partner Dashboard</h1>
            <p className="text-sm text-slate-500">Welcome back, Acme Resellers</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full font-medium">
              <Activity className="w-3 h-3 inline mr-1" />All systems operational
            </span>
          </div>
        </header>

        <div className="p-8 space-y-8">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-5">
            {stats.map(({ label, value, icon: Icon, trend, color, bg }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-sm text-slate-500 font-medium">{label}</p>
                  <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon className={`w-4.5 h-4.5 ${color}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900 mb-1">{value}</p>
                <p className="text-xs text-slate-400">{trend}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Recent Activity */}
            <div className="col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Recent Activity</h2>
                <Link href="/tenants" className="text-xs text-indigo-600 hover:text-indigo-500">View all →</Link>
              </div>
              <div className="divide-y divide-slate-50">
                {recentActivity.map((item, i) => (
                  <div key={i} className="px-6 py-3.5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                    <div className="text-xs text-slate-400 w-12 flex-shrink-0">{item.time}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{item.event}</p>
                      <p className="text-xs text-slate-500 truncate">{item.detail}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${TYPE_BADGES[item.type]}`}>
                      {item.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Quick Actions</h2>
              </div>
              <div className="p-5 space-y-3">
                {quickActions.map(({ href, label, icon: Icon, color }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${color}`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                ))}
              </div>

              {/* Plan distribution */}
              <div className="px-5 pb-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Plan Distribution</h3>
                <div className="space-y-2">
                  {[
                    { plan: 'Pro', count: 8, pct: 33, color: 'bg-indigo-500' },
                    { plan: 'Growth', count: 11, pct: 46, color: 'bg-emerald-500' },
                    { plan: 'Starter', count: 5, pct: 21, color: 'bg-amber-400' },
                  ].map((p) => (
                    <div key={p.plan}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-600">{p.plan}</span>
                        <span className="text-slate-400">{p.count} tenants</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${p.color} rounded-full`} style={{ width: `${p.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
