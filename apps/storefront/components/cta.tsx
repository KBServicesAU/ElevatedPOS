'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';

export function CTA() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="relative py-32 sm:py-44">
      <div
        ref={ref}
        className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12"
      >
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl"
        >
          <h2
            className="font-black tracking-[-0.03em] leading-[1.0] mb-8"
            style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
          >
            Run your venue.
            <br />
            <span className="text-neutral-500">Not your software.</span>
          </h2>
          <p className="text-lg sm:text-xl text-neutral-400 mb-12 max-w-lg text-pretty">
            Start your free 14-day trial. No credit card required.
            Set up in under an hour.
          </p>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <Link
              href="/onboard"
              className="btn-accent px-10 py-4 rounded-full text-sm font-medium text-white"
            >
              Get started for free
            </Link>
            <a
              href="mailto:sales@elevatedpos.com.au"
              className="text-sm text-neutral-500 hover:text-white transition-colors duration-300 py-4 link-underline"
            >
              Talk to sales
            </a>
          </div>
        </motion.div>
      </div>

      {/* Bottom divider */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
    </section>
  );
}
