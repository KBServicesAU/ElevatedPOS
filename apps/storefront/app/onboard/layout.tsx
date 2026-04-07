'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const steps = [
  { label: 'Account', path: '/onboard' },
  { label: 'Plan', path: '/onboard/plan' },
  { label: 'Payments', path: '/onboard/payment-account' },
  { label: 'Billing', path: '/onboard/subscription' },
  { label: 'Launch', path: '/onboard/complete' },
];

function OnboardProgress() {
  const pathname = usePathname();

  const currentIdx = steps.findIndex((s) => s.path === pathname);
  const activeStep = currentIdx === -1 ? 0 : currentIdx;

  return (
    <div className="border-b border-white/[0.06]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
        <nav aria-label="Onboarding progress">
          <ol className="flex items-center gap-0">
            {steps.map((step, idx) => (
              <li key={step.label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  {idx < activeStep ? (
                    /* Completed step */
                    <div className="w-7 h-7 rounded-full bg-[#7c3aed] flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                  ) : idx === activeStep ? (
                    /* Active step */
                    <div className="w-7 h-7 rounded-full border-2 border-[#7c3aed] bg-[#7c3aed]/10 flex items-center justify-center text-xs font-semibold text-[#7c3aed]">
                      {idx + 1}
                    </div>
                  ) : (
                    /* Inactive step */
                    <div className="w-7 h-7 rounded-full border-2 border-white/[0.15] flex items-center justify-center text-xs font-semibold text-neutral-600">
                      {idx + 1}
                    </div>
                  )}
                  <span
                    className={`text-xs mt-1 hidden sm:block whitespace-nowrap ${
                      idx < activeStep
                        ? 'text-neutral-500'
                        : idx === activeStep
                          ? 'text-white'
                          : 'text-neutral-500'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 ${
                      idx < activeStep ? 'bg-[#7c3aed]' : 'bg-white/[0.08]'
                    }`}
                  />
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </div>
  );
}

export default function OnboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <header className="border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white tracking-tight">
            ElevatedPOS
          </Link>
          <span className="text-sm text-neutral-500">Merchant onboarding</span>
        </div>
      </header>

      {/* Progress indicator */}
      <OnboardProgress />

      {/* Content */}
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  );
}
