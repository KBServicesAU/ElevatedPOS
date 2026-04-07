'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import {
  SectionTransition,
  StaggerContainer,
  StaggerItem,
} from '@/components/section-transition';

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

const featuredPost = {
  title: 'Why we\u2019re building the anti-enterprise POS',
  excerpt:
    'Most point-of-sale systems are designed top-down for enterprise buyers, not the operators who use them every day. We took the opposite approach.',
  date: '28 Mar 2026',
  readTime: '6 min read',
  gradient: 'from-violet-600/30 to-fuchsia-600/20',
  category: 'Company',
};

const posts = [
  {
    title: 'Offline mode: How we handle connectivity drops',
    excerpt:
      'What happens when the Wi-Fi goes down mid-service? Our offline-first architecture keeps orders flowing.',
    date: '20 Mar 2026',
    readTime: '5 min read',
    category: 'Engineering',
    accent: 'bg-sky-500',
  },
  {
    title: 'The hidden cost of POS lock-in contracts',
    excerpt:
      'Three-year contracts sound fine until you need to switch. Here is what the fine print really costs.',
    date: '12 Mar 2026',
    readTime: '4 min read',
    category: 'Industry',
    accent: 'bg-amber-500',
  },
  {
    title: 'Kitchen Display Systems: A complete guide',
    excerpt:
      'Everything you need to know about KDS, from hardware to workflow configuration.',
    date: '4 Mar 2026',
    readTime: '8 min read',
    category: 'Product',
    accent: 'bg-emerald-500',
  },
  {
    title: 'How loyalty programs actually drive revenue',
    excerpt:
      'We analysed data across hundreds of venues to see which loyalty mechanics move the needle.',
    date: '22 Feb 2026',
    readTime: '5 min read',
    category: 'Industry',
    accent: 'bg-rose-500',
  },
  {
    title: 'Our approach to payment processing fees',
    excerpt:
      'Interchange-plus, flat rate, or blended? We break down the models and explain our choice.',
    date: '14 Feb 2026',
    readTime: '4 min read',
    category: 'Product',
    accent: 'bg-violet-500',
  },
  {
    title: 'Multi-location management done right',
    excerpt:
      'How we designed the multi-site dashboard so operators can run ten venues like one.',
    date: '5 Feb 2026',
    readTime: '6 min read',
    category: 'Engineering',
    accent: 'bg-teal-500',
  },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function BlogPage() {
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
            Blog
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{
              duration: 0.8,
              delay: 0.1,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="font-black tracking-[-0.03em] leading-[1.0] mb-6 max-w-2xl"
            style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
          >
            Ideas, updates, and guides.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{
              duration: 0.7,
              delay: 0.3,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="text-lg sm:text-xl text-neutral-400 max-w-lg leading-relaxed text-pretty"
          >
            Thoughts on running a better venue.
          </motion.p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Featured Post                                                 */}
      {/* ------------------------------------------------------------ */}
      <section className="relative py-24 sm:py-32">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <SectionTransition>
            <a href="#" className="block group">
              <div className="border border-white/[0.08] rounded-2xl overflow-hidden hover:border-white/[0.15] transition-colors duration-500">
                {/* Gradient placeholder */}
                <div
                  className={`h-64 sm:h-80 bg-gradient-to-br ${featuredPost.gradient} relative`}
                >
                  <div className="absolute inset-0 bg-[#0a0a0a]/40" />
                  <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
                </div>

                <div className="p-8 sm:p-10 -mt-16 relative">
                  <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-violet-400 mb-4">
                    {featuredPost.category}
                  </span>
                  <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4 group-hover:text-violet-400 transition-colors duration-500">
                    {featuredPost.title}
                  </h2>
                  <p className="text-neutral-400 text-lg leading-relaxed max-w-2xl mb-6 text-pretty">
                    {featuredPost.excerpt}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-neutral-500">
                    <span>{featuredPost.date}</span>
                    <span className="w-1 h-1 rounded-full bg-neutral-600" />
                    <span>{featuredPost.readTime}</span>
                  </div>
                </div>
              </div>
            </a>
          </SectionTransition>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Post Grid                                                     */}
      {/* ------------------------------------------------------------ */}
      <section className="relative py-24 sm:py-32">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <SectionTransition className="mb-16">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">
              Latest Posts
            </p>
          </SectionTransition>

          <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <StaggerItem key={post.title}>
                <a href="#" className="block group h-full">
                  <div className="relative border border-white/[0.08] rounded-2xl p-8 hover:border-white/[0.15] transition-colors duration-500 h-full flex flex-col">
                    {/* Colored top accent */}
                    <div
                      className={`absolute top-0 left-8 right-8 h-px ${post.accent}`}
                    />

                    <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-neutral-500 mb-4">
                      {post.category}
                    </span>

                    <h3 className="text-lg font-bold tracking-tight mb-3 group-hover:text-violet-400 transition-colors duration-500">
                      {post.title}
                    </h3>

                    <p className="text-neutral-500 text-sm leading-relaxed line-clamp-2 flex-1 mb-6">
                      {post.excerpt}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-neutral-600">
                      <span>{post.date}</span>
                      <span className="w-1 h-1 rounded-full bg-neutral-700" />
                      <span>{post.readTime}</span>
                    </div>
                  </div>
                </a>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      <Footer />
    </div>
  );
}
