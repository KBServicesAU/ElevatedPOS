'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const tips = [
  {
    icon: (
      <svg className="w-5 h-5 text-[#7c3aed]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
    title: 'Quick start guide',
    description: 'Get up to speed with our 5-minute setup walkthrough.',
  },
  {
    icon: (
      <svg className="w-5 h-5 text-[#7c3aed]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    title: 'Invite your team',
    description: 'Add staff members and set their permissions from your dashboard.',
  },
  {
    icon: (
      <svg className="w-5 h-5 text-[#7c3aed]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    title: 'Add your menu',
    description: 'Import products or build your catalog with our easy editor.',
  },
];

function CompleteContent() {
  const searchParams = useSearchParams();
  const orgId = searchParams?.get('orgId') || '';

  return (
    <div className="flex-1 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-lg text-center">
        {/* Animated checkmark */}
        <div className="flex items-center justify-center mb-8">
          <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              style={{ animation: 'checkmark 0.4s ease-in-out 0.1s both' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
        </div>

        <style>{`
          @keyframes checkmark {
            from { stroke-dasharray: 0 100; opacity: 0; }
            to { stroke-dasharray: 100 0; opacity: 1; }
          }
        `}</style>

        <h1 className="text-3xl font-bold text-white mb-2">You&#39;re all set!</h1>
        {orgId && (
          <p className="text-neutral-500 text-sm mb-1">Account ID: <span className="font-mono text-neutral-400">{orgId}</span></p>
        )}
        <p className="text-neutral-500 mb-8">
          Your 14-day free trial is active. Head to your dashboard to finish setting up your store.
        </p>

        <a
          href="https://app.elevatedpos.com.au/login"
          className="inline-block bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-semibold px-8 py-3.5 rounded-xl transition-colors mb-10"
        >
          Go to your dashboard
        </a>

        {/* Next steps */}
        <div className="border-t border-white/[0.06] pt-8">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">What to do next</h2>
          <div className="grid grid-cols-1 gap-4 text-left">
            {tips.map((tip) => (
              <div key={tip.title} className="flex items-start gap-4 p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] transition-colors cursor-pointer">
                <div className="w-10 h-10 rounded-lg bg-[#7c3aed]/10 flex items-center justify-center flex-shrink-0">
                  {tip.icon}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{tip.title}</div>
                  <div className="text-sm text-neutral-500 mt-0.5">{tip.description}</div>
                </div>
                <div className="ml-auto flex items-center self-center">
                  <svg className="w-4 h-4 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CompletePage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-neutral-600">Loading…</div>}>
      <CompleteContent />
    </Suspense>
  );
}
