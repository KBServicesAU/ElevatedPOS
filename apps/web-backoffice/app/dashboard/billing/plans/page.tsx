'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Zap, Star, Crown } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  price: number | null; // null = free
  priceLabel?: string;
  description?: string;
  features: string[];
  recommended?: boolean;
}

interface SessionMe {
  plan?: string;
  orgId?: string;
}

// ─── Hardcoded fallback plans ─────────────────────────────────────────────────

const FALLBACK_PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: null,
    priceLabel: 'Free',
    features: [
      '1 location',
      '1 register',
      'Basic reporting',
      'Email support',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 79,
    recommended: true,
    features: [
      '3 locations',
      '3 registers',
      'Advanced reporting',
      'Priority support',
      'Loyalty program',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 149,
    features: [
      'Unlimited locations',
      'Unlimited registers',
      'All features',
      'Dedicated support',
      'API access',
    ],
  },
];

// ─── Plan card icon ───────────────────────────────────────────────────────────

function PlanIcon({ name, className }: { name: string; className?: string }) {
  const n = name.toLowerCase();
  if (n === 'starter') return <Zap className={className} />;
  if (n === 'growth')  return <Star className={className} />;
  return <Crown className={className} />;
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="p-8 max-w-4xl animate-pulse space-y-6">
      <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-72 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlansPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<string>('Starter');
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  // Fetch plans + current session on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingPlans(true);

      // Fetch plans and session in parallel; fall back gracefully
      const [remotePlans, me] = await Promise.allSettled([
        fetch('/api/proxy/billing/plans').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)),
      ]);

      if (cancelled) return;

      // Resolve plans
      let resolvedPlans: Plan[] = FALLBACK_PLANS;
      if (remotePlans.status === 'fulfilled' && remotePlans.value) {
        const raw = remotePlans.value;
        const arr: Plan[] = Array.isArray(raw) ? raw : (raw.data ?? raw.plans ?? []);
        if (arr.length > 0) resolvedPlans = arr;
      }
      setPlans(resolvedPlans);

      // Resolve current plan
      if (me.status === 'fulfilled' && me.value) {
        const session = me.value as SessionMe;
        if (session.plan) setCurrentPlan(session.plan);
      }

      setLoadingPlans(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  async function handleSelectPlan(planId: string, planName: string) {
    if (upgrading) return;
    setUpgrading(planId);
    try {
      await apiFetch('billing/upgrade', {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
      setCurrentPlan(planName);
      toast({ title: `Upgraded to ${planName}!`, variant: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upgrade failed';
      toast({ title: 'Upgrade failed', description: msg, variant: 'destructive' });
    } finally {
      setUpgrading(null);
    }
  }

  if (loadingPlans) return <Skeleton />;

  return (
    <div className="p-8 max-w-4xl">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Billing
      </button>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Choose a Plan</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Select the plan that best fits your business.
        </p>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {plans.map((plan, idx) => {
          const isCurrentPlan =
            plan.name.toLowerCase() === currentPlan.toLowerCase() ||
            plan.id.toLowerCase() === currentPlan.toLowerCase();
          const isRecommended = plan.recommended ?? idx === 1;
          const isUpgrading = upgrading === plan.id;

          return (
            <div
              key={plan.id}
              className={[
                'relative flex flex-col bg-white dark:bg-gray-900 rounded-2xl border p-6 transition-shadow hover:shadow-md',
                isRecommended
                  ? 'border-indigo-500 shadow-indigo-100 dark:shadow-none ring-1 ring-indigo-500'
                  : 'border-gray-200 dark:border-gray-800',
              ].join(' ')}
            >
              {/* Most Popular badge */}
              {isRecommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-semibold shadow">
                    <Star className="h-3 w-3" />
                    Most Popular
                  </span>
                </div>
              )}

              {/* Current Plan badge */}
              {isCurrentPlan && (
                <div className="absolute top-4 right-4">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-semibold">
                    <Check className="h-3 w-3" />
                    Current Plan
                  </span>
                </div>
              )}

              {/* Plan icon + name */}
              <div className="mb-4">
                <div className={[
                  'inline-flex items-center justify-center h-10 w-10 rounded-xl mb-3',
                  isRecommended
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
                ].join(' ')}>
                  <PlanIcon name={plan.name} className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h2>
              </div>

              {/* Price */}
              <div className="mb-5">
                {plan.priceLabel ? (
                  <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
                    {plan.priceLabel}
                  </p>
                ) : plan.price === null ? (
                  <p className="text-3xl font-extrabold text-gray-900 dark:text-white">Free</p>
                ) : (
                  <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
                    ${plan.price}
                    <span className="text-base font-normal text-gray-400 dark:text-gray-500">/month</span>
                  </p>
                )}
                {plan.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{plan.description}</p>
                )}
              </div>

              {/* Features */}
              <ul className="flex-1 space-y-2.5 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {isCurrentPlan ? (
                <div className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm font-semibold">
                  <Check className="h-4 w-4" />
                  Your Current Plan
                </div>
              ) : (
                <button
                  disabled={!!upgrading}
                  onClick={() => handleSelectPlan(plan.id, plan.name)}
                  className={[
                    'w-full py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2',
                    isRecommended
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-60',
                  ].join(' ')}
                >
                  {isUpgrading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Upgrading…
                    </>
                  ) : (
                    'Select Plan'
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="mt-8 text-center text-xs text-gray-400 dark:text-gray-600">
        All plans include a 14-day free trial. No credit card required.{' '}
        <a href="mailto:support@elevatedpos.com.au" className="text-indigo-500 hover:underline">
          Contact us
        </a>{' '}
        for enterprise pricing.
      </p>
    </div>
  );
}
