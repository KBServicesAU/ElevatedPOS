'use client';

import { useState } from 'react';

const SERVICES = [
  { name: 'Auth', port: 4001 },
  { name: 'Catalog', port: 4002 },
  { name: 'Inventory', port: 4003 },
  { name: 'Orders', port: 4004 },
  { name: 'Payments', port: 4005 },
  { name: 'Customers', port: 4006 },
  { name: 'Loyalty', port: 4007 },
  { name: 'Campaigns', port: 4008 },
  { name: 'Notifications', port: 4009 },
  { name: 'Integrations', port: 4010 },
  { name: 'Automations', port: 4011 },
  { name: 'AI', port: 4012 },
  { name: 'Franchise', port: 4013 },
  { name: 'Reporting', port: 4014 },
  { name: 'Webhooks', port: 4015 },
];

export default function SystemPage() {
  const [confirmService, setConfirmService] = useState<string | null>(null);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">System Health</h1>
        <p className="text-gray-500 text-sm mt-1">Microservice status overview</p>
      </div>

      {/* Service Grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {SERVICES.map(({ name, port }) => (
          <div key={name} className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-white font-medium text-sm">{name}</p>
                <p className="text-gray-600 text-xs">:{port}</p>
              </div>
              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                Operational
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => alert('Log viewer coming soon')}
                className="flex-1 px-3 py-1.5 bg-[#1e1e2e] hover:bg-[#2a2a3e] text-gray-400 text-xs rounded transition-colors"
              >
                View Logs
              </button>
              <button
                onClick={() => setConfirmService(name)}
                className="flex-1 px-3 py-1.5 bg-[#1e1e2e] hover:bg-red-600/20 text-gray-400 hover:text-red-400 text-xs rounded transition-colors"
              >
                Restart
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-5">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />
          <div>
            <p className="text-white font-medium">All Systems Operational</p>
            <p className="text-gray-500 text-sm">{SERVICES.length} services running normally</p>
          </div>
        </div>
      </div>

      {/* Confirm Restart Modal */}
      {confirmService && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-white font-semibold mb-3">Restart {confirmService}?</h3>
            <p className="text-gray-400 text-sm mb-6">
              This will restart the {confirmService} service. Active connections will be interrupted.
              This action is currently a placeholder.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmService(null)}
                className="flex-1 px-4 py-2.5 border border-[#1e1e2e] text-gray-400 text-sm rounded hover:bg-[#1e1e2e] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { alert(`Restart ${confirmService} — not yet implemented`); setConfirmService(null); }}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors"
              >
                Restart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
