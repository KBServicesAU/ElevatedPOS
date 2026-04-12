'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  // Step 1 — Business Info
  businessName: string;
  industry: string;
  abn: string;
  // Step 2 — Your Account
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  // Step 3 — Plan
  plan: 'starter' | 'growth' | 'enterprise';
}

interface FieldErrors {
  businessName?: string;
  industry?: string;
  abn?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

// ─── Plan Definitions ─────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'starter' as const,
    name: 'Starter',
    price: '$49/mo',
    trial: 'Free 30-day trial',
    description: 'Perfect for single-location businesses getting started.',
    features: ['1 location', '2 devices', 'POS + basic reports', 'Email support'],
    highlight: false,
  },
  {
    id: 'growth' as const,
    name: 'Growth',
    price: '$99/mo',
    trial: null,
    description: 'For growing businesses with multiple locations.',
    features: ['3 locations', '10 devices', 'POS + KDS + Kiosk', 'Loyalty program', 'Priority support'],
    highlight: true,
  },
  {
    id: 'enterprise' as const,
    name: 'Enterprise',
    price: '$249/mo',
    trial: null,
    description: 'Unlimited scale with all features and dedicated support.',
    features: ['Unlimited locations', 'Unlimited devices', 'All features', 'Dedicated account manager', '24/7 support'],
    highlight: false,
  },
] as const;

