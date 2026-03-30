export default function FranchiseLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-6 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-1 h-4 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="h-4 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            <div className="mt-2 h-7 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
    </div>
  );
}
