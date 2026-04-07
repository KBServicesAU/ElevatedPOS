'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { SectionTransition } from './section-transition';

interface Plan {
  id: string;
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  featured: boolean;
  contactUs?: boolean;
}

const monthly: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$49',
    period: '/mo',
    tagline: 'For small and growing businesses',
    features: ['1 location', '2 devices', 'POS + Kiosk', 'Email support', 'Basic reports'],
    featured: false,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$149',
    period: '/mo',
    tagline: 'For multi-location businesses',
    features: [
      '3 locations',
      '10 devices',
      'Everything in Starter',
      'Kitchen Display (KDS)',
      'Phone support',
      'Advanced analytics',
      'Loyalty programs',
    ],
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    tagline: 'For enterprise and franchise groups',
    features: [
      'Unlimited locations & devices',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantee',
      'Priority support',
    ],
    featured: false,
    contactUs: true,
  },
];

const annual: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$490',
    period: '/yr',
    tagline: 'For small and growing businesses',
    features: ['1 location', '2 devices', 'POS + Kiosk', 'Email support', 'Basic reports'],
    featured: false,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$1,490',
    period: '/yr',
    tagline: 'For multi-location businesses',
    features: [
      '3 locations',
      '10 devices',
      'Everything in Starter',
      'Kitchen Display (KDS)',
      'Phone support',
      'Advanced analytics',
      'Loyalty programs',
    ],
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    tagline: 'For enterprise and franchise groups',
    features: [
      'Unlimited locations & devices',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantee',
      'Priority support',
    ],
    featured: false,
    contactUs: true,
  },
];

export function Pricing() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const plans = billing === 'monthly' ? monthly : annual;

  return (
    <section id="pricing" className="relative py-24 sm:py-32">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
        {/* Section Header */}
        <SectionTransition className="mb-16">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">
            Pricing
          </p>
          <h2
            className="font-black tracking-[-0.03em] leading-[1.05] mb-5"
            style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
          >
            Simple, honest pricing.
          </h2>
          <p className="text-neutral-400 text-lg mb-10">
            No lock-in contracts. Cancel any time.
          </p>

          {/* Toggle */}
          <div className="inline-flex items-center border border-white/[0.08] rounded-full p-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`relative px-5 py-2 rounded-full text-sm font-medium transition-colors duration-300 ${
                billing === 'monthly' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {billing === 'monthly' && (
                <motion.div
                  layoutId="billing-pill"
                  className="absolute inset-0 bg-white/[0.08] rounded-full"
                  initial={false}
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                />
              )}
              <span className="relative">Monthly</span>
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`relative px-5 py-2 rounded-full text-sm font-medium transition-colors duration-300 ${
                billing === 'annual' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {billing === 'annual' && (
                <motion.div
                  layoutId="billing-pill"
                  className="absolute inset-0 bg-white/[0.08] rounded-full"
                  initial={false}
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                />
              )}
              <span className="relative">
                Annual{' '}
                <span className="text-violet-400 text-xs font-medium ml-1">
                  Save 2mo
                </span>
              </span>
            </button>
          </div>
        </SectionTransition>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col h-full rounded-2xl p-8 transition-all duration-500 ${
                plan.featured
                  ? 'pricing-card-featured'
                  : 'pricing-card'
              }`}
              style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
              {/* Featured indicator */}
              {plan.featured && (
                <p className="text-xs font-medium uppercase tracking-[0.15em] text-neutral-400 mb-6">
                  Most popular
                </p>
              )}

              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-3">
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={plan.price + billing}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="text-4xl font-black tracking-tight"
                    >
                      {plan.price}
                    </motion.span>
                  </AnimatePresence>
                  {plan.period && (
                    <span className={plan.featured ? 'text-neutral-400' : 'text-neutral-500'}>
                      {plan.period}
                    </span>
                  )}
                </div>
                <p className={`text-sm mt-2 ${plan.featured ? 'text-neutral-500' : 'text-neutral-500'}`}>
                  {plan.tagline}
                </p>
              </div>

              <ul className="space-y-3 flex-1 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm">
                    <span
                      className={`w-1 h-1 rounded-full flex-shrink-0 ${
                        plan.featured ? 'bg-neutral-400' : 'bg-neutral-600'
                      }`}
                    />
                    <span className={plan.featured ? 'text-neutral-600' : 'text-neutral-400'}>
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              {plan.contactUs ? (
                <a
                  href="mailto:sales@elevatedpos.com.au"
                  className="block text-center text-sm font-medium border border-white/[0.12] hover:border-white/[0.25] px-6 py-3.5 rounded-full transition-all duration-300 text-neutral-300 hover:text-white"
                >
                  Contact us
                </a>
              ) : (
                <Link
                  href="/onboard"
                  className={`block text-center text-sm font-medium px-6 py-3.5 rounded-full transition-all duration-300 ${
                    plan.featured
                      ? 'bg-[#0a0a0a] text-white hover:bg-neutral-800'
                      : 'border border-white/[0.12] text-neutral-300 hover:border-white/[0.25] hover:text-white'
                  }`}
                >
                  Get started
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom divider */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
    </section>
  );
}
