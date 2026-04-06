'use client';

import { useEffect, useState, useCallback } from 'react';
import { platformFetch } from '@/lib/api';
import { Save, RefreshCw } from 'lucide-react';

interface PlatformSettings {
  platformName: string;
  supportEmail: string;
  defaultPlanId: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  signupEnabled: boolean;
  maxOrgsLimit: number;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
}

interface PlansResponse {
  data: Plan[];
}

const DEFAULT_SETTINGS: PlatformSettings = {
  platformName: 'ElevatedPOS',
  supportEmail: 'support@elevatedpos.com.au',
  defaultPlanId: '',
  maintenanceMode: false,
  maintenanceMessage: 'We are currently undergoing scheduled maintenance. Please try again shortly.',
  signupEnabled: true,
  maxOrgsLimit: 0,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [settingsData, plansData] = await Promise.all([
        platformFetch('platform/settings').catch(() => ({ data: DEFAULT_SETTINGS })) as Promise<{ data: PlatformSettings }>,
        platformFetch('platform/plans') as Promise<PlansResponse>,
      ]);
      setSettings(settingsData.data ?? DEFAULT_SETTINGS);
      setPlans(plansData.data ?? []);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      await platformFetch('platform/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Platform Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Global platform configuration</p>
        </div>
        <div className="text-gray-500 text-sm">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Global platform configuration</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-[#111118] border border-[#1e1e2e] hover:border-indigo-500 text-gray-400 hover:text-white text-sm rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Reload
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
          {loadError}
        </div>
      )}

      {saveError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
          {saveError}
        </div>
      )}

      {saveSuccess && (
        <div className="mb-4 bg-green-500/10 border border-green-500/30 rounded px-4 py-3 text-green-400 text-sm">
          Settings saved successfully.
        </div>
      )}

      <div className="space-y-6">
        {/* General Settings */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6">
          <h2 className="text-white font-semibold mb-4">General</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                Platform Name
              </label>
              <input
                type="text"
                value={settings.platformName}
                onChange={(e) => setSettings((s) => ({ ...s, platformName: e.target.value }))}
                className="w-full max-w-md bg-[#0a0a0f] border border-[#1e1e2e] rounded px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
              <p className="text-gray-600 text-xs mt-1">Display name used across the platform</p>
            </div>

            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                Support Email
              </label>
              <input
                type="email"
                value={settings.supportEmail}
                onChange={(e) => setSettings((s) => ({ ...s, supportEmail: e.target.value }))}
                className="w-full max-w-md bg-[#0a0a0f] border border-[#1e1e2e] rounded px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
              <p className="text-gray-600 text-xs mt-1">Shown to merchants for support enquiries</p>
            </div>

            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                Default Plan
              </label>
              <select
                value={settings.defaultPlanId}
                onChange={(e) => setSettings((s) => ({ ...s, defaultPlanId: e.target.value }))}
                className="w-full max-w-md bg-[#0a0a0f] border border-[#1e1e2e] rounded px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="">No default plan</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (/{p.slug})</option>
                ))}
              </select>
              <p className="text-gray-600 text-xs mt-1">Auto-assigned to new merchants during signup</p>
            </div>

            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                Max Organisations
              </label>
              <input
                type="number"
                min="0"
                value={settings.maxOrgsLimit}
                onChange={(e) => setSettings((s) => ({ ...s, maxOrgsLimit: Number(e.target.value) }))}
                className="w-full max-w-md bg-[#0a0a0f] border border-[#1e1e2e] rounded px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
              <p className="text-gray-600 text-xs mt-1">Maximum total orgs allowed on the platform (0 = unlimited)</p>
            </div>
          </div>
        </div>

        {/* Access & Registration */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6">
          <h2 className="text-white font-semibold mb-4">Access &amp; Registration</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between max-w-md">
              <div>
                <p className="text-white text-sm">Signup Enabled</p>
                <p className="text-gray-600 text-xs mt-0.5">Allow new merchants to sign up</p>
              </div>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, signupEnabled: !s.signupEnabled }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${settings.signupEnabled ? 'bg-green-600' : 'bg-[#1e1e2e]'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.signupEnabled ? 'translate-x-6' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Maintenance Mode */}
        <div className={`bg-[#111118] border rounded-lg p-6 ${settings.maintenanceMode ? 'border-yellow-500/50' : 'border-[#1e1e2e]'}`}>
          <h2 className="text-white font-semibold mb-4">Maintenance Mode</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between max-w-md">
              <div>
                <p className="text-white text-sm">Maintenance Mode</p>
                <p className="text-gray-600 text-xs mt-0.5">Blocks merchant access with a maintenance message</p>
              </div>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, maintenanceMode: !s.maintenanceMode }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${settings.maintenanceMode ? 'bg-yellow-600' : 'bg-[#1e1e2e]'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.maintenanceMode ? 'translate-x-6' : ''}`} />
              </button>
            </div>

            {settings.maintenanceMode && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded px-4 py-3 text-yellow-400 text-sm">
                Maintenance mode is active. All merchant-facing apps will display the maintenance message.
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                Maintenance Message
              </label>
              <textarea
                value={settings.maintenanceMessage}
                onChange={(e) => setSettings((s) => ({ ...s, maintenanceMessage: e.target.value }))}
                rows={3}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
                placeholder="Enter the message to display to merchants..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
