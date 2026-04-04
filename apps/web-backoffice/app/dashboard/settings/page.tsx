'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building, MapPin, Printer as PrinterIcon, Receipt, CreditCard, Bell, Plug,
  Plus, Trash2, Check, X, ChevronRight, ToggleLeft, ToggleRight,
  Upload, Globe, Clock, Calendar, Percent, DollarSign, Loader2,
  Smartphone,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Location {
  id: string;
  name: string;
  address: string;
  type: 'retail' | 'warehouse' | 'popup' | 'kiosk';
  active: boolean;
}

interface TaxRate {
  id: string;
  name: string;
  percent: number;
}

type Tab = 'organisation' | 'locations' | 'receipts' | 'tax' | 'payments' | 'notifications' | 'devices' | 'printers';

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${checked ? 'bg-elevatedpos-600' : 'bg-gray-200 dark:bg-gray-700'}`}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

// ─── Field Components ─────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {hint && <p className="mb-1.5 text-xs text-gray-500">{hint}</p>}
      {children}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white';

const selectCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white';

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function SkeletonField() {
  return <div className="h-9 w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />;
}

// ─── Save Button ──────────────────────────────────────────────────────────────

function SaveButton({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-700 active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {saving ? (
        <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
      ) : (
        'Save changes'
      )}
    </button>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
  onSave,
  saving,
  saved,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  children: React.ReactNode;
  onSave: () => void;
  saving?: boolean;
  saved?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div className="rounded-lg bg-elevatedpos-50 p-2 dark:bg-elevatedpos-900/30">
          <Icon className="h-5 w-5 text-elevatedpos-600 dark:text-elevatedpos-400" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
      <div className="space-y-4 p-5">
        {children}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          <SaveButton saving={!!saving} saved={!!saved} onClick={onSave} />
        </div>
      </div>
    </div>
  );
}

// ─── Organisation Tab ─────────────────────────────────────────────────────────

function OrganisationTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    businessName: '',
    abn: '',
    website: '',
    phone: '',
    address: '',
    businessType: 'hospitality',
    currency: 'AUD',
    timezone: 'Australia/Sydney',
    financialYearEnd: '06-30',
  });

  useEffect(() => {
    apiFetch('settings/organisation')
      .then((data) => {
        if (data) setForm((f) => ({ ...f, ...data }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('settings/organisation', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: 'Organisation saved', description: 'Your business settings have been updated.', variant: 'success' });
    } catch (err) {
      toast({ title: 'Save failed', description: 'Could not save organisation settings. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Organisation" description="Business identity, locale, and financial settings" icon={Building} onSave={handleSave} saving={saving} saved={saved}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business Name">
          {loading ? <SkeletonField /> : <input className={inputCls} value={form.businessName} onChange={(e) => set('businessName', e.target.value)} />}
        </Field>
        <Field label="ABN / ACN">
          {loading ? <SkeletonField /> : <input className={inputCls} value={form.abn} onChange={(e) => set('abn', e.target.value)} placeholder="12 345 678 901" />}
        </Field>
        <Field label="Website">
          {loading ? <SkeletonField /> : <input className={inputCls} type="url" value={form.website} onChange={(e) => set('website', e.target.value)} />}
        </Field>
        <Field label="Phone">
          {loading ? <SkeletonField /> : <input className={inputCls} type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />}
        </Field>
        <Field label="Address">
          {loading ? <SkeletonField /> : <input className={inputCls + ' sm:col-span-2'} value={form.address} onChange={(e) => set('address', e.target.value)} />}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-gray-100 dark:border-gray-800">
        <Field label="Business Type">
          <select className={selectCls} value={form.businessType} onChange={(e) => set('businessType', e.target.value)}>
            <option value="retail">Retail</option>
            <option value="hospitality">Hospitality</option>
            <option value="qsr">QSR (Quick Service Restaurant)</option>
            <option value="service">Service</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </Field>
        <Field label="Default Currency">
          <select className={selectCls} value={form.currency} onChange={(e) => set('currency', e.target.value)}>
            <option value="AUD">AUD — Australian Dollar</option>
            <option value="NZD">NZD — New Zealand Dollar</option>
            <option value="USD">USD — US Dollar</option>
            <option value="GBP">GBP — British Pound</option>
          </select>
        </Field>
        <Field label="Timezone" hint="Used for reports and scheduling">
          <select className={selectCls} value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
            <option value="Australia/Sydney">AEST/AEDT — Sydney, Melbourne, Canberra, Hobart (UTC+10/+11)</option>
            <option value="Australia/Brisbane">AEST — Brisbane (UTC+10, no DST)</option>
            <option value="Australia/Adelaide">ACST/ACDT — Adelaide (UTC+9:30/+10:30)</option>
            <option value="Australia/Darwin">ACST — Darwin (UTC+9:30, no DST)</option>
            <option value="Australia/Perth">AWST — Perth (UTC+8, no DST)</option>
            <option value="Pacific/Auckland">NZST/NZDT — Auckland (UTC+12/+13)</option>
          </select>
        </Field>
        <Field label="Financial Year End" hint="Default is 30 June (Australian standard)">
          <select className={selectCls} value={form.financialYearEnd} onChange={(e) => set('financialYearEnd', e.target.value)}>
            <option value="06-30">30 June (Australian standard)</option>
            <option value="03-31">31 March</option>
            <option value="12-31">31 December (calendar year)</option>
          </select>
        </Field>
      </div>
    </SectionCard>
  );
}

// ─── Locations Tab ────────────────────────────────────────────────────────────

const DEFAULT_LOCATIONS: Location[] = [
  { id: '1', name: 'Main Store', address: '42 Main St, Sydney NSW 2000', type: 'retail', active: true },
];

function LocationsTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<Location[]>(DEFAULT_LOCATIONS);
  const [showAdd, setShowAdd] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: '', address: '', type: 'retail' as Location['type'] });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<{ locations?: Location[] }>('settings/locations')
      .then((data) => {
        if (data?.locations && Array.isArray(data.locations) && data.locations.length > 0) {
          setLocations(data.locations);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleActive = (id: string) => setLocations((ls) => ls.map((l) => (l.id === id ? { ...l, active: !l.active } : l)));
  const removeLocation = (id: string) => setLocations((ls) => ls.filter((l) => l.id !== id));
  const addLocation = () => {
    if (!newLoc.name.trim()) return;
    setLocations((ls) => [...ls, { id: Date.now().toString(), ...newLoc, active: true }]);
    setNewLoc({ name: '', address: '', type: 'retail' });
    setShowAdd(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('settings/locations', {
        method: 'PUT',
        body: JSON.stringify({ locations }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: 'Locations saved', description: `${locations.length} location(s) updated.`, variant: 'success' });
    } catch {
      toast({ title: 'Save failed', description: 'Could not save location settings. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const typeColors: Record<Location['type'], string> = {
    retail: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    warehouse: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    popup: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    kiosk: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-elevatedpos-50 p-2 dark:bg-elevatedpos-900/30">
            <MapPin className="h-5 w-5 text-elevatedpos-600 dark:text-elevatedpos-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Locations</h3>
            <p className="text-sm text-gray-500">Manage your physical and virtual selling locations</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 rounded-lg bg-elevatedpos-600 px-3 py-2 text-sm font-medium text-white hover:bg-elevatedpos-700"
        >
          <Plus className="h-4 w-4" /> Add Location
        </button>
      </div>

      {showAdd && (
        <div className="border-b border-gray-100 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-800/50">
          <h4 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">New Location</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              className={inputCls}
              placeholder="Location name"
              value={newLoc.name}
              onChange={(e) => setNewLoc((n) => ({ ...n, name: e.target.value }))}
            />
            <input
              className={inputCls}
              placeholder="Address"
              value={newLoc.address}
              onChange={(e) => setNewLoc((n) => ({ ...n, address: e.target.value }))}
            />
            <select
              className={selectCls}
              value={newLoc.type}
              onChange={(e) => setNewLoc((n) => ({ ...n, type: e.target.value as Location['type'] }))}
            >
              <option value="retail">Retail</option>
              <option value="warehouse">Warehouse</option>
              <option value="popup">Pop-up</option>
              <option value="kiosk">Kiosk</option>
            </select>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={addLocation} className="rounded-lg bg-elevatedpos-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-elevatedpos-700">
              Add
            </button>
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {locations.map((loc) => (
          <div key={loc.id} className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${typeColors[loc.type]}`}>
                {loc.type}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{loc.name}</p>
                <p className="text-xs text-gray-500">{loc.address}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium ${loc.active ? 'text-green-600' : 'text-gray-400'}`}>
                {loc.active ? 'Active' : 'Inactive'}
              </span>
              <Toggle checked={loc.active} onChange={() => toggleActive(loc.id)} />
              <button
                onClick={() => removeLocation(loc.id)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        <p className="text-sm text-gray-500">{locations.filter((l) => l.active).length} of {locations.length} locations active</p>
        <div className="flex items-center gap-3">
          {saved && <span className="flex items-center gap-1.5 text-sm text-green-600"><Check className="h-4 w-4" /> Saved</span>}
          <SaveButton saving={saving} saved={saved} onClick={handleSave} />
        </div>
      </div>
    </div>
  );
}

// ─── Receipts Tab ─────────────────────────────────────────────────────────────

function ReceiptsTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    headerText: '',
    footerText: '',
    showGstBreakdown: true,
    showLoyaltyPoints: true,
    invoiceTerms: '',
  });

  useEffect(() => {
    apiFetch('settings/receipts')
      .then((data) => {
        if (data) setForm((f) => ({ ...f, ...data }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('settings/receipts', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: 'Receipt settings saved', description: 'Receipt and document preferences have been updated.', variant: 'success' });
    } catch {
      toast({ title: 'Save failed', description: 'Could not save receipt settings. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Receipts & Documents" description="Customise receipts, invoices, and print settings" icon={PrinterIcon} onSave={handleSave} saving={saving} saved={saved}>
      <Field label="Receipt Header" hint="Appears at the top of every receipt">
        {loading ? <div className="h-20 w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" /> : (
          <textarea
            className={inputCls + ' min-h-[80px] resize-y'}
            value={form.headerText}
            onChange={(e) => set('headerText', e.target.value)}
          />
        )}
      </Field>
      <Field label="Receipt Footer" hint="e.g. ABN, social handles, return policy">
        {loading ? <div className="h-20 w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" /> : (
          <textarea
            className={inputCls + ' min-h-[80px] resize-y'}
            value={form.footerText}
            onChange={(e) => set('footerText', e.target.value)}
          />
        )}
      </Field>

      <div className="space-y-3 rounded-lg border border-gray-100 p-4 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Show GST breakdown</p>
            <p className="text-xs text-gray-500">Display GST amount separately on receipt</p>
          </div>
          <Toggle checked={form.showGstBreakdown} onChange={(v) => set('showGstBreakdown', v)} />
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Show loyalty points earned</p>
            <p className="text-xs text-gray-500">Print points balance on receipt footer</p>
          </div>
          <Toggle checked={form.showLoyaltyPoints} onChange={(v) => set('showLoyaltyPoints', v)} />
        </div>
      </div>

      <Field label="Business Logo" hint="Displayed at top of receipts and invoices (PNG or SVG, max 2MB)">
        <div className="flex items-center gap-3 rounded-lg border-2 border-dashed border-gray-200 p-4 hover:border-elevatedpos-400 dark:border-gray-700">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
            <Upload className="h-5 w-5 text-gray-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Upload logo</p>
            <p className="text-xs text-gray-500">PNG, SVG up to 2MB · Recommended 400×120px</p>
          </div>
          <label className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400">
            Choose file
            <input type="file" accept="image/png,image/svg+xml" className="sr-only" />
          </label>
        </div>
      </Field>

      <Field label="Invoice Terms" hint="Printed on all tax invoices">
        {loading ? <div className="h-20 w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" /> : (
          <textarea
            className={inputCls + ' min-h-[80px] resize-y'}
            value={form.invoiceTerms}
            onChange={(e) => set('invoiceTerms', e.target.value)}
          />
        )}
      </Field>
    </SectionCard>
  );
}

// ─── Tax Tab ──────────────────────────────────────────────────────────────────

function TaxTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [gstRate, setGstRate] = useState('10');
  const [gstRegistered, setGstRegistered] = useState(true);
  const [taxDisplayMode, setTaxDisplayMode] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [taxRates, setTaxRates] = useState<TaxRate[]>([
    { id: '1', name: 'GST', percent: 10 },
    { id: '2', name: 'Zero Rated', percent: 0 },
  ]);
  const [newRate, setNewRate] = useState({ name: '', percent: '' });

  useEffect(() => {
    apiFetch<{ gstRate?: number; gstRegistered?: boolean; taxDisplayMode?: 'inclusive' | 'exclusive'; taxRates?: TaxRate[] }>('settings/tax')
      .then((data) => {
        if (data) {
          if (data.gstRate !== undefined) setGstRate(String(data.gstRate));
          if (data.gstRegistered !== undefined) setGstRegistered(data.gstRegistered);
          if (data.taxDisplayMode) setTaxDisplayMode(data.taxDisplayMode);
          if (Array.isArray(data.taxRates) && data.taxRates.length > 0) setTaxRates(data.taxRates);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addRate = () => {
    if (!newRate.name.trim() || newRate.percent === '') return;
    setTaxRates((r) => [...r, { id: Date.now().toString(), name: newRate.name, percent: parseFloat(newRate.percent) }]);
    setNewRate({ name: '', percent: '' });
  };
  const removeRate = (id: string) => setTaxRates((r) => r.filter((t) => t.id !== id));

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('settings/tax', {
        method: 'PUT',
        body: JSON.stringify({
          gstRate: parseFloat(gstRate),
          gstRegistered,
          taxDisplayMode,
          taxRates,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: 'Tax settings saved', description: 'GST configuration and tax rates have been updated.', variant: 'success' });
    } catch {
      toast({ title: 'Save failed', description: 'Could not save tax settings. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Tax Configuration" description="GST registration, rates, and display preferences" icon={Receipt} onSave={handleSave} saving={saving} saved={saved}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default GST Rate (%)">
          <div className="relative">
            <input
              className={inputCls + ' pr-8'}
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={gstRate}
              onChange={(e) => setGstRate(e.target.value)}
            />
            <Percent className="absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
          </div>
        </Field>
        <Field label="Tax Display Mode">
          <select className={selectCls} value={taxDisplayMode} onChange={(e) => setTaxDisplayMode(e.target.value as 'inclusive' | 'exclusive')}>
            <option value="inclusive">Tax-inclusive (prices include GST)</option>
            <option value="exclusive">Tax-exclusive (GST added at checkout)</option>
          </select>
        </Field>
      </div>

      <div className="rounded-lg border border-gray-100 p-4 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">GST Registered</p>
            <p className="text-xs text-gray-500">Your business is registered for GST with the ATO</p>
          </div>
          <Toggle checked={gstRegistered} onChange={setGstRegistered} />
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tax Rates</h4>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Rate</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {taxRates.map((rate) => (
                <tr key={rate.id}>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{rate.name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{rate.percent}%</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => removeRate(rate.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                <td className="px-4 py-2.5">
                  <input className={inputCls + ' py-1.5'} placeholder="Rate name (e.g. Luxury Tax)" value={newRate.name} onChange={(e) => setNewRate((n) => ({ ...n, name: e.target.value }))} />
                </td>
                <td className="px-4 py-2.5">
                  <input className={inputCls + ' py-1.5'} type="number" placeholder="%" min="0" max="100" value={newRate.percent} onChange={(e) => setNewRate((n) => ({ ...n, percent: e.target.value }))} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={addRate} className="rounded-lg bg-elevatedpos-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-elevatedpos-700">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Payments Tab ─────────────────────────────────────────────────────────────

const DEFAULT_PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', description: 'Physical cash payments', enabled: true, surcharge: '', rounding: '0.05' },
  { id: 'card', label: 'Card (EFTPOS)', description: 'Credit and debit card via terminal', enabled: true, surcharge: '1.5', rounding: '' },
  { id: 'giftcard', label: 'Gift Card', description: 'ElevatedPOS-issued gift cards', enabled: true, surcharge: '', rounding: '' },
  { id: 'account', label: 'Account / Credit', description: 'Customer account credit', enabled: false, surcharge: '', rounding: '' },
  { id: 'layby', label: 'Lay-by', description: 'Pay over time with deposits', enabled: false, surcharge: '', rounding: '' },
  { id: 'bnpl', label: 'BNPL', description: 'Buy now, pay later (Afterpay, Zip)', enabled: false, surcharge: '1.9', rounding: '' },
];

function PaymentsTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [methods, setMethods] = useState(DEFAULT_PAYMENT_METHODS);

  useEffect(() => {
    apiFetch<{ methods?: typeof DEFAULT_PAYMENT_METHODS }>('settings/payment-methods')
      .then((data) => {
        if (data?.methods && Array.isArray(data.methods) && data.methods.length > 0) {
          setMethods(data.methods);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => setMethods((ms) => ms.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)));
  const set = (id: string, k: string, v: string) => setMethods((ms) => ms.map((m) => (m.id === id ? { ...m, [k]: v } : m)));

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('settings/payment-methods', {
        method: 'PUT',
        body: JSON.stringify({ methods }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      const enabledCount = methods.filter((m) => m.enabled).length;
      toast({ title: 'Payment methods saved', description: `${enabledCount} payment method(s) enabled.`, variant: 'success' });
    } catch {
      toast({ title: 'Save failed', description: 'Could not save payment settings. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Payment Methods" description="Configure which payment methods are available at POS" icon={CreditCard} onSave={handleSave} saving={saving} saved={saved}>
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 w-full animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))
        ) : methods.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl border p-4 transition-colors ${m.enabled ? 'border-elevatedpos-200 bg-elevatedpos-50/30 dark:border-elevatedpos-800 dark:bg-elevatedpos-900/10' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <DollarSign className={`h-5 w-5 ${m.enabled ? 'text-elevatedpos-600' : 'text-gray-400'}`} />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{m.label}</p>
                  <p className="text-xs text-gray-500">{m.description}</p>
                </div>
              </div>
              <Toggle checked={m.enabled} onChange={() => toggle(m.id)} />
            </div>

            {m.enabled && (
              <div className="mt-3 flex flex-wrap gap-4 border-t border-gray-100 pt-3 dark:border-gray-800">
                {(m.id === 'card' || m.id === 'bnpl') && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 dark:text-gray-400">Surcharge %:</label>
                    <input
                      className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      type="number" step="0.1" min="0"
                      value={m.surcharge}
                      onChange={(e) => set(m.id, 'surcharge', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                )}
                {m.id === 'cash' && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 dark:text-gray-400">Cash rounding:</label>
                    <select
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      value={m.rounding}
                      onChange={(e) => set(m.id, 'rounding', e.target.value)}
                    >
                      <option value="">None</option>
                      <option value="0.05">$0.05 intervals</option>
                      <option value="0.10">$0.10 intervals</option>
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────

function NotificationsTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    lowStockThreshold: '10',
    alertEmail: '',
    browserNotifications: false,
  });

  useEffect(() => {
    apiFetch<{ lowStockThreshold?: number; alertEmail?: string; browserNotifications?: boolean }>('settings/notifications')
      .then((data) => {
        if (data) {
          setForm((f) => ({
            ...f,
            lowStockThreshold: data.lowStockThreshold !== undefined ? String(data.lowStockThreshold) : f.lowStockThreshold,
            alertEmail: data.alertEmail ?? f.alertEmail,
            browserNotifications: data.browserNotifications ?? f.browserNotifications,
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('settings/notifications', {
        method: 'PUT',
        body: JSON.stringify({
          lowStockThreshold: parseInt(form.lowStockThreshold, 10),
          alertEmail: form.alertEmail,
          browserNotifications: form.browserNotifications,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: 'Notification settings saved', description: 'Alert preferences have been updated.', variant: 'success' });
    } catch {
      toast({ title: 'Save failed', description: 'Could not save notification settings. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const integrationCards = [
    { name: 'Xero', category: 'Accounting', color: 'bg-blue-600', connected: true },
    { name: 'MYOB', category: 'Accounting', color: 'bg-orange-600', connected: false },
    { name: 'Shopify', category: 'eCommerce', color: 'bg-green-600', connected: false },
    { name: 'Uber Eats', category: 'Delivery', color: 'bg-black', connected: true },
  ];

  return (
    <div className="space-y-6">
      <SectionCard title="Notifications & Alerts" description="Configure alert thresholds and notification channels" icon={Bell} onSave={handleSave} saving={saving} saved={saved}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Low Stock Alert Threshold" hint="Alert when product stock falls below this level">
            <div className="relative">
              <input
                className={inputCls + ' pr-14'}
                type="number"
                min="0"
                value={form.lowStockThreshold}
                onChange={(e) => set('lowStockThreshold', e.target.value)}
              />
              <span className="absolute right-3 top-2.5 text-sm text-gray-400">units</span>
            </div>
          </Field>
          <Field label="Operational Alerts Email">
            {loading ? <SkeletonField /> : (
              <input
                className={inputCls}
                type="email"
                value={form.alertEmail}
                onChange={(e) => set('alertEmail', e.target.value)}
                placeholder="ops@yourbusiness.com"
              />
            )}
          </Field>
        </div>

        <div className="rounded-lg border border-gray-100 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Browser Notifications</p>
              <p className="text-xs text-gray-500">Show desktop alerts for critical events (requires permission)</p>
            </div>
            <Toggle checked={form.browserNotifications} onChange={(v) => set('browserNotifications', v)} />
          </div>
        </div>
      </SectionCard>

      {/* Integrations Quick Links */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="rounded-lg bg-elevatedpos-50 p-2 dark:bg-elevatedpos-900/30">
            <Plug className="h-5 w-5 text-elevatedpos-600 dark:text-elevatedpos-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Integrations</h3>
            <p className="text-sm text-gray-500">Quick links to connected services</p>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {integrationCards.map((app) => (
            <a
              key={app.name}
              href="/dashboard/integrations"
              className="group flex items-center justify-between rounded-xl border border-gray-200 p-4 hover:border-elevatedpos-300 hover:bg-elevatedpos-50/30 dark:border-gray-700 dark:hover:border-elevatedpos-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${app.color} text-xs font-bold text-white`}>
                  {app.name.slice(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{app.name}</p>
                  <p className="text-xs text-gray-500">{app.category}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${app.connected ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                  {app.connected ? 'Connected' : 'Not connected'}
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-elevatedpos-600 transition-colors" />
              </div>
            </a>
          ))}
        </div>
        <div className="border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <a href="/dashboard/integrations" className="text-sm font-medium text-elevatedpos-600 hover:text-elevatedpos-700 dark:text-elevatedpos-400">
            Manage all integrations →
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType; href?: string }[] = [
  { id: 'organisation', label: 'Organisation', icon: Building },
  { id: 'locations', label: 'Locations', icon: MapPin },
  { id: 'receipts', label: 'Receipts', icon: PrinterIcon },
  { id: 'tax', label: 'Tax', icon: Receipt },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'devices', label: 'Devices', icon: Smartphone, href: '/dashboard/settings/devices' },
  { id: 'printers', label: 'Printers', icon: PrinterIcon, href: '/dashboard/settings/printers' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('organisation');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h2>
        <p className="text-sm text-gray-500">Manage your business configuration and preferences</p>
      </div>

      {/* Tab navigation */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const cls = `flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-elevatedpos-600 text-elevatedpos-600 dark:border-elevatedpos-400 dark:text-elevatedpos-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`;
            if (tab.href) {
              return (
                <Link key={tab.id} href={tab.href} className={cls}>
                  <tab.icon className="h-4 w-4 flex-shrink-0" />
                  {tab.label}
                </Link>
              );
            }
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cls}
              >
                <tab.icon className="h-4 w-4 flex-shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'organisation' && <OrganisationTab />}
        {activeTab === 'locations' && <LocationsTab />}
        {activeTab === 'receipts' && <ReceiptsTab />}
        {activeTab === 'tax' && <TaxTab />}
        {activeTab === 'payments' && <PaymentsTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
      </div>
    </div>
  );
}
