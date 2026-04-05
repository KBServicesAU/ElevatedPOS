'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  Loader2,
  AlertCircle,
  Package,
  Tag,
  Users,
  UserCircle,
  Download,
  ChevronRight,
} from 'lucide-react';

const PROVIDERS = [
  { id: 'square',     name: 'Square',        color: 'bg-black',      description: 'Square POS & Square for Retail' },
  { id: 'lightspeed', name: 'Lightspeed',    color: 'bg-red-600',    description: 'Lightspeed Retail (R-Series)' },
  { id: 'eposnow',    name: 'EPOS Now',      color: 'bg-blue-600',   description: 'EPOS Now POS system' },
  { id: 'vend',       name: 'Vend',          color: 'bg-teal-600',   description: 'Vend by Lightspeed' },
  { id: 'shopify',    name: 'Shopify POS',   color: 'bg-green-600',  description: 'Shopify POS & Shopify store' },
  { id: 'kounta',     name: 'Kounta',        color: 'bg-orange-500', description: 'Kounta by Lightspeed' },
];

const OAUTH_PROVIDERS = ['square', 'lightspeed', 'vend', 'shopify', 'kounta'];

interface PreviewData {
  count: number;
  preview: Record<string, string>[];
}

interface PreviewResult {
  products: PreviewData;
  categories: PreviewData;
  customers: PreviewData;
  staff: PreviewData;
}

interface ImportResults {
  products?: number;
  categories?: number;
  customers?: number;
  staff?: number;
}

type Step = 1 | 2 | 3 | 4;

const ENTITY_ICONS: Record<string, React.ElementType> = {
  products: Package,
  categories: Tag,
  customers: Users,
  staff: UserCircle,
};

const ENTITY_LABELS: Record<string, string> = {
  products: 'Products',
  categories: 'Categories',
  customers: 'Customers',
  staff: 'Staff / Employees',
};

