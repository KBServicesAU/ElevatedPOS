export default function DevicesLoading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-[#2a2a3a]" />
      <div className="h-10 w-full rounded-xl bg-[#2a2a3a]" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 w-full rounded-xl bg-[#2a2a3a]" />
        ))}
      </div>
    </div>
  );
}
