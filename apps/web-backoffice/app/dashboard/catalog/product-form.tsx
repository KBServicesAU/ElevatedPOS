'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Zap,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
}

interface TaxClass {
  id: string;
  name: string;
}

interface VariantOption {
  id?: string;
  name: string;
  priceAdjustment: number;
  isAvailable: boolean;
  sortOrder: number;
  triggersGroupIndexes: number[];
}

interface VariantGroup {
  id?: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  allowMultiple: boolean;
  isRoot: boolean;
  sortOrder: number;
  options: VariantOption[];
}

// ─── New SKU-based variants types ────────────────────────────────────────────

/** One option dimension, e.g. { name: "Size", values: ["S","M","L"] } */
interface ProductOptionType {
  name: string;
  values: string[];
}

/** One auto-generated variant row (cartesian product of option values) */
interface GeneratedVariant {
  /** e.g. ["S", "Red"] – one entry per option type */
  optionValues: string[];
  /** Display name, e.g. "S / Red" */
  label: string;
  sku: string;
  price: string;
  costPrice: string;
  stock: string;
  enabled: boolean;
}

interface ProductFormData {
  // Details
  name: string;
  kitchenDisplayName: string;
  description: string;
  sku: string;
  barcodes: string[];
  brand: string;
  categoryId: string;
  taxClassId: string;
  productType: 'standard' | 'weighted';
  weightUnit: 'kg' | 'g' | 'lb' | 'oz';
  basePrice: string;
  costPrice: string;
  calories: string;
  prepTime: string;
  hospitalityCourse: string;
  // Channels
  isSoldInstore: boolean;
  showOnKiosk: boolean;
  isSoldOnline: boolean;
  ageRestricted: boolean;
  minAge: string;
  trackStock: boolean;
  isCountdown: boolean;
  countdownStartQty: string;
  // Allergens
  isGlutenFree: boolean;
  isDairyFree: boolean;
  isNutFree: boolean;
  isEggFree: boolean;
  isSoyFree: boolean;
  isSeafoodFree: boolean;
  isSesameFree: boolean;
  isVegan: boolean;
  isVegetarian: boolean;
  isHalal: boolean;
  isKosher: boolean;
  // Dimensions
  dimWidth: string;
  dimWidthUnit: string;
  dimHeight: string;
  dimHeightUnit: string;
  dimDepth: string;
  dimDepthUnit: string;
  dimWeight: string;
  dimWeightUnit: string;
}

const DEFAULT_FORM: ProductFormData = {
  name: '',
  kitchenDisplayName: '',
  description: '',
  sku: '',
  barcodes: [],
  brand: '',
  categoryId: '',
  taxClassId: '',
  productType: 'standard',
  weightUnit: 'kg',
  basePrice: '',
  costPrice: '',
  calories: '',
  prepTime: '',
  hospitalityCourse: '',
  isSoldInstore: true,
  showOnKiosk: true,
  isSoldOnline: false,
  ageRestricted: false,
  minAge: '',
  trackStock: true,
  isCountdown: false,
  countdownStartQty: '',
  isGlutenFree: false,
  isDairyFree: false,
  isNutFree: false,
  isEggFree: false,
  isSoyFree: false,
  isSeafoodFree: false,
  isSesameFree: false,
  isVegan: false,
  isVegetarian: false,
  isHalal: false,
  isKosher: false,
  dimWidth: '',
  dimWidthUnit: 'cm',
  dimHeight: '',
  dimHeightUnit: 'cm',
  dimDepth: '',
  dimDepthUnit: 'cm',
  dimWeight: '',
  dimWeightUnit: 'g',
};

type TabId = 'details' | 'channels' | 'allergens' | 'dimensions' | 'variants';

const TABS: { id: TabId; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'channels', label: 'Channels & Visibility' },
  { id: 'allergens', label: 'Allergens & Dietary' },
  { id: 'dimensions', label: 'Dimensions' },
  { id: 'variants', label: 'Variants' },
];

