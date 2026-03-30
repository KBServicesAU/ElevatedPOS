'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  FlaskConical, Send, Plus, Trash2, ChevronDown, Clock,
  ToggleLeft, ToggleRight, Globe, Key, AlertTriangle,
  RefreshCw, Check, Copy, CheckCheck,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Header {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

interface HistoryEntry {
  id: string;
  method: HttpMethod;
  path: string;
  status: number;
  responseTime: number;
  timestamp: Date;
  responseBody: string;
}

interface EndpointPreset {
  label: string;
  method: HttpMethod;
  path: string;
  body?: string;
}

// ─── Mock Responses ───────────────────────────────────────────────────────────

const MOCK_RESPONSES: Record<string, unknown> = {
  'GET /api/v1/catalog/products': {
    data: [
      { id: 'prod_01HXXX', name: 'Flat White', basePrice: 450, currency: 'AUD', category: 'Beverages', inStock: true },
      { id: 'prod_02HXXX', name: 'Avocado Toast', basePrice: 1400, currency: 'AUD', category: 'Food', inStock: true },
      { id: 'prod_03HXXX', name: 'Cold Brew', basePrice: 550, currency: 'AUD', category: 'Beverages', inStock: false },
    ],
    meta: { total: 50, limit: 10, offset: 0 },
  },
  'GET /api/v1/orders': {
    data: [
      { id: 'ord_01HXXX', status: 'completed', total: 1850, currency: 'AUD', createdAt: '2024-09-15T10:30:00Z' },
      { id: 'ord_02HXXX', status: 'pending', total: 450, currency: 'AUD', createdAt: '2024-09-15T11:00:00Z' },
    ],
    meta: { total: 500, limit: 10, offset: 0 },
  },
  'POST /api/v1/orders': {
    id: 'ord_sandbox_new',
    status: 'pending',
    locationId: 'loc_123',
    customerId: 'cust_456',
    lineItems: [{ productId: 'prod_789', quantity: 2, unitPrice: 1500, total: 3000 }],
    subtotal: 3000,
    tax: 273,
    total: 3273,
    currency: 'AUD',
    createdAt: new Date().toISOString(),
  },
  'GET /api/v1/customers': {
    data: [
      { id: 'cust_01HXXX', name: 'Alice Johnson', email: 'alice@example.com', phone: '+61412345678', loyaltyPoints: 1250 },
      { id: 'cust_02HXXX', name: 'Bob Smith', email: 'bob@example.com', phone: '+61498765432', loyaltyPoints: 300 },
    ],
    meta: { total: 100, limit: 10, offset: 0 },
  },
  'GET /api/v1/gift-cards/GIFT1234': {
    id: 'gc_01HXXX',
    code: 'GIFT1234',
    initialBalance: 5000,
    balance: 3250,
    currency: 'AUD',
    issuedAt: '2024-06-01T00:00:00Z',
    expiresAt: '2025-06-01T00:00:00Z',
    status: 'active',
  },
  'POST /api/v1/loyalty/points/earn': {
    accountId: 'lac_01HXXX',
    customerId: 'cust_456',
    pointsEarned: 50,
    pointsBalance: 1300,
    orderId: 'ord_789',
    earnedAt: new Date().toISOString(),
  },
  'POST /api/v1/gift-cards': {
    id: 'gc_new_01HXXX',
    code: 'GC-NEWX-5678',
    initialBalance: 5000,
    balance: 5000,
    currency: 'AUD',
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
  },
};

// ─── Endpoint Presets ─────────────────────────────────────────────────────────

const ENDPOINT_PRESETS: EndpointPreset[] = [
  { label: 'List Products', method: 'GET', path: '/api/v1/catalog/products?limit=10' },
  { label: 'Get Orders', method: 'GET', path: '/api/v1/orders?limit=10' },
  {
    label: 'Create Order',
    method: 'POST',
    path: '/api/v1/orders',
    body: '{\n  "locationId": "loc_123",\n  "customerId": "cust_456",\n  "items": [{"productId": "prod_789", "quantity": 2, "unitPrice": 1500}]\n}',
  },
  { label: 'List Customers', method: 'GET', path: '/api/v1/customers?limit=10' },
  { label: 'Get Gift Card', method: 'GET', path: '/api/v1/gift-cards/GIFT1234' },
  {
    label: 'Earn Points',
    method: 'POST',
    path: '/api/v1/loyalty/points/earn',
    body: '{\n  "customerId": "cust_456",\n  "orderId": "ord_789",\n  "amount": 5000\n}',
  },
  {
    label: 'Issue Gift Card',
    method: 'POST',
    path: '/api/v1/gift-cards',
    body: '{\n  "initialBalance": 5000,\n  "currency": "AUD"\n}',
  },
];

// ─── Utility ──────────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-emerald-400 bg-emerald-950 border-emerald-800',
  POST: 'text-sky-400 bg-sky-950 border-sky-800',
  PATCH: 'text-amber-400 bg-amber-950 border-amber-800',
  DELETE: 'text-red-400 bg-red-950 border-red-800',
};

