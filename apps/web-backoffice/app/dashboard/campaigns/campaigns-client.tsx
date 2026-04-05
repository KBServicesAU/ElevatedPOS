'use client';

import { useState } from 'react';
import {
  Plus, Megaphone, Mail, MessageSquare, Tag, Calendar, X,
  BarChart2, ChevronRight, ChevronLeft, Smartphone,
} from 'lucide-react';
import { useCampaigns } from '@/lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';
import type { Campaign } from '@/lib/api';
import { formatDate } from '@/lib/formatting';

// ─── Constants ────────────────────────────────────────────────────────────────

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

const EMAIL_BENCHMARK = 21.5; // industry average open rate %
const SMS_SEGMENTS = 160;

type CampaignType = 'email' | 'sms' | 'push' | 'discount' | 'points_multiplier';
type WinnerCriterion = 'open_rate' | 'click_rate' | 'conversion' | 'manual';
type TestDuration = '2h' | '4h' | '8h' | '24h';
type SendOption = 'now' | 'scheduled';

// ─── Shared input style ────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white';

// ─── SMS Phone Preview ─────────────────────────────────────────────────────────

function SmsPhonePreview({ fromName, message }: { fromName: string; message: string }) {
  return (
    <div className="flex justify-center py-2">
      <div className="relative w-48 rounded-3xl border-4 border-gray-700 bg-gray-900 p-2 shadow-lg dark:border-gray-600">
        {/* notch */}
        <div className="mx-auto mb-2 h-2 w-12 rounded-full bg-gray-700" />
        {/* screen */}
        <div className="min-h-[120px] rounded-2xl bg-gray-100 p-3 dark:bg-gray-800">
          <p className="mb-1 text-center text-[10px] font-semibold text-gray-500 dark:text-gray-400">
            {fromName || 'ElevatedPOS'}
          </p>
          <div className="rounded-xl rounded-tl-sm bg-white p-2 shadow-sm dark:bg-gray-700">
            <p className="text-[11px] leading-relaxed text-gray-800 dark:text-gray-200">
              {message || <span className="italic text-gray-400">Your message preview…</span>}
            </p>
          </div>
          <p className="mt-1 text-right text-[9px] text-gray-400">Now</p>
        </div>
        {/* home bar */}
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-700" />
      </div>
    </div>
  );
}

// ─── A/B Test Panel ────────────────────────────────────────────────────────────

interface AbConfig {
  enabled: boolean;
  variantASubject: string;
  variantBSubject: string;
  splitRatio: number; // percentage for A, e.g. 50
  winnerCriterion: WinnerCriterion;
  testDuration: TestDuration;
}

