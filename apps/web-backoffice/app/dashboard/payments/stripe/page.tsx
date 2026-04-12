'use client';

/**
 * Stripe Terminal Settings
 *
 * Configure Stripe API keys for Tap to Pay on Android (localMobile reader).
 * Keys are stored in the terminal credentials table against provider='stripe'.
 *
 * Required keys from dashboard.stripe.com → Developers → API Keys:
 *   - Publishable key (pk_live_... or pk_test_...)
 *   - Secret key      (sk_live_... or sk_test_...)
 */

import { useState, useEffect } from 'react';
import { Save, Loader2, CreditCard, Eye, EyeOff, Info } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';

interface StripeTerminalCredentials {
  publishableKey?: string;
  /** Secret key is write-only — server returns a masked version */
  secretKeyMask?: string;
}

export default function StripeTerminalSettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishableKey, setPublishableKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [secretKeyMask, setSecretKeyMask] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<StripeTerminalCredentials>('terminal/credentials?provider=stripe');
        if (data.publishableKey) setPublishableKey(data.publishableKey);
        if (data.secretKeyMask) setSecretKeyMask(data.secretKeyMask);
      } catch {
        // Not configured yet — defaults are fine
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!publishableKey.trim()) {
      toast({ title: 'Publishable key is required', variant: 'destructive' });
      return;
    }
    if (!publishableKey.trim().startsWith('pk_')) {
      toast({ title: 'Publishable key must start with pk_live_ or pk_test_', variant: 'destructive' });
      return;
    }
    if (secretKey && !secretKey.trim().startsWith('sk_')) {
      toast({ title: 'Secret key must start with sk_live_ or sk_test_', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch('terminal/credentials', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'stripe',
          publishableKey: publishableKey.trim(),
          ...(secretKey.trim() ? { secretKey: secretKey.trim() } : {}),
        }),
      });
      setSecretKey('');
      toast({ title: 'Stripe Terminal settings saved', variant: 'success' });
    } catch {
      toast({ title: 'Failed to save settings', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20">
            <CreditCard className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Stripe Terminal</h1>
            <p className="text-sm text-gray-400">Tap to Pay on Android — uses the device&apos;s own NFC</p>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
        <p className="text-sm text-indigo-200">
          Enter your Stripe API keys from{' '}
          <a
            href="https://dashboard.stripe.com/developers/api-keys"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            dashboard.stripe.com → Developers → API Keys
          </a>
          . Use live keys for production and test keys for staging.
        </p>
      </div>

      {/* API Keys */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-white">API Keys</h3>
        <div className="space-y-4 rounded-xl border border-[#1e2a40] bg-[#0f172a] p-4">
          {/* Publishable key */}
          <div>
            <label className="mb-1 block text-xs text-gray-400">
              Publishable Key <span className="text-red-400">*</span>
            </label>
            <input
              value={publishableKey}
              onChange={(e) => setPublishableKey(e.target.value)}
              placeholder="pk_live_... or pk_test_..."
              className="w-full rounded-lg border border-[#2a3a55] bg-[#0a1628] px-3 py-2 font-mono text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Used by the POS app to initialize the Stripe Terminal SDK.
            </p>
          </div>

          {/* Secret key */}
          <div>
            <label className="mb-1 block text-xs text-gray-400">Secret Key</label>
            {secretKeyMask && !secretKey && (
              <p className="mb-2 font-mono text-xs text-gray-400">
                Current: {secretKeyMask}
              </p>
            )}
            <div className="relative">
              <input
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                type={showSecret ? 'text' : 'password'}
                placeholder={secretKeyMask ? 'Enter new key to replace…' : 'sk_live_... or sk_test_...'}
                className="w-full rounded-lg border border-[#2a3a55] bg-[#0a1628] px-3 py-2 pr-10 font-mono text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Used by the payments backend to create payment intents and process refunds.
              Leave blank to keep existing key.
            </p>
          </div>
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Settings
        </button>
      </div>
    </div>
  );
}
