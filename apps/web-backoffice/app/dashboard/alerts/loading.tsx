export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-36 rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-48 rounded-lg bg-gray-100 dark:bg-gray-800" />
        </div>
        <div className="h-9 w-32 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 flex-1 rounded-lg bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>

      {/* Alert card skeletons */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex items-start gap-4">
              <div className="mt-0.5 h-5 w-5 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
                  <div className="h-5 w-20 rounded-full bg-gray-100 dark:bg-gray-800" />
                  <div className="h-5 w-24 rounded-full bg-gray-100 dark:bg-gray-800" />
                </div>
                <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-gray-800" />
                <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
