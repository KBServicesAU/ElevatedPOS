export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded-lg bg-gray-800" />
        <div className="h-9 w-32 rounded-lg bg-gray-800" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="mb-3 h-4 w-24 rounded bg-gray-800" />
            <div className="h-8 w-32 rounded bg-gray-700" />
            <div className="mt-2 h-3 w-20 rounded bg-gray-800" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="mb-4 h-6 w-32 rounded bg-gray-800" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-gray-800 py-3 last:border-0">
            <div className="h-4 w-24 rounded bg-gray-800" />
            <div className="h-4 flex-1 rounded bg-gray-800" />
            <div className="h-4 w-16 rounded bg-gray-800" />
            <div className="h-6 w-20 rounded-full bg-gray-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
