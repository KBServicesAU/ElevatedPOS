export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-36 rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-52 rounded-lg bg-gray-100 dark:bg-gray-800" />
        </div>
        <div className="h-9 w-40 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
      {/* Active stocktake skeleton */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 h-5 w-40 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 flex-1 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-4 w-16 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-8 w-20 rounded-lg bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-12 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          ))}
        </div>
      </div>
      {/* History table skeleton */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-100 dark:border-gray-800 px-5 py-4">
          <div className="h-5 w-32 rounded-lg bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-16 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-4 flex-1 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-6 w-20 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-12 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
