'use client';

import { useState } from 'react';
import { Plus, Megaphone, Mail, MessageSquare, Tag, Calendar, X } from 'lucide-react';
import { useCampaigns } from '@/lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';
import type { Campaign } from '@/lib/api';
import { formatDate } from '@/lib/formatting';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  sent: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

const typeIcons: Record<string, React.ElementType> = {
  email: Mail,
  sms: MessageSquare,
  push: MessageSquare,
  discount: Tag,
  points_multiplier: Tag,
};

const typeColors: Record<string, string> = {
  email: 'bg-blue-50 text-blue-600',
  sms: 'bg-green-50 text-green-600',
  push: 'bg-indigo-50 text-indigo-600',
  discount: 'bg-orange-50 text-orange-600',
  points_multiplier: 'bg-yellow-50 text-yellow-600',
};


// ─── Create Campaign Modal ─────────────────────────────────────────────────────

type CampaignType = 'email' | 'sms' | 'push' | 'discount' | 'points_multiplier';

function CreateCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<CampaignType>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    setSaving(true);
    try {
      await apiFetch('campaigns', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), type, subject: subject.trim() || undefined, body: body.trim() || undefined, status: 'draft' }),
      });
      toast({ title: 'Campaign created', description: `"${name}" saved as draft.`, variant: 'success' });
      onCreated();
      onClose();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to create campaign');
      setError(msg);
      toast({ title: 'Failed to create campaign', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Create Campaign</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4 p-6">
          {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{error}</div>}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Campaign Name <span className="text-red-500">*</span></label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Promotion" className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as CampaignType)} className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="push">Push Notification</option>
              <option value="discount">Discount</option>
              <option value="points_multiplier">Points Multiplier</option>
            </select>
          </div>
          {(type === 'email' || type === 'sms' || type === 'push') && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Subject / Title</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Message Body</label>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Campaign message…" className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
            </>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={saving || !name.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Creating…' : 'Save as Draft'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function CampaignsClient() {
  const { toast: _toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useCampaigns();
  const campaigns = data?.data ?? [];
  const active = campaigns.filter((c) => c.status === 'active').length;
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      {showCreate && (
        <CreateCampaignModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { queryClient.invalidateQueries({ queryKey: ['campaigns'] }); }}
        />
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Campaigns</h2>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${campaigns.length} campaigns · ${active} active`}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" /> Create Campaign
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Campaigns', value: isLoading ? '—' : active.toString(), icon: Megaphone },
          { label: 'Total Reach', value: isLoading ? '—' : campaigns.reduce((s, c) => s + (c.recipientCount ?? 0), 0).toLocaleString(), icon: Mail },
          { label: 'Total Campaigns', value: isLoading ? '—' : campaigns.length.toString(), icon: MessageSquare },
          { label: 'Drafts', value: isLoading ? '—' : campaigns.filter((c) => c.status === 'draft').length.toString(), icon: Tag },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
              <stat.icon className="h-4 w-4 text-gray-400" />
            </div>
            <p className="mt-1.5 text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Campaign list */}
      {isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-500 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400">
          Failed to load campaigns.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Campaign</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Type</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Reach</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Schedule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="px-5 py-3.5">
                          <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: '80%' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : campaigns.map((c: Campaign) => {
                    const Icon = typeIcons[c.type] ?? Megaphone;
                    const colorClass = typeColors[c.type] ?? 'bg-gray-50 text-gray-600';
                    return (
                      <tr key={c.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`rounded-lg p-2 ${colorClass}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</p>
                              <p className="text-xs text-gray-400">{c.id.slice(0, 8)} · {c.type}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400 capitalize">
                          {c.type.replace('_', ' ')}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[c.status] ?? 'bg-gray-100 text-gray-500'}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                          {c.recipientCount ? c.recipientCount.toLocaleString() : '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                            <Calendar className="h-3.5 w-3.5" />
                            {c.scheduledAt ? formatDate(c.scheduledAt, { month: 'short', day: 'numeric' }) : c.sentAt ? `Sent ${formatDate(c.sentAt, { month: 'short', day: 'numeric' })}` : 'Not scheduled'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              {!isLoading && campaigns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                    No campaigns yet. Create your first campaign to engage customers.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
