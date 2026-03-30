export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-40 rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-48 rounded-lg bg-gray-100 dark:bg-gray-800" />
        </div>
        <div className="h-9 w-36 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="h-4 w-56 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-40 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-28 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-4 w-16 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
