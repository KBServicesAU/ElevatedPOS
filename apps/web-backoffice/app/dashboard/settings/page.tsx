'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building, MapPin, Printer as PrinterIcon, Receipt, Bell, Plug,
  Plus, Trash2, Check, X, ChevronRight, ToggleLeft, ToggleRight,
  Upload, Globe, Clock, Calendar, Percent, Loader2,
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

// v2.7.51 — `locations` lives at /dashboard/locations now; the duplicate
// settings tab was a no-op. `printers` is fully owned by the POS/Kiosk
// More page, so the dashboard tab + /dashboard/settings/printers route
// are removed. The `receipts` tab now houses the receipt template
// settings (logo / order# / header / footer with a live preview).
type Tab = 'organisation' | 'hours' | 'receipts' | 'tax' | 'notifications' | 'devices';

// ─── Toggle Switch ────────────────────────────────────────────────────────────

/**
 * v2.7.48 — render a stored 1-bit raster back to a small canvas thumbnail
 * so the merchant can see what the printer will actually print after the
 * dashboard's threshold step.
 */
function RasterPreview({ base64, width, height }: { base64: string; width: number; height: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      const bin = atob(base64);
      const rowBytes = width / 8;
      const img = ctx.createImageData(width, height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const byte = bin.charCodeAt(y * rowBytes + (x >> 3));
          const bit = (byte >> (7 - (x & 7))) & 1;
          const idx = (y * width + x) * 4;
          const v = bit ? 0 : 255;
          img.data[idx] = v;
          img.data[idx + 1] = v;
          img.data[idx + 2] = v;
          img.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    } catch {
      /* corrupt base64 — leave canvas blank */
    }
  }, [base64, width, height]);
  return <canvas ref={canvasRef} className="h-16 w-16 object-contain" />;
}

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
      .catch(() => {
        toast({ title: 'Could not load organisation settings', description: 'Showing defaults — save to apply changes.', variant: 'destructive' });
      })
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

const DEFAULT_LOCATIONS: Location[] = [];

function LocationsTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<Location[]>(DEFAULT_LOCATIONS);
  const [showAdd, setShowAdd] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: '', address: '', type: 'retail' as Location['type'] });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<{ locations?: Location[] } | Location[]>('settings/locations')
      .then((data) => {
        const list = Array.isArray(data) ? data : (data as { locations?: Location[] })?.locations;
        if (list && Array.isArray(list)) setLocations(list);
      })
      .catch(() => {
        toast({ title: 'Could not load locations', description: 'Showing defaults — save to apply changes.', variant: 'destructive' });
      })
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
        {loading && (
          <div className="px-5 py-4 space-y-3">
            {[1,2].map(i => <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />)}
          </div>
        )}
        {!loading && locations.length === 0 && (
          <div className="px-5 py-8 text-center">
            <MapPin className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No locations yet</p>
            <p className="mt-1 text-xs text-gray-400">Click &quot;Add Location&quot; above to add your first store or outlet.</p>
          </div>
        )}
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
    // v2.7.44 — printed receipt toggles stored on
    // organisations.receipt_settings (separate JSONB column from the
    // generic settings.* surface). Loaded / saved via the dedicated
    // /api/v1/organisations/me/receipt-settings endpoint below so the
    // mobile POS can pick it up via /api/v1/devices/config without
    // routing through the catch-all settings/:key bucket.
    showOrderNumber: true,
    // v2.7.48 — base64-encoded 1-bit raster of the merchant logo. The
    // dashboard pre-rasterises the uploaded image at 384px (default 80mm
    // printer width) so the mobile printer never has to decode PNG. We
    // also keep the original `logoPreviewDataUrl` for the inline preview.
    logoBase64: null as string | null,
    logoWidth: null as number | null,
    logoHeight: null as number | null,
  });
  /** Original-image data URL for the live preview block — NOT sent to the server. */
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    // Load both the legacy "receipts" bucket (header/footer/etc.) and
    // the new dedicated receipt-settings endpoint. They live in
    // different columns server-side; combining them here keeps the UI
    // a single tab.
    Promise.all([
      apiFetch<Record<string, unknown>>('settings/receipts').catch(() => null),
      apiFetch<{
        showOrderNumber?: boolean;
        logoBase64?: string | null;
        logoWidth?: number | null;
        logoHeight?: number | null;
      }>('organisations/me/receipt-settings').catch(() => null),
    ]).then(([legacy, receipt]) => {
      setForm((f) => ({
        ...f,
        ...(legacy ?? {}),
        ...(typeof receipt?.showOrderNumber === 'boolean' ? { showOrderNumber: receipt.showOrderNumber } : {}),
        ...(typeof receipt?.logoBase64 === 'string' ? { logoBase64: receipt.logoBase64 } : {}),
        ...(typeof receipt?.logoWidth === 'number' ? { logoWidth: receipt.logoWidth } : {}),
        ...(typeof receipt?.logoHeight === 'number' ? { logoHeight: receipt.logoHeight } : {}),
      }));
    }).catch(() => {
      toast({ title: 'Could not load receipt settings', description: 'Showing defaults — save to apply changes.', variant: 'destructive' });
    }).finally(() => setLoading(false));
  }, []);

  const set = (k: string, v: string | boolean | number | null) => setForm((f) => ({ ...f, [k]: v }));

  /**
   * v2.7.48 — pre-rasterise an uploaded PNG/JPEG/SVG to a 1-bit packed
   * bitmap at the printer's pixel width (384px for 80mm @ 200dpi),
   * threshold to monochrome, base64-encode, and stash on `form` ready
   * for the next Save. Doing the conversion client-side avoids needing
   * a PNG decoder on the mobile POS — it just emits the bytes verbatim
   * as part of the GS v 0 raster command.
   */
  async function handleLogoFile(file: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Logo too large', description: 'Pick a file under 2 MB.', variant: 'destructive' });
      return;
    }
    setLogoUploading(true);
    try {
      // Read into a data URL — used for the inline preview AND fed into the canvas.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result ?? ''));
        fr.onerror = () => reject(new Error('read failed'));
        fr.readAsDataURL(file);
      });
      setLogoPreview(dataUrl);

      // Decode via an Image, draw to canvas, threshold to 1-bit.
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('decode failed'));
        img.src = dataUrl;
      });

      // Target width in pixels — 80mm 200dpi printers expose 384 dots.
      // Round to a multiple of 8 so each row packs cleanly.
      const targetWidth = 384;
      // Maintain aspect ratio, but cap the height so a tall logo doesn't
      // burn through paper. 240 px ≈ 3 cm.
      const maxHeight = 240;
      let scale = targetWidth / img.width;
      let h = Math.round(img.height * scale);
      if (h > maxHeight) {
        scale = maxHeight / img.height;
        h = maxHeight;
      }
      const w = targetWidth; // already multiple of 8
      const drawnW = Math.round(img.width * scale);
      const offsetX = Math.floor((w - drawnW) / 2); // centre on white background

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, offsetX, 0, drawnW, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      const rowBytes = w / 8;
      const out = new Uint8Array(rowBytes * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          // Standard luminance + alpha-aware threshold.
          const a = data[i + 3]!;
          const lum = a < 128 ? 255 : (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
          if (lum < 128) {
            // Black pixel — set the bit (MSB = leftmost).
            out[y * rowBytes + (x >> 3)]! |= 0x80 >> (x & 7);
          }
        }
      }

      // Encode out as base64 for the JSONB blob.
      let bin = '';
      for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]!);
      const b64 = btoa(bin);

      setForm((f) => ({ ...f, logoBase64: b64, logoWidth: w, logoHeight: h }));
      toast({ title: 'Logo ready', description: `Rasterised to ${w}×${h} 1-bit. Save to apply.`, variant: 'success' });
    } catch (err) {
      toast({
        title: 'Logo upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLogoUploading(false);
    }
  }

  function handleClearLogo() {
    setLogoPreview(null);
    setForm((f) => ({ ...f, logoBase64: null, logoWidth: null, logoHeight: null }));
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      // Split the save: the printed-receipt toggles + logo go to the
      // dedicated PATCH endpoint (so the mobile POS can read them via
      // devices/config), while the legacy header/footer/loyalty/etc.
      // fields stay on the generic settings/:key bucket.
      const { showOrderNumber, logoBase64, logoWidth, logoHeight, ...legacyForm } = form;
      // v2.7.51 — instrument the save so we can see if the toggle PATCH
      // is actually firing and what payload size is being sent.
      console.log('[receipt-toggle] saving showOrderNumber=', showOrderNumber, 'logoBase64.length=', logoBase64?.length ?? 0);
      await Promise.all([
        apiFetch('settings/receipts', {
          method: 'PUT',
          body: JSON.stringify(legacyForm),
        }),
        apiFetch('organisations/me/receipt-settings', {
          method: 'PATCH',
          body: JSON.stringify({ showOrderNumber, logoBase64, logoWidth, logoHeight }),
        }),
      ]);
      console.log('[receipt-toggle] save succeeded');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: 'Receipt settings saved', description: 'Receipt and document preferences have been updated.', variant: 'success' });
    } catch (err) {
      // v2.7.51 — surface the real reason from the server (e.g. "Logo too
      // large") instead of always showing a generic "Please try again".
      const description = err instanceof Error && err.message
        ? err.message
        : 'Could not save receipt settings. Please try again.';
      console.error('[receipt-toggle] save failed:', err);
      toast({ title: 'Save failed', description, variant: 'destructive' });
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
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Show order number on receipt</p>
            <p className="text-xs text-gray-500">Print the order number line and barcode on each receipt</p>
          </div>
          <Toggle checked={form.showOrderNumber} onChange={(v) => set('showOrderNumber', v)} />
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800">
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

      <Field label="Business Logo" hint="Displayed at top of receipts and invoices (PNG, JPEG, SVG, max 2MB)">
        <div className="flex items-center gap-3 rounded-lg border-2 border-dashed border-gray-200 p-4 hover:border-elevatedpos-400 dark:border-gray-700">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="Logo preview" className="h-16 w-16 object-contain" />
            ) : form.logoBase64 && form.logoWidth && form.logoHeight ? (
              // Saved-state preview — render the 1-bit raster back to a tiny <canvas>
              // so the merchant sees what the printer will actually produce.
              <RasterPreview
                base64={form.logoBase64}
                width={form.logoWidth}
                height={form.logoHeight}
              />
            ) : (
              <Upload className="h-5 w-5 text-gray-400" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {form.logoBase64 ? 'Logo set' : 'Upload logo'}
              {form.logoBase64 && form.logoWidth ? ` · ${form.logoWidth}×${form.logoHeight} 1-bit` : ''}
            </p>
            <p className="text-xs text-gray-500">PNG, JPEG, SVG up to 2MB · Recommended 400×120px</p>
            {logoUploading && <p className="text-xs text-elevatedpos-600">Rasterising…</p>}
          </div>
          {form.logoBase64 && (
            <button
              type="button"
              onClick={handleClearLogo}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-gray-700"
            >
              Clear
            </button>
          )}
          <label className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400">
            Choose file
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLogoFile(f);
                // reset so the same file can be picked again
                e.currentTarget.value = '';
              }}
            />
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
  const [gstFreeCategories, setGstFreeCategories] = useState('');

  useEffect(() => {
    apiFetch<{ gstRate?: number; gstRegistered?: boolean; taxDisplayMode?: 'inclusive' | 'exclusive'; taxRates?: TaxRate[]; gstFreeCategories?: string }>('settings/tax')
      .then((data) => {
        if (data) {
          if (data.gstRate !== undefined) setGstRate(String(data.gstRate));
          if (data.gstRegistered !== undefined) setGstRegistered(data.gstRegistered);
          if (data.taxDisplayMode) setTaxDisplayMode(data.taxDisplayMode);
          if (Array.isArray(data.taxRates) && data.taxRates.length > 0) setTaxRates(data.taxRates);
          if (data.gstFreeCategories !== undefined) setGstFreeCategories(data.gstFreeCategories);
        }
      })
      .catch(() => {
        toast({ title: 'Could not load tax settings', description: 'Showing defaults — save to apply changes.', variant: 'destructive' });
      })
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
          gstFreeCategories,
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

      <div className="space-y-1">
        <Field label="GST-Free Product Categories" hint="Comma-separated list of product categories exempt from GST. Default: all products include 10% GST.">
          {loading ? <SkeletonField /> : (
            <input
              className={inputCls}
              value={gstFreeCategories}
              onChange={(e) => setGstFreeCategories(e.target.value)}
              placeholder="e.g. Fresh Produce, Medical, Education"
            />
          )}
        </Field>
        <p className="text-xs text-gray-500">
          Default: All products include 10% GST. Leave blank to apply GST to all categories.
        </p>
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

// ─── Trading Hours Tab ────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface DayHours {
  open: boolean;
  openTime: string;
  closeTime: string;
}

type HoursMap = Record<string, DayHours>;

const DEFAULT_HOURS: HoursMap = Object.fromEntries(
  DAYS_OF_WEEK.map((d) => [d, { open: d !== 'Sunday', openTime: '09:00', closeTime: '17:00' }])
);

function TradingHoursTab() {
  const { toast } = useToast();
  const [hours, setHours] = useState<HoursMap>(DEFAULT_HOURS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<{ hours?: HoursMap } | HoursMap>('settings/hours')
      .then((data) => {
        const map = (data as { hours?: HoursMap })?.hours ?? data as HoursMap;
        if (map && typeof map === 'object' && Object.keys(map).length > 0) {
          setHours((prev) => ({ ...prev, ...map }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('settings/hours', { method: 'PUT', body: JSON.stringify({ hours }) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: 'Trading hours saved', variant: 'success' });
    } catch {
      toast({ title: 'Save failed', description: 'Could not save trading hours. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const setDay = (day: string, patch: Partial<DayHours>) =>
    setHours((h) => ({ ...h, [day]: { ...h[day]!, ...patch } }));

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div className="rounded-lg bg-elevatedpos-50 p-2 dark:bg-elevatedpos-900/30">
          <Clock className="h-5 w-5 text-elevatedpos-600 dark:text-elevatedpos-400" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Trading Hours</h3>
          <p className="text-sm text-gray-500">Set your regular opening hours for each day of the week</p>
        </div>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {loading
          ? DAYS_OF_WEEK.map((d) => (
              <div key={d} className="flex items-center justify-between px-5 py-3.5">
                <div className="h-4 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                <div className="h-8 w-48 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            ))
          : DAYS_OF_WEEK.map((day) => {
              const dh = hours[day] ?? { open: false, openTime: '09:00', closeTime: '17:00' };
              return (
                <div key={day} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:flex-nowrap">
                  <div className="w-28 flex-shrink-0">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{day}</span>
                  </div>
                  <Toggle checked={dh.open} onChange={(v) => setDay(day, { open: v })} />
                  {dh.open ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={dh.openTime}
                        onChange={(e) => setDay(day, { openTime: e.target.value })}
                        className={inputCls + ' w-32'}
                      />
                      <span className="text-sm text-gray-400">to</span>
                      <input
                        type="time"
                        value={dh.closeTime}
                        onChange={(e) => setDay(day, { closeTime: e.target.value })}
                        className={inputCls + ' w-32'}
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400 italic">Closed</span>
                  )}
                </div>
              );
            })}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        {saved && <span className="flex items-center gap-1.5 text-sm text-green-600"><Check className="h-4 w-4" /> Saved</span>}
        <SaveButton saving={saving} saved={saved} onClick={handleSave} />
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType; href?: string }[] = [
  { id: 'organisation', label: 'Organisation', icon: Building },
  { id: 'hours', label: 'Trading Hours', icon: Clock },
  { id: 'receipts', label: 'Receipts', icon: PrinterIcon },
  { id: 'tax', label: 'Tax / GST', icon: Receipt },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'devices', label: 'Devices', icon: Smartphone, href: '/dashboard/settings/devices' },
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
        {activeTab === 'hours' && <TradingHoursTab />}
        {activeTab === 'receipts' && <ReceiptsTab />}
        {activeTab === 'tax' && <TaxTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
      </div>
    </div>
  );
}
