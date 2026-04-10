'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '../../components/Sidebar';
import { Check, ChevronRight, Building2, CreditCard, ClipboardCheck } from 'lucide-react';

type BusinessType = 'retail' | 'hospitality' | 'qsr';
type Plan = 'Starter' | 'Growth' | 'Pro';

interface StepOneData {
  businessName: string;
  abn: string;
  ownerName: string;
  email: string;
  phone: string;
  businessType: BusinessType | '';
}

const PLANS: { id: Plan; price: number; features: string[]; highlight?: boolean }[] = [
  {
    id: 'Starter',
    price: 299,
    features: [
      'Up to 1 location',
      '2 POS devices',
      'Basic reporting',
      'Email support',
      'Standard integrations',
    ],
  },
  {
    id: 'Growth',
    price: 499,
    highlight: true,
    features: [
      'Up to 5 locations',
      '10 POS devices',
      'Advanced reporting',
      'Priority support',
      'Loyalty & campaigns',
      'Inventory management',
    ],
  },
  {
    id: 'Pro',
    price: 999,
    features: [
      'Unlimited locations',
      'Unlimited POS devices',
      'Full analytics suite',
      'Dedicated account manager',
      'Custom integrations',
      'Franchise management',
      'AI-powered insights',
    ],
  },
];

const STEP_META = [
  { id: 1, label: 'Business Details', icon: Building2 },
  { id: 2, label: 'Plan Selection', icon: CreditCard },
  { id: 3, label: 'Confirmation', icon: ClipboardCheck },
];

