'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface FormData {
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  password: string;
  phone: string;
  abn: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  businessName?: string;
  email?: string;
  password?: string;
}

function validateForm(data: FormData): FormErrors {
  const errors: FormErrors = {};
  if (!data.firstName.trim()) errors.firstName = 'First name is required';
  if (!data.lastName.trim()) errors.lastName = 'Last name is required';
  if (!data.businessName.trim()) errors.businessName = 'Business name is required';
  if (!data.email.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Enter a valid email address';
  }
  if (!data.password) {
    errors.password = 'Password is required';
  } else if (data.password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  }
  return errors;
}

export default function OnboardAccountPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>({
    firstName: '',
    lastName: '',
    businessName: '',
    email: '',
    password: '',
    phone: '',
    abn: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError('');
    const validationErrors = validateForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/onboard/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      const params = new URLSearchParams({ orgId: data.orgId });
      if (data.token) params.set('token', data.token);
      router.push(`/onboard/plan?${params.toString()}`);
    } catch {
      setServerError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="text-gray-500 mt-1">Start your free 14-day trial — no credit card required.</p>
        </div>

        {serverError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="firstName">
                First name <span className="text-red-500">*</span>
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                value={form.firstName}
                onChange={handleChange}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors ${
                  errors.firstName
                    ? 'border-red-400 bg-red-50 focus:border-red-500'
                    : 'border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
                }`}
                placeholder="Jane"
              />
              {errors.firstName && <p className="text-xs text-red-600 mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="lastName">
                Last name <span className="text-red-500">*</span>
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                value={form.lastName}
                onChange={handleChange}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors ${
                  errors.lastName
                    ? 'border-red-400 bg-red-50 focus:border-red-500'
                    : 'border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
                }`}
                placeholder="Smith"
              />
              {errors.lastName && <p className="text-xs text-red-600 mt-1">{errors.lastName}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="businessName">
              Business name <span className="text-red-500">*</span>
            </label>
            <input
              id="businessName"
              name="businessName"
              type="text"
              autoComplete="organization"
              value={form.businessName}
              onChange={handleChange}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors ${
                errors.businessName
                  ? 'border-red-400 bg-red-50 focus:border-red-500'
                  : 'border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
              }`}
              placeholder="Acme Cafe"
            />
            {errors.businessName && <p className="text-xs text-red-600 mt-1">{errors.businessName}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="email">
              Email address <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors ${
                errors.email
                  ? 'border-red-400 bg-red-50 focus:border-red-500'
                  : 'border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
              }`}
              placeholder="jane@acmecafe.com.au"
            />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="password">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={handleChange}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors ${
                errors.password
                  ? 'border-red-400 bg-red-50 focus:border-red-500'
                  : 'border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
              }`}
              placeholder="Minimum 8 characters"
            />
            {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="phone">
              Phone <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={handleChange}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              placeholder="04XX XXX XXX"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="abn">
              ABN <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="abn"
              name="abn"
              type="text"
              value={form.abn}
              onChange={handleChange}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              placeholder="XX XXX XXX XXX"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating account…
              </>
            ) : (
              'Create account'
            )}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <a href="https://app.elevatedpos.com.au/login" className="text-indigo-600 hover:text-indigo-500 font-medium">
              Log in
            </a>
          </p>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          By creating an account you agree to our{' '}
          <a href="/terms" className="underline hover:text-gray-600">Terms of Service</a>{' '}
          and{' '}
          <a href="/privacy" className="underline hover:text-gray-600">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
