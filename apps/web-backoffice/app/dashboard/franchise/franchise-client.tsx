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
  X,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatDate, getErrorMessage } from '@/lib/formatting';
import { useToast } from '@/lib/use-toast';

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

// ─── Add Location Modal ───────────────────────────────────────────────────────

interface AddLocationModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function AddLocationModal({ onClose, onSaved }: AddLocationModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    locationId: '',
    franchiseeOrgId: '',
    franchiseeContactName: '',
    franchiseeEmail: '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Ensure a franchise group exists, then add the location to it
      const groupsRes = await apiFetch<{ data: { id: string }[] }>('franchise/groups');
      let groupId: string;
      if (groupsRes.data.length > 0) {
        groupId = groupsRes.data[0].id;
      } else {
        // Create a default franchise group
        const newGroup = await apiFetch<{ data: { id: string } }>('franchise/groups', {
          method: 'POST',
          body: JSON.stringify({ name: 'Default Franchise Group' }),
        });
        groupId = newGroup.data.id;
      }
      await apiFetch(`franchise/groups/${groupId}/locations`, {
        method: 'POST',
        body: JSON.stringify({
          locationId: form.locationId,
          franchiseeOrgId: form.franchiseeOrgId,
          franchiseeContactName: form.franchiseeContactName || undefined,
          franchiseeEmail: form.franchiseeEmail || undefined,
        }),
      });
      toast({ title: 'Location added', description: 'The franchise location has been added to the network.', variant: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to add location.');
      toast({ title: 'Failed to add location', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add Franchise Location</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4 p-6">
          {[
            { key: 'locationId' as const, label: 'Location ID', placeholder: 'Location UUID', type: 'text' },
            { key: 'franchiseeOrgId' as const, label: 'Franchisee Org ID', placeholder: 'Franchisee Organisation UUID', type: 'text' },
            { key: 'franchiseeContactName' as const, label: 'Contact Name', placeholder: 'Jane Smith', type: 'text' },
            { key: 'franchiseeEmail' as const, label: 'Contact Email', placeholder: 'manager@franchise.com', type: 'email' },
          ].map(({ key, label, placeholder, type }) => (
            <div key={key}>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
              <input
                required={key === 'locationId' || key === 'franchiseeOrgId'}
                type={type}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          ))}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              Cancel
            </button>
            <button type="submit" disabled={saving || !form.locationId || !form.franchiseeOrgId} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Adding…' : 'Add Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Policy Modal ─────────────────────────────────────────────────────────

interface AddPolicyModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function AddPolicyModal({ onClose, onSaved }: AddPolicyModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    fieldPath: '',
    lockType: 'locked' as 'locked' | 'store_managed' | 'hq_default',
    description: '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Ensure a franchise group exists, then add the policy to it
      const groupsRes = await apiFetch<{ data: { id: string }[] }>('franchise/groups');
      let groupId: string;
      if (groupsRes.data.length > 0) {
        groupId = groupsRes.data[0].id;
      } else {
        const newGroup = await apiFetch<{ data: { id: string } }>('franchise/groups', {
          method: 'POST',
          body: JSON.stringify({ name: 'Default Franchise Group' }),
        });
        groupId = newGroup.data.id;
      }
      await apiFetch(`franchise/groups/${groupId}/policies`, {
        method: 'POST',
        body: JSON.stringify({
          fieldPath: form.fieldPath,
          lockType: form.lockType,
          description: form.description || undefined,
        }),
      });
      toast({ title: 'Policy added', description: `Field lock for "${form.fieldPath}" has been created.`, variant: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to add policy.');
      toast({ title: 'Failed to add policy', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add Policy</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Field Path</label>
            <input
              required
              value={form.fieldPath}
              onChange={(e) => setForm((f) => ({ ...f, fieldPath: e.target.value }))}
              placeholder="e.g. menu.pricing"
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Lock Type</label>
            <select
              value={form.lockType}
              onChange={(e) => setForm((f) => ({ ...f, lockType: e.target.value as 'locked' | 'store_managed' | 'hq_default' }))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="locked">Locked</option>
              <option value="hq_default">HQ Default</option>
              <option value="store_managed">Store Managed</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description <span className="text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Describe the policy..."
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              Cancel
            </button>
            <button type="submit" disabled={saving || !form.fieldPath} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving…' : 'Add Policy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FranchiseClient() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('network');
  const [locations, setLocations] = useState<FranchiseeLocation[]>([]);
  const [statements, setStatements] = useState<RoyaltyStatement[]>([]);
  const [policies, setPolicies] = useState<FranchisePolicy[]>([]);
  const [compliance, setCompliance] = useState<ComplianceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [showAddPolicy, setShowAddPolicy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch franchise groups first, then load nested data from the first group
      const groupsRes = await apiFetch<{ data: { id: string }[] }>('franchise/groups').catch(() => ({ data: [] }));
      const groupId = groupsRes.data[0]?.id;
      if (!groupId) {
        setLocations([]);
        setStatements([]);
        setPolicies([]);
        setCompliance([]);
        return;
      }
      const [locsRes, polsRes] = await Promise.all([
        apiFetch<unknown>(`franchise/groups/${groupId}/locations`).catch(() => null),
        apiFetch<unknown>(`franchise/groups/${groupId}/policies`).catch(() => null),
      ]);
      setLocations(extractList(locsRes, []));
      setPolicies(extractList(polsRes, []));
      // Royalty statements and compliance checks use flat routes that may not exist yet;
      // keep fetches but gracefully fall back to empty arrays
      const [stmtsRes, compRes] = await Promise.all([
        apiFetch<unknown>('franchise/royalty-statements').catch(() => null),
        apiFetch<unknown>('franchise/compliance-checks').catch(() => null),
      ]);
      setStatements(extractList(stmtsRes, []));
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

  async function handleGenerateStatements() {
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    try {
      await apiFetch('franchise/statements/generate', {
        method: 'POST',
        body: JSON.stringify({ month }),
      });
      toast({ title: 'Statements generated', description: `Royalty statements for ${month} have been generated.`, variant: 'success' });
      void load();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to generate statements.');
      toast({ title: 'Failed to generate statements', description: msg, variant: 'destructive' });
    }
  }

  async function handleRunComplianceCheck() {
    try {
      const result = await apiFetch<{ message?: string; summary?: string }>('franchise/compliance/check', { method: 'POST' });
      const description = result?.message ?? result?.summary ?? 'Compliance check completed.';
      toast({ title: 'Compliance check complete', description, variant: 'success' });
      void load();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to run compliance check.');
      toast({ title: 'Compliance check failed', description: msg, variant: 'destructive' });
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'network', label: 'Network' },
    { key: 'royalties', label: 'Royalties' },
    { key: 'policies', label: 'Policies' },
    { key: 'compliance', label: 'Compliance' },
  ];

  return (
    <div className="space-y-6">
      {/* Modals */}
      {showAddLocation && (
        <AddLocationModal
          onClose={() => setShowAddLocation(false)}
          onSaved={() => { void load(); }}
        />
      )}
      {showAddPolicy && (
        <AddPolicyModal
          onClose={() => setShowAddPolicy(false)}
          onSaved={() => { void load(); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Franchise Network</h2>
          <p className="text-sm text-gray-500">
            {loading ? 'Loading…' : `${locations.length} locations · ${activeLocations} active`}
          </p>
        </div>
        <button
          onClick={() => setShowAddLocation(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
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
          {activeTab === 'royalties' && (
            <RoyaltiesTab statements={statements} onGenerateStatements={() => void handleGenerateStatements()} />
          )}
          {activeTab === 'policies' && (
            <PoliciesTab policies={policies} onAddPolicy={() => setShowAddPolicy(true)} />
          )}
          {activeTab === 'compliance' && (
            <ComplianceTab checks={compliance} onRunCheck={() => void handleRunComplianceCheck()} />
          )}
        </>
      )}
    </div>
  );
}

// ─── Network tab ──────────────────────────────────────────────────────────────

function NetworkTab({ locations }: { locations: FranchiseeLocation[] }) {
  if (locations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center dark:border-gray-700">
        <Building2 className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="font-medium text-gray-700 dark:text-gray-300">No franchise locations yet</p>
        <p className="mt-1 text-sm text-gray-500">Add your first franchise location to get started.</p>
      </div>
    );
  }
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

function RoyaltiesTab({
  statements,
  onGenerateStatements,
}: {
  statements: RoyaltyStatement[];
  onGenerateStatements: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={onGenerateStatements}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
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
            {statements.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                  No royalty statements yet. Generate statements to get started.
                </td>
              </tr>
            ) : (
              statements.map((stmt) => (
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Policies tab ─────────────────────────────────────────────────────────────

function PoliciesTab({
  policies,
  onAddPolicy,
}: {
  policies: FranchisePolicy[];
  onAddPolicy: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={onAddPolicy}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
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
            {policies.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                  No policies configured yet. Add a policy to control franchise settings.
                </td>
              </tr>
            ) : (
            policies.map((policy) => (
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
            ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Compliance tab ───────────────────────────────────────────────────────────

function ComplianceTab({
  checks,
  onRunCheck,
}: {
  checks: ComplianceCheck[];
  onRunCheck: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={onRunCheck}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
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
            {checks.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                  No compliance checks yet. Run a compliance check to see results.
                </td>
              </tr>
            ) : (
              checks.map((check) => (
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