const INDUSTRIES = [
  { value: 'cafe', label: 'Cafe' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'bar', label: 'Bar' },
  { value: 'retail', label: 'Retail' },
  { value: 'quick_service', label: 'Quick Service' },
  { value: 'other', label: 'Other' },
] as const;

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  const labels = ['Business Info', 'Your Account', 'Choose Plan', 'Confirm'];
  return (
    <div className="mb-8">
      <p className="text-center text-xs font-medium text-[#6b7280] mb-3 uppercase tracking-wider">
        Step {current} of {total}
      </p>
      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: total }, (_, i) => {
          const stepNum = i + 1;
          const isDone = stepNum < current;
          const isActive = stepNum === current;
          return (
            <div key={stepNum} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  isDone
                    ? 'bg-[#6366f1] text-white'
                    : isActive
                    ? 'bg-[#6366f1] text-white ring-4 ring-[#6366f1]/20'
                    : 'bg-[#1f1f1f] text-[#6b7280] border border-[#2a2a2a]'
                }`}
              >
                {isDone ? (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : stepNum}
              </div>
              <span className={`hidden sm:block text-xs font-medium ${isActive ? 'text-white' : 'text-[#4b5563]'}`}>
                {labels[i]}
              </span>
              {stepNum < total && (
                <div className={`hidden sm:block h-px w-6 ${stepNum < current ? 'bg-[#6366f1]' : 'bg-[#2a2a2a]'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [form, setForm] = useState<FormData>({
    businessName: '',
    industry: '',
    abn: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    plan: 'starter',
  });

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear field error on change
    if (fieldErrors[key as keyof FieldErrors]) {
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  function validateStep1(): FieldErrors {
    const errors: FieldErrors = {};
    if (!form.businessName.trim() || form.businessName.trim().length < 2) {
      errors.businessName = 'Business name must be at least 2 characters.';
    }
    if (form.abn && !/^\d{11}$/.test(form.abn.replace(/\s/g, ''))) {
      errors.abn = 'ABN must be 11 digits.';
    }
    return errors;
  }

  function validateStep2(): FieldErrors {
    const errors: FieldErrors = {};
    if (!form.firstName.trim()) errors.firstName = 'First name is required.';
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = 'A valid email address is required.';
    }
    if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.';
    if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match.';
    return errors;
  }

  function handleNext() {
    setServerError('');
    const errors = step === 1 ? validateStep1() : step === 2 ? validateStep2() : {};
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setStep((s) => s + 1);
  }

  function handleBack() {
    setServerError('');
    setFieldErrors({});
    setStep((s) => s - 1);
  }

  // ─── Submit ───────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setServerError('');
    setSubmitting(true);

    // Map signup industry values to API values
    const industryMap: Record<string, string> = {
      quick_service: 'other',
    };
    const mappedIndustry = industryMap[form.industry] ?? form.industry;

    try {
      const res = await fetch('/api/proxy/organisations/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: form.businessName.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          abn: form.abn ? form.abn.replace(/\s/g, '') : undefined,
          plan: form.plan,
          industry: mappedIndustry || undefined,
        }),
      });

      const data = await res.json() as { error?: string; orgId?: string };

      if (!res.ok) {
        setServerError(data.error ?? `Registration failed (${res.status}). Please try again.`);
        return;
      }

      // Success — redirect to login with registered flag
      router.push('/login?registered=true');
    } catch {
      setServerError('Unable to connect. Please check your internet connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Shared input class ───────────────────────────────────────────────────────

  const inputCls = (hasError?: string) =>
    `w-full rounded-xl border ${
      hasError ? 'border-red-500/60 bg-red-500/5' : 'border-[#2a2a2a] bg-[#0d0d0d]'
    } px-4 py-2.5 text-sm text-white placeholder-[#4b5563] outline-none ring-[#6366f1] transition focus:border-[#6366f1] focus:ring-2 disabled:opacity-50`;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-start justify-center bg-[#0a0a0a] px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex flex-col items-center gap-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6366f1] shadow-xl shadow-[#6366f1]/30">
              <span className="text-2xl font-bold text-white">E</span>
            </div>
            <span className="text-lg font-bold text-white tracking-tight">ElevatedPOS</span>
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-white">Create your account</h1>
          <p className="mt-1 text-sm text-[#6b7280]">Get started with a free 30-day trial. No credit card required.</p>
        </div>

        {/* Step Indicator */}
        <StepIndicator current={step} total={4} />

        {/* Card */}
        <div className="rounded-2xl border border-[#1f1f1f] bg-[#141414] p-6 shadow-2xl">

          {/* ── Step 1: Business Info ── */}
          {step === 1 && (
            <div>
              <h2 className="mb-1 text-lg font-semibold text-white">Business Information</h2>
              <p className="mb-6 text-sm text-[#6b7280]">Tell us about your business to get started.</p>
              <div className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#d1d5db]">
                    Business Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.businessName}
                    onChange={(e) => setField('businessName', e.target.value)}
                    placeholder="My Awesome Cafe"
                    className={inputCls(fieldErrors.businessName)}
                    autoFocus
                  />
                  {fieldErrors.businessName && (
                    <p className="mt-1.5 text-xs text-red-400">{fieldErrors.businessName}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#d1d5db]">
                    Industry
                  </label>
                  <select
                    value={form.industry}
                    onChange={(e) => setField('industry', e.target.value)}
                    className={`${inputCls(fieldErrors.industry)} cursor-pointer`}
                  >
                    <option value="">Select your industry...</option>
                    {INDUSTRIES.map((ind) => (
                      <option key={ind.value} value={ind.value}>{ind.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#d1d5db]">
                    ABN <span className="text-[#6b7280] font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.abn}
                    onChange={(e) => setField('abn', e.target.value.replace(/[^\d\s]/g, '').slice(0, 14))}
                    placeholder="12 345 678 901"
                    className={inputCls(fieldErrors.abn)}
                  />
                  {fieldErrors.abn ? (
                    <p className="mt-1.5 text-xs text-red-400">{fieldErrors.abn}</p>
                  ) : (
                    <p className="mt-1.5 text-xs text-[#4b5563]">11-digit Australian Business Number</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Account ── */}
          {step === 2 && (
            <div>
              <h2 className="mb-1 text-lg font-semibold text-white">Your Account</h2>
              <p className="mb-6 text-sm text-[#6b7280]">Create your owner login credentials.</p>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#d1d5db]">
                      First Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={(e) => setField('firstName', e.target.value)}
                      placeholder="Jane"
                      autoComplete="given-name"
                      className={inputCls(fieldErrors.firstName)}
                      autoFocus
                    />
                    {fieldErrors.firstName && (
                      <p className="mt-1.5 text-xs text-red-400">{fieldErrors.firstName}</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#d1d5db]">
                      Last Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={(e) => setField('lastName', e.target.value)}
                      placeholder="Smith"
                      autoComplete="family-name"
                      className={inputCls(fieldErrors.lastName)}
                    />
                    {fieldErrors.lastName && (
                      <p className="mt-1.5 text-xs text-red-400">{fieldErrors.lastName}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#d1d5db]">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    placeholder="jane@mybusiness.com"
                    autoComplete="email"
                    className={inputCls(fieldErrors.email)}
                  />
                  {fieldErrors.email && (
                    <p className="mt-1.5 text-xs text-red-400">{fieldErrors.email}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#d1d5db]">
                    Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setField('password', e.target.value)}
                      placeholder="Min. 8 characters"
                      autoComplete="new-password"
                      className={`${inputCls(fieldErrors.password)} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-[#9ca3af] transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {fieldErrors.password ? (
                    <p className="mt-1.5 text-xs text-red-400">{fieldErrors.password}</p>
                  ) : (
                    <p className="mt-1.5 text-xs text-[#4b5563]">Minimum 8 characters</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#d1d5db]">
                    Confirm Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={form.confirmPassword}
                      onChange={(e) => setField('confirmPassword', e.target.value)}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                      className={`${inputCls(fieldErrors.confirmPassword)} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-[#9ca3af] transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && (
                    <p className="mt-1.5 text-xs text-red-400">{fieldErrors.confirmPassword}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Choose Plan ── */}
          {step === 3 && (
            <div>
              <h2 className="mb-1 text-lg font-semibold text-white">Choose Your Plan</h2>
              <p className="mb-6 text-sm text-[#6b7280]">Start with a 30-day free trial on any plan. Cancel anytime.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {PLANS.map((plan) => {
                  const isSelected = form.plan === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setField('plan', plan.id)}
                      className={`relative flex flex-col rounded-2xl border p-5 text-left transition-all ${
                        isSelected
                          ? 'border-[#6366f1] bg-[#6366f1]/10 ring-2 ring-[#6366f1]/40'
                          : 'border-[#2a2a2a] bg-[#0d0d0d] hover:border-[#404040]'
                      }`}
                    >
                      {plan.highlight && (
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#6366f1] px-3 py-0.5 text-xs font-semibold text-white shadow">
                          Most Popular
                        </span>
                      )}
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-base font-bold text-white">{plan.name}</span>
                        {isSelected && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#6366f1]">
                            <svg className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                        )}
                      </div>
                      <p className="mb-0.5 text-xl font-bold text-[#6366f1]">{plan.price}</p>
                      {plan.trial && (
                        <p className="mb-3 text-xs text-[#10b981] font-medium">{plan.trial}</p>
                      )}
                      {!plan.trial && <div className="mb-3" />}
                      <p className="mb-4 text-xs text-[#6b7280] leading-relaxed">{plan.description}</p>
                      <ul className="space-y-1.5">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-2 text-xs text-[#9ca3af]">
                            <svg className="h-3 w-3 shrink-0 text-[#6366f1]" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 4: Confirmation ── */}
          {step === 4 && (
            <div>
              <h2 className="mb-1 text-lg font-semibold text-white">You&apos;re almost there!</h2>
              <p className="mb-6 text-sm text-[#6b7280]">Review your details and create your account.</p>

              {/* Summary card */}
              <div className="mb-6 rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] divide-y divide-[#1f1f1f]">
                <div className="flex items-center justify-between px-5 py-4">
                  <span className="text-sm text-[#6b7280]">Business</span>
                  <span className="text-sm font-semibold text-white">{form.businessName}</span>
                </div>
                {form.industry && (
                  <div className="flex items-center justify-between px-5 py-4">
                    <span className="text-sm text-[#6b7280]">Industry</span>
                    <span className="text-sm font-semibold text-white capitalize">{form.industry.replace('_', ' ')}</span>
                  </div>
                )}
                {form.abn && (
                  <div className="flex items-center justify-between px-5 py-4">
                    <span className="text-sm text-[#6b7280]">ABN</span>
                    <span className="text-sm font-semibold text-white font-mono">{form.abn}</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-5 py-4">
                  <span className="text-sm text-[#6b7280]">Name</span>
                  <span className="text-sm font-semibold text-white">{form.firstName} {form.lastName}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-4">
                  <span className="text-sm text-[#6b7280]">Email</span>
                  <span className="text-sm font-semibold text-white">{form.email}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-4">
                  <span className="text-sm text-[#6b7280]">Plan</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-white capitalize">{form.plan}</span>
                    <span className="rounded-full bg-[#6366f1]/20 px-2 py-0.5 text-xs font-medium text-[#818cf8]">
                      {PLANS.find((p) => p.id === form.plan)?.price}
                    </span>
                  </span>
                </div>
                {form.plan === 'starter' && (
                  <div className="px-5 py-3 bg-[#10b981]/5 rounded-b-2xl">
                    <p className="text-xs text-[#10b981] font-medium text-center">
                      30-day free trial included — no credit card required today
                    </p>
                  </div>
                )}
              </div>

              {/* Server error */}
              {serverError && (
                <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {serverError}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="w-full rounded-xl bg-[#6366f1] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#6366f1]/25 transition hover:bg-[#5253cc] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating account…
                  </span>
                ) : (
                  'Create Account'
                )}
              </button>

              <p className="mt-3 text-center text-xs text-[#4b5563]">
                By creating an account you agree to our{' '}
                <a href="https://elevatedpos.com.au/terms" className="text-[#6366f1] hover:underline" target="_blank" rel="noopener noreferrer">Terms of Service</a>
                {' '}and{' '}
                <a href="https://elevatedpos.com.au/privacy" className="text-[#6366f1] hover:underline" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
              </p>
            </div>
          )}

          {/* ── Navigation Buttons ── */}
          {step < 4 && (
            <div className={`mt-6 flex gap-3 ${step > 1 ? 'justify-between' : 'justify-end'}`}>
              {step > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] px-5 py-2.5 text-sm font-medium text-[#9ca3af] transition hover:bg-[#1a1a1a] hover:text-white"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                className="rounded-xl bg-[#6366f1] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#6366f1]/20 transition hover:bg-[#5253cc] active:scale-95"
              >
                {step === 3 ? 'Review & Confirm' : 'Continue'}
              </button>
            </div>
          )}

          {step === 4 && step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="mt-3 w-full rounded-xl border border-[#2a2a2a] bg-transparent px-4 py-2.5 text-sm font-medium text-[#6b7280] transition hover:bg-[#1a1a1a] hover:text-[#9ca3af]"
            >
              Back
            </button>
          )}
        </div>

        {/* Sign in link */}
        <p className="mt-6 text-center text-sm text-[#6b7280]">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-[#6366f1] hover:text-[#818cf8] transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
