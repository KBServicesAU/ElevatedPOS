'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { SectionTransition } from './section-transition';

const testimonials = [
  {
    quote:
      'The KDS integration alone saved us 20 minutes per service. Our kitchen has never been so organised.',
    name: 'Sarah M.',
    role: 'Cafe Owner',
    location: 'Melbourne',
  },
  {
    quote:
      'We moved from three separate systems to ElevatedPOS and our ops costs dropped by 40%.',
    name: 'James T.',
    role: 'Restaurant Manager',
    location: 'Sydney',
  },
  {
    quote:
      'Setup took less than an hour. The support team is brilliant.',
    name: 'Priya K.',
    role: 'Retail Store Owner',
    location: 'Brisbane',
  },
  {
    quote:
      'The analytics dashboard gives me insights I never had before. Game changer for our franchise.',
    name: 'Tom L.',
    role: 'Franchise Director',
    location: 'Perth',
  },
  {
    quote:
      'Our self-serve kiosks boosted average order value by 25%. Customers love the experience.',
    name: 'Nina R.',
    role: 'QSR Owner',
    location: 'Adelaide',
  },
  {
    quote:
      'Finally a POS that actually works offline. We run markets every weekend and never miss a sale.',
    name: 'Daniel W.',
    role: 'Market Vendor',
    location: 'Gold Coast',
  },
];

export function Testimonials() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const t = testimonials[current]!;

  return (
    <section id="testimonials" className="relative py-24 sm:py-32">
      <div
        ref={ref}
        className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12"
      >
        <SectionTransition className="mb-16">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">
            Testimonials
          </p>
          <h2
            className="font-black tracking-[-0.03em] leading-[1.05]"
            style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
          >
            Trusted by Australian businesses.
          </h2>
        </SectionTransition>

        {/* Large Quote Display */}
        <div className="min-h-[300px] sm:min-h-[350px] flex flex-col justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <blockquote
                className="font-light italic leading-relaxed text-neutral-200 mb-10 max-w-4xl text-pretty"
                style={{ fontSize: 'clamp(1.5rem, 3vw, 2.5rem)' }}
              >
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              <div className="flex items-center gap-4">
                <div className="w-px h-8 bg-white/[0.15]" />
                <div>
                  <p className="text-sm font-medium text-white">
                    {t.name}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {t.role}, {t.location}
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress Dots */}
        <div className="flex items-center gap-2 mt-12">
          {testimonials.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-px transition-all duration-500 ${
                i === current
                  ? 'w-8 bg-white'
                  : 'w-4 bg-white/[0.15] hover:bg-white/[0.3]'
              }`}
              aria-label={`View testimonial ${i + 1}`}
              style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
            />
          ))}
        </div>
      </div>

      {/* Bottom divider */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
    </section>
  );
}
