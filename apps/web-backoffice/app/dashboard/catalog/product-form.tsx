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
}: {
  form: ProductFormData;
  setField: <K extends keyof ProductFormData>(k: K, v: ProductFormData[K]) => void;
  categories: Category[];
  taxClasses: TaxClass[];
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

function VariantsTab({
  groups,
  setGroups,
}: {
  groups: VariantGroup[];
  setGroups: React.Dispatch<React.SetStateAction<VariantGroup[]>>;
}) {
  function addGroup() {
    setGroups((prev) => [
      ...prev,
      {
        name: '',
        required: false,
        minSelections: 0,
        maxSelections: 1,
        allowMultiple: false,
        isRoot: prev.length === 0, // first group defaults to root
        sortOrder: prev.length,
        options: [],
      },
    ]);
  }

  function updateGroup(idx: number, g: VariantGroup) {
    setGroups((prev) => {
      const next = [...prev];
      next[idx] = g;
      return next;
    });
  }

  function deleteGroup(idx: number) {
    setGroups((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Variant Groups
          </h3>
          <p className="mt-0.5 text-sm text-gray-500">
            Build modifier groups (e.g. &ldquo;Size&rdquo;, &ldquo;Add-ons&rdquo;). Conditional rules
            let options trigger additional groups.
          </p>
        </div>
        <button
          type="button"
          onClick={addGroup}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center dark:border-gray-700">
          <p className="text-sm text-gray-400">No variant groups yet.</p>
          <button
            type="button"
            onClick={addGroup}
            className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            + Add your first group
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g, i) => (
            <VariantGroupCard
              key={i}
              group={g}
              groupIndex={i}
              groups={groups}
              onUpdate={updateGroup}
              onDelete={deleteGroup}
            />
          ))}
        </div>
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

    // Load variants
    fetch(`/api/proxy/catalog/products/${productId}/variants`)
      .then((r) => r.json())
      .then((data: { data?: VariantGroup[] } | VariantGroup[]) => {
        if (!mountedRef.current) return;
        const items = Array.isArray(data) ? data : (data.data ?? []);
        setGroups(items);
      })
      .catch(() => {
        // variants may not exist yet
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
    if (!form.basePrice) {
      setSaveError('Base price is required.');
      setActiveTab('details');
      return;
    }

    setSaveError('');
    setSaving(true);

    try {
      const payload = buildPayload(form);
      let savedId = productId;

      if (isEditing) {
        const res = await fetch(`/api/proxy/catalog/products/${productId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(err.message ?? `HTTP ${res.status}`);
        }
      } else {
        const res = await fetch('/api/proxy/catalog/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(err.message ?? `HTTP ${res.status}`);
        }
        const created = (await res.json()) as { id?: string; data?: { id?: string } };
        savedId = created.id ?? created.data?.id;
      }

      // Sync variants
      if (savedId && groups.length > 0) {
        await syncVariants(savedId, groups).catch(() => {
          // non-fatal — product is saved
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
          <VariantsTab groups={groups} setGroups={setGroups} />
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
