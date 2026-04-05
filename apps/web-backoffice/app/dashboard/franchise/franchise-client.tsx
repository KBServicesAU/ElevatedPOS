'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  MapPin,
  DollarSign,
  ShieldCheck,
  Lock,
  Calendar,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/formatting';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FranchiseeLocation {
  id: string;
  locationId: string;
  franchiseeContactName: string;
  franchiseeEmail: string;
  status: 'active' | 'suspended' | 'terminated';
  joinedAt: string;
  todayRevenue: number;
}

interface RoyaltyStatement {
  id: string;
  period: string;
  locationId: string;
  franchiseeContact: string;
  grossSales: number;
  royaltyRate: number;
  royaltyAmount: number;
  status: 'paid' | 'issued' | 'draft' | 'disputed';
  issuedAt: string | null;
}

interface FranchisePolicy {
  id: string;
  fieldPath: string;
  lockType: 'locked' | 'hq_default' | 'store_managed';
  description: string;
  updatedAt: string;
}

interface ComplianceCheck {
  id: string;
  locationId: string;
  franchiseeContact: string;
  checkType: string;
  status: 'compliant' | 'non_compliant' | 'pending';
  checkedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);
}

function extractList<T>(res: unknown, fallback: T[]): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && 'data' in res && Array.isArray((res as { data: unknown }).data)) {
    return (res as { data: T[] }).data;
  }
  return fallback;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  terminated: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  issued: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  disputed: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  compliant: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  non_compliant: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const lockTypeColors: Record<string, string> = {
  locked: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  hq_default: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  store_managed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

type Tab = 'network' | 'royalties' | 'policies' | 'compliance';

// ─── Main component ───────────────────────────────────────────────────────────

export function FranchiseClient() {
  const [activeTab, setActiveTab] = useState<Tab>('network');
  const [locations, setLocations] = useState<FranchiseeLocation[]>([]);
  const [statements, setStatements] = useState<RoyaltyStatement[]>([]);
  const [policies, setPolicies] = useState<FranchisePolicy[]>([]);
  const [compliance, setCompliance] = useState<ComplianceCheck[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [locsRes, stmtsRes, polsRes, compRes] = await Promise.all([
        apiFetch<unknown>('franchise/franchisees').catch(() => null),
        apiFetch<unknown>('franchise/royalty-statements').catch(() => null),
        apiFetch<unknown>('franchise/policies').catch(() => null),
        apiFetch<unknown>('franchise/compliance-checks').catch(() => null),
      ]);
      setLocations(extractList(locsRes, []));
      setStatements(extractList(stmtsRes, []));
      setPolicies(extractList(polsRes, []));
      setCompliance(extractList(compRes, []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeLocations = locations.filter((l) => l.status === 'active').length;
  const totalRoyalties = statements.filter((s) => s.status !== 'draft').reduce((sum, s) => sum + s.royaltyAmount, 0);
  const draftStatements = statements.filter((s) => s.status === 'draft').length;
  const nonCompliantChecks = compliance.filter((c) => c.status === 'non_compliant').length;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'network', label: 'Network' },
    { key: 'royalties', label: 'Royalties' },
    { key: 'policies', label: 'Policies' },
    { key: 'compliance', label: 'Compliance' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Franchise Network</h2>
          <p className="text-sm text-gray-500">
            {loading ? 'Loading…' : `${locations.length} locations · ${activeLocations} active`}
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" /> Add Location
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Locations', value: loading ? '—' : activeLocations.toString(), icon: MapPin },
          { label: 'Total Locations', value: loading ? '—' : locations.length.toString(), icon: Building2 },
          { label: 'Royalties Collected', value: loading ? '—' : formatCurrency(totalRoyalties), icon: DollarSign },
          { label: 'Pending Reviews', value: loading ? '—' : (draftStatements + nonCompliantChecks).toString(), icon: ShieldCheck },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
              <stat.icon className="h-4 w-4 text-gray-400" />
            </div>
            <p className="mt-1.5 text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800" />
          ))}
        </div>
      ) : (
        <>
          {activeTab === 'network' && <NetworkTab locations={locations} />}
          {activeTab === 'royalties' && <RoyaltiesTab statements={statements} />}
          {activeTab === 'policies' && <PoliciesTab policies={policies} />}
          {activeTab === 'compliance' && <ComplianceTab checks={compliance} />}
        </>
      )}
    </div>
  );
}

// ─── Network tab ──────────────────────────────────────────────────────────────

function NetworkTab({ locations }: { locations: FranchiseeLocation[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {locations.map((loc) => (
        <div
          key={loc.id}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
                <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{loc.franchiseeContactName}</p>
                <p className="text-xs text-gray-400">{loc.franchiseeEmail}</p>
              </div>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[loc.status] ?? ''}`}>
              {loc.status}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400">Today&apos;s Revenue</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
                {loc.status === 'active' ? formatCurrency(loc.todayRevenue) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Joined</p>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                <Calendar className="h-3 w-3" />
                {formatDate(loc.joinedAt)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Royalties tab ────────────────────────────────────────────────────────────

function RoyaltiesTab({ statements }: { statements: RoyaltyStatement[] }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
          <RefreshCw className="h-4 w-4" /> Generate Statements
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              {['Period', 'Location', 'Gross Sales', 'Royalty Amount', 'Status', 'Issued'].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {statements.map((stmt) => (
              <tr key={stmt.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{stmt.period}</td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{stmt.franchiseeContact}</td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{formatCurrency(stmt.grossSales)}</td>
                <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(stmt.royaltyAmount)}</td>
                <td className="px-5 py-3.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[stmt.status] ?? ''}`}>
                    {stmt.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">{formatDate(stmt.issuedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Policies tab ─────────────────────────────────────────────────────────────

function PoliciesTab({ policies }: { policies: FranchisePolicy[] }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" /> Add Policy
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              {['Field Path', 'Lock Type', 'Description', 'Last Updated'].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {policies.map((policy) => (
              <tr key={policy.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-gray-400" />
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {policy.fieldPath}
                    </code>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${lockTypeColors[policy.lockType] ?? ''}`}>
                    {policy.lockType.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{policy.description}</td>
                <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">{formatDate(policy.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Compliance tab ───────────────────────────────────────────────────────────

function ComplianceTab({ checks }: { checks: ComplianceCheck[] }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
          <RefreshCw className="h-4 w-4" /> Run Compliance Check
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              {['Location', 'Check Type', 'Status', 'Checked At'].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {checks.map((check) => (
              <tr key={check.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-5 py-3.5 text-sm text-gray-900 dark:text-white">{check.franchiseeContact}</td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{check.checkType.replace(/_/g, ' ')}</td>
                <td className="px-5 py-3.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[check.status] ?? ''}`}>
                    {check.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">{formatDate(check.checkedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
