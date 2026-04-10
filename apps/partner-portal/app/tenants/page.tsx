'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sidebar } from '../components/Sidebar';
import { useState, useEffect, useRef } from 'react';
import { PLAN_STYLES, STATUS_STYLES } from '../../lib/styles';
import {
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  Settings,
  Ban,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  plan: 'Starter' | 'Growth' | 'Pro';
  locations: number;
  mrr: number;
  status: 'active' | 'suspended' | 'trial';
  lastActivity: string;
  email: string;
}

// PLAN_STYLES and STATUS_STYLES are imported from ../../lib/styles

export default function TenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch tenants from the partner API
  useEffect(() => {
    fetch('/api/tenants')
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data: { data?: Tenant[] } | Tenant[]) => {
        if (Array.isArray(data)) setTenants(data);
        else setTenants((data as { data?: Tenant[] }).data ?? []);
      })
      .catch((err) => { console.error('Failed to load tenants:', err); setTenants([]); })
      .finally(() => setLoading(false));
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    if (openMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenu]);

  const filtered = tenants.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === 'all' || t.plan === planFilter;
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchSearch && matchPlan && matchStatus;
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Tenants</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{loading ? '…' : `${tenants.length} total tenants`}</p>
          </div>
          <Link
            href="/tenants/new"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Provision Tenant
          </Link>
        </header>

        <div className="p-8">
          {/* Filters */}
          <div className="flex items-center gap-3 mb-5">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search tenants..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Plans</option>
              <option value="Starter">Starter</option>
              <option value="Growth">Growth</option>
              <option value="Pro">Pro</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="trial">Trial</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {['Tenant', 'Plan', 'Locations', 'MRR', 'Status', 'Last Activity', ''].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-900 dark:text-white">{tenant.name}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">{tenant.email}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_STYLES[tenant.plan]}`}>
                        {tenant.plan}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-400">{tenant.locations}</td>
                    <td className="px-5 py-4 text-slate-900 dark:text-white font-mono font-medium">
                      {tenant.mrr > 0 ? `$${tenant.mrr.toLocaleString()}` : <span className="text-slate-400 dark:text-slate-500">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[tenant.status]}`}>
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-400 dark:text-slate-500 text-xs">{tenant.lastActivity}</td>
                    <td className="px-5 py-4">
                      <div ref={openMenu === tenant.id ? menuRef : undefined} className="relative flex items-center gap-1">
                        <Link
                          href={`/tenants/${tenant.id}`}
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                          title="View"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
                        <Link
                          href={`/tenants/${tenant.id}?tab=settings`}
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                          title="Manage"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={() => setOpenMenu(openMenu === tenant.id ? null : tenant.id)}
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                        {openMenu === tenant.id && (
                          <div className="absolute right-0 top-8 z-10 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1">
                            <button
                              onClick={() => { router.push(`/tenants/${tenant.id}`); setOpenMenu(null); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" /> View Details
                            </button>
                            <button
                              onClick={() => { router.push(`/tenants/${tenant.id}?tab=settings`); setOpenMenu(null); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                              <Settings className="w-3.5 h-3.5" /> Manage
                            </button>
                            <button
                              onClick={() => { router.push(`/tenants/${tenant.id}?tab=settings&action=upgrade`); setOpenMenu(null); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                              <ChevronUp className="w-3.5 h-3.5" /> Upgrade Plan
                            </button>
                            <button
                              onClick={() => { router.push(`/tenants/${tenant.id}?tab=settings&action=downgrade`); setOpenMenu(null); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                              <ChevronDown className="w-3.5 h-3.5" /> Downgrade Plan
                            </button>
                            <hr className="my-1 border-slate-100 dark:border-slate-700" />
                            <button
                              onClick={() => { router.push(`/tenants/${tenant.id}?tab=settings&action=suspend`); setOpenMenu(null); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                            >
                              <Ban className="w-3.5 h-3.5" /> Suspend
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
                No tenants match your filters.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
