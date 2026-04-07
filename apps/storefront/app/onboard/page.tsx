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
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-neutral-500 mt-1">Start your free 14-day trial — no credit card required.</p>
        </div>

        {serverError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5" htmlFor="firstName">
                First name <span className="text-red-400">*</span>
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                value={form.firstName}
                onChange={handleChange}
                className={`w-full px-4 py-3 rounded-lg border text-sm text-white outline-none transition-colors bg-white/[0.05] placeholder-neutral-600 ${
                  errors.firstName
                    ? 'border-red-500/50 bg-red-500/[0.05] focus:border-red-500'
                    : 'border-white/[0.08] focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]/20'
                }`}
                placeholder="Jane"
              />
              {errors.firstName && <p className="text-xs text-red-400 mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5" htmlFor="lastName">
                Last name <span className="text-red-400">*</span>
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                value={form.lastName}
                onChange={handleChange}
                className={`w-full px-4 py-3 rounded-lg border text-sm text-white outline-none transition-colors bg-white/[0.05] placeholder-neutral-600 ${
                  errors.lastName
                    ? 'border-red-500/50 bg-red-500/[0.05] focus:border-red-500'
                    : 'border-white/[0.08] focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]/20'
                }`}
                placeholder="Smith"
              />
              {errors.lastName && <p className="text-xs text-red-400 mt-1">{errors.lastName}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5" htmlFor="businessName">
              Business name <span className="text-red-400">*</span>
            </label>
            <input
              id="businessName"
              name="businessName"
              type="text"
              autoComplete="organization"
              value={form.businessName}
              onChange={handleChange}
              className={`w-full px-4 py-3 rounded-lg border text-sm text-white outline-none transition-colors bg-white/[0.05] placeholder-neutral-600 ${
                errors.businessName
                  ? 'border-red-500/50 bg-red-500/[0.05] focus:border-red-500'
                  : 'border-white/[0.08] focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]/20'
              }`}
              placeholder="Acme Cafe"
            />
            {errors.businessName && <p className="text-xs text-red-400 mt-1">{errors.businessName}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5" htmlFor="email">
              Email address <span className="text-red-400">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              className={`w-full px-4 py-3 rounded-lg border text-sm text-white outline-none transition-colors bg-white/[0.05] placeholder-neutral-600 ${
                errors.email
                  ? 'border-red-500/50 bg-red-500/[0.05] focus:border-red-500'
                  : 'border-white/[0.08] focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]/20'
              }`}
              placeholder="jane@acmecafe.com.au"
            />
            {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5" htmlFor="password">
              Password <span className="text-red-400">*</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={handleChange}
              className={`w-full px-4 py-3 rounded-lg border text-sm text-white outline-none transition-colors bg-white/[0.05] placeholder-neutral-600 ${
                errors.password
                  ? 'border-red-500/50 bg-red-500/[0.05] focus:border-red-500'
                  : 'border-white/[0.08] focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]/20'
              }`}
              placeholder="Minimum 8 characters"
            />
            {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5" htmlFor="phone">
              Phone <span className="text-neutral-600 font-normal">(optional)</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-lg border border-white/[0.08] bg-white/[0.05] text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]/20"
              placeholder="04XX XXX XXX"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5" htmlFor="abn">
              ABN <span className="text-neutral-600 font-normal">(optional)</span>
            </label>
            <input
              id="abn"
              name="abn"
              type="text"
              value={form.abn}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-lg border border-white/[0.08] bg-white/[0.05] text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]/20"
              placeholder="XX XXX XXX XXX"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] disabled:bg-[#7c3aed]/50 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
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

          <p className="text-center text-sm text-neutral-500">
            Already have an account?{' '}
            <a href="https://app.elevatedpos.com.au/login" className="text-[#7c3aed] hover:text-white font-medium transition-colors">
              Log in
            </a>
          </p>
        </form>

        <p className="text-xs text-neutral-600 text-center mt-6">
          By creating an account you agree to our{' '}
          <a href="/terms" className="text-neutral-500 underline hover:text-white transition-colors">Terms of Service</a>{' '}
          and{' '}
          <a href="/privacy" className="text-neutral-500 underline hover:text-white transition-colors">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
