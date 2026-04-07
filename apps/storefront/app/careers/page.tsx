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

const benefits = [
  {
    title: 'Remote-first',
    description:
      'Work from anywhere in Australia. We have no office and no plans to get one.',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9 9 0 0 1 3 12c0-1.47.353-2.856.978-4.082"
        />
      </svg>
    ),
  },
  {
    title: 'Competitive salary + equity',
    description:
      'We pay well and everyone on the team holds equity. When ElevatedPOS wins, you win.',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    ),
  },
  {
    title: 'Flexible hours',
    description:
      'We care about output, not hours logged. Structure your day around your life.',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    ),
  },
  {
    title: 'Learning budget',
    description:
      '$2,000 per year for courses, conferences, books, or anything that makes you better.',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5"
        />
      </svg>
    ),
  },
  {
    title: 'Latest hardware',
    description:
      'MacBook Pro, monitor, keyboard, chair. Whatever you need to do your best work.',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z"
        />
      </svg>
    ),
  },
  {
    title: 'Annual team retreat',
    description:
      'Once a year we get the whole team together somewhere good. Last year: Byron Bay.',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
        />
      </svg>
    ),
  },
];

const roles = [
  {
    title: 'Senior Full-Stack Engineer',
    department: 'Engineering',
    location: 'Remote, AU',
  },
  {
    title: 'Product Designer',
    department: 'Design',
    location: 'Remote, AU',
  },
  {
    title: 'Customer Success Lead',
    department: 'Customer Success',
    location: 'Remote, AU',
  },
  {
    title: 'DevOps Engineer',
    department: 'Engineering',
    location: 'Remote, AU',
  },
  {
    title: 'Technical Writer',
    department: 'Product',
    location: 'Remote, AU',
  },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function CareersPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const heroInView = useInView(heroRef, { once: true });

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
            Careers
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
            Help us reimagine hospitality tech.
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
            We are building the platform that powers thousands of venues across
            Australia. Join us and work on problems that matter.
          </motion.p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Culture                                                       */}
      {/* ------------------------------------------------------------ */}
      <section className="relative py-24 sm:py-32">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">
            <SectionTransition>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-8">
                Culture
              </p>
              <h2
                className="font-black tracking-[-0.03em] leading-[1.0] mb-8"
                style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
              >
                Remote-first. Australian-owned.
              </h2>
            </SectionTransition>

            <SectionTransition delay={0.15}>
              <div className="space-y-6 text-neutral-400 leading-relaxed text-lg">
                <p>
                  ElevatedPOS is a fully remote company with team members across
                  every Australian timezone. We believe the best work happens
                  when people have the freedom to structure their day, not when
                  they are stuck in traffic or chained to a desk.
                </p>
                <p>
                  We ship fast, communicate asynchronously by default, and get
                  together in person once a year to plan, bond, and eat far too
                  well. If you care about craft, move quickly, and want to build
                  something people genuinely love using, you will fit right in.
                </p>
              </div>
            </SectionTransition>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Benefits                                                      */}
      {/* ------------------------------------------------------------ */}
      <section className="relative py-24 sm:py-32">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <SectionTransition className="mb-16">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">
              Benefits
            </p>
            <h2
              className="font-black tracking-[-0.03em] leading-[1.0] max-w-2xl"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
            >
              Perks that actually matter.
            </h2>
          </SectionTransition>

          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((benefit) => (
              <StaggerItem key={benefit.title}>
                <div className="border border-white/[0.08] rounded-2xl p-8 hover:border-white/[0.15] transition-colors duration-500 h-full">
                  <div className="text-neutral-400 mb-6">{benefit.icon}</div>
                  <h3 className="text-lg font-semibold tracking-tight mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-neutral-500 text-sm leading-relaxed">
                    {benefit.description}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Open Positions                                                */}
      {/* ------------------------------------------------------------ */}
      <section className="relative py-24 sm:py-32">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <SectionTransition className="mb-16">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">
              Open Roles
            </p>
            <h2
              className="font-black tracking-[-0.03em] leading-[1.0] max-w-2xl"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
            >
              Current openings.
            </h2>
          </SectionTransition>

          <div>
            {roles.map((role, i) => (
              <div key={role.title}>
                <DividerLine />
                <SectionTransition delay={0.05 * i}>
                  <a href="#" className="block group">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-8 sm:py-10">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg sm:text-xl font-bold tracking-tight group-hover:text-violet-400 transition-colors duration-500">
                          {role.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
                        <span className="text-xs font-medium uppercase tracking-[0.1em] text-neutral-500 border border-white/[0.08] rounded-full px-3 py-1">
                          {role.department}
                        </span>
                        <span className="text-sm text-neutral-500">
                          {role.location}
                        </span>
                        <svg
                          className="w-5 h-5 text-neutral-600 group-hover:text-violet-400 group-hover:translate-x-1 transition-all duration-300"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                          />
                        </svg>
                      </div>
                    </div>
                  </a>
                </SectionTransition>
                {i === roles.length - 1 && <DividerLine />}
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
      </section>

      {/* ------------------------------------------------------------ */}
      {/* CTA                                                           */}
      {/* ------------------------------------------------------------ */}
      <section className="relative py-24 sm:py-32">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <SectionTransition>
            <div className="max-w-2xl">
              <h2
                className="font-black tracking-[-0.03em] leading-[1.0] mb-6"
                style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
              >
                Don&apos;t see your role?
              </h2>
              <p className="text-lg text-neutral-400 leading-relaxed mb-10 text-pretty">
                We are always looking for talented people who share our vision.
                If you think you would be a great fit, send us your resume and a
                short note about what excites you.
              </p>
              <a
                href="mailto:careers@elevatedpos.com.au"
                className="btn-outline px-8 py-3.5 rounded-full text-sm font-medium text-white inline-block"
              >
                <span>careers@elevatedpos.com.au</span>
              </a>
            </div>
          </SectionTransition>
        </div>
      </section>

      <Footer />
    </div>
  );
}
