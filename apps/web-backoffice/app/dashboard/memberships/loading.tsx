export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-36 rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-52 rounded-lg bg-gray-100 dark:bg-gray-800" />
        </div>
        <div className="h-9 w-32 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="flex gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-1 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-3">
            <div className="h-5 w-24 rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="h-8 w-20 rounded-lg bg-gray-100 dark:bg-gray-800" />
            <div className="space-y-1.5">
              <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-3 w-3/4 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
