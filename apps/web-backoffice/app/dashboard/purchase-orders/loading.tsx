export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-64 rounded-lg bg-gray-100 dark:bg-gray-800" />
        </div>
        <div className="h-9 w-44 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-20 rounded-lg bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-100 dark:border-gray-800 px-5 py-4">
          <div className="h-5 w-32 rounded-lg bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-32 rounded bg-gray-100 dark:bg-gray-800 flex-1" />
              <div className="h-6 w-20 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-16 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-4 w-20 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-4 w-24 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-8 w-20 rounded-lg bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
