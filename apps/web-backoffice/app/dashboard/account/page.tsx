'use client';

import { useState, useEffect } from 'react';
import {
  Building2,
  CreditCard,
  LifeBuoy,
  FileText,
  Activity,
  User,
  Hash,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  Monitor,
  ChefHat,
  TabletSmartphone,
  Tv,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/lib/use-toast';

interface SessionMe {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string | null;
  orgId?: string;
  plan?: string;
  createdAt?: string;
}

interface OrgSettings {
  businessName?: string;
}

interface OrgMe {
  accountNumber?: string | null;
  slug?: string;
  name?: string;
}

// v2.7.51 — per-device pricing model. The dashboard previously had a
// /dashboard/billing page with the legacy 3-plan model (Starter / Growth /
// Enterprise). The new per-device pricing model lives directly in the
// account page so merchants see exactly what they're paying for and per
// active device. Costs are sourced from organisations.devices_* /
// org_subscription_items where present (via /api/v1/billing/status), and
// fall back to these per-role list prices when the subscription hasn't
// been provisioned yet.
//
// Coordination note: Agent A2 is also working on the per-device pricing
// model. This component reads from the existing org_subscription_items
// surface (services/auth/src/routes/billing.ts → GET /status) — when A2
// lands the unitAmountCents in DB will take precedence over these
// fallbacks automatically.
const DEVICE_LIST_PRICES: Record<string, number> = {
  pos:     49,
  kds:     29,
  kiosk:   39,
  display: 19, // signage
};

const DEVICE_LABELS: Record<string, string> = {
  pos:     'POS',
  kds:     'KDS',
  kiosk:   'Kiosk',
  display: 'Signage',
};

interface DeviceRow {
  id: string;
  role: 'pos' | 'kds' | 'kiosk' | 'display' | 'dashboard';
  status: 'active' | 'revoked';
}

interface BillingStatusItem {
  deviceType: string;
  quantity: number;
  unitAmountCents: number;
  monthlyTotalCents: number;
}

interface BillingStatus {
  billingModel?: string;
  subscriptionStatus?: string;
  stripeSubscriptionId?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  websiteAddonEnabled?: boolean;
  customDomainAddonEnabled?: boolean;
  items?: BillingStatusItem[];
  monthlyTotalCents?: number;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

function formatMemberSince(dateStr?: string): string {
  if (!dateStr) return 'Member since 2025';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  } catch {
    return 'Member since 2025';
  }
}

// ─── Change Password section ─────────────────────────────────────────────────

function ChangePasswordSection() {
  const { toast } = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [saving, setSaving] = useState(false);

  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.next !== form.confirm) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (form.next.length < 8) {
      toast({ title: 'Password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`);
      }
      toast({ title: 'Password updated', description: 'Your password has been changed successfully.', variant: 'success' });
      setForm({ current: '', next: '', confirm: '' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not update password.';
      toast({ title: 'Failed to update password', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-5">
      <div className="flex items-center gap-2 mb-5">
        <Lock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Change Password</h2>
      </div>

      <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
        {/* Current password */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
            Current Password
          </label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={form.current}
              onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
              placeholder="••••••••"
              required
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShowCurrent((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={showCurrent ? 'Hide password' : 'Show password'}
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* New password */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
            New Password
          </label>
          <div className="relative">
            <input
              type={showNext ? 'text' : 'password'}
              value={form.next}
              onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
              placeholder="Min. 8 characters"
              required
              minLength={8}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShowNext((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={showNext ? 'Hide password' : 'Show password'}
            >
              {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Confirm */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
            Confirm New Password
          </label>
          <input
            type="password"
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
            placeholder="Repeat new password"
            required
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
      aria-label="Copy account number"
    >
      {copied ? (
        <><Check className="w-3 h-3" /> Copied</>
      ) : (
        <><Copy className="w-3 h-3" /> Copy</>
      )}
    </button>
  );
}

// ─── Device billing section (v2.7.51) ─────────────────────────────────────────
//
// Replaces the legacy /dashboard/billing page (3-plan model). Shows the
// per-device count + per-role unit price + monthly total, plus the card on
// file from Stripe Subscription, with deep-links into the Stripe Customer
// Portal for self-service updates.

interface DeviceBillingSectionProps {
  devices: DeviceRow[];
  billingStatus: BillingStatus | null;
  paymentMethods: PaymentMethod[];
  onOpenPortal: () => Promise<void>;
  portalLoading: boolean;
  plan: string;
}

function DeviceBillingSection({
  devices,
  billingStatus,
  paymentMethods,
  onOpenPortal,
  portalLoading,
  plan,
}: DeviceBillingSectionProps) {
  // Active devices grouped by role.
  const activeDevices = devices.filter((d) => d.status === 'active');
  const counts: Record<string, number> = { pos: 0, kds: 0, kiosk: 0, display: 0 };
  for (const d of activeDevices) {
    if (d.role in counts) counts[d.role] = (counts[d.role] ?? 0) + 1;
  }

  // Resolve unit price per role: prefer the DB-driven price (already
  // synced from Stripe by Agent A2's per-device subscription items) and
  // fall back to the hardcoded list price if the subscription hasn't
  // been provisioned yet.
  function resolveUnitPriceDollars(role: string): number {
    const fromDb = billingStatus?.items?.find((it) => it.deviceType === role);
    if (fromDb && fromDb.unitAmountCents > 0) {
      return fromDb.unitAmountCents / 100;
    }
    return DEVICE_LIST_PRICES[role] ?? 0;
  }

  const lineItems = (['pos', 'kds', 'kiosk', 'display'] as const).map((role) => {
    const qty = counts[role] ?? 0;
    const unit = resolveUnitPriceDollars(role);
    return {
      role,
      label: DEVICE_LABELS[role] ?? role,
      qty,
      unit,
      total: qty * unit,
    };
  });

  // Prefer the server-computed monthlyTotalCents when available — it
  // accounts for add-ons (website, custom domain). Otherwise sum the
  // device-line totals we just computed.
  const monthlyTotal = typeof billingStatus?.monthlyTotalCents === 'number'
    ? billingStatus.monthlyTotalCents / 100
    : lineItems.reduce((sum, it) => sum + it.total, 0);

  const hasSubscription = !!billingStatus?.stripeSubscriptionId;
  const card = paymentMethods[0];

  // Roles → icon mapping for the device table.
  const RoleIcon = ({ role }: { role: string }) => {
    if (role === 'pos') return <Monitor className="h-4 w-4 text-indigo-500" />;
    if (role === 'kds') return <ChefHat className="h-4 w-4 text-amber-500" />;
    if (role === 'kiosk') return <TabletSmartphone className="h-4 w-4 text-purple-500" />;
    if (role === 'display') return <Tv className="h-4 w-4 text-emerald-500" />;
    return <Monitor className="h-4 w-4 text-gray-400" />;
  };

  const status = billingStatus?.subscriptionStatus ?? 'inactive';
  const STATUS_TONE: Record<string, string> = {
    active:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    trialing:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    past_due:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    paused:    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    inactive:  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    incomplete:'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-5">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Subscription
          </h2>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize ${
            STATUS_TONE[status] ?? STATUS_TONE['inactive']
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 inline-block" />
          {status === 'past_due' ? 'Past Due' : status}
          {plan && plan.toLowerCase() !== 'starter' && (
            <span className="ml-1 opacity-60">· {plan}</span>
          )}
        </span>
      </div>

      {/* Device line items */}
      <div className="mb-5 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Device</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Active</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Per Device</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {lineItems.map((it) => (
              <tr key={it.role} className={it.qty === 0 ? 'opacity-60' : ''}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <RoleIcon role={it.role} />
                    <span className="font-medium text-gray-900 dark:text-white">{it.label}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300 font-medium">{it.qty}</td>
                <td className="px-4 py-2.5 text-right text-gray-500 dark:text-gray-400">${it.unit.toFixed(2)}/mo</td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white">${it.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40">
              <td colSpan={3} className="px-4 py-2.5 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                Monthly Total
              </td>
              <td className="px-4 py-2.5 text-right text-base font-bold text-gray-900 dark:text-white">
                ${monthlyTotal.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Payment method on file */}
      <div className="mb-5 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <CreditCard className="h-4 w-4 text-gray-400" />
            {card ? (
              <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                <span className="font-semibold capitalize">{card.brand}</span>
                <span className="ml-2 font-mono">•••• {card.last4}</span>
                <span className="ml-2 text-xs text-gray-400">
                  Exp {String(card.expMonth).padStart(2, '0')}/{String(card.expYear).slice(-2)}
                </span>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No payment method on file.</p>
            )}
          </div>
        </div>
      </div>

      {/* Stripe portal actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void onOpenPortal()}
          disabled={portalLoading || !hasSubscription}
          title={!hasSubscription ? 'Subscription not yet provisioned' : undefined}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {portalLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Opening portal…
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4" />
              Update Card
            </>
          )}
        </button>
        <button
          onClick={() => void onOpenPortal()}
          disabled={portalLoading || !hasSubscription}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          View Invoices
        </button>
        {!hasSubscription && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Per-device subscription not yet active. Contact{' '}
            <a href="mailto:support@elevatedpos.com.au" className="text-indigo-500 hover:underline">support</a>
            {' '}to provision billing.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { toast } = useToast();
  const [me, setMe] = useState<SessionMe | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [orgMe, setOrgMe] = useState<OrgMe | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/proxy/settings/organisation').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/proxy/organisations/me').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/proxy/devices').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/proxy/billing-saas/status').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/proxy/billing/payment-methods').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([meData, orgData, orgMeData, devicesRes, billingRes, pmRes]: [
      SessionMe | null,
      OrgSettings | null,
      OrgMe | null,
      { data?: DeviceRow[] } | null,
      { data?: BillingStatus } | null,
      PaymentMethod[] | { data?: PaymentMethod[] } | null,
    ]) => {
      setMe(meData);
      setOrgSettings(orgData);
      setOrgMe(orgMeData);
      setDevices(Array.isArray(devicesRes?.data) ? devicesRes!.data : []);
      setBillingStatus(billingRes?.data ?? null);
      const pmArr = Array.isArray(pmRes) ? pmRes : (pmRes?.data ?? []);
      setPaymentMethods(pmArr);
    }).finally(() => setLoading(false));
  }, []);

  // v2.7.51 — open the Stripe Customer Portal so merchants can update
  // their card on file or download platform invoices. The portal URL is
  // single-use and short-lived; we re-mint each click.
  async function openStripePortal() {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/proxy/billing-saas/portal');
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not open billing portal.');
      }
      const data = await res.json() as { data?: { url?: string } };
      const url = data?.data?.url;
      if (!url) throw new Error('No portal URL returned.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open Stripe portal.';
      toast({ title: 'Could not open billing portal', description: msg, variant: 'destructive' });
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-3xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-36" />
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-64" />
          <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-28 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        </div>
      </div>
    );
  }

  const accountNumber = orgMe?.accountNumber ?? null;
  const businessName = orgSettings?.businessName || orgMe?.name || 'Your Business';
  const fullName =
    [me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'Account Owner';
  const email = me?.email ?? '';
  const plan = me?.plan ?? 'Starter';

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Account</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Manage your ElevatedPOS account details and subscription.
        </p>
      </div>

      {/* ── 1. Account Details ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-5">
        <div className="flex items-center gap-2 mb-5">
          <Building2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Account Details
          </h2>
        </div>

        {/* Account Number — full-width, prominent */}
        <div className="mb-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700/50 rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Hash className="w-3.5 h-3.5 text-indigo-500" />
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              Account Number
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {accountNumber ? (
              <>
                <p className="text-2xl font-mono font-bold text-gray-900 dark:text-white tracking-widest">
                  {accountNumber}
                </p>
                <CopyButton text={accountNumber} />
              </>
            ) : (
              <p className="text-sm text-gray-400 italic">Generating…</p>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
            Quote this number when contacting our support team.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Business Name */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Building2 className="w-3 h-3 text-gray-400" />
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Business Name
              </p>
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {businessName}
            </p>
          </div>

          {/* Account Owner */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <User className="w-3 h-3 text-gray-400" />
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Account Owner
              </p>
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{fullName}</p>
            {email && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{email}</p>
            )}
          </div>

          {/* Member Since */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="w-3 h-3 text-gray-400" />
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Member Since
              </p>
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {formatMemberSince(me?.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. Per-device subscription (v2.7.51 — replaces /dashboard/billing) ── */}
      <DeviceBillingSection
        devices={devices}
        billingStatus={billingStatus}
        paymentMethods={paymentMethods}
        onOpenPortal={openStripePortal}
        portalLoading={portalLoading}
        plan={plan}
      />

      {/* ── 3. Support ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-5">
        <div className="flex items-center gap-2 mb-5">
          <LifeBuoy className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Support</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Live Chat */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 text-indigo-500" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Live Chat</p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex-1">
              Chat with our team
            </p>
            <a
              href="mailto:support@elevatedpos.com.au"
              className="inline-flex items-center justify-center px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
            >
              Contact Us
            </a>
          </div>

          {/* Documentation */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Documentation
              </p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex-1">
              Browse help articles
            </p>
            <a
              href="https://help.elevatedpos.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-medium hover:bg-white dark:hover:bg-gray-700 transition-colors"
            >
              View Docs ↗
            </a>
          </div>

          {/* System Status */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                System Status
              </p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex-1">
              Check service health
            </p>
            <a
              href="https://status.elevatedpos.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-medium hover:bg-white dark:hover:bg-gray-700 transition-colors"
            >
              View Status ↗
            </a>
          </div>
        </div>
      </div>

      {/* ── 4. Change Password ── */}
      <ChangePasswordSection />

      {/* ── 5. Danger Zone ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-red-200 dark:border-red-900/50 p-6 mb-5">
        <h2 className="text-base font-semibold text-red-600 dark:text-red-400 mb-2">
          Danger Zone
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Once you cancel your subscription, you will lose access to all paid features at the
          end of your current billing period.
        </p>
        <a
          href="mailto:support@elevatedpos.com.au?subject=Cancel%20Subscription"
          className="inline-block px-4 py-2 border border-red-400 dark:border-red-600 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          Cancel Subscription
        </a>
      </div>

      {/* ── Footer links ── */}
      <p className="mt-2 text-center text-xs text-gray-400 dark:text-gray-600">
        <a
          href="https://elevatedpos.com.au/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600 dark:hover:text-gray-400"
        >
          Terms of Service
        </a>
        {' · '}
        <a
          href="https://elevatedpos.com.au/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600 dark:hover:text-gray-400"
        >
          Privacy Policy
        </a>
      </p>
    </div>
  );
}