function AbTestPanel({
  type,
  config,
  onChange,
}: {
  type: CampaignType;
  config: AbConfig;
  onChange: (c: AbConfig) => void;
}) {
  const isSms = type === 'sms';
  const label = isSms ? 'Message' : 'Subject line';

  if (!config.enabled) return null;

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
        A/B Test Configuration
      </p>

      {/* Variant A */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Variant A — {label}
        </label>
        <input
          value={config.variantASubject}
          onChange={(e) => onChange({ ...config, variantASubject: e.target.value })}
          placeholder={`Variant A ${label.toLowerCase()}…`}
          className={inputCls}
        />
      </div>

      {/* Variant B */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Variant B — {label}
        </label>
        <input
          value={config.variantBSubject}
          onChange={(e) => onChange({ ...config, variantBSubject: e.target.value })}
          placeholder={`Variant B ${label.toLowerCase()}…`}
          className={inputCls}
        />
      </div>

      {/* Split ratio */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Split ratio</label>
          <span className="text-xs text-gray-500">
            A: {config.splitRatio}% / B: {100 - config.splitRatio}%
          </span>
        </div>
        <input
          type="range"
          min={10}
          max={90}
          step={5}
          value={config.splitRatio}
          onChange={(e) => onChange({ ...config, splitRatio: Number(e.target.value) })}
          className="w-full accent-indigo-600"
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
          <span>10/90</span>
          <span>50/50</span>
          <span>90/10</span>
        </div>
      </div>

      {/* Winner criterion */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Winner criterion
          </label>
          <select
            value={config.winnerCriterion}
            onChange={(e) => onChange({ ...config, winnerCriterion: e.target.value as WinnerCriterion })}
            className={inputCls}
          >
            <option value="open_rate">Open rate</option>
            <option value="click_rate">Click rate</option>
            <option value="conversion">Conversion</option>
            <option value="manual">Manual pick</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Test duration
          </label>
          <select
            value={config.testDuration}
            onChange={(e) => onChange({ ...config, testDuration: e.target.value as TestDuration })}
            className={inputCls}
          >
            <option value="2h">2 hours</option>
            <option value="4h">4 hours</option>
            <option value="8h">8 hours</option>
            <option value="24h">24 hours</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Panel ────────────────────────────────────────────────────────────

function SchedulePanel({
  sendOption,
  scheduledAt,
  onSendOptionChange,
  onScheduledAtChange,
}: {
  sendOption: SendOption;
  scheduledAt: string;
  onSendOptionChange: (v: SendOption) => void;
  onScheduledAtChange: (v: string) => void;
}) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="space-y-3">
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Send options
      </label>
      <div className="flex gap-3">
        {(['now', 'scheduled'] as SendOption[]).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onSendOptionChange(opt)}
            className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
              sendOption === opt
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/30 dark:text-indigo-300'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {opt === 'now' ? 'Send now' : 'Schedule for later'}
          </button>
        ))}
      </div>

      {sendOption === 'scheduled' && (
        <div>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => onScheduledAtChange(e.target.value)}
            className={inputCls}
          />
          <p className="mt-1 text-xs text-gray-400">
            Your timezone: {tz}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Create Campaign Modal ─────────────────────────────────────────────────────

function CreateCampaignModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Core fields
  const [name, setName] = useState('');
  const [type, setType] = useState<CampaignType>('email');
  const [audience, setAudience] = useState('all');

  // Email fields
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // SMS fields
  const [fromName, setFromName] = useState('ElevatedPOS');
  const [smsMessage, setSmsMessage] = useState('');

  // A/B Test
  const [abConfig, setAbConfig] = useState<AbConfig>({
    enabled: false,
    variantASubject: '',
    variantBSubject: '',
    splitRatio: 50,
    winnerCriterion: 'open_rate',
    testDuration: '4h',
  });

  // Schedule
  const [sendOption, setSendOption] = useState<SendOption>('now');
  const [scheduledAt, setScheduledAt] = useState('');

  // Derived
  const smsChars = smsMessage.length;
  const smsSegments = Math.ceil(smsChars / SMS_SEGMENTS) || 1;
  const isMultiSegment = smsChars > SMS_SEGMENTS;

  // Rough estimate: all = 1000 placeholder
  const audienceEstimates: Record<string, number> = {
    all: 1000,
    vip: 120,
    inactive_30d: 340,
    new_this_month: 85,
  };
  const recipientEstimate = audienceEstimates[audience] ?? 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (sendOption === 'scheduled' && !scheduledAt) {
      setError('Please pick a date/time to schedule.');
      return;
    }
    setError('');
    setSaving(true);

    // Build ISO timestamp for scheduledAt
    let scheduledIso: string | undefined;
    if (sendOption === 'scheduled' && scheduledAt) {
      scheduledIso = new Date(scheduledAt).toISOString();
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      type,
      status: sendOption === 'now' ? 'active' : 'scheduled',
      audience,
      ...(scheduledIso ? { scheduledAt: scheduledIso } : {}),
    };

    if (type === 'email') {
      payload.subject = subject.trim() || undefined;
      payload.body = body.trim() || undefined;
    }
    if (type === 'sms') {
      payload.fromName = fromName.trim();
      payload.message = smsMessage.trim();
    }
    if (type === 'push') {
      payload.subject = subject.trim() || undefined;
      payload.body = body.trim() || undefined;
    }
    if (abConfig.enabled) {
      payload.abTest = {
        variantA: abConfig.variantASubject,
        variantB: abConfig.variantBSubject,
        splitRatio: abConfig.splitRatio,
        winnerCriterion: abConfig.winnerCriterion,
        testDuration: abConfig.testDuration,
      };
    }

    try {
      await apiFetch('campaigns', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast({
        title: sendOption === 'now' ? 'Campaign launched' : 'Campaign scheduled',
        description:
          sendOption === 'now'
            ? `"${name}" is now active.`
            : `"${name}" scheduled for ${new Date(scheduledAt).toLocaleString()}.`,
        variant: 'success',
      });
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

  const isCommunication = type === 'email' || type === 'sms' || type === 'push';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-900 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Create Campaign</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => { void handleSubmit(e); }}
          className="space-y-4 p-6 overflow-y-auto flex-1"
        >
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Campaign Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Campaign Name <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Summer Promotion"
              className={inputCls}
            />
          </div>

          {/* Type selector — pill style for email/sms/push */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Campaign Type
            </label>
            <div className="flex gap-2 flex-wrap">
              {(['email', 'sms', 'push', 'discount', 'points_multiplier'] as CampaignType[]).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`rounded-lg border px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors ${
                      type === t
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/30 dark:text-indigo-300'
                        : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    {t === 'points_multiplier' ? 'Points ×' : t.replace('_', ' ')}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Audience */}
          {isCommunication && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Audience segment
              </label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className={inputCls}
              >
                <option value="all">All customers (~1,000)</option>
                <option value="vip">VIP members (~120)</option>
                <option value="inactive_30d">Inactive 30 days (~340)</option>
                <option value="new_this_month">New this month (~85)</option>
              </select>
              <p className="mt-1 text-xs text-gray-400">
                Estimated recipients: {recipientEstimate.toLocaleString()}
              </p>
            </div>
          )}

          {/* Email-specific fields */}
          {type === 'email' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Subject line
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Your email subject…"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Message body
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  placeholder="Campaign message…"
                  className={inputCls}
                />
              </div>
            </>
          )}

          {/* Push notification */}
          {type === 'push' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Notification title
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Push notification title…"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Notification body
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  placeholder="Notification message…"
                  className={inputCls}
                />
              </div>
            </>
          )}

          {/* SMS-specific fields */}
          {type === 'sms' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  From name
                </label>
                <input
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="ElevatedPOS"
                  maxLength={11}
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-gray-400">Displayed as sender ID (max 11 chars)</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Message
                  </label>
                  <span
                    className={`text-xs font-mono ${
                      isMultiSegment ? 'text-amber-500' : 'text-gray-400'
                    }`}
                  >
                    {smsChars} / {smsSegments * SMS_SEGMENTS} chars
                    {smsSegments > 1 ? ` (${smsSegments} segments)` : ''}
                  </span>
                </div>
                <textarea
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                  rows={4}
                  placeholder="Your SMS message…"
                  className={inputCls}
                />
                {isMultiSegment && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    Message exceeds 160 chars — will be split into {smsSegments} segments. This may
                    increase delivery cost.
                  </p>
                )}
              </div>

              {/* Phone preview */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex items-center gap-1.5 mb-2">
                  <Smartphone className="h-3.5 w-3.5 text-gray-400" />
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Preview
                  </p>
                </div>
                <SmsPhonePreview fromName={fromName} message={smsMessage} />
              </div>
            </>
          )}

          {/* A/B Test toggle — only for communication types */}
          {isCommunication && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAbConfig((c) => ({ ...c, enabled: !c.enabled }))}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                    abConfig.enabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                  role="switch"
                  aria-checked={abConfig.enabled}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      abConfig.enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  A/B Test
                </span>
              </div>

              <AbTestPanel type={type} config={abConfig} onChange={setAbConfig} />
            </div>
          )}

          {/* Schedule */}
          <SchedulePanel
            sendOption={sendOption}
            scheduledAt={scheduledAt}
            onSendOptionChange={setSendOption}
            onScheduledAtChange={setScheduledAt}
          />

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
              {saving
                ? 'Saving…'
                : sendOption === 'now'
                  ? 'Launch Campaign'
                  : 'Schedule Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Analytics Types ───────────────────────────────────────────────────────────

interface CampaignAnalytics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  converted: number;
  openRate: number;
  clickRate: number;
  revenue: number;
  opensPerDay: { date: string; opens: number }[];
  topLinks: { url: string; clicks: number }[];
}

// ─── Analytics Side Panel ──────────────────────────────────────────────────────

function AnalyticsPanel({
  campaign,
  onClose,
}: {
  campaign: Campaign;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<CampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Fetch on mount
  useState(() => {
    void (async () => {
      try {
        const res = await apiFetch<CampaignAnalytics>(`campaigns/${campaign.id}/analytics`);
        setData(res);
      } catch (e) {
        setErr(getErrorMessage(e, 'Failed to load analytics'));
        toast({ title: 'Analytics error', description: getErrorMessage(e), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  });

  const metrics = data
    ? [
        { label: 'Sent', value: data.sent.toLocaleString() },
        { label: 'Delivered', value: data.delivered.toLocaleString() },
        { label: 'Opened', value: data.opened.toLocaleString() },
        { label: 'Clicked', value: data.clicked.toLocaleString() },
        { label: 'Unsubscribed', value: data.unsubscribed.toLocaleString() },
        { label: 'Converted', value: data.converted.toLocaleString() },
      ]
    : [];

  const maxOpens = data
    ? Math.max(...data.opensPerDay.map((d) => d.opens), 1)
    : 1;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white shadow-2xl dark:bg-gray-900 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Campaign Analytics</h3>
            <p className="text-xs text-gray-500 truncate max-w-[240px]">{campaign.name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading && (
            <div className="space-y-3 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          )}

          {err && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {err}
            </div>
          )}

          {data && (
            <>
              {/* Key metrics grid */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Key Metrics
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {metrics.map((m) => (
                    <div
                      key={m.label}
                      className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-800 dark:bg-gray-800/50"
                    >
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{m.value}</p>
                      <p className="text-[10px] text-gray-500">{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Open rate vs benchmark */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Open Rate vs Benchmark
                </p>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50 space-y-3">
                  {/* Your open rate */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Your campaign</span>
                      <span className="text-xs font-semibold text-indigo-600">
                        {data.openRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className="h-2.5 rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${Math.min(data.openRate, 100)}%` }}
                      />
                    </div>
                  </div>
                  {/* Industry benchmark */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        Industry benchmark
                      </span>
                      <span className="text-xs font-semibold text-gray-500">
                        {EMAIL_BENCHMARK}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className="h-2.5 rounded-full bg-gray-400 transition-all"
                        style={{ width: `${EMAIL_BENCHMARK}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    {data.openRate >= EMAIL_BENCHMARK
                      ? `+${(data.openRate - EMAIL_BENCHMARK).toFixed(1)}% above industry average`
                      : `${(EMAIL_BENCHMARK - data.openRate).toFixed(1)}% below industry average`}
                  </p>
                </div>
              </div>

              {/* Opens per day bar chart (pure CSS) */}
              {data.opensPerDay.length > 0 && (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Opens — Last 7 Days
                  </p>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
                    <div className="flex items-end gap-1.5 h-24">
                      {data.opensPerDay.map((d) => {
                        const pct = (d.opens / maxOpens) * 100;
                        return (
                          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                            <span className="text-[9px] text-gray-400">{d.opens}</span>
                            <div
                              className="w-full rounded-t bg-indigo-400 dark:bg-indigo-500 min-h-[3px]"
                              style={{ height: `${Math.max(pct, 4)}%` }}
                              title={`${d.date}: ${d.opens} opens`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {data.opensPerDay.map((d) => (
                        <div key={d.date} className="flex-1 text-center">
                          <span className="text-[9px] text-gray-400">
                            {new Date(d.date).toLocaleDateString('en-AU', { weekday: 'short' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Top clicked links (email only) */}
              {campaign.type === 'email' && data.topLinks.length > 0 && (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Top Clicked Links
                  </p>
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">
                            URL
                          </th>
                          <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">
                            Clicks
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {data.topLinks.map((link) => (
                          <tr key={link.url} className="bg-white dark:bg-gray-900">
                            <td className="px-3 py-2 text-xs text-indigo-600 dark:text-indigo-400 truncate max-w-[220px]">
                              {link.url}
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
                              {link.clicks.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Revenue attributed */}
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/40 dark:bg-green-950/20">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400 mb-1">
                  Revenue Attributed
                </p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                  ${data.revenue.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-0.5">
                  from this campaign
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function CampaignsClient() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useCampaigns();
  const campaigns = data?.data ?? [];
  const active = campaigns.filter((c) => c.status === 'active').length;

  const [showCreate, setShowCreate] = useState(false);
  const [analyticsFor, setAnalyticsFor] = useState<Campaign | null>(null);

  const isCompleted = (c: Campaign) => c.status === 'sent' || c.status === 'completed';

  return (
    <div className="space-y-6">
      {showCreate && (
        <CreateCampaignModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { queryClient.invalidateQueries({ queryKey: ['campaigns'] }); }}
        />
      )}

      {analyticsFor && (
        <AnalyticsPanel
          campaign={analyticsFor}
          onClose={() => setAnalyticsFor(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Campaigns</h2>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${campaigns.length} campaigns · ${active} active`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Create Campaign
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Campaigns', value: isLoading ? '—' : active.toString(), icon: Megaphone },
          {
            label: 'Total Reach',
            value: isLoading
              ? '—'
              : campaigns.reduce((s, c) => s + (c.recipientCount ?? 0), 0).toLocaleString(),
            icon: Mail,
          },
          { label: 'Total Campaigns', value: isLoading ? '—' : campaigns.length.toString(), icon: MessageSquare },
          {
            label: 'Drafts',
            value: isLoading ? '—' : campaigns.filter((c) => c.status === 'draft').length.toString(),
            icon: Tag,
          },
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
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Campaign
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Type
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Reach
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Schedule
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 6 }).map((__, j) => (
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
                      <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`rounded-lg p-2 ${colorClass}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {c.name}
                              </p>
                              <p className="text-xs text-gray-400">
                                {c.id.slice(0, 8)} · {c.type}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400 capitalize">
                          {c.type.replace('_', ' ')}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[c.status] ?? 'bg-gray-100 text-gray-500'}`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                          {c.recipientCount ? c.recipientCount.toLocaleString() : '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                            <Calendar className="h-3.5 w-3.5" />
                            {c.scheduledAt
                              ? formatDate(c.scheduledAt, { month: 'short', day: 'numeric' })
                              : c.sentAt
                                ? `Sent ${formatDate(c.sentAt, { month: 'short', day: 'numeric' })}`
                                : 'Not scheduled'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {isCompleted(c) && (
                            <button
                              onClick={() => setAnalyticsFor(c)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                            >
                              <BarChart2 className="h-3.5 w-3.5" />
                              View Analytics
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              {!isLoading && campaigns.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-sm text-gray-400"
                  >
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