function StepIndicator({ current }: { current: Step }) {
  const steps = [
    { n: 1, label: 'Select Provider' },
    { n: 2, label: 'Connect Account' },
    { n: 3, label: 'Select Data' },
    { n: 4, label: 'Import' },
  ];

  return (
    <div className="mb-8 flex items-center">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors ${
                current > s.n
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : current === s.n
                  ? 'border-indigo-600 bg-white text-indigo-600 dark:bg-gray-900'
                  : 'border-gray-300 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-500'
              }`}
            >
              {current > s.n ? <Check className="h-4 w-4" /> : s.n}
            </div>
            <span
              className={`mt-1.5 hidden text-xs font-medium sm:block ${
                current === s.n
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`mx-2 h-0.5 w-12 flex-shrink-0 sm:w-20 ${
                current > s.n ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ProviderIcon({ provider }: { provider: typeof PROVIDERS[0] }) {
  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-xl ${provider.color} text-sm font-bold text-white shadow-sm`}
    >
      {provider.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function EasyMovePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [eposToken, setEposToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [include, setInclude] = useState<Set<string>>(
    new Set(['products', 'categories', 'customers', 'staff']),
  );

  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [importResults, setImportResults] = useState<ImportResults>({});
  const [importError, setImportError] = useState('');
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [importSubmitted, setImportSubmitted] = useState(false);

  // Handle OAuth callback — ?connected=1&provider=xxx
  useEffect(() => {
    const connected = searchParams.get('connected');
    const providerParam = searchParams.get('provider');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setConnectError(
        errorParam === 'oauth_denied'
          ? 'Authorization was denied. Please try again.'
          : errorParam === 'token_exchange_failed'
          ? 'Could not exchange authorization code. Check your app credentials.'
          : 'An error occurred during connection.',
      );
      if (providerParam) {
        setSelectedProvider(providerParam);
        setStep(2);
      }
      return;
    }

    if (connected === '1' && providerParam) {
      setSelectedProvider(providerParam);
      setStep(3);
    }
  }, [searchParams]);

  // Fetch preview when entering step 3
  useEffect(() => {
    if (step !== 3 || !selectedProvider) return;

    setPreviewLoading(true);
    setPreviewError('');

    fetch(`/api/easy-move/${selectedProvider}/preview`)
      .then((r) => r.json())
      .then((data: PreviewResult & { error?: string }) => {
        if (data.error) {
          setPreviewError(data.error);
        } else {
          setPreview(data);
        }
      })
      .catch(() => setPreviewError('Failed to load data preview.'))
      .finally(() => setPreviewLoading(false));
  }, [step, selectedProvider]);

  function handleSelectProvider(id: string) {
    setSelectedProvider(id);
    setStep(2);
  }

  function handleOAuthConnect() {
    if (!selectedProvider) return;
    setConnecting(true);
    window.location.href = `/api/easy-move/${selectedProvider}/auth`;
  }

  async function handleEposConnect() {
    if (!eposToken.trim()) return;
    setConnecting(true);
    setConnectError('');

    try {
      const res = await fetch('/api/easy-move/eposnow/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: eposToken }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setConnectError(data.error ?? 'Invalid API token. Please check and try again.');
        setConnecting(false);
        return;
      }
      setStep(3);
    } catch {
      setConnectError('Connection failed. Please try again.');
      setConnecting(false);
    }
  }

  function toggleInclude(entity: string) {
    setInclude((prev) => {
      const next = new Set(prev);
      if (next.has(entity)) next.delete(entity);
      else next.add(entity);
      return next;
    });
  }

  // Poll job status when we have a real jobId from the API
  useEffect(() => {
    if (!importJobId || importDone) return;

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/proxy/migrations/${importJobId}/status`);
        if (!res.ok) return;
        const data = await res.json() as {
          progress: number;
          status: 'processing' | 'complete' | 'failed';
          imported: number;
          total: number;
          results?: ImportResults;
        };

        // Update all entity progress bars uniformly from overall job progress
        setProgress((prev) => {
          const updated: Record<string, number> = {};
          for (const key of Object.keys(prev)) {
            updated[key] = data.progress;
          }
          return updated;
        });

        if (data.status === 'complete') {
          clearInterval(poll);
          setImportResults(data.results ?? {});
          setImportDone(true);
          setImporting(false);
        } else if (data.status === 'failed') {
          clearInterval(poll);
          setImportError('Import failed on the server. Please try again.');
          setImporting(false);
        }
      } catch {
        // swallow transient poll errors
      }
    }, 2000);

    return () => clearInterval(poll);
  }, [importJobId, importDone]);

  async function handleImport() {
    if (!selectedProvider) return;
    setImporting(true);
    setImportError('');
    setImportSubmitted(false);
    setImportJobId(null);

    const entities = Array.from(include);

    // Initialise progress bars at 0
    const initProgress: Record<string, number> = {};
    entities.forEach((e) => { initProgress[e] = 0; });
    setProgress(initProgress);

    try {
      const res = await fetch(`/api/easy-move/${selectedProvider}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include: entities }),
      });
      const data = await res.json() as {
        jobId?: string;
        results?: ImportResults;
        errors?: string[];
        error?: string;
      };

      if (!res.ok && !data.results && !data.jobId) {
        setImportError(data.error ?? 'Import failed. Please try again.');
        setImporting(false);
        return;
      }

      if (data.jobId) {
        // Real server-side job — polling useEffect will handle progress
        setImportJobId(data.jobId);
      } else if (data.results) {
        // Synchronous response — completed immediately
        const final: Record<string, number> = {};
        entities.forEach((e) => { final[e] = 100; });
        setProgress(final);
        setTimeout(() => {
          setImportResults(data.results ?? {});
          setImportDone(true);
          setImporting(false);
        }, 600);
      } else {
        // API submitted but no jobId returned — cannot track progress
        setImportSubmitted(true);
      }
    } catch {
      setImportError('Import failed. Please try again.');
      setImporting(false);
    }
  }

  const providerObj = PROVIDERS.find((p) => p.id === selectedProvider);

  const ENTITIES = ['products', 'categories', 'customers', 'staff'] as const;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Easy Move</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Migrate your data from your existing POS to ElevatedPOS in minutes.
        </p>
      </div>

      <StepIndicator current={step} />

      {/* ── Step 1: Select Provider ── */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">
            Which POS are you migrating from?
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROVIDERS.map((p) => (
              <div
                key={p.id}
                className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
              >
                <ProviderIcon provider={p} />
                <p className="mt-3 font-semibold text-gray-900 dark:text-white">{p.name}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{p.description}</p>
                <button
                  onClick={() => handleSelectProvider(p.id)}
                  className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  Connect <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 2: Connect Account ── */}
      {step === 2 && providerObj && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-4 mb-6">
            <ProviderIcon provider={providerObj} />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">{providerObj.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{providerObj.description}</p>
            </div>
          </div>

          {connectError && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700 dark:text-red-400">{connectError}</p>
            </div>
          )}

          {connecting && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Waiting for authorization…</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Complete the login in the popup window, then return here.
              </p>
            </div>
          )}

          {!connecting && providerObj.id === 'eposnow' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  API Token
                </label>
                <input
                  type="text"
                  value={eposToken}
                  onChange={(e) => setEposToken(e.target.value)}
                  placeholder="Paste your EPOS Now API token here"
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  Find your API token in EPOS Now Back Office → Integrations → API Access.
                </p>
              </div>
              <button
                onClick={handleEposConnect}
                disabled={!eposToken.trim()}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Connect <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {!connecting && OAUTH_PROVIDERS.includes(providerObj.id) && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Click the button below to securely connect your {providerObj.name} account via OAuth.
                You will be redirected to {providerObj.name} to authorise access.
              </p>
              <button
                onClick={handleOAuthConnect}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Connect with OAuth <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          <button
            onClick={() => { setStep(1); setConnectError(''); setConnecting(false); }}
            className="mt-6 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ← Back to provider selection
          </button>
        </div>
      )}

      {/* ── Step 3: Select Data ── */}
      {step === 3 && (
        <div className="space-y-6">
          {providerObj && (
            <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-3 dark:border-green-800 dark:bg-green-900/20">
              <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Connected to {providerObj.name}
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">What would you like to import?</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Select the data to copy into ElevatedPOS.</p>
            </div>

            {previewError && (
              <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                <p className="text-sm text-red-700 dark:text-red-400">{previewError}</p>
              </div>
            )}

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {ENTITIES.map((entity) => {
                const Icon = ENTITY_ICONS[entity];
                const data = preview?.[entity];
                const checked = include.has(entity);

                return (
                  <div key={entity} className="px-6 py-4">
                    <div className="flex items-start gap-4">
                      <input
                        type="checkbox"
                        id={`include-${entity}`}
                        checked={checked}
                        onChange={() => toggleInclude(entity)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label htmlFor={`include-${entity}`} className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                          <span className="font-medium text-gray-900 dark:text-white">
                            {ENTITY_LABELS[entity]}
                          </span>
                          {previewLoading ? (
                            <span className="h-4 w-12 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                          ) : data ? (
                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                              {data.count.toLocaleString()} records
                            </span>
                          ) : null}
                        </div>
                      </label>
                    </div>

                    {/* Preview table */}
                    {checked && !previewLoading && data && data.preview.length > 0 && (
                      <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                        <table className="min-w-full text-xs">
                          <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                              {Object.keys(data.preview[0]).map((col) => (
                                <th
                                  key={col}
                                  className="px-3 py-2 text-left font-medium capitalize text-gray-500 dark:text-gray-400"
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-700 dark:bg-gray-900">
                            {data.preview.map((row, i) => (
                              <tr key={i}>
                                {Object.values(row).map((val, j) => (
                                  <td
                                    key={j}
                                    className="max-w-xs truncate px-3 py-2 text-gray-700 dark:text-gray-300"
                                  >
                                    {String(val ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {data.count > 5 && (
                          <p className="px-3 py-1.5 text-center text-xs text-gray-400 dark:text-gray-500">
                            Showing 5 of {data.count.toLocaleString()} records
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 dark:border-gray-800">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {include.size} data type{include.size !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => setStep(4)}
                disabled={include.size === 0}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Start Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 4: Importing ── */}
      {step === 4 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {!importDone ? (
            <>
              <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {importing ? 'Importing your data…' : 'Ready to import'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {importing
                    ? 'Please keep this page open until the import completes.'
                    : 'Click the button below to begin importing.'}
                </p>
              </div>

              {importError && (
                <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                  <p className="text-sm text-red-700 dark:text-red-400">{importError}</p>
                </div>
              )}

              {/* If API submitted but no jobId: show spinner + message */}
              {importSubmitted ? (
                <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Import submitted</p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Check back in a few minutes — your data is being processed in the background.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5 px-6 py-6">
                  {Array.from(include).map((entity) => {
                    const Icon = ENTITY_ICONS[entity];
                    const pct = progress[entity] ?? 0;

                    return (
                      <div key={entity}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {ENTITY_LABELS[entity]}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{pct}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 dark:border-gray-800">
                {!importing && (
                  <button
                    onClick={() => setStep(3)}
                    className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    ← Back
                  </button>
                )}
                {!importing && (
                  <button
                    onClick={handleImport}
                    className="ml-auto flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                  >
                    <Download className="h-4 w-4" />
                    Begin Import
                  </button>
                )}
                {importing && (
                  <div className="flex w-full items-center justify-center gap-2 py-1">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">Importing… do not close this page</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Success screen */
            <div className="flex flex-col items-center px-8 py-12 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Import Complete!</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Your data from {providerObj?.name ?? 'your previous POS'} has been imported successfully.
              </p>

              <div className="mt-6 w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700">
                {(Object.entries(importResults) as [string, number][]).map(([entity, count], i, arr) => (
                  <div
                    key={entity}
                    className={`flex items-center justify-between px-5 py-3 ${
                      i < arr.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {(() => {
                        const Icon = ENTITY_ICONS[entity];
                        return Icon ? <Icon className="h-4 w-4 text-gray-400" /> : null;
                      })()}
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {ENTITY_LABELS[entity] ?? entity}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {count.toLocaleString()} imported
                    </span>
                  </div>
                ))}
              </div>

              <a
                href="/dashboard/catalog"
                className="mt-8 flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Go to Catalog <ChevronRight className="h-4 w-4" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
