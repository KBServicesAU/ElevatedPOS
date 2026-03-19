import type { Metadata } from 'next';
import { Plus, Clock, CheckCircle, XCircle, Shield } from 'lucide-react';

export const metadata: Metadata = { title: 'Staff' };

const staff = [
  { id: 'E001', name: 'Jane Martinez', role: 'Manager', pin: '••••', clockedIn: true, hoursToday: '6h 22m', status: 'Active', avatar: 'JM' },
  { id: 'E002', name: 'Tom Lee', role: 'Barista', pin: '••••', clockedIn: true, hoursToday: '5h 10m', status: 'Active', avatar: 'TL' },
  { id: 'E003', name: 'Priya Nair', role: 'Cashier', pin: '••••', clockedIn: false, hoursToday: '0h', status: 'Active', avatar: 'PN' },
  { id: 'E004', name: 'Kyle Smith', role: 'Barista', pin: '••••', clockedIn: true, hoursToday: '4h 45m', status: 'Active', avatar: 'KS' },
  { id: 'E005', name: 'Sofia Torres', role: 'Supervisor', pin: '••••', clockedIn: true, hoursToday: '7h 00m', status: 'Active', avatar: 'ST' },
  { id: 'E006', name: 'Raj Patel', role: 'Kitchen', pin: '••••', clockedIn: false, hoursToday: '0h', status: 'Inactive', avatar: 'RP' },
];

const roles = [
  { name: 'Owner', count: 1, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  { name: 'Manager', count: 2, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { name: 'Supervisor', count: 3, color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  { name: 'Cashier', count: 5, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { name: 'Barista', count: 8, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { name: 'Kitchen', count: 4, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
];

const roleColorMap: Record<string, string> = {
  Manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Supervisor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  Cashier: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Barista: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  Kitchen: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

export default function StaffPage() {
  const clockedIn = staff.filter((s) => s.clockedIn).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Staff</h2>
          <p className="text-sm text-gray-500">{staff.length} employees · {clockedIn} clocked in now</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-700">
          <Plus className="h-4 w-4" /> Add Employee
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Staff list */}
        <div className="lg:col-span-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">All Employees</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Employee</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Role</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Today</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {staff.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          {s.avatar}
                        </div>
                        {s.clockedIn && (
                          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-400 dark:border-gray-900" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColorMap[s.role] || 'bg-gray-100 text-gray-600'}`}>
                      {s.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                      <Clock className="h-3.5 w-3.5" /> {s.hoursToday}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${s.clockedIn ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                      {s.clockedIn ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      {s.clockedIn ? 'Clocked In' : 'Not In'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Roles */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Roles & Permissions</h3>
              <Shield className="h-4 w-4 text-gray-400" />
            </div>
          </div>
          <div className="p-4 space-y-2">
            {roles.map((role) => (
              <div key={role.name} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${role.color}`}>{role.name}</span>
                <span className="text-sm text-gray-500">{role.count} employees</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 p-4 dark:border-gray-800">
            <button className="w-full rounded-lg border border-dashed border-gray-200 py-2.5 text-sm text-gray-500 hover:border-nexus-400 hover:text-nexus-600 dark:border-gray-700">
              Manage permissions →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
