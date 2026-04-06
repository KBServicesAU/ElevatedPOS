import { BadgeDollarSign } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CURRENT_YEAR = new Date().getFullYear();

const placeholderRows = MONTHS.map((month) => ({
  month: `${month} ${CURRENT_YEAR}`,
  newMerchants: 0,
  recurringMerchants: 0,
  commissionRate: '0%',
  totalEarned: '$0.00',
}));

export default function CommissionPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Commission</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Track your reseller commissions</p>
      </div>

      {/* Banner */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 flex items-start gap-4">
        <BadgeDollarSign size={24} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
        <div>
          <h2 className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">Commission tracking coming soon</h2>
          <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
            Your commission is calculated at the end of each billing cycle. Historical data will
            appear here once the commission service is connected.
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Month
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                New Merchants
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Recurring Merchants
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Commission Rate
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Total Earned
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {placeholderRows.map((row) => (
              <tr key={row.month} className="text-gray-400 dark:text-gray-500">
                <td className="px-5 py-3 text-sm">{row.month}</td>
                <td className="px-5 py-3 text-sm">{row.newMerchants}</td>
                <td className="px-5 py-3 text-sm">{row.recurringMerchants}</td>
                <td className="px-5 py-3 text-sm">{row.commissionRate}</td>
                <td className="px-5 py-3 text-sm">{row.totalEarned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Your commission is calculated at the end of each billing cycle. Contact your account manager for current rates.
      </p>
    </div>
  );
}
