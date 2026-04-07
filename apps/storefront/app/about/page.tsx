'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import {
  SectionTransition,
  StaggerContainer,
  StaggerItem,
  DividerLine,
} from '@/components/section-transition';

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

const values = [
  {
    number: '01',
    title: 'Speed over complexity',
    description:
      'Every screen, every tap, every workflow is designed to shave seconds off real tasks. We obsess over speed because your staff are mid-rush, not mid-demo.',
  },
  {
    number: '02',
    title: 'Australian-first',
    description:
      'Built in Australia, for Australian tax rules, tipping culture, and payment networks. No retrofitted US product with a localisation patch.',
  },
  {
    number: '03',
    title: 'Transparent pricing',
    description:
      'No hidden fees, no lock-in contracts, no surprise charges at the end of the month. You see every cost before you commit.',
  },
  {
    number: '04',
    title: 'Relentless support',
    description:
      'Real humans, Australian timezone, fast response. We pick up the phone because we remember what it feels like when the till goes down on a Friday night.',
  },
];

const team = [
  { name: 'Marcus Chen', role: 'Founder & CEO', color: 'bg-violet-600' },
  { name: 'Sarah Walsh', role: 'Head of Product', color: 'bg-emerald-600' },
  { name: 'James Patel', role: 'Lead Engineer', color: 'bg-amber-600' },
  { name: 'Mia Nguyen', role: 'Customer Success', color: 'bg-rose-600' },
  { name: 'Tom Bradley', role: 'Design Lead', color: 'bg-sky-600' },
];

const stats = [
  { value: '2024', label: 'Founded' },
  { value: '500+', label: 'Businesses' },
  { value: '15', label: 'Team Members' },
  { value: '99.9%', label: 'Uptime' },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function AboutPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const heroInView = useInView(heroRef, { once: true });

  const quoteRef = useRef<HTMLDivElement>(null);
  const quoteInView = useInView(quoteRef, { once: true, margin: '-80px' });

  const statsRef = useRef<HTMLDivElement>(null);
  const statsInView = useInView(statsRef, { once: true, margin: '-60px' });

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />

      {/* ------------------------------------------------------------ */}
      {/* Hero                                                          */}
      {/* ------------------------------------------------------------ */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28">
        <div
          ref={heroRef}
          className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12"
        >
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-8"
          >
            About Us
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{
              duration: 0.8,
              delay: 0.1,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="font-black tracking-[-0.03em] leading-[1.0] mb-8 max-w-3xl"
            style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
          >
            Built in Australia, for Australian hospitality.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{
              duration: 0.7,
              delay: 0.3,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="text-lg sm:text-xl text-neutral-400 max-w-xl leading-relaxed text-pretty"
          >
            We started ElevatedPOS because hospitality deserves technology that
            works as hard as the people behind the counter.
          </motion.p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Story                                                         */}
      {/* ------------------------------------------------------------ */}
      <section className="relative py-24 sm:py-32">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">
            {/* Pull quote */}
            <div ref={quoteRef}>
              <motion.blockquote
                initial={{ opacity: 0, y: 30 }}
                animate={quoteInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-snug text-pretty"
              >
                &ldquo;We spent years watching venues struggle with software that
                was built for someone else. So we built our own.&rdquo;
              </motion.blockquote>
              <motion.p
                initial={{ opacity: 0 }}
                animate={quoteInView ? { opacity: 1 } : {}}
                transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="text-sm text-neutral-500 mt-6"
              >
                Marcus Chen, Founder & CEO
              </motion.p>
            </div>

            {/* Story paragraphs */}
            <SectionTransition delay={0.15}>
              <div className="space-y-6 text-neutral-400 leading-relaxed text-lg">
                <p>
                  ElevatedPOS was born out of frustration. After years running
                  hospitality venues across Melbourne and Sydney, our founders
                  experienced first-hand how legacy POS systems held operators
                  back. Clunky hardware, laggy software, opaque pricing, and
                  support teams that vanished after the sale.
                </p>
                <p>
                  We set out to build the system we always wished existed:
                  cloud-native, lightning-fast, and designed around the way
                  Australian venues actually operate. From split-bill workflows
                  to GST compliance, every detail is considered.
                </p>
                <p>
                  Today, ElevatedPOS powers cafes, restaurants, bars, and retail
                  stores across the country. We are still a small team, still
                  based in Australia, and still obsessed with making hospitality
                  tech that genuinely works.
                </p>
              </div>
            </SectionTransition>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Values                                                        */}
      {/* ------------------------------------------------------------ */}
      <section className="relative py-24 sm:py-32">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <SectionTransition className="mb-20">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">
              Our Values
            </p>
            <h2
              className="font-black tracking-[-0.03em] leading-[1.0] max-w-2xl"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
            >
              What we believe in.
            </h2>
          </SectionTransition>

          <div>
            {values.map((value, i) => (
              <div key={value.number}>
                <DividerLine />
                <SectionTransition delay={0.1}>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 py-12 sm:py-16 group">
                    <div className="lg:col-span-1">
                      <span className="feature-number text-4xl sm:text-5xl lg:text-6xl">
                        {value.number}
                      </span>
                    </div>
                    <div className="lg:col-span-4">
                      <h3 className="text-2xl sm:text-3xl font-bold tracking-tight group-hover:text-violet-400 transition-colors duration-500">
                        {value.title}
                      </h3>
                    </div>
                    <div className="lg:col-span-7">
                      <p className="text-neutral-400 leading-relaxed text-base sm:text-lg max-w-xl text-pretty">
                        {value.description}
                      </p>
                    </div>
                  </div>
                </SectionTransition>
                {i === values.length - 1 && <DividerLine />}
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Team                                                          */}
      {/* ------------------------------------------------------------ */}
      <section className="relative py-24 sm:py-32">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <SectionTransition className="mb-16">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">
              The Team
            </p>
            <h2
              className="font-black tracking-[-0.03em] leading-[1.0] max-w-2xl"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
            >
              Small team. Big ambitions.
            </h2>
          </SectionTransition>

          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {team.map((member) => (
              <StaggerItem key={member.name}>
                <div className="border border-white/[0.08] rounded-2xl p-8 hover:border-white/[0.15] transition-colors duration-500">
                  <div
                    className={`w-14 h-14 ${member.color} rounded-full flex items-center justify-center mb-6`}
                  >
                    <span className="text-xl font-bold text-white">
                      {member.name.charAt(0)}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight mb-1">
                    {member.name}
                  </h3>
                  <p className="text-sm text-neutral-500">{member.role}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
      </section>

      {/* ------------------------------------------------------------ */}
      {/* By the Numbers                                                */}
      {/* ------------------------------------------------------------ */}
      <section className="relative py-24 sm:py-32">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <SectionTransition className="mb-16">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">
              By the Numbers
            </p>
          </SectionTransition>

          <div ref={statsRef}>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={statsInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center flex-wrap gap-y-8"
            >
              {stats.map((stat, i) => (
                <div key={stat.label} className="flex items-center">
                  {i > 0 && (
                    <div className="w-px h-10 bg-white/[0.08] mx-6 sm:mx-10 lg:mx-14" />
                  )}
                  <div>
                    <p className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
                      {stat.value}
                    </p>
                    <p className="text-xs text-neutral-500 uppercase tracking-[0.15em] mt-2">
                      {stat.label}
                    </p>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