// ─── Small helper components ──────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  step,
  min,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  step?: string;
  min?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      step={step}
      min={min}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 ${className}`}
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
    />
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 pr-9 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
        checked ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function SectionCard({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {title && (
        <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
      )}
      {children}
    </div>
  );
}

function UnitInput({
  value,
  onChange,
  unit,
  onUnitChange,
  units,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  onUnitChange: (v: string) => void;
  units: string[];
  placeholder?: string;
}) {
  return (
    <div className="flex">
      <input
        type="number"
        step="any"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '0'}
        className="min-w-0 flex-1 rounded-l-lg border border-r-0 border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      />
      <div className="relative">
        <select
          value={unit}
          onChange={(e) => onUnitChange(e.target.value)}
          className="h-full appearance-none rounded-r-lg border border-gray-300 bg-gray-50 px-3 py-2.5 pr-7 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-700 dark:text-gray-300"
        >
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
      </div>
    </div>
  );
}

// ─── Tab: Details ─────────────────────────────────────────────────────────────

function DetailsTab({
  form,
  setField,
  categories,
  taxClasses,
  hasVariants,
}: {
  form: ProductFormData;
  setField: <K extends keyof ProductFormData>(k: K, v: ProductFormData[K]) => void;
  categories: Category[];
  taxClasses: TaxClass[];
  hasVariants: boolean;
}) {
  const [barcodeInput, setBarcodeInput] = useState('');

  function addBarcode() {
    const trimmed = barcodeInput.trim();
    if (trimmed && !form.barcodes.includes(trimmed)) {
      setField('barcodes', [...form.barcodes, trimmed]);
    }
    setBarcodeInput('');
  }

  function removeBarcode(bc: string) {
    setField('barcodes', form.barcodes.filter((b) => b !== bc));
  }

  // Auto-suggest SKU from name
  useEffect(() => {
    if (form.sku === '' && form.name.trim()) {
      const suggested = form.name
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 20);
      // Don't force-set; just show placeholder behaviour
      void suggested;
    }
  }, [form.name, form.sku]);

  const skuPlaceholder =
    form.name.trim()
      ? form.name
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 20)
      : 'Auto-generated';

  return (
    <div className="space-y-5">
      <SectionCard title="Basic Info">
        <div className="space-y-4">
          <div>
            <Label required>Product Name</Label>
            <Input
              value={form.name}
              onChange={(v) => setField('name', v)}
              placeholder="e.g. Flat White"
            />
          </div>
          <div>
            <Label>Kitchen Display Name</Label>
            <Input
              value={form.kitchenDisplayName}
              onChange={(v) => setField('kitchenDisplayName', v)}
              placeholder="Name shown on KDS tickets (leave blank to use product name)"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(v) => setField('description', v)}
              placeholder="Short product description…"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Identification">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>SKU</Label>
            <Input
              value={form.sku}
              onChange={(v) => setField('sku', v)}
              placeholder={skuPlaceholder}
            />
          </div>
          <div>
            <Label>Brand</Label>
            <Input
              value={form.brand}
              onChange={(v) => setField('brand', v)}
              placeholder="e.g. Nespresso"
            />
          </div>
        </div>

        {/* Barcodes */}
        <div className="mt-4">
          <Label>Barcodes</Label>
          <div className="flex gap-2">
            <input
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addBarcode();
                }
              }}
              placeholder="Scan or type barcode…"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <button
              type="button"
              onClick={addBarcode}
              className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {form.barcodes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {form.barcodes.map((bc) => (
                <span
                  key={bc}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                >
                  {bc}
                  <button
                    type="button"
                    onClick={() => removeBarcode(bc)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Classification">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Category</Label>
            <Select value={form.categoryId} onChange={(v) => setField('categoryId', v)}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          {taxClasses.length > 0 && (
            <div>
              <Label>Tax Class</Label>
              <Select value={form.taxClassId} onChange={(v) => setField('taxClassId', v)}>
                <option value="">Default tax</option>
                {taxClasses.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {/* Product type */}
        <div className="mt-4">
          <Label>Product Type</Label>
          <div className="flex gap-6">
            {(
              [
                { value: 'standard', label: 'Standard' },
                { value: 'weighted', label: 'Weighted / Scalable' },
              ] as const
            ).map((opt) => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="productType"
                  value={opt.value}
                  checked={form.productType === opt.value}
                  onChange={() => setField('productType', opt.value)}
                  className="accent-indigo-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
              </label>
            ))}
          </div>
          {form.productType === 'weighted' && (
            <div className="mt-3">
              <Label>Weight Unit</Label>
              <div className="flex gap-4">
                {(['kg', 'g', 'lb', 'oz'] as const).map((unit) => (
                  <label key={unit} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name="weightUnit"
                      value={unit}
                      checked={form.weightUnit === unit}
                      onChange={() => setField('weightUnit', unit)}
                      className="accent-indigo-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{unit}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {!hasVariants && (
        <SectionCard title="Pricing">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label required>Base Price ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.basePrice}
                onChange={(v) => setField('basePrice', v)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Cost Price ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.costPrice}
                onChange={(v) => setField('costPrice', v)}
                placeholder="0.00"
              />
            </div>
          </div>
        </SectionCard>
      )}
      {hasVariants && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 px-5 py-3 text-sm text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/10 dark:text-indigo-300">
          Price and stock are managed per-variant in the <strong>Variants</strong> tab.
        </div>
      )}

      <SectionCard title="Hospitality">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label>Calories</Label>
            <Input
              type="number"
              min="0"
              value={form.calories}
              onChange={(v) => setField('calories', v)}
              placeholder="kcal"
            />
          </div>
          <div>
            <Label>Prep Time (min)</Label>
            <Input
              type="number"
              min="0"
              value={form.prepTime}
              onChange={(v) => setField('prepTime', v)}
              placeholder="0"
            />
          </div>
          <div>
            <Label>Course</Label>
            <Select value={form.hospitalityCourse} onChange={(v) => setField('hospitalityCourse', v)}>
              <option value="">None</option>
              <option value="appetizer">Appetizer</option>
              <option value="main">Main</option>
              <option value="dessert">Dessert</option>
              <option value="beverage">Beverage</option>
              <option value="kids">Kids</option>
            </Select>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Channels ─────────────────────────────────────────────────────────────

function ChannelsTab({
  form,
  setField,
}: {
  form: ProductFormData;
  setField: <K extends keyof ProductFormData>(k: K, v: ProductFormData[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionCard title="Sales Channels">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          <ToggleRow
            label="Show on Till"
            description="Visible and purchasable from the POS terminal"
            checked={form.isSoldInstore}
            onChange={(v) => setField('isSoldInstore', v)}
          />
          <ToggleRow
            label="Show on Kiosk"
            description="Visible on self-service kiosk"
            checked={form.showOnKiosk}
            onChange={(v) => setField('showOnKiosk', v)}
          />
          <ToggleRow
            label="Show on Web"
            description="Listed in the online storefront"
            checked={form.isSoldOnline}
            onChange={(v) => setField('isSoldOnline', v)}
          />
        </div>
      </SectionCard>

      <SectionCard title="Access Control">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          <ToggleRow
            label="Age Restricted"
            description="Staff must verify customer age before sale"
            checked={form.ageRestricted}
            onChange={(v) => setField('ageRestricted', v)}
          />
          {form.ageRestricted && (
            <div className="py-3">
              <Label>Minimum Age</Label>
              <Input
                type="number"
                min="1"
                value={form.minAge}
                onChange={(v) => setField('minAge', v)}
                placeholder="18"
                className="max-w-[120px]"
              />
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Stock Management">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          <ToggleRow
            label="Track Stock"
            description="Monitor inventory levels for this product"
            checked={form.trackStock}
            onChange={(v) => setField('trackStock', v)}
          />
          {form.trackStock && (
            <>
              <ToggleRow
                label="Countdown when low"
                description="Display remaining quantity when stock is low"
                checked={form.isCountdown}
                onChange={(v) => setField('isCountdown', v)}
              />
              {form.isCountdown && (
                <div className="py-3">
                  <Label>Starting countdown quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.countdownStartQty}
                    onChange={(v) => setField('countdownStartQty', v)}
                    placeholder="10"
                    className="max-w-[160px]"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Countdown displays when SOH drops below this number.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Allergens ────────────────────────────────────────────────────────────

const ALLERGEN_FIELDS: { key: keyof ProductFormData; label: string }[] = [
  { key: 'isGlutenFree', label: 'Gluten Free' },
  { key: 'isDairyFree', label: 'Dairy Free' },
  { key: 'isNutFree', label: 'Nut Free' },
  { key: 'isEggFree', label: 'Egg Free' },
  { key: 'isSoyFree', label: 'Soy Free' },
  { key: 'isSeafoodFree', label: 'Seafood Free' },
  { key: 'isSesameFree', label: 'Sesame Free' },
  { key: 'isVegan', label: 'Vegan' },
  { key: 'isVegetarian', label: 'Vegetarian' },
  { key: 'isHalal', label: 'Halal' },
  { key: 'isKosher', label: 'Kosher' },
];

function AllergensTab({
  form,
  setField,
}: {
  form: ProductFormData;
  setField: <K extends keyof ProductFormData>(k: K, v: ProductFormData[K]) => void;
}) {
  return (
    <SectionCard title="Allergens & Dietary">
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
        {ALLERGEN_FIELDS.map(({ key, label }) => (
          <label key={key} className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={form[key] as boolean}
              onChange={(e) => setField(key, e.target.checked as ProductFormData[typeof key])}
              className="h-4 w-4 rounded accent-indigo-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
          </label>
        ))}
      </div>
    </SectionCard>
  );
}

// ─── Tab: Dimensions ──────────────────────────────────────────────────────────

const LINEAR_UNITS = ['cm', 'mm', 'inch'];
const WEIGHT_UNITS = ['g', 'kg', 'oz', 'lb'];

function DimensionsTab({
  form,
  setField,
}: {
  form: ProductFormData;
  setField: <K extends keyof ProductFormData>(k: K, v: ProductFormData[K]) => void;
}) {
  return (
    <SectionCard title="Dimensions">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>Width</Label>
          <UnitInput
            value={form.dimWidth}
            onChange={(v) => setField('dimWidth', v)}
            unit={form.dimWidthUnit}
            onUnitChange={(v) => setField('dimWidthUnit', v)}
            units={LINEAR_UNITS}
          />
        </div>
        <div>
          <Label>Height</Label>
          <UnitInput
            value={form.dimHeight}
            onChange={(v) => setField('dimHeight', v)}
            unit={form.dimHeightUnit}
            onUnitChange={(v) => setField('dimHeightUnit', v)}
            units={LINEAR_UNITS}
          />
        </div>
        <div>
          <Label>Depth / Length</Label>
          <UnitInput
            value={form.dimDepth}
            onChange={(v) => setField('dimDepth', v)}
            unit={form.dimDepthUnit}
            onUnitChange={(v) => setField('dimDepthUnit', v)}
            units={LINEAR_UNITS}
          />
        </div>
        <div>
          <Label>Weight</Label>
          <UnitInput
            value={form.dimWeight}
            onChange={(v) => setField('dimWeight', v)}
            unit={form.dimWeightUnit}
            onUnitChange={(v) => setField('dimWeightUnit', v)}
            units={WEIGHT_UNITS}
          />
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Tab: Variants ────────────────────────────────────────────────────────────

function VariantOptionRow({
  option,
  optionIndex,
  groupIndex,
  groups,
  onUpdate,
  onDelete,
}: {
  option: VariantOption;
  optionIndex: number;
  groupIndex: number;
  groups: VariantGroup[];
  onUpdate: (idx: number, opt: VariantOption) => void;
  onDelete: (idx: number) => void;
}) {
  const [showConditional, setShowConditional] = useState(false);

  function toggleTrigger(gIdx: number) {
    const current = option.triggersGroupIndexes;
    const updated = current.includes(gIdx)
      ? current.filter((i) => i !== gIdx)
      : [...current, gIdx];
    onUpdate(optionIndex, { ...option, triggersGroupIndexes: updated });
  }

  const otherGroups = groups
    .map((g, i) => ({ g, i }))
    .filter(({ i }) => i !== groupIndex);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
      <div className="flex flex-wrap items-center gap-2">
        {/* Name */}
        <input
          type="text"
          value={option.name}
          onChange={(e) => onUpdate(optionIndex, { ...option, name: e.target.value })}
          placeholder="Option name"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
        {/* Price adj */}
        <div className="flex items-center gap-1">
          <span className="text-sm text-gray-500">±$</span>
          <input
            type="number"
            step="0.01"
            value={option.priceAdjustment === 0 ? '' : String(option.priceAdjustment / 100)}
            onChange={(e) =>
              onUpdate(optionIndex, {
                ...option,
                priceAdjustment: e.target.value
                  ? Math.round(parseFloat(e.target.value) * 100)
                  : 0,
              })
            }
            placeholder="0.00"
            className="w-20 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        {/* Available toggle */}
        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={option.isAvailable}
            onChange={(e) => onUpdate(optionIndex, { ...option, isAvailable: e.target.checked })}
            className="h-3.5 w-3.5 accent-indigo-600"
          />
          Available
        </label>
        {/* Conditional trigger button */}
        {otherGroups.length > 0 && (
          <button
            type="button"
            onClick={() => setShowConditional((v) => !v)}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              option.triggersGroupIndexes.length > 0
                ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                : 'border-gray-200 bg-white text-gray-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            <Zap className="h-3 w-3" /> Conditional
            {option.triggersGroupIndexes.length > 0 && (
              <span className="ml-0.5 rounded-full bg-amber-600 px-1 text-[10px] text-white">
                {option.triggersGroupIndexes.length}
              </span>
            )}
          </button>
        )}
        {/* Delete */}
        <button
          type="button"
          onClick={() => onDelete(optionIndex)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Conditional panel */}
      {showConditional && otherGroups.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-900/10">
          <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-300">
            When this option is selected, also show these groups:
          </p>
          <div className="flex flex-wrap gap-3">
            {otherGroups.map(({ g, i }) => (
              <label key={i} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={option.triggersGroupIndexes.includes(i)}
                  onChange={() => toggleTrigger(i)}
                  className="h-3.5 w-3.5 accent-indigo-600"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {g.name || `Group ${i + 1}`}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VariantGroupCard({
  group,
  groupIndex,
  groups,
  onUpdate,
  onDelete,
}: {
  group: VariantGroup;
  groupIndex: number;
  groups: VariantGroup[];
  onUpdate: (idx: number, g: VariantGroup) => void;
  onDelete: (idx: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  function setGroupField<K extends keyof VariantGroup>(key: K, val: VariantGroup[K]) {
    onUpdate(groupIndex, { ...group, [key]: val });
  }

  function addOption() {
    const newOpt: VariantOption = {
      name: '',
      priceAdjustment: 0,
      isAvailable: true,
      sortOrder: group.options.length,
      triggersGroupIndexes: [],
    };
    setGroupField('options', [...group.options, newOpt]);
  }

  function updateOption(optIdx: number, opt: VariantOption) {
    const updated = [...group.options];
    updated[optIdx] = opt;
    setGroupField('options', updated);
  }

  function deleteOption(optIdx: number) {
    setGroupField(
      'options',
      group.options.filter((_, i) => i !== optIdx),
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      {/* Group header */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:text-gray-600"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Group name */}
        <input
          type="text"
          value={group.name}
          onChange={(e) => setGroupField('name', e.target.value)}
          placeholder={`Group ${groupIndex + 1}`}
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-transparent px-2.5 py-1.5 text-sm font-medium text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:text-white"
        />

        <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs">
          {/* Required */}
          <label className="flex cursor-pointer items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={group.required}
              onChange={(e) => setGroupField('required', e.target.checked)}
              className="h-3.5 w-3.5 accent-indigo-600"
            />
            Required
          </label>

          {/* Allow multiple */}
          <label className="flex cursor-pointer items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={group.allowMultiple}
              onChange={(e) => setGroupField('allowMultiple', e.target.checked)}
              className="h-3.5 w-3.5 accent-indigo-600"
            />
            Multi-select
          </label>

          {/* Root group */}
          <label className="flex cursor-pointer items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={group.isRoot}
              onChange={(e) => setGroupField('isRoot', e.target.checked)}
              className="h-3.5 w-3.5 accent-indigo-600"
            />
            Root group
          </label>

          {/* Delete */}
          <button
            type="button"
            onClick={() => onDelete(groupIndex)}
            className="flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        </div>
      </div>

      {/* Min/max when allowMultiple */}
      {expanded && group.allowMultiple && (
        <div className="flex items-center gap-4 border-b border-gray-100 px-4 py-2 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Min</span>
            <input
              type="number"
              min="0"
              value={group.minSelections}
              onChange={(e) => setGroupField('minSelections', Number(e.target.value))}
              className="w-16 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Max</span>
            <input
              type="number"
              min="0"
              value={group.maxSelections}
              onChange={(e) => setGroupField('maxSelections', Number(e.target.value))}
              className="w-16 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>
      )}

      {/* Options */}
      {expanded && (
        <div className="space-y-2 p-4">
          {group.options.map((opt, optIdx) => (
            <VariantOptionRow
              key={optIdx}
              option={opt}
              optionIndex={optIdx}
              groupIndex={groupIndex}
              groups={groups}
              onUpdate={updateOption}
              onDelete={deleteOption}
            />
          ))}
          <button
            type="button"
            onClick={addOption}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-700 dark:hover:border-indigo-600 dark:hover:text-indigo-400"
          >
            <Plus className="h-4 w-4" /> Add Option
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Helpers: cartesian product ──────────────────────────────────────────────

function cartesian(arrays: string[][]): string[][] {
  if (arrays.length === 0) return [[]];
  const [first, ...rest] = arrays;
  const restProduct = cartesian(rest);
  return first.flatMap((val) => restProduct.map((combo) => [val, ...combo]));
}

function buildVariantSku(parentSku: string, optionValues: string[]): string {
  const suffix = optionValues
    .map((v) => v.toUpperCase().replace(/[^A-Z0-9]+/g, ''))
    .filter(Boolean)
    .join('-');
  return parentSku ? `${parentSku}-${suffix}` : suffix;
}

/** Merge newly generated variants with any existing ones (preserve user edits) */
function mergeVariants(
  newCombos: string[][],
  existing: GeneratedVariant[],
  parentSku: string,
  parentPrice: string,
): GeneratedVariant[] {
  return newCombos.map((combo) => {
    const label = combo.join(' / ');
    const found = existing.find((v) => v.label === label);
    if (found) return { ...found, label, optionValues: combo };
    return {
      optionValues: combo,
      label,
      sku: buildVariantSku(parentSku, combo),
      price: parentPrice,
      costPrice: '',
      stock: '',
      enabled: true,
    };
  });
}

// ─── Tab: Variants (new SKU-based system) ────────────────────────────────────

function VariantsTab({
  hasVariants,
  onToggleHasVariants,
  optionTypes,
  setOptionTypes,
  variants,
  setVariants,
  parentSku,
  parentPrice,
}: {
  hasVariants: boolean;
  onToggleHasVariants: (v: boolean) => void;
  optionTypes: ProductOptionType[];
  setOptionTypes: React.Dispatch<React.SetStateAction<ProductOptionType[]>>;
  variants: GeneratedVariant[];
  setVariants: React.Dispatch<React.SetStateAction<GeneratedVariant[]>>;
  parentSku: string;
  parentPrice: string;
}) {
  // Local state for tag input per option type
  const [tagInputs, setTagInputs] = useState<string[]>(() => optionTypes.map(() => ''));

  // Keep tagInputs length in sync with optionTypes
  useEffect(() => {
    setTagInputs((prev) => {
      const next = [...prev];
      while (next.length < optionTypes.length) next.push('');
      return next.slice(0, optionTypes.length);
    });
  }, [optionTypes.length]);

  // Regenerate variant table whenever optionTypes or parentSku/parentPrice change
  useEffect(() => {
    if (!hasVariants) return;
    const valueSets = optionTypes.map((o) => o.values).filter((v) => v.length > 0);
    if (valueSets.length === 0) {
      setVariants([]);
      return;
    }
    const combos = cartesian(valueSets);
    setVariants((prev) => mergeVariants(combos, prev, parentSku, parentPrice));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionTypes, hasVariants, parentSku, parentPrice]);

  // ── Option type helpers ────────────────────────────────────────────────────

  function addOptionType() {
    if (optionTypes.length >= 3) return;
    setOptionTypes((prev) => [...prev, { name: '', values: [] }]);
  }

  function removeOptionType(idx: number) {
    setOptionTypes((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateOptionTypeName(idx: number, name: string) {
    setOptionTypes((prev) => prev.map((o, i) => (i === idx ? { ...o, name } : o)));
  }

  function addTag(idx: number, raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setOptionTypes((prev) =>
      prev.map((o, i) =>
        i === idx && !o.values.includes(trimmed)
          ? { ...o, values: [...o.values, trimmed] }
          : o,
      ),
    );
    setTagInputs((prev) => prev.map((v, i) => (i === idx ? '' : v)));
  }

  function removeTag(optIdx: number, tagVal: string) {
    setOptionTypes((prev) =>
      prev.map((o, i) =>
        i === optIdx ? { ...o, values: o.values.filter((v) => v !== tagVal) } : o,
      ),
    );
  }

  // ── Variant row helpers ────────────────────────────────────────────────────

  function updateVariant(idx: number, patch: Partial<GeneratedVariant>) {
    setVariants((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }

  function applyPriceToAll(price: string) {
    setVariants((prev) => prev.map((v) => ({ ...v, price })));
  }

  function applyCostToAll(cost: string) {
    setVariants((prev) => prev.map((v) => ({ ...v, costPrice: cost })));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* hasVariants toggle */}
      <SectionCard>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Enable Product Variants
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Turn on to sell this product in multiple variants (e.g. sizes, colours). Price and
              stock become per-variant.
            </p>
          </div>
          <Toggle checked={hasVariants} onChange={onToggleHasVariants} />
        </div>
      </SectionCard>

      {hasVariants && (
        <>
          {/* Option types editor */}
          <SectionCard title="Option Types">
            <div className="space-y-4">
              {optionTypes.map((opt, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={opt.name}
                      onChange={(e) => updateOptionTypeName(idx, e.target.value)}
                      placeholder={`Option name (e.g. ${idx === 0 ? 'Size' : idx === 1 ? 'Colour' : 'Style'})`}
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeOptionType(idx)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Tag values */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {opt.values.map((val) => (
                      <span
                        key={val}
                        className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                      >
                        {val}
                        <button
                          type="button"
                          onClick={() => removeTag(idx, val)}
                          className="ml-0.5 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Tag input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInputs[idx] ?? ''}
                      onChange={(e) =>
                        setTagInputs((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag(idx, tagInputs[idx] ?? '');
                        }
                      }}
                      placeholder="Type a value and press Enter…"
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => addTag(idx, tagInputs[idx] ?? '')}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              {optionTypes.length < 3 ? (
                <button
                  type="button"
                  onClick={addOptionType}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-700 dark:hover:border-indigo-600 dark:hover:text-indigo-400"
                >
                  <Plus className="h-4 w-4" /> Add Option{optionTypes.length > 0 ? ' Type' : ' (e.g. Size, Colour)'}
                </button>
              ) : (
                <p className="text-center text-xs text-gray-400 dark:text-gray-500">
                  Maximum of 3 option types reached.
                </p>
              )}
            </div>
          </SectionCard>

          {/* Auto-generated variants table */}
          {variants.length > 0 && (
            <SectionCard title={`Generated Variants (${variants.length})`}>
              {/* Apply-to-all quick actions */}
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Apply to all:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Price $</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={parentPrice || '0.00'}
                    className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    onBlur={(e) => { if (e.target.value) applyPriceToAll(e.target.value); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        applyPriceToAll((e.target as HTMLInputElement).value);
                      }
                    }}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Cost $</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    onBlur={(e) => { if (e.target.value) applyCostToAll(e.target.value); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        applyCostToAll((e.target as HTMLInputElement).value);
                      }
                    }}
                  />
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="pb-2 pl-1 pr-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        Variant
                      </th>
                      <th className="pb-2 px-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        SKU
                      </th>
                      <th className="pb-2 px-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        Price ($)
                      </th>
                      <th className="pb-2 px-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        Cost ($)
                      </th>
                      <th className="pb-2 px-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        Stock
                      </th>
                      <th className="pb-2 px-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                        Enabled
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {[...variants]
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .map((v) => {
                        // find the real index in the unsorted array
                        const realIdx = variants.findIndex((rv) => rv.label === v.label);
                        return (
                          <tr
                            key={v.label}
                            className={`${
                              !v.enabled ? 'opacity-50' : ''
                            } transition-opacity`}
                          >
                            {/* Variant name */}
                            <td className="py-2 pl-1 pr-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                              {v.label}
                            </td>
                            {/* SKU */}
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={v.sku}
                                onChange={(e) => updateVariant(realIdx, { sku: e.target.value })}
                                className="w-36 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                              />
                            </td>
                            {/* Price */}
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={v.price}
                                onChange={(e) => updateVariant(realIdx, { price: e.target.value })}
                                placeholder="0.00"
                                className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                              />
                            </td>
                            {/* Cost */}
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={v.costPrice}
                                onChange={(e) => updateVariant(realIdx, { costPrice: e.target.value })}
                                placeholder="0.00"
                                className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                              />
                            </td>
                            {/* Stock */}
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={v.stock}
                                onChange={(e) => updateVariant(realIdx, { stock: e.target.value })}
                                placeholder="0"
                                className="w-20 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                              />
                            </td>
                            {/* Enabled */}
                            <td className="py-2 px-2 text-center">
                              <Toggle
                                checked={v.enabled}
                                onChange={(val) => updateVariant(realIdx, { enabled: val })}
                              />
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {variants.length === 0 && optionTypes.some((o) => o.values.length > 0) && (
            <div className="rounded-xl border-2 border-dashed border-gray-200 py-8 text-center dark:border-gray-700">
              <p className="text-sm text-gray-400">
                Add values to your option types to generate variant combinations.
              </p>
            </div>
          )}

          {optionTypes.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-gray-200 py-10 text-center dark:border-gray-700">
              <p className="text-sm text-gray-400">
                Add an option type above (e.g. &ldquo;Size&rdquo; with values S, M, L) to get started.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function buildPayload(form: ProductFormData): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    status: 'active',
    productType: form.productType,
    isSoldInstore: form.isSoldInstore,
    showOnKiosk: form.showOnKiosk,
    isSoldOnline: form.isSoldOnline,
    trackStock: form.trackStock,
    isCountdown: form.trackStock ? form.isCountdown : false,
    ageRestricted: form.ageRestricted,
    isGlutenFree: form.isGlutenFree,
    isDairyFree: form.isDairyFree,
    isNutFree: form.isNutFree,
    isEggFree: form.isEggFree,
    isSoyFree: form.isSoyFree,
    isSeafoodFree: form.isSeafoodFree,
    isSesameFree: form.isSesameFree,
    isVegan: form.isVegan,
    isVegetarian: form.isVegetarian,
    isHalal: form.isHalal,
    isKosher: form.isKosher,
  };

  if (form.kitchenDisplayName.trim()) payload.kitchenDisplayName = form.kitchenDisplayName.trim();
  if (form.description.trim()) payload.description = form.description.trim();
  if (form.sku.trim()) payload.sku = form.sku.trim();
  if (form.brand.trim()) payload.brand = form.brand.trim();
  if (form.barcodes.length > 0) payload.barcodes = form.barcodes;
  if (form.categoryId) payload.categoryId = form.categoryId;
  if (form.taxClassId) payload.taxClassId = form.taxClassId;
  if (form.hospitalityCourse) payload.hospitalityCourse = form.hospitalityCourse;
  if (form.weightUnit && form.productType === 'weighted') payload.weightUnit = form.weightUnit;
  if (form.ageRestricted && form.minAge) payload.minAge = Number(form.minAge);
  if (form.trackStock && form.isCountdown && form.countdownStartQty)
    payload.countdownStartQty = Number(form.countdownStartQty);
  if (form.basePrice) payload.basePrice = Math.round(parseFloat(form.basePrice) * 100);
  if (form.costPrice) payload.costPrice = Math.round(parseFloat(form.costPrice) * 100);
  if (form.calories) payload.calories = Number(form.calories);
  if (form.prepTime) payload.prepTime = Number(form.prepTime);

  // Dimensions
  const dims: Record<string, unknown> = {};
  if (form.dimWidth) dims.width = { value: Number(form.dimWidth), unit: form.dimWidthUnit };
  if (form.dimHeight) dims.height = { value: Number(form.dimHeight), unit: form.dimHeightUnit };
  if (form.dimDepth) dims.depth = { value: Number(form.dimDepth), unit: form.dimDepthUnit };
  if (form.dimWeight) dims.weight = { value: Number(form.dimWeight), unit: form.dimWeightUnit };
  if (Object.keys(dims).length > 0) payload.dimensions = dims;

  return payload;
}

async function syncVariants(productId: string, groups: VariantGroup[]): Promise<void> {
  for (const [gi, group] of groups.entries()) {
    let groupId = group.id;

    if (!groupId) {
      // Create group
      const res = await fetch(`/api/proxy/catalog/products/${productId}/variant-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: group.name,
          required: group.required,
          minSelections: group.minSelections,
          maxSelections: group.maxSelections,
          allowMultiple: group.allowMultiple,
          isRoot: group.isRoot,
          sortOrder: group.sortOrder,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { id?: string; data?: { id?: string } };
        groupId = data.id ?? data.data?.id;
      } else {
        continue;
      }
    }

    if (!groupId) continue;

    // Create options
    for (const [oi, opt] of group.options.entries()) {
      if (opt.id) continue; // already saved

      const res = await fetch(
        `/api/proxy/catalog/products/${productId}/variant-groups/${groupId}/options`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: opt.name,
            priceAdjustment: opt.priceAdjustment,
            isAvailable: opt.isAvailable,
            sortOrder: opt.sortOrder,
          }),
        },
      );

      if (res.ok && opt.triggersGroupIndexes.length > 0) {
        const optData = (await res.json()) as { id?: string; data?: { id?: string } };
        const optId = optData.id ?? optData.data?.id;
        if (optId) {
          // Create variant rules
          for (const triggeredGroupIdx of opt.triggersGroupIndexes) {
            const triggeredGroup = groups[triggeredGroupIdx];
            if (!triggeredGroup?.id) continue;
            await fetch(`/api/proxy/catalog/products/${productId}/variant-rules`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                triggerOptionId: optId,
                targetGroupId: triggeredGroup.id,
              }),
            }).catch(() => {
              // best-effort
            });
          }
        }
      }

      void oi; // suppress unused warning
    }

    void gi; // suppress unused warning
  }
}

