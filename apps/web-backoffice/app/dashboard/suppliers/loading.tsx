export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-36 rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-52 rounded-lg bg-gray-100 dark:bg-gray-800" />
        </div>
        <div className="h-9 w-36 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-5 w-36 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-4 w-24 rounded bg-gray-100 dark:bg-gray-800" />
              </div>
              <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-3 w-48 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-3 w-40 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-3 w-32 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
            <div className="mt-4 flex gap-4">
              <div className="h-10 w-20 rounded-lg bg-gray-100 dark:bg-gray-800" />
              <div className="h-10 w-24 rounded-lg bg-gray-100 dark:bg-gray-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
