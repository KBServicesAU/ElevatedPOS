import { ScrollText } from 'lucide-react';

export default function ActionsLogPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Actions Log</h1>
        <p className="text-sm text-gray-500 mt-1">Audit trail of support actions</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <ScrollText size={40} className="mx-auto text-gray-200 mb-3" />
        <h2 className="text-lg font-semibold text-gray-700 mb-1">Actions Log</h2>
        <p className="text-sm text-gray-500">Audit logging coming soon.</p>
      </div>
    </div>
  );
}