// ─── Main Form Component ──────────────────────────────────────────────────────

export function ProductForm({ productId }: { productId?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const isEditing = !!productId;

  const [activeTab, setActiveTab] = useState<TabId>('details');
  const [form, setForm] = useState<ProductFormData>(DEFAULT_FORM);
  const [groups, setGroups] = useState<VariantGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [taxClasses, setTaxClasses] = useState<TaxClass[]>([]);

  // ── New SKU-based variant state ────────────────────────────────────────────
  const [hasVariants, setHasVariants] = useState(false);
  const [variantOptionTypes, setVariantOptionTypes] = useState<ProductOptionType[]>([]);
  const [generatedVariants, setGeneratedVariants] = useState<GeneratedVariant[]>([]);

  const [loadingProduct, setLoadingProduct] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Use a ref to track mounted state to avoid state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ─── Load reference data ──────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/proxy/catalog/categories')
      .then((r) => r.json())
      .then((data: { data?: Category[] } | Category[]) => {
        if (!mountedRef.current) return;
        const items = Array.isArray(data) ? data : (data.data ?? []);
        setCategories(items);
      })
      .catch(() => {});

    fetch('/api/proxy/catalog/tax-classes')
      .then((r) => r.json())
      .then((data: { data?: TaxClass[] } | TaxClass[]) => {
        if (!mountedRef.current) return;
        const items = Array.isArray(data) ? data : (data.data ?? []);
        setTaxClasses(items);
      })
      .catch(() => {
        // endpoint may not exist — silently skip
      });
  }, []);

  // ─── Load product if editing ──────────────────────────────────────────────

  useEffect(() => {
    if (!productId) return;

    setLoadingProduct(true);

    fetch(`/api/proxy/catalog/products/${productId}`)
      .then((r) => r.json())
      .then((raw: Record<string, unknown>) => {
        if (!mountedRef.current) return;
        const p = (raw.data ?? raw) as Record<string, unknown>;

        const dims = (p.dimensions as Record<string, { value?: number; unit?: string }>) ?? {};

        setForm({
          name: String(p.name ?? ''),
          kitchenDisplayName: String(p.kitchenDisplayName ?? ''),
          description: String(p.description ?? ''),
          sku: String(p.sku ?? ''),
          barcodes: Array.isArray(p.barcodes) ? (p.barcodes as string[]) : [],
          brand: String(p.brand ?? ''),
          categoryId: String(p.categoryId ?? ''),
          taxClassId: String(p.taxClassId ?? ''),
          productType: (p.productType as 'standard' | 'weighted') ?? 'standard',
          weightUnit: (p.weightUnit as 'kg' | 'g' | 'lb' | 'oz') ?? 'kg',
          basePrice: p.basePrice != null ? String(Number(p.basePrice) / 100) : '',
          costPrice: p.costPrice != null ? String(Number(p.costPrice) / 100) : '',
          calories: p.calories != null ? String(p.calories) : '',
          prepTime: p.prepTime != null ? String(p.prepTime) : '',
          hospitalityCourse: String(p.hospitalityCourse ?? ''),
          isSoldInstore: Boolean(p.isSoldInstore ?? true),
          showOnKiosk: Boolean(p.showOnKiosk ?? true),
          isSoldOnline: Boolean(p.isSoldOnline ?? false),
          ageRestricted: Boolean(p.ageRestricted ?? false),
          minAge: p.minAge != null ? String(p.minAge) : '',
          trackStock: Boolean(p.trackStock ?? true),
          isCountdown: Boolean(p.isCountdown ?? false),
          countdownStartQty: p.countdownStartQty != null ? String(p.countdownStartQty) : '',
          isGlutenFree: Boolean(p.isGlutenFree),
          isDairyFree: Boolean(p.isDairyFree),
          isNutFree: Boolean(p.isNutFree),
          isEggFree: Boolean(p.isEggFree),
          isSoyFree: Boolean(p.isSoyFree),
          isSeafoodFree: Boolean(p.isSeafoodFree),
          isSesameFree: Boolean(p.isSesameFree),
          isVegan: Boolean(p.isVegan),
          isVegetarian: Boolean(p.isVegetarian),
          isHalal: Boolean(p.isHalal),
          isKosher: Boolean(p.isKosher),
          dimWidth: dims.width?.value != null ? String(dims.width.value) : '',
          dimWidthUnit: dims.width?.unit ?? 'cm',
          dimHeight: dims.height?.value != null ? String(dims.height.value) : '',
          dimHeightUnit: dims.height?.unit ?? 'cm',
          dimDepth: dims.depth?.value != null ? String(dims.depth.value) : '',
          dimDepthUnit: dims.depth?.unit ?? 'cm',
          dimWeight: dims.weight?.value != null ? String(dims.weight.value) : '',
          dimWeightUnit: dims.weight?.unit ?? 'g',
        });
      })
      .catch(() => {
        if (mountedRef.current) {
          toast({ title: 'Failed to load product', variant: 'destructive' });
        }
      })
      .finally(() => {
        if (mountedRef.current) setLoadingProduct(false);
      });

    // Load modifier-group-style variants (legacy)
    fetch(`/api/proxy/catalog/products/${productId}/variant-groups`)
      .then((r) => r.json())
      .then((data: { data?: VariantGroup[] } | VariantGroup[]) => {
        if (!mountedRef.current) return;
        const items = Array.isArray(data) ? data : (data.data ?? []);
        setGroups(items);
      })
      .catch(() => {
        // variants may not exist yet
      });

    // Load new SKU-based variants
    fetch(`/api/proxy/products/${productId}/variants`)
      .then((r) => r.json())
      .then((data: { data?: GeneratedVariant[]; hasVariants?: boolean } | GeneratedVariant[]) => {
        if (!mountedRef.current) return;
        const isEnvelope = !Array.isArray(data);
        const items: GeneratedVariant[] = Array.isArray(data)
          ? data
          : ((data.data ?? []) as GeneratedVariant[]);
        if (items.length > 0) {
          setHasVariants(true);
          setGeneratedVariants(items);
          // Reconstruct option types from first variant's optionValues
          // The API is expected to return optionTypes alongside, but we fall back gracefully
          const optTypes =
            isEnvelope && (data as { optionTypes?: ProductOptionType[] }).optionTypes
              ? ((data as { optionTypes?: ProductOptionType[] }).optionTypes ?? [])
              : [];
          if (optTypes.length > 0) setVariantOptionTypes(optTypes);
        } else if (isEnvelope && (data as { hasVariants?: boolean }).hasVariants) {
          setHasVariants(true);
        }
      })
      .catch(() => {
        // endpoint may not exist yet
      });
  }, [productId, toast]);

  // ─── Field setter ─────────────────────────────────────────────────────────

  const setField = useCallback(
    <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // ─── Save ─────────────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setSaveError('Product name is required.');
      setActiveTab('details');
      return;
    }
    // Base price required only when not using per-variant pricing
    if (!hasVariants && !form.basePrice) {
      setSaveError('Base price is required.');
      setActiveTab('details');
      return;
    }

    setSaveError('');
    setSaving(true);

    try {
      const payload = buildPayload(form);

      // When variants are enabled, strip top-level price and embed variant data
      if (hasVariants) {
        delete payload.basePrice;
        delete payload.costPrice;
        payload.hasVariants = true;
        payload.variantOptionTypes = variantOptionTypes;
        payload.variants = generatedVariants.map((v) => ({
          optionValues: v.optionValues,
          sku: v.sku,
          price: v.price ? Math.round(parseFloat(v.price) * 100) : 0,
          costPrice: v.costPrice ? Math.round(parseFloat(v.costPrice) * 100) : undefined,
          stock: v.stock !== '' ? Number(v.stock) : undefined,
          enabled: v.enabled,
        }));
      }

      let savedId = productId;

      if (isEditing) {
        // Try new endpoint first, fall back to catalog path
        let res = await fetch(`/api/proxy/products/${productId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          res = await fetch(`/api/proxy/catalog/products/${productId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(err.message ?? `HTTP ${res.status}`);
          }
        }
      } else {
        // Try new endpoint first, fall back to catalog path
        let res = await fetch('/api/proxy/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          res = await fetch('/api/proxy/catalog/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(err.message ?? `HTTP ${res.status}`);
          }
        }
        const created = (await res.json()) as { id?: string; data?: { id?: string } };
        savedId = created.id ?? created.data?.id;
      }

      // Sync legacy modifier-group variants
      if (savedId && groups.length > 0) {
        await syncVariants(savedId, groups).catch(() => {
          toast({
            title: 'Product saved',
            description: 'Note: Some variant groups may not have synced.',
            variant: 'default',
          });
        });
      }

      toast({ title: 'Product saved', variant: 'success' });

      if (!isEditing && savedId) {
        router.push(`/dashboard/catalog/products/${savedId}`);
      }
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to save product');
      setSaveError(msg);
      toast({ title: 'Failed to save product', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loadingProduct) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/catalog"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Products
          </Link>
          <span className="text-gray-300 dark:text-gray-700">/</span>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {isEditing ? (form.name || 'Edit Product') : 'New Product'}
          </h1>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            'Save'
          )}
        </button>
      </div>

      {/* Error banner */}
      {saveError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <span className="flex-1">{saveError}</span>
          <button type="button" onClick={() => setSaveError('')} className="shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab panels */}
      <div>
        {activeTab === 'details' && (
          <DetailsTab
            form={form}
            setField={setField}
            categories={categories}
            taxClasses={taxClasses}
            hasVariants={hasVariants}
          />
        )}
        {activeTab === 'channels' && (
          <ChannelsTab form={form} setField={setField} />
        )}
        {activeTab === 'allergens' && (
          <AllergensTab form={form} setField={setField} />
        )}
        {activeTab === 'dimensions' && (
          <DimensionsTab form={form} setField={setField} />
        )}
        {activeTab === 'variants' && (
          <VariantsTab
            hasVariants={hasVariants}
            onToggleHasVariants={setHasVariants}
            optionTypes={variantOptionTypes}
            setOptionTypes={setVariantOptionTypes}
            variants={generatedVariants}
            setVariants={setGeneratedVariants}
            parentSku={form.sku}
            parentPrice={form.basePrice}
          />
        )}
      </div>

      {/* Bottom save bar */}
      <div className="flex items-center justify-end gap-3 rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-800 dark:bg-gray-800/50">
        <Link
          href="/dashboard/catalog"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            'Save Product'
          )}
        </button>
      </div>
    </form>
  );
}
