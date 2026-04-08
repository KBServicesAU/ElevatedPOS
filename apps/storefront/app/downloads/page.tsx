'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import type { AppRelease } from '@/lib/app-releases';

/* ------------------------------------------------------------------ */
/* Animation helpers                                                   */
/* ------------------------------------------------------------------ */

const ease = [0.16, 1, 0.3, 1] as const;

function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* App icon per variant                                                */
/* ------------------------------------------------------------------ */

function AppIcon({ app }: { app: string }) {
  if (app === 'pos') {
    return (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
        <rect width="48" height="48" rx="12" fill="#7c3aed" fillOpacity="0.15" />
        <rect x="12" y="10" width="24" height="28" rx="3" stroke="#7c3aed" strokeWidth="2" />
        <rect x="16" y="14" width="16" height="10" rx="1.5" fill="#7c3aed" fillOpacity="0.3" />
        <circle cx="20" cy="31" r="1.5" fill="#7c3aed" />
        <circle cx="24" cy="31" r="1.5" fill="#7c3aed" />
        <circle cx="28" cy="31" r="1.5" fill="#7c3aed" />
      </svg>
    );
  }
  if (app === 'kds') {
    return (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
        <rect width="48" height="48" rx="12" fill="#f59e0b" fillOpacity="0.15" />
        <rect x="8" y="12" width="32" height="22" rx="3" stroke="#f59e0b" strokeWidth="2" />
        <line x1="18" y1="12" x2="18" y2="34" stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.4" />
        <line x1="28" y1="12" x2="28" y2="34" stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.4" />
        <rect x="18" y="38" width="12" height="2" rx="1" fill="#f59e0b" fillOpacity="0.5" />
      </svg>
    );
  }
  // kiosk
  return (
    <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
      <rect width="48" height="48" rx="12" fill="#10b981" fillOpacity="0.15" />
      <rect x="14" y="6" width="20" height="30" rx="3" stroke="#10b981" strokeWidth="2" />
      <rect x="18" y="10" width="12" height="16" rx="1.5" fill="#10b981" fillOpacity="0.3" />
      <circle cx="24" cy="31" r="1.5" fill="#10b981" />
      <rect x="20" y="38" width="8" height="4" rx="1" fill="#10b981" fillOpacity="0.5" />
    </svg>
  );
}

const accentMap: Record<string, string> = {
  pos: '#7c3aed',
  kds: '#f59e0b',
  kiosk: '#10b981',
};

