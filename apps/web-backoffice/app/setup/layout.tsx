'use client';

import { usePathname } from 'next/navigation';

const STEPS = [
  { path: '/setup', label: 'Industry' },
  { path: '/setup/location', label: 'Location' },
  { path: '/setup/products', label: 'Products' },
  { path: '/setup/complete', label: 'Complete' },
];

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentIndex = STEPS.findIndex((s) => s.path === pathname);
  const step = currentIndex >= 0 ? currentIndex + 1 : 1;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-center border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-600/25">
            <span className="text-lg font-bold text-white">E</span>
          </div>
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            ElevatedPOS
          </span>
        </div>
      </header>

      {/* Progress bar */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Step {step} of {STEPS.length}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {STEPS[currentIndex]?.label ?? 'Setup'}
            </span>
          </div>
          <div className="flex gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s.path}
                className={`h-2 flex-1 rounded-full transition-colors duration-300 ${
                  i < step
                    ? 'bg-indigo-600'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex flex-1 items-start justify-center px-4 py-10">
        <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {children}
        </div>
      </main>
    </div>
  );
}
