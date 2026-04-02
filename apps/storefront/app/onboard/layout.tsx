import Link from 'next/link';

const steps = [
  { label: 'Account', path: '/onboard' },
  { label: 'Plan', path: '/onboard/plan' },
  { label: 'Payments', path: '/onboard/payment-account' },
  { label: 'Billing', path: '/onboard/subscription' },
  { label: 'Launch', path: '/onboard/complete' },
];

export default function OnboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-indigo-600 tracking-tight">
            ElevatedPOS
          </Link>
          <span className="text-sm text-gray-400">Merchant onboarding</span>
        </div>
      </header>

      {/* Progress indicator */}
      <div className="border-b border-gray-100 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <nav aria-label="Onboarding progress">
            <ol className="flex items-center gap-0">
              {steps.map((step, idx) => (
                <li key={step.label} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className="w-7 h-7 rounded-full border-2 border-indigo-200 bg-white flex items-center justify-center text-xs font-semibold text-indigo-400">
                      {idx + 1}
                    </div>
                    <span className="text-xs text-gray-500 mt-1 hidden sm:block whitespace-nowrap">{step.label}</span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className="flex-1 h-0.5 bg-indigo-100 mx-2" />
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  );
}
