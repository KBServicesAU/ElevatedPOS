'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';

const stats = [
  { value: '500+', label: 'Businesses' },
  { value: '10M+', label: 'Orders processed' },
  { value: '99.9%', label: 'Uptime' },
  { value: 'AU', label: 'Owned & built' },
];

const headlineLines = [
  'We built the POS',
  'system we wished',
  'existed.',
];

export function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <section className="relative min-h-screen flex flex-col justify-center">
      <div
        ref={ref}
        className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 pt-32 pb-20 sm:pt-40 sm:pb-28 w-full"
      >
        {/* Tag */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-8"
        >
          Point of Sale, Reimagined
        </motion.p>

        {/* Headline - split text clip animation */}
        <h1
          className="font-black tracking-[-0.03em] leading-[0.95] mb-8"
          style={{ fontSize: 'clamp(3.5rem, 8vw, 8rem)' }}
          aria-label="We built the POS system we wished existed."
        >
          {headlineLines.map((line, i) => (
            <span key={i} className="split-line" aria-hidden="true">
              <motion.span
                className="split-line-inner"
                initial={{ y: '110%' }}
                animate={isInView ? { y: '0%' } : {}}
                transition={{
                  duration: 0.9,
                  delay: 0.15 + i * 0.08,
                  ease: [0.76, 0, 0.24, 1],
                }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-lg sm:text-xl text-neutral-400 max-w-lg leading-relaxed mb-12 text-pretty"
        >
          Cloud-native POS, kitchen display, and self-serve kiosk.
          One platform for every venue, every location. Built in Australia,
          for Australian hospitality.
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row items-start gap-4 mb-24"
        >
          <Link
            href="/onboard"
            className="btn-outline px-8 py-3.5 rounded-full text-sm font-medium text-white"
          >
            <span>Start your free trial</span>
          </Link>
          <a
            href="#features"
            className="text-sm text-neutral-500 hover:text-white transition-colors duration-300 py-3.5 link-underline"
          >
            See how it works
          </a>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.85, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center flex-wrap gap-y-6"
        >
          {stats.map((stat, i) => (
            <div key={stat.label} className="flex items-center">
              {i > 0 && (
                <div className="w-px h-10 bg-white/[0.08] mx-6 sm:mx-8" />
              )}
              <div>
                <p className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {stat.value}
                </p>
                <p className="text-xs text-neutral-500 uppercase tracking-[0.15em] mt-1">
                  {stat.label}
                </p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Bottom divider */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
    </section>
  );
}