const METHOD_TAB_ACTIVE: Record<HttpMethod, string> = {
  GET: 'bg-emerald-950 text-emerald-300 border-emerald-700',
  POST: 'bg-sky-950 text-sky-300 border-sky-700',
  PATCH: 'bg-amber-950 text-amber-300 border-amber-700',
  DELETE: 'bg-red-950 text-red-300 border-red-700',
};

function statusColor(code: number): string {
  if (code >= 200 && code < 300) return 'bg-emerald-950 text-emerald-400 border-emerald-800';
  if (code >= 300 && code < 400) return 'bg-amber-950 text-amber-400 border-amber-800';
  return 'bg-red-950 text-red-400 border-red-800';
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Syntax highlighter ───────────────────────────────────────────────────────

function highlightJson(json: string): React.ReactNode[] {
  const lines = json.split('\n');
  return lines.map((line, li) => {
    // Tokenise key, string value, number, boolean/null
    const parts: React.ReactNode[] = [];
    let rest = line;

    // Leading whitespace
    const wsMatch = rest.match(/^(\s*)/);
    const ws = wsMatch ? wsMatch[1] : '';
    parts.push(<span key="ws">{ws}</span>);
    rest = rest.slice(ws.length);

    // JSON key  "key":
    const keyMatch = rest.match(/^("(?:[^"\\]|\\.)*")(\s*:\s*)/);
    if (keyMatch) {
      parts.push(<span key="k" className="text-sky-300">{keyMatch[1]}</span>);
      parts.push(<span key="kc" className="text-gray-500">{keyMatch[2]}</span>);
      rest = rest.slice(keyMatch[0].length);
    }

    // Trailing comma
    const trailingComma = rest.endsWith(',') ? ',' : '';
    if (trailingComma) rest = rest.slice(0, -1);

    // Value
    if (rest === '{' || rest === '[' || rest === '}' || rest === ']' ||
        rest === '},' || rest === '],' || rest === '{,' || rest === '[,') {
      parts.push(<span key="br" className="text-gray-400">{rest}</span>);
    } else if (rest.startsWith('"')) {
      parts.push(<span key="sv" className="text-amber-300">{rest}</span>);
    } else if (/^-?\d/.test(rest)) {
      parts.push(<span key="nv" className="text-purple-300">{rest}</span>);
    } else if (rest === 'true' || rest === 'false') {
      parts.push(<span key="bv" className="text-emerald-400">{rest}</span>);
    } else if (rest === 'null') {
      parts.push(<span key="nu" className="text-gray-500">{rest}</span>);
    } else {
      parts.push(<span key="ot">{rest}</span>);
    }

    if (trailingComma) parts.push(<span key="tc" className="text-gray-400">,</span>);

    return (
      <div key={li} className="leading-relaxed">
        {parts}
      </div>
    );
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SandboxPage() {
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [baseUrl] = useState('https://sandbox.nexus.app');
  const [path, setPath] = useState('/api/v1/catalog/products?limit=10');
  const [headers, setHeaders] = useState<Header[]>([
    { id: uid(), key: 'Authorization', value: 'Bearer YOUR_SANDBOX_TOKEN', enabled: true },
    { id: uid(), key: 'Content-Type', value: 'application/json', enabled: true },
  ]);
  const [body, setBody] = useState('');
  const [showPresets, setShowPresets] = useState(false);
  const [mockMode, setMockMode] = useState(true);
  const [loading, setLoading] = useState(false);

  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [responseBody, setResponseBody] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const presetsRef = useRef<HTMLDivElement>(null);

  // Apply preset
  const applyPreset = useCallback((preset: EndpointPreset) => {
    setMethod(preset.method);
    setPath(preset.path);
    setBody(preset.body ?? '');
    setShowPresets(false);
  }, []);

  // Header management
  const addHeader = () => setHeaders((h) => [...h, { id: uid(), key: '', value: '', enabled: true }]);
  const removeHeader = (id: string) => setHeaders((h) => h.filter((hdr) => hdr.id !== id));
  const updateHeader = (id: string, field: keyof Header, value: string | boolean) =>
    setHeaders((h) => h.map((hdr) => (hdr.id === id ? { ...hdr, [field]: value } : hdr)));

  // Copy response
  const copyResponse = useCallback(() => {
    if (!responseBody) return;
    navigator.clipboard.writeText(responseBody).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [responseBody]);

  // Load history entry
  const loadHistory = (entry: HistoryEntry) => {
    setResponseStatus(entry.status);
    setResponseTime(entry.responseTime);
    setResponseBody(entry.responseBody);
  };

  // Send request
  const sendRequest = useCallback(async () => {
    setLoading(true);
    setResponseBody(null);
    setResponseStatus(null);
    setResponseTime(null);
    setCopied(false);

    const start = performance.now();

    try {
      let status: number;
      let bodyText: string;

      if (mockMode) {
        // Normalise path: strip query string, replace dynamic segments
        const cleanPath = path.split('?')[0] ?? path;
        // Try exact match first, then pattern match for dynamic segments like /GIFT1234
        let mockData = MOCK_RESPONSES[`${method} ${cleanPath}`];
        if (!mockData) {
          // Try replacing last path segment with wildcard patterns
          const parentPath = cleanPath.replace(/\/[^/]+$/, '');
          const lastSeg = cleanPath.match(/\/([^/]+)$/)?.[1] ?? '';
          // Check parent + segment key patterns
          const altKey = `${method} ${parentPath}/${lastSeg.replace(/^[A-Z0-9-]+$/, 'GIFT1234')}`;
          mockData = MOCK_RESPONSES[altKey] ??
            MOCK_RESPONSES[`${method} ${cleanPath.replace(/\/[^/]+$/, '/:id')}`] ??
            { message: 'Mock response not available for this endpoint', endpoint: `${method} ${cleanPath}` };
        }
        await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
        status = 200;
        bodyText = JSON.stringify(mockData, null, 2);
      } else {
        const enabledHeaders = headers.filter((h) => h.enabled && h.key);
        const headersObj: Record<string, string> = {};
        for (const h of enabledHeaders) headersObj[h.key] = h.value;

        const res = await fetch(baseUrl + path, {
          method,
          headers: headersObj,
          body: ['POST', 'PATCH'].includes(method) && body ? body : undefined,
        });
        status = res.status;
        bodyText = await res.text();
        try { bodyText = JSON.stringify(JSON.parse(bodyText), null, 2); } catch { /* leave as-is */ }
      }

      const elapsed = Math.round(performance.now() - start);
      setResponseStatus(status);
      setResponseTime(elapsed);
      setResponseBody(bodyText);

      const shortPath = path.split('?')[0] ?? path;
      setHistory((prev) => [
        { id: uid(), method, path: shortPath, status, responseTime: elapsed, timestamp: new Date(), responseBody: bodyText },
        ...prev.slice(0, 4),
      ]);
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      const errText = JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2);
      setResponseStatus(0);
      setResponseTime(elapsed);
      setResponseBody(errText);
    } finally {
      setLoading(false);
    }
  }, [method, baseUrl, path, headers, body, mockMode]);

  const METHODS: HttpMethod[] = ['GET', 'POST', 'PATCH', 'DELETE'];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center gap-3 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-300 transition-colors">Home</Link>
        <span>/</span>
        <span className="text-gray-300">Sandbox</span>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-7 h-7 text-emerald-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">API Sandbox</h1>
              <p className="text-sm text-gray-400">Build and test API requests interactively</p>
            </div>
          </div>

          {/* Mock mode toggle */}
          <button
            onClick={() => setMockMode((m) => !m)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
              mockMode
                ? 'bg-emerald-950 border-emerald-800 text-emerald-300'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            {mockMode ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            Mock Mode {mockMode ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Main two-column layout */}
        <div className="flex gap-6">

          {/* ── Left Panel: Request Builder (40%) ── */}
          <div className="w-[40%] flex-shrink-0 space-y-4">

            {/* Method tabs + URL */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              {/* Method selector tabs */}
              <div className="flex gap-1">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`flex-1 py-1.5 text-xs font-bold font-mono rounded-md border transition-all ${
                      method === m
                        ? METHOD_TAB_ACTIVE[m]
                        : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Endpoint dropdown with presets */}
              <div className="relative" ref={presetsRef}>
                <div className="flex gap-2">
                  <input
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-indigo-500"
                    placeholder="/api/v1/..."
                  />
                  <button
                    onClick={() => setShowPresets((s) => !s)}
                    className="flex items-center gap-1 px-3 py-2 bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg text-xs text-gray-400 hover:text-gray-200 transition-colors whitespace-nowrap"
                  >
                    Presets <ChevronDown className={`w-3 h-3 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {showPresets && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
                    {ENDPOINT_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => applyPreset(preset)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-700 text-left transition-colors"
                      >
                        <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded border flex-shrink-0 ${METHOD_COLORS[preset.method]}`}>
                          {preset.method}
                        </span>
                        <span className="text-sm text-gray-300">{preset.label}</span>
                        <span className="ml-auto text-xs text-gray-500 font-mono truncate max-w-[120px]">{preset.path}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Headers */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300">Headers</h3>
                <button
                  onClick={addHeader}
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              <div className="space-y-2">
                {headers.map((hdr) => (
                  <div key={hdr.id} className="flex items-center gap-2">
                    <button
                      onClick={() => updateHeader(hdr.id, 'enabled', !hdr.enabled)}
                      className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                        hdr.enabled ? 'bg-indigo-600 border-indigo-500' : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      {hdr.enabled && <Check className="w-2.5 h-2.5 text-white" />}
                    </button>
                    <input
                      value={hdr.key}
                      onChange={(e) => updateHeader(hdr.id, 'key', e.target.value)}
                      className="w-36 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-gray-500"
                      placeholder="Header name"
                    />
                    <input
                      value={hdr.value}
                      onChange={(e) => updateHeader(hdr.id, 'value', e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-gray-400 focus:outline-none focus:border-gray-500"
                      placeholder="Value"
                    />
                    <button
                      onClick={() => removeHeader(hdr.id)}
                      className="p-1 text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Request body */}
            {['POST', 'PATCH'].includes(method) && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-300">Request Body</h3>
                  <span className="text-xs text-gray-500 font-mono">application/json</span>
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-sm font-mono text-gray-300 focus:outline-none focus:border-indigo-700 resize-y min-h-[160px] leading-relaxed"
                  placeholder={'{\n  "key": "value"\n}'}
                  spellCheck={false}
                />
              </div>
            )}

            {/* Send button */}
            <button
              onClick={sendRequest}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {loading ? 'Sending…' : 'Send Request'}
            </button>

            {/* Info cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-gray-300">Sandbox URL</span>
                </div>
                <code className="text-xs font-mono text-emerald-300 break-all">sandbox.nexus.app</code>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-gray-300">Auth Token</span>
                </div>
                <code className="text-xs font-mono text-amber-300">sk_sandbox_...</code>
              </div>
            </div>

            {mockMode && (
              <div className="bg-amber-950 border border-amber-900 rounded-xl p-3 flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/80">
                  Mock Mode is ON. No real API calls are made. Toggle off to hit the live sandbox endpoint.
                </p>
              </div>
            )}
          </div>

          {/* ── Right Panel: Response (60%) ── */}
          <div className="flex-1 min-w-0">
            <div className="bg-gray-900 border border-gray-800 rounded-xl h-full flex flex-col">
              {/* Response header bar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <h3 className="text-sm font-semibold text-gray-300">Response</h3>
                <div className="flex items-center gap-3">
                  {responseStatus !== null && responseTime !== null && (
                    <>
                      <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded border ${statusColor(responseStatus)}`}>
                        {responseStatus === 0 ? 'ERR' : responseStatus}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {responseTime}ms
                      </span>
                      {mockMode && (
                        <span className="text-xs bg-amber-950 text-amber-400 border border-amber-900 px-2 py-0.5 rounded-full">
                          Mock
                        </span>
                      )}
                    </>
                  )}
                  {responseBody && (
                    <button
                      onClick={copyResponse}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded-md hover:bg-gray-800"
                    >
                      {copied ? (
                        <><CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> Copied</>
                      ) : (
                        <><Copy className="w-3.5 h-3.5" /> Copy</>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Response body */}
              <div className="flex-1 p-4">
                {responseBody !== null ? (
                  <pre className="bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-xs font-mono overflow-auto h-full max-h-[560px] leading-relaxed">
                    {highlightJson(responseBody)}
                  </pre>
                ) : loading ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-3">
                    <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                    <p className="text-sm text-gray-500">Sending request…</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 gap-3">
                    <Send className="w-8 h-8 text-gray-700" />
                    <p className="text-sm text-gray-600">Hit &ldquo;Send Request&rdquo; to see the response here</p>
                    <p className="text-xs text-gray-700">Select a preset endpoint or enter a custom path</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom: Request History (chips) ── */}
        {history.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider flex-shrink-0">History</span>
              {history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => loadHistory(entry)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-full text-xs transition-colors group"
                >
                  <span className={`font-bold font-mono px-1.5 py-0.5 rounded border text-xs ${METHOD_COLORS[entry.method]}`}>
                    {entry.method}
                  </span>
                  <span className="font-mono text-gray-400 max-w-[180px] truncate group-hover:text-gray-200">
                    {entry.path}
                  </span>
                  <span className={`font-mono font-bold text-xs ${
                    entry.status >= 200 && entry.status < 300 ? 'text-emerald-400' :
                    entry.status >= 400 ? 'text-red-400' : 'text-amber-400'
                  }`}>
                    {entry.status === 0 ? 'ERR' : entry.status}
                  </span>
                  <span className="text-gray-600">{entry.responseTime}ms</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Sandbox environment details ── */}
        <div className="mt-12 border-t border-gray-800 pt-10">
          <h2 className="text-lg font-bold text-white mb-6">Sandbox Environment</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-200 mb-3">Pre-Seeded Data</h3>
              <ul className="space-y-1.5 text-sm text-gray-400">
                <li>50 Products (standard, variant, bundled)</li>
                <li>100 Customers with loyalty accounts</li>
                <li>3 Locations</li>
                <li>500+ Historical orders</li>
                <li>5 Automation rules</li>
              </ul>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <RefreshCw className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-gray-200">Reset Policy</h3>
              </div>
              <p className="text-sm text-gray-400">Data resets every <strong className="text-gray-200">Sunday at 00:00 UTC</strong>. API keys are unaffected by resets.</p>
            </div>
            <div className="bg-amber-950 border border-amber-900 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-amber-200">Limitations</h3>
              </div>
              <ul className="text-xs text-amber-200/80 space-y-1">
                <li>Payment processing is simulated</li>
                <li>Emails go to sandbox-inbox only</li>
                <li>Rate limit: 500 req/min</li>
                <li>Webhooks have a 5s delivery delay</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
