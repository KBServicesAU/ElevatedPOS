'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle, ExternalLink } from 'lucide-react';

interface FormState {
  businessName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  abn: string;
  plan: 'starter' | 'growth';
}

interface SuccessData {
  orgId: string;
  email: string;
  businessName: string;
}

const DEFAULT_FORM: FormState = {
  businessName: '',
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  abn: '',
  plan: 'starter',
};

export default function AddMerchantPage() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<SuccessData | null>(null);

  function update(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/onboard/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json() as SuccessData & { error?: string };

      if (!res.ok || data.error) {
        setError(data.error ?? 'Registration failed');
        return;
      }

      setSuccess(data);
      setForm(DEFAULT_FORM);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <CheckCircle size={48} className="mx-auto text-emerald-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Merchant Added!</h2>
          <p className="text-sm text-gray-500 mb-6">
            <strong>{success.businessName}</strong> has been registered successfully.
          </p>

          <dl className="text-left space-y-2 mb-6 bg-gray-50 rounded-xl p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Organisation ID</dt>
              <dd className="font-mono text-gray-800">{success.orgId}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Email</dt>
              <dd className="text-gray-800">{success.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Business Name</dt>
              <dd className="text-gray-800">{success.businessName}</dd>
            </div>
          </dl>

          <div className="flex gap-3 justify-center flex-wrap">
            <a
              href={`https://organisation.elevatedpos.com.au/dashboard/merchants/${success.orgId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <ExternalLink size={14} />
              View merchant
            </a>
            <button
              onClick={() => setSuccess(null)}
              className="px-4 py-2 border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors font-medium"
            >
              Add another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Add Merchant</h1>
        <p className="text-sm text-gray-500 mt-1">Register a new merchant under your reseller account</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Business Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
              Business Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Name *</label>
                <input
                  type="text"
                  required
                  value={form.businessName}
                  onChange={update('businessName')}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="Acme Cafe Pty Ltd"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ABN (optional)</label>
                <input
                  type="text"
                  value={form.abn}
                  onChange={update('abn')}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="12 345 678 901"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan *</label>
                <select
                  required
                  value={form.plan}
                  onChange={update('plan')}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
                >
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                </select>
              </div>
            </div>
          </div>

          {/* Owner Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
              Owner / Admin Account
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input
                  type="text"
                  required
                  value={form.firstName}
                  onChange={update('firstName')}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="Jane"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input
                  type="text"
                  required
                  value={form.lastName}
                  onChange={update('lastName')}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={update('email')}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="jane@acmecafe.com.au"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={update('phone')}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="+61 4XX XXX XXX"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={update('password')}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="Min. 8 characters"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Link
              href="/dashboard/merchants"
              className="px-5 py-2.5 border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors font-medium"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Registering…' : 'Register Merchant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
