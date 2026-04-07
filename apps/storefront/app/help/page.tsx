'use client';

import { useState, useRef, useMemo } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: FAQItem[];
}

const categories: FAQCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
      </svg>
    ),
    items: [
      {
        question: 'How do I create an account?',
        answer: 'Head to our onboarding page and follow the guided setup. You can be up and running in under ten minutes with your menu, devices, and payment processing configured.',
      },
      {
        question: 'What hardware do I need?',
        answer: 'At minimum you need an iPad (9th generation or newer) or any modern Android tablet. For a full setup we recommend a receipt printer and a card reader, all available in our hardware store.',
      },
      {
        question: 'How long is the free trial?',
        answer: 'Every new account includes a 14-day free trial with full access to all features. No credit card is required to start.',
      },
      {
        question: 'Can I import my existing menu?',
        answer: 'Yes. You can upload a CSV or connect directly with common POS platforms. Our onboarding wizard walks you through the process step by step.',
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
      </svg>
    ),
    items: [
      {
        question: 'What payment methods are supported?',
        answer: 'We support all major credit and debit cards, Apple Pay, Google Pay, and EFTPOS through our integrated payment processing powered by Stripe.',
      },
      {
        question: 'How do payouts work?',
        answer: 'Funds from card payments are deposited into your nominated bank account automatically. Standard payout timing is T+2 business days.',
      },
      {
        question: 'What are the processing fees?',
        answer: 'Card processing is 1.4% + 30c per transaction for domestic cards. International and AMEX rates may differ. Full details are on your billing dashboard.',
      },
      {
        question: 'Can I issue refunds?',
        answer: 'Yes. You can issue full or partial refunds directly from the POS terminal or the web dashboard. Refunds are typically processed within 5-10 business days.',
      },
    ],
  },
  {
    id: 'hardware',
    title: 'Hardware',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5h3m-6.75 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-15a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 4.5v15a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
    items: [
      {
        question: 'What devices are compatible?',
        answer: 'ElevatedPOS runs on iPads (9th gen+), Android tablets (Android 12+), and any modern browser for the web dashboard. Kitchen displays work on any screen with a browser.',
      },
      {
        question: 'Do you sell hardware?',
        answer: 'Yes. We offer curated hardware bundles including tablets, receipt printers, cash drawers, and card readers. All hardware is pre-configured and ships Australia-wide.',
      },
      {
        question: 'How do I connect a receipt printer?',
        answer: 'Navigate to Settings > Hardware in your dashboard, select your printer model, and follow the on-screen pairing instructions. We support Bluetooth, USB, and network printers.',
      },
      {
        question: 'Can I use my existing iPad?',
        answer: 'Absolutely. Any iPad running iPadOS 16 or later is fully supported. Just download the ElevatedPOS app from the App Store and sign in.',
      },
    ],
  },
  {
    id: 'account-billing',
    title: 'Account & Billing',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
    items: [
      {
        question: 'How do I change my plan?',
        answer: 'Go to Settings > Billing in your dashboard and select a new plan. Upgrades take effect immediately; downgrades apply at the end of your current billing cycle.',
      },
      {
        question: 'Can I cancel anytime?',
        answer: 'Yes. There are no lock-in contracts. Cancel from your billing settings and you will retain access until the end of your current paid period.',
      },
      {
        question: 'How do I add team members?',
        answer: 'Navigate to Settings > Team, enter their email address, and assign a role. They will receive an invitation to join your account instantly.',
      },
      {
        question: 'Where are my invoices?',
        answer: 'All invoices are available under Settings > Billing > Invoice History. You can download PDF invoices for your records at any time.',
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* FAQ Item Component                                                  */
/* ------------------------------------------------------------------ */

function FAQItemRow({ item }: { item: FAQItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span className="text-base sm:text-lg font-medium text-white group-hover:text-neutral-300 transition-colors duration-300 pr-8">
          {item.question}
        </span>
        <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-neutral-500">
          <motion.span
            animate={{ rotate: open ? 45 : 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="block text-xl leading-none"
          >
            +
          </motion.span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="text-neutral-400 text-base leading-relaxed pb-5 max-w-2xl">
              {item.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section Wrapper                                                     */
/* ------------------------------------------------------------------ */

function AnimatedSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function HelpPage() {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.question.toLowerCase().includes(q) ||
            item.answer.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [search]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 sm:pb-20">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <AnimatedSection>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-8">
              Help Centre
            </p>
            <h1
              className="font-black tracking-[-0.03em] leading-[1.0] mb-10"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
            >
              How can we help?
            </h1>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for answers..."
              className="w-full max-w-2xl bg-white/[0.05] border border-white/[0.08] text-white placeholder-neutral-500 rounded-xl px-6 py-4 text-lg outline-none focus:border-white/[0.2] transition-colors duration-300"
            />
          </AnimatedSection>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
        <div className="h-px bg-white/[0.06]" />
      </div>

      {/* Category Cards */}
      {!search.trim() && (
        <section className="py-16 sm:py-20">
          <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
            <AnimatedSection>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categories.map((cat) => (
                  <a
                    key={cat.id}
                    href={`#${cat.id}`}
                    className="border border-white/[0.08] rounded-2xl p-8 hover:border-white/[0.15] transition-all duration-500 group"
                    style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
                  >
                    <div className="text-neutral-500 group-hover:text-white transition-colors duration-300 mb-4">
                      {cat.icon}
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-1">{cat.title}</h3>
                    <p className="text-sm text-neutral-500">
                      {cat.items.length} articles
                    </p>
                  </a>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </section>
      )}

      {/* FAQ Sections */}
      <section className="py-8 sm:py-12">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          {filtered.length === 0 && (
            <AnimatedSection className="py-16 text-center">
              <p className="text-neutral-500 text-lg">
                No results found. Try a different search term.
              </p>
            </AnimatedSection>
          )}

          {filtered.map((cat) => (
            <AnimatedSection key={cat.id} className="mb-16">
              <div id={cat.id} className="scroll-mt-28">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-8">
                  {cat.title}
                </p>
                <div>
                  {cat.items.map((item, i) => (
                    <div key={item.question}>
                      <FAQItemRow item={item} />
                      {i < cat.items.length - 1 && (
                        <div className="h-px bg-white/[0.06]" />
                      )}
                    </div>
                  ))}
                </div>
                <div className="h-px bg-white/[0.06] mt-0" />
              </div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-24 sm:py-32">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <AnimatedSection className="text-center">
            <h2
              className="font-black tracking-[-0.03em] leading-[1.0] mb-6"
              style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)' }}
            >
              Still need help?
            </h2>
            <p className="text-lg text-neutral-400 mb-8">
              Our support team is here for you.
            </p>
            <a
              href="mailto:support@elevatedpos.com.au"
              className="btn-accent inline-block px-10 py-4 rounded-full text-sm font-medium text-white"
            >
              Email support
            </a>
          </AnimatedSection>
        </div>
      </section>

      <Footer />
    </div>
  );
}
