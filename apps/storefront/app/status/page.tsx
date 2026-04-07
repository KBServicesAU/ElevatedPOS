'use client';

import { useRef, useState, type FormEvent } from 'react';
import { motion, useInView } from 'framer-motion';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

/* ------------------------------------------------------------------ */
/* Animation Wrapper                                                   */
/* ------------------------------------------------------------------ */

function AnimatedSection({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

const services = [
  { name: 'POS Terminal', uptime: 99.99 },
  { name: 'Kitchen Display', uptime: 99.98 },
  { name: 'Self-Serve Kiosk', uptime: 99.97 },
  { name: 'Payment Processing', uptime: 99.99 },
  { name: 'Cloud Sync', uptime: 99.95 },
  { name: 'Web Dashboard', uptime: 99.99 },
  { name: 'API', uptime: 99.99 },
  { name: 'Notifications', uptime: 99.96 },
];

/* ------------------------------------------------------------------ */
/* Uptime Bar Component                                                */
/* ------------------------------------------------------------------ */

function UptimeBar() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <div ref={ref} className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">90-day uptime</span>
        <span className="text-white font-medium">99.9%</span>
      </div>
      <div className="w-full bg-white/[0.05] rounded-full h-2">
        <motion.div
          initial={{ width: 0 }}
          animate={isInView ? { width: '99.9%' } : {}}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="bg-emerald-500 h-2 rounded-full"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function StatusPage() {
  const [subscribed, setSubscribed] = useState(false);

  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  function handleSubscribe(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubscribed(true);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 sm:pb-20">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <AnimatedSection>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-8">
              System Status
            </p>
            <div className="flex items-center gap-4 mb-4">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
              <h1
                className="font-black tracking-[-0.03em] leading-[1.0]"
                style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
              >
                All Systems Operational
              </h1>
            </div>
            <p className="text-lg text-neutral-500">
              {today}
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
        <div className="h-px bg-white/[0.06]" />
      </div>

      {/* Overall Uptime Bar */}
      <section className="py-16 sm:py-20">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <AnimatedSection>
            <div className="border border-white/[0.08] rounded-2xl p-8">
              <UptimeBar />
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Service List */}
      <section className="pb-16 sm:pb-20">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <AnimatedSection>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-8">
              Services
            </p>
            <div>
              {services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between py-5 border-b border-white/[0.06]"
                >
                  <span className="font-medium text-white">
                    {service.name}
                  </span>
                  <div className="flex items-center gap-6">
                    <span className="bg-emerald-500/10 text-emerald-400 text-xs px-3 py-1 rounded-full">
                      Operational
                    </span>
                    <span className="text-sm text-neutral-500 hidden sm:block">
                      {service.uptime}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Incident History */}
      <section className="pb-16 sm:pb-20">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <AnimatedSection>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-8">
              Incident History
            </p>
            <div className="border border-white/[0.08] rounded-xl p-8">
              <h3 className="text-lg font-semibold text-white mb-6">Recent Incidents</h3>
              <div className="text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <p className="text-neutral-500">
                  No incidents in the last 30 days.
                </p>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
        <div className="h-px bg-white/[0.06]" />
      </div>

      {/* Subscribe */}
      <section className="py-24 sm:py-32">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <AnimatedSection className="text-center max-w-lg mx-auto">
            <h2
              className="font-black tracking-[-0.03em] leading-[1.0] mb-4"
              style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)' }}
            >
              Get notified of outages
            </h2>
            <p className="text-neutral-400 mb-8">
              Subscribe to receive email alerts when something goes wrong.
            </p>

            {subscribed ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="text-emerald-400 font-medium">
                  You&apos;re subscribed. We&apos;ll keep you in the loop.
                </p>
              </motion.div>
            ) : (
              <form
                onSubmit={handleSubscribe}
                className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
              >
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  className="flex-1 bg-white/[0.05] border border-white/[0.08] text-white placeholder-neutral-500 rounded-full px-6 py-3.5 text-sm outline-none focus:border-white/[0.2] transition-colors duration-300"
                />
                <button
                  type="submit"
                  className="btn-outline px-8 py-3.5 rounded-full text-sm font-medium whitespace-nowrap"
                >
                  Subscribe
                </button>
              </form>
            )}
          </AnimatedSection>
        </div>
      </section>

      <Footer />
    </div>
  );
}
