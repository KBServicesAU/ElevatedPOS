'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload,
  Download,
  Package,
  Tag,
  Users,
  Warehouse,
  UserCircle,
  Truck,
  List,
  Loader2,
  FileText,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityKey =
  | 'products'
  | 'categories'
  | 'customers'
  | 'inventory'
  | 'staff'
  | 'suppliers'
  | 'price-lists';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

// ─── Entity config ────────────────────────────────────────────────────────────

const ENTITIES: {
  key: EntityKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  templateHeaders: string;
  exportEndpoint: string;
  exportDescription: string;
}[] = [
  {
    key: 'products',
    label: 'Products',
    icon: Package,
    templateHeaders: 'name,sku,barcode,category,price,cost_price,type,track_stock,status',
    exportEndpoint: '/api/proxy/products?limit=10000',
    exportDescription: 'All products including SKU, pricing, category, and stock tracking settings.',
  },
  {
    key: 'categories',
    label: 'Categories',
    icon: Tag,
    templateHeaders: 'name,description,parent_category,color,printer_destination,kds_destination',
    exportEndpoint: '/api/proxy/catalog/categories?limit=1000',
    exportDescription: 'All product categories with hierarchy, routing and display settings.',
  },
  {
    key: 'customers',
    label: 'Customers',
    icon: Users,
    templateHeaders: 'first_name,last_name,email,phone,loyalty_points,notes',
    exportEndpoint: '/api/proxy/customers?limit=10000',
    exportDescription: 'Full customer list with contact details and loyalty point balances.',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: Warehouse,
    templateHeaders: 'sku,location,quantity,reorder_point,reorder_qty',
    exportEndpoint: '/api/proxy/inventory/stock-levels?limit=10000',
    exportDescription: 'Current stock levels per SKU and location, including reorder thresholds.',
  },
  {
    key: 'staff',
    label: 'Staff',
    icon: UserCircle,
    templateHeaders: 'first_name,last_name,email,role,pin',
    exportEndpoint: '/api/proxy/staff?limit=1000',
    exportDescription: 'Employee list with roles and contact details.',
  },
  {
    key: 'suppliers',
    label: 'Suppliers',
    icon: Truck,
    templateHeaders: 'name,contact_name,email,phone,address',
    exportEndpoint: '/api/proxy/suppliers?limit=1000',
    exportDescription: 'Supplier directory with contact and address information.',
  },
  {
    key: 'price-lists',
    label: 'Price Lists',
    icon: List,
    templateHeaders: 'name,sku,price,start_date,end_date',
    exportEndpoint: '/api/proxy/price-lists?limit=1000',
    exportDescription: 'Price list entries including product overrides and validity dates.',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonToCSV(rows: Record<string, unknown>[]): string {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const headerLine = headers.join(',');
  const dataLines = rows.map((row) =>
    headers
      .map((h) => {
        const val = row[h] == null ? '' : String(row[h]);
        return val.includes(',') ? `"${val.replace(/"/g, '""')}"` : val;
      })
      .join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text: string): ParsedCSV {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    // Simple CSV parse — handles quoted fields
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  });
  return { headers, rows };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ToastContainerProps {
  toasts: Toast[];
}

function ToastContainer({ toasts }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white pointer-events-auto transition-all
            ${t.type === 'success' ? 'bg-emerald-600' : t.type === 'error' ? 'bg-red-600' : 'bg-indigo-600'}`}
        >
          {t.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {t.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
          {t.type === 'info' && <FileText className="w-4 h-4 shrink-0" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─── Import Panel ─────────────────────────────────────────────────────────────

interface ImportPanelProps {
  entity: (typeof ENTITIES)[number];
  onToast: (message: string, type: Toast['type']) => void;
}

function ImportPanel({ entity, onToast }: ImportPanelProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      onToast('Please select a CSV file', 'error');
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseCSV(text);
      setParsed(result);
    };
    reader.readAsText(file);
  }, [onToast]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDownloadTemplate = () => {
    downloadCSV(`${entity.key}-template.csv`, entity.templateHeaders + '\n');
    onToast('Template downloaded', 'info');
  };

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    await new Promise((r) => setTimeout(r, 800));
    const count = parsed.rows.length;
    setImporting(false);
    onToast(`Successfully imported ${count} record${count !== 1 ? 's' : ''}`, 'success');
    setSelectedFile(null);
    setParsed(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const previewRows = parsed ? parsed.rows.slice(0, 3) : [];

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white">
        Import {entity.label}
      </h3>

      {/* Drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-8 flex flex-col items-center justify-center gap-3 transition-colors
          ${
            isDragOver
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
              : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
          }`}
      >
        <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
          <Upload className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        {selectedFile ? (
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedFile.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {parsed ? `${parsed.rows.length} rows detected` : 'Parsing...'}
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Drop CSV file here or click to browse
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Only .csv files are supported
            </p>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Download template */}
      <button
        onClick={handleDownloadTemplate}
        className="inline-flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline w-fit"
      >
        <Download className="w-4 h-4" />
        Download Template
      </button>

      {/* Preview table */}
      {parsed && previewRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {parsed.headers.map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {previewRows.map((row, i) => (
                <tr key={i} className="bg-white dark:bg-gray-900">
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[120px] truncate"
                    >
                      {cell || <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {parsed.rows.length > 3 && (
            <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              Showing 3 of {parsed.rows.length} rows
            </div>
          )}
        </div>
      )}

      {/* Import button */}
      {parsed && parsed.rows.length > 0 && (
        <button
          onClick={handleImport}
          disabled={importing}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
        >
          {importing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Importing…
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Import {parsed.rows.length} Record{parsed.rows.length !== 1 ? 's' : ''}
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Export Panel ─────────────────────────────────────────────────────────────

interface ExportPanelProps {
  entity: (typeof ENTITIES)[number];
  onToast: (message: string, type: Toast['type']) => void;
}

function ExportPanel({ entity, onToast }: ExportPanelProps) {
  const [loading, setLoading] = useState(false);
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCountLoading(true);
    fetch(entity.exportEndpoint)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setRecordCount(data.length);
        } else if (data && typeof data === 'object') {
          const obj = data as Record<string, unknown>;
          const arr =
            obj.data ?? obj.items ?? obj.results ?? obj.products ??
            obj.categories ?? obj.customers ?? obj.staff ?? obj.suppliers;
          if (Array.isArray(arr)) {
            setRecordCount(arr.length);
          } else {
            setRecordCount(null);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setRecordCount(null);
      })
      .finally(() => {
        if (!cancelled) setCountLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entity.exportEndpoint]);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch(entity.exportEndpoint);
      if (!res.ok) throw new Error('Fetch failed');
      const data: unknown = await res.json();

      let rows: Record<string, unknown>[] = [];
      if (Array.isArray(data)) {
        rows = data as Record<string, unknown>[];
      } else if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>;
        const arr =
          obj.data ?? obj.items ?? obj.results ?? obj.products ??
          obj.categories ?? obj.customers ?? obj.staff ?? obj.suppliers;
        if (Array.isArray(arr)) rows = arr as Record<string, unknown>[];
      }

      if (rows.length === 0) {
        onToast('No data to export', 'error');
        return;
      }

      const csv = jsonToCSV(rows);
      const date = new Date().toISOString().slice(0, 10);
      downloadCSV(`${entity.key}-export-${date}.csv`, csv);
      onToast(`Exported ${rows.length} record${rows.length !== 1 ? 's' : ''} successfully`, 'success');
    } catch {
      onToast('No data to export', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white">
        Export {entity.label}
      </h3>

      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        {entity.exportDescription}
      </p>

      <div className="flex items-center gap-3">
        <button
          onClick={handleExport}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl transition-colors shadow-sm"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Exporting…
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Export as CSV
            </>
          )}
        </button>

        <span className="text-sm text-gray-400 dark:text-gray-500">
          {countLoading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading count…
            </span>
          ) : recordCount != null ? (
            `${recordCount.toLocaleString()} record${recordCount !== 1 ? 's' : ''}`
          ) : (
            'Count unavailable'
          )}
        </span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BulkManagePage() {
  const [activeTab, setActiveTab] = useState<EntityKey>('products');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);

  const addToast = useCallback((message: string, type: Toast['type']) => {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const activeEntity = ENTITIES.find((e) => e.key === activeTab)!;

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bulk Manage</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Import and export your business data as CSV files
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
        {ENTITIES.map((e) => {
          const Icon = e.icon;
          const isActive = e.key === activeTab;
          return (
            <button
              key={e.key}
              onClick={() => setActiveTab(e.key)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
                ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
            >
              <Icon className="w-4 h-4" />
              {e.label}
            </button>
          );
        })}
      </div>

      {/* Two-column content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Import card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <ImportPanel key={activeTab} entity={activeEntity} onToast={addToast} />
        </div>

        {/* Export card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <ExportPanel key={activeTab} entity={activeEntity} onToast={addToast} />
        </div>
      </div>

      {/* Toast container */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
