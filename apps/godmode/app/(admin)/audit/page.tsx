export default function AuditPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Audit Log</h1>
        <p className="text-gray-500 text-sm mt-1">Platform activity history</p>
      </div>

      <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg">
        <div className="px-6 py-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-500/10 mb-4">
            <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-white font-medium mb-2">Audit Log — Coming Soon</h3>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            Comprehensive audit logging for all platform actions is under development.
          </p>
        </div>

        <div className="border-t border-[#1e1e2e] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Timestamp</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Actor</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Action</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Entity</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Details</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="px-6 py-6 text-center text-gray-700 text-xs">
                  No audit log entries available yet
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