const labelMap: Record<string, string> = {
  pos: 'POS Terminal',
  kds: 'Kitchen Display',
  kiosk: 'Self-Service Kiosk',
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function DownloadsPage() {
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/downloads/latest')
      .then((r) => {
        if (!r.ok) throw new Error(`Server error ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const list = data.releases ?? [];
        setReleases(list);
        if (list.length === 0) {
          setError('No releases found. The build system may be updating.');
        }
      })
      .catch((err) => {
        console.error('[downloads] Fetch failed:', err);
        setError('Could not load app releases. Please refresh and try again.');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <FadeIn>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">
              Downloads
            </p>
            <h1
              className="font-black tracking-[-0.03em] leading-[1.05] mb-6"
              style={{ fontSize: 'clamp(2rem, 5vw, 4rem)' }}
            >
              Get the apps.
            </h1>
            <p className="text-neutral-400 text-lg max-w-2xl leading-relaxed">
              Download the latest ElevatedPOS apps for your Android POS terminals,
              kitchen displays, and self-service kiosks. Compatible with iMin, Sunmi,
              and all standard Android POS hardware.
            </p>
          </FadeIn>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
      </section>

      {/* App Cards */}
      <section className="py-20 sm:py-28">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-500 text-sm">Loading releases...</p>
            </div>
          ) : error && releases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <p className="text-gray-400 text-sm">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {releases.map((release, i) => (
                <AppCard key={release.app} release={release} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Installation Guide */}
      <section className="relative py-20 sm:py-28">
        <div className="absolute top-0 left-0 right-0 h-px bg-white/[0.06]" />
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <FadeIn>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">
              Installation
            </p>
            <h2
              className="font-black tracking-[-0.03em] leading-[1.05] mb-12"
              style={{ fontSize: 'clamp(1.5rem, 3vw, 2.5rem)' }}
            >
              Quick setup guide.
            </h2>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl">
            {[
              {
                step: '01',
                title: 'Download APK',
                desc: 'Download the appropriate APK file for your device role above.',
              },
              {
                step: '02',
                title: 'Install on device',
                desc: 'Transfer the APK via USB or download directly on the Android device. Enable "Install unknown apps" if prompted.',
              },
              {
                step: '03',
                title: 'Pair the device',
                desc: 'Open the app and enter the 6-digit pairing code from your back-office (Settings → Devices → Pair New).',
              },
              {
                step: '04',
                title: 'Start selling',
                desc: 'The device is now connected. Your products, categories, and settings sync automatically.',
              },
            ].map((s, i) => (
              <FadeIn key={s.step} delay={i * 0.1}>
                <div className="group">
                  <p
                    className="text-5xl font-black mb-4 transition-colors duration-500"
                    style={{ color: 'rgba(124,58,237,0.2)' }}
                  >
                    {s.step}
                  </p>
                  <h3 className="text-white font-semibold mb-2">{s.title}</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">{s.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
      </section>

      {/* Requirements */}
      <section className="py-20 sm:py-28">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <FadeIn>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">
              Compatibility
            </p>
            <h2
              className="font-black tracking-[-0.03em] leading-[1.05] mb-12"
              style={{ fontSize: 'clamp(1.5rem, 3vw, 2.5rem)' }}
            >
              Supported hardware.
            </h2>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl">
            {[
              {
                title: 'POS Terminals',
                items: ['iMin Swan 1 / Swan 2', 'Sunmi T2 / V2 Pro', 'Any Android 8.0+ tablet'],
              },
              {
                title: 'Kitchen Displays',
                items: ['iMin Swan 2 (landscape)', 'Sunmi D3 series', 'Any Android tablet 10"+'],
              },
              {
                title: 'Self-Service Kiosks',
                items: ['iMin Swan 2 with stand', 'Sunmi K2 series', 'Any Android touch display'],
              },
            ].map((cat, i) => (
              <FadeIn key={cat.title} delay={i * 0.1}>
                <div className="border border-white/[0.06] rounded-2xl p-6">
                  <h3 className="text-white font-semibold mb-4">{cat.title}</h3>
                  <ul className="space-y-2.5">
                    {cat.items.map((item) => (
                      <li key={item} className="flex items-center gap-3 text-sm text-neutral-400">
                        <span className="w-1 h-1 rounded-full bg-violet-500 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* In-app updates note */}
      <section className="relative py-16">
        <div className="absolute top-0 left-0 right-0 h-px bg-white/[0.06]" />
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <FadeIn>
            <div className="border border-white/[0.06] rounded-2xl p-8 max-w-3xl">
              <h3 className="text-white font-semibold mb-2">Automatic update notifications</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Each app includes a built-in update checker. Go to{' '}
                <span className="text-white font-medium">More → Software Update</span> within the
                app to check for and install the latest version. The app will notify you when a new
                update is available.
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      <Footer />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* App Card Component                                                  */
/* ------------------------------------------------------------------ */

function AppCard({ release, index }: { release: AppRelease; index: number }) {
  const accent = accentMap[release.app] ?? '#7c3aed';
  const hasDownload = release.downloadUrl !== '';

  return (
    <FadeIn delay={index * 0.12}>
      <div
        className="relative flex flex-col h-full rounded-2xl border border-white/[0.06] p-8 transition-all duration-500 hover:border-white/[0.12]"
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <AppIcon app={release.app} />
          <span
            className="text-xs font-medium uppercase tracking-wider px-2.5 py-1 rounded-full"
            style={{ color: accent, backgroundColor: `${accent}15` }}
          >
            {labelMap[release.app]}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-white mb-2">{release.name}</h3>
        <p className="text-sm text-neutral-500 leading-relaxed mb-6 flex-1">
          {release.description}
        </p>

        {/* Meta */}
        <div className="space-y-2.5 mb-8">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-500">Version</span>
            <span className="text-white font-medium">{release.version}</span>
          </div>
          <div className="h-px bg-white/[0.04]" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-500">Size</span>
            <span className="text-neutral-300">{release.size}</span>
          </div>
          <div className="h-px bg-white/[0.04]" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-500">Requires</span>
            <span className="text-neutral-300">{release.minAndroid}</span>
          </div>
          <div className="h-px bg-white/[0.04]" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-500">Released</span>
            <span className="text-neutral-300">
              {new Date(release.releasedAt).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>

        {/* Changelog */}
        <details className="mb-8 group">
          <summary className="text-xs font-medium uppercase tracking-wider text-neutral-500 cursor-pointer hover:text-neutral-300 transition-colors select-none">
            Changelog
            <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
          </summary>
          <ul className="mt-3 space-y-1.5">
            {release.changelog.map((entry) => (
              <li key={entry} className="text-sm text-neutral-400 flex items-start gap-2">
                <span className="text-neutral-600 mt-1">•</span>
                {entry}
              </li>
            ))}
          </ul>
        </details>

        {/* Download Button */}
        {hasDownload ? (
          <a
            href={release.downloadUrl}
            download
            className="block text-center text-sm font-medium px-6 py-3.5 rounded-full transition-all duration-300"
            style={{
              backgroundColor: accent,
              color: '#fff',
            }}
          >
            Download APK
          </a>
        ) : (
          <div className="block text-center text-sm font-medium px-6 py-3.5 rounded-full border border-white/[0.08] text-neutral-500 cursor-not-allowed">
            Build pending — run EAS build
          </div>
        )}
      </div>
    </FadeIn>
  );
}
