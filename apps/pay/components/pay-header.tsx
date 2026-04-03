export function PayHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="bg-zinc-900 py-5 px-6 text-center">
      <div className="inline-flex items-center gap-3">
        <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center">
          <span className="text-xl font-black text-zinc-900" style={{ fontFamily: 'Georgia, serif' }}>E</span>
        </div>
        <span className="text-white font-semibold text-lg tracking-wide">ElevatedPOS</span>
      </div>
      {subtitle && <p className="text-zinc-400 text-sm mt-1">{subtitle}</p>}
    </div>
  );
}