export default function NewTenantPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [provisioning, setProvisioning] = useState(false);
  const [provisioned, setProvisioned] = useState(false);

  const [stepOne, setStepOne] = useState<StepOneData>({
    businessName: '',
    abn: '',
    ownerName: '',
    email: '',
    phone: '',
    businessType: '',
  });
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  function canProceedStepOne() {
    return (
      stepOne.businessName.trim() &&
      stepOne.ownerName.trim() &&
      stepOne.email.trim() &&
      stepOne.businessType
    );
  }

  async function handleProvision() {
    if (!selectedPlan) return;
    setProvisioning(true);
    try {
      const [firstName, ...rest] = stepOne.ownerName.trim().split(' ');
      const lastName = rest.join(' ') || firstName;
      const res = await fetch('/api/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: stepOne.businessName,
          abn: stepOne.abn || undefined,
          email: stepOne.email,
          phone: stepOne.phone || undefined,
          firstName: firstName ?? stepOne.ownerName,
          lastName: lastName ?? '',
          plan: selectedPlan.toLowerCase() as 'starter' | 'growth' | 'pro',
          industry: stepOne.businessType || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Provisioning failed' })) as { error?: string };
        alert(err.error ?? 'Provisioning failed. Please try again.');
        setProvisioning(false);
        return;
      }
      setProvisioned(true);
    } catch {
      alert('Network error. Please check your connection and try again.');
    } finally {
      setProvisioning(false);
    }
  }

  if (provisioned) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950 rounded-full flex items-center justify-center mx-auto mb-5">
              <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Tenant Provisioned!</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-2">
              <strong className="dark:text-white">{stepOne.businessName}</strong> has been successfully set up on the{' '}
              <strong className="dark:text-white">{selectedPlan}</strong> plan.
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mb-8">
              A welcome email has been sent to {stepOne.email} with login credentials.
            </p>
            <button
              onClick={() => router.push('/tenants')}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              View All Tenants
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-4">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Provision New Tenant</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Set up a new tenant on the ElevatedPOS platform</p>
        </header>

        <div className="p-8 max-w-3xl">
          {/* Step Indicator */}
          <div className="flex items-center gap-0 mb-10">
            {STEP_META.map(({ id, label, icon: Icon }, idx) => (
              <div key={id} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                      step > id
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : step === id
                        ? 'border-indigo-600 text-indigo-600 bg-white dark:bg-slate-900'
                        : 'border-slate-200 dark:border-slate-700 text-slate-400 bg-white dark:bg-slate-900'
                    }`}
                  >
                    {step > id ? <Check className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span
                    className={`mt-2 text-xs font-medium whitespace-nowrap ${
                      step >= id ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {idx < STEP_META.length - 1 && (
                  <div className={`flex-1 h-0.5 mb-5 mx-2 ${step > id ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Step 1 — Business Details */}
          {step === 1 && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Business Details</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Provide the new tenant&apos;s business information</p>
              </div>
              <div className="p-6 grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Business Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Coastal Café Pty Ltd"
                    value={stepOne.businessName}
                    onChange={(e) => setStepOne({ ...stepOne, businessName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 dark:bg-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">ABN</label>
                  <input
                    type="text"
                    placeholder="e.g. 51 824 753 556"
                    value={stepOne.abn}
                    onChange={(e) => setStepOne({ ...stepOne, abn: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 dark:bg-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Business Type <span className="text-red-500">*</span></label>
                  <select
                    value={stepOne.businessType}
                    onChange={(e) => setStepOne({ ...stepOne, businessType: e.target.value as BusinessType })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 bg-white dark:bg-slate-800"
                  >
                    <option value="">Select type...</option>
                    <option value="retail">Retail</option>
                    <option value="hospitality">Hospitality</option>
                    <option value="qsr">QSR (Quick Service Restaurant)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Owner Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Sarah Thompson"
                    value={stepOne.ownerName}
                    onChange={(e) => setStepOne({ ...stepOne, ownerName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 dark:bg-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Email <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    placeholder="e.g. owner@business.com"
                    value={stepOne.email}
                    onChange={(e) => setStepOne({ ...stepOne, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 dark:bg-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Phone</label>
                  <input
                    type="tel"
                    placeholder="e.g. +61 2 9000 1234"
                    value={stepOne.phone}
                    onChange={(e) => setStepOne({ ...stepOne, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 dark:bg-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="px-6 pb-6 flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={!canProceedStepOne()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Next: Plan Selection
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — Plan Selection */}
          {step === 2 && (
            <div>
              <div className="grid grid-cols-3 gap-4 mb-6">
                {PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`relative text-left rounded-xl border-2 p-5 transition-all ${
                      selectedPlan === plan.id
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'
                    } ${plan.highlight ? 'ring-1 ring-indigo-400 ring-offset-1 dark:ring-offset-slate-950' : ''}`}
                  >
                    {plan.highlight && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs bg-indigo-600 text-white px-2.5 py-0.5 rounded-full font-medium">
                        Most Popular
                      </span>
                    )}
                    {selectedPlan === plan.id && (
                      <div className="absolute top-3 right-3 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <h3 className="font-bold text-slate-900 dark:text-white mb-1">{plan.id}</h3>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white mb-0.5">${plan.price}<span className="text-sm font-normal text-slate-500 dark:text-slate-400">/mo</span></p>
                    <ul className="mt-4 space-y-1.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                          <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
              <div className="flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!selectedPlan}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Next: Confirm
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Confirmation */}
          {step === 3 && selectedPlan && (
            <div>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm mb-5">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Provisioning Summary</h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Review the details before creating the tenant</p>
                </div>
                <div className="p-6 grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  {[
                    { label: 'Business Name', value: stepOne.businessName },
                    { label: 'Plan', value: selectedPlan },
                    { label: 'ABN', value: stepOne.abn || '—' },
                    { label: 'Monthly Fee', value: `$${PLANS.find((p) => p.id === selectedPlan)?.price}/mo` },
                    { label: 'Owner Name', value: stepOne.ownerName },
                    { label: 'Business Type', value: stepOne.businessType ? stepOne.businessType.charAt(0).toUpperCase() + stepOne.businessType.slice(1) : '—' },
                    { label: 'Email', value: stepOne.email },
                    { label: 'Phone', value: stepOne.phone || '—' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">{label}</p>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6 text-sm text-amber-700 dark:text-amber-300">
                Provisioning will create the tenant environment, send a welcome email to <strong>{stepOne.email}</strong>, and begin the first billing cycle immediately.
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleProvision}
                  disabled={provisioning}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-70 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {provisioning ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Provisioning...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Provision Tenant
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
