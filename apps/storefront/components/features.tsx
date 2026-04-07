'use client';

import { SectionTransition, DividerLine } from './section-transition';

const features = [
  {
    number: '01',
    title: 'POS Terminal',
    description:
      'Fast, intuitive point of sale. Take orders, split bills, and process payments in seconds. Designed for speed during the rush, not just the demo.',
  },
  {
    number: '02',
    title: 'Kitchen Display',
    description:
      'Real-time kitchen orders. Keep your kitchen in sync with live order tickets and smart bumping. No more lost dockets, no more shouting.',
  },
  {
    number: '03',
    title: 'Self-Serve Kiosk',
    description:
      'Let customers order themselves. Reduce wait times and increase average order value. Your best employee never calls in sick.',
  },
  {
    number: '04',
    title: 'Inventory Management',
    description:
      'Always know your stock. Get low-stock alerts, track usage, and automate reorders. Stop counting things and start running your business.',
  },
  {
    number: '05',
    title: 'Customer Loyalty',
    description:
      'Built-in loyalty programs that actually work. Reward your regulars, track visit frequency, and bring them back without the stamp card.',
  },
  {
    number: '06',
    title: 'Analytics & Reports',
    description:
      'Know your numbers. Daily summaries, top sellers, revenue trends, staff performance. The data you need without the spreadsheet headache.',
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
        {/* Section Header */}
        <SectionTransition className="mb-20">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">
            What we do
          </p>
          <h2
            className="font-black tracking-[-0.03em] leading-[1.05] text-pretty max-w-2xl"
            style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
          >
            Everything your venue needs. Nothing it doesn&apos;t.
          </h2>
        </SectionTransition>

        {/* Features List - Editorial Style */}
        <div>
          {features.map((feature, i) => (
            <div key={feature.number}>
              <DividerLine />
              <SectionTransition delay={0.1}>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 py-12 sm:py-16 group">
                  {/* Number */}
                  <div className="lg:col-span-1">
                    <span className="feature-number text-4xl sm:text-5xl lg:text-6xl">
                      {feature.number}
                    </span>
                  </div>

                  {/* Title */}
                  <div className="lg:col-span-4">
                    <h3 className="text-2xl sm:text-3xl font-bold tracking-tight group-hover:text-violet-400 transition-colors duration-500">
                      {feature.title}
                    </h3>
                  </div>

                  {/* Description */}
                  <div className="lg:col-span-7">
                    <p className="text-neutral-400 leading-relaxed text-base sm:text-lg max-w-xl text-pretty">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </SectionTransition>
              {i === features.length - 1 && <DividerLine />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
