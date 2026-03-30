export default function PriceListsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
          <div className="h-4 w-56 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
        </div>
        <div className="h-9 w-40 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-gray-100 px-5 py-4 last:border-b-0 dark:border-gray-800">
            <div className="h-4 w-1/4 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            <div className="h-4 w-1/6 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            <div className="h-4 w-1/6 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            <div className="h-4 w-1/6 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
