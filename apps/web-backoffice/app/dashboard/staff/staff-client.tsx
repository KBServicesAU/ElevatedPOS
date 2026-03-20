'use client';

import { Plus, Clock, CheckCircle, XCircle, Shield } from 'lucide-react';
import { useEmployees } from '../../../lib/hooks';
import type { Employee } from '../../../lib/api';

const roleColorMap: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  supervisor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  cashier: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  barista: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  kitchen: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

export function StaffClient() {
  const { data, isLoading, isError } = useEmployees();
  const employees = data?.data ?? [];
  const clockedIn = employees.filter((e) => e.clockedIn).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Staff</h2>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${employees.length} employees · ${clockedIn} clocked in now`}
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" /> Add Employee
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Staff list */}
        <div className="lg:col-span-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">All Employees</h3>
          </div>
          {isError ? (
            <div className="p-8 text-center text-sm text-red-500 dark:text-red-400">
              Failed to load staff.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Employee</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Role</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {Array.from({ length: 3 }).map((__, j) => (
                          <td key={j} className="px-5 py-3.5">
                            <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: '75%' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : employees.map((emp: Employee) => {
                      const initials = emp.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2);
                      return (
                        <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                  {initials}
                                </div>
                                {emp.clockedIn && (
                                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-400 dark:border-gray-900" />
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">{emp.name}</p>
                                <p className="text-xs text-gray-400">{emp.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${roleColorMap[emp.role.toLowerCase()] ?? 'bg-gray-100 text-gray-600'}`}
                            >
                              {emp.role}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-medium ${emp.clockedIn ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}
                            >
                              {emp.clockedIn ? (
                                <CheckCircle className="h-3.5 w-3.5" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5" />
                              )}
                              {emp.clockedIn ? 'Clocked In' : 'Not In'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                {!isLoading && employees.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-10 text-center text-sm text-gray-400">
                      No employees found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Roles summary */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Roles & Permissions</h3>
              <Shield className="h-4 w-4 text-gray-400" />
            </div>
          </div>
          <div className="p-4 space-y-2">
            {Object.entries(
              employees.reduce<Record<string, number>>((acc, e) => {
                const r = e.role ?? 'unknown';
                acc[r] = (acc[r] ?? 0) + 1;
                return acc;
              }, {}),
            ).map(([role, count]) => (
              <div
                key={role}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
              >
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${roleColorMap[role.toLowerCase()] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {role}
                </span>
                <span className="text-sm text-gray-500">{count} employee{count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 p-4 dark:border-gray-800">
            <button className="w-full rounded-lg border border-dashed border-gray-200 py-2.5 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-700">
              Manage permissions →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
