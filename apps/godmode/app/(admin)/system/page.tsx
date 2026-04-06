'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTime: number;
  checkedAt: string;
  error?: string;
}

interface HealthResponse {
  data: ServiceHealth[];
}

const SERVICE_DISPLAY: Record<string, string> = {
  auth: 'Auth',
  catalog: 'Catalog',
  inventory: 'Inventory',
  orders: 'Orders',
  payments: 'Payments',
  customers: 'Customers',
  loyalty: 'Loyalty',
  campaigns: 'Campaigns',
  notifications: 'Notifications',
  integrations: 'Integrations',
  automations: 'Automations',
  ai: 'AI',
  franchise: 'Franchise',
  reporting: 'Reporting',
  webhooks: 'Webhooks',
};

const STATUS_CONFIG = {
  healthy: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    dot: 'bg-green-400',
    label: 'Healthy',
    Icon: CheckCircle,
  },
  degraded: {
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-400',
    dot: 'bg-yellow-400',
    label: 'Degraded',
    Icon: AlertTriangle,
  },
  down: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    dot: 'bg-red-400',
    label: 'Down',
    Icon: XCircle,
  },
};

export default function SystemPage() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [confirmService, setConfirmService] = useState<string | null>(null);
  const [restartingService, setRestartingService] = useState<string | null>(null);
  const [restartMessage, setRestartMessage] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/services-health', { cache: 'no-store' });
      const data = (await res.json()) as HealthResponse;
      setServices(data.data ?? []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to load service health:', err);
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    intervalRef.current = setInterval(() => void load(), 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  const healthyCount = services.filter((s) => s.status === 'healthy').length;
  const degradedCount = services.filter((s) => s.status === 'degraded').length;
  const downCount = services.filter((s) => s.status === 'down').length;

  const overallStatus = downCount > 0 ? 'down' : degradedCount > 0 ? 'degraded' : 'healthy';
  const overallConfig = STATUS_CONFIG[overallStatus];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">System Health</h1>
          <p className="text-gray-500 text-sm mt-1">
            Live microservice status — auto-refreshes every 60s
            {lastRefresh && (
              <span className="ml-2 text-gray-600">
                (last checked {lastRefresh.toLocaleTimeString()})
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-[#111118] border border-[#1e1e2e] hover:border-indigo-500 text-gray-400 hover:text-white text-sm rounded transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh All
        </button>
      </div>

      {/* Summary banner */}
      <div className={`mb-6 flex items-center gap-3 px-5 py-4 rounded-lg border ${
        overallStatus === 'healthy'
          ? 'bg-green-500/10 border-green-500/30'
          : overallStatus === 'degraded'
          ? 'bg-yellow-500/10 border-yellow-500/30'
          : 'bg-red-500/10 border-red-500/30'
      }`}>
        <span className={`w-3 h-3 rounded-full ${overallConfig.dot}`} />
        <div>
          <p className={`font-medium ${overallConfig.text}`}>
            {overallStatus === 'healthy'
              ? 'All Systems Operational'
              : overallStatus === 'degraded'
              ? 'Some Services Degraded'
              : 'Service Outage Detected'}
          </p>
          <p className="text-gray-500 text-sm">
            {services.length} services — {healthyCount} healthy, {degradedCount} degraded, {downCount} down
          </p>
        </div>
      </div>

      {/* Service Grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {loading && services.length === 0
          ? Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-[#1e1e2e] rounded w-24 mb-3" />
                <div className="h-3 bg-[#1e1e2e] rounded w-16" />
              </div>
            ))
          : services.map((svc) => {
              const cfg = STATUS_CONFIG[svc.status];
              const displayName = SERVICE_DISPLAY[svc.service] ?? svc.service;
              return (
                <div key={svc.service} className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-white font-medium text-sm">{displayName}</p>
                      <p className="text-gray-600 text-xs mt-0.5">{svc.responseTime}ms</p>
                    </div>
                    <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${cfg.bg} ${cfg.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  </div>
                  {svc.error && (
                    <p className="text-red-400 text-xs mb-2 truncate" title={svc.error}>
                      {svc.error}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      disabled
                      title="Log viewer coming soon"
                      className="flex-1 px-3 py-1.5 bg-[#1e1e2e] text-gray-600 text-xs rounded cursor-not-allowed"
                    >
                      View Logs
                    </button>
                    <button
                      onClick={() => setConfirmService(svc.service)}
                      className="flex-1 px-3 py-1.5 bg-[#1e1e2e] hover:bg-red-600/20 text-gray-400 hover:text-red-400 text-xs rounded transition-colors"
                    >
                      Restart
                    </button>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Confirm Restart Modal */}
      {confirmService && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-white font-semibold mb-3">
              Restart {SERVICE_DISPLAY[confirmService] ?? confirmService}?
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              This will restart the service. Active connections will be interrupted.
            </p>
            <p className="text-yellow-500/70 text-xs mb-6">
              Service restart is a placeholder -- the integration is not yet wired up.
            </p>
            {restartMessage && (
              <div className="mb-4 bg-yellow-500/10 border border-yellow-500/30 rounded px-4 py-3 text-yellow-400 text-sm">
                {restartMessage}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmService(null); setRestartMessage(''); }}
                className="flex-1 px-4 py-2.5 border border-[#1e1e2e] text-gray-400 text-sm rounded hover:bg-[#1e1e2e] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setRestartingService(confirmService);
                  setRestartMessage(`Restart ${confirmService} -- not yet implemented. This will be wired up to the orchestration API.`);
                  setTimeout(() => {
                    setRestartingService(null);
                  }, 1500);
                }}
                disabled={restartingService !== null}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
              >
                {restartingService ? 'Restarting...' : 'Restart'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
