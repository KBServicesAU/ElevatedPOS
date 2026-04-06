'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const AU_STATES = [
  { value: 'NSW', label: 'New South Wales' },
  { value: 'VIC', label: 'Victoria' },
  { value: 'QLD', label: 'Queensland' },
  { value: 'SA', label: 'South Australia' },
  { value: 'WA', label: 'Western Australia' },
  { value: 'TAS', label: 'Tasmania' },
  { value: 'NT', label: 'Northern Territory' },
  { value: 'ACT', label: 'Australian Capital Territory' },
] as const;

const TIMEZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Australia/Hobart',
  'Australia/Darwin',
] as const;

interface LocationForm {
  name: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  phone: string;
  timezone: string;
}

export default function SetupLocationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<LocationForm>({
    name: '',
    address: '',
    suburb: '',
    state: 'NSW',
    postcode: '',
    phone: '',
    timezone: 'Australia/Sydney',
  });

  function update(field: keyof LocationForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Create the location
      await apiFetch('locations', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          address: form.address,
          suburb: form.suburb,
          state: form.state,
          postcode: form.postcode,
          phone: form.phone,
          timezone: form.timezone,
        }),
      });

      // Update onboarding progress
      await apiFetch('organisations/onboarding', {
        method: 'POST',
        body: JSON.stringify({ step: 'location_setup' }),
      });

      // Persist summary data for the completion page
      sessionStorage.setItem('elevatedpos_setup_location', form.name);
      router.push('/setup/products');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create location. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputClasses =
    'w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:focus:border-indigo-500';
  const labelClasses = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

  return (
    <div>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
          <MapPin className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Set up your first location
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Where is your business located? You can add more locations later.
        </p>
      </div>

      <form onSubmit={handleContinue} className="space-y-5">
        {/* Location Name */}
        <div>
          <label htmlFor="loc-name" className={labelClasses}>
            Location Name
          </label>
          <input
            id="loc-name"
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Main Store, CBD Branch"
            required
            className={inputClasses}
          />
        </div>

        {/* Address */}
        <div>
          <label htmlFor="loc-address" className={labelClasses}>
            Address
          </label>
          <input
            id="loc-address"
            type="text"
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
            placeholder="123 Example Street"
            required
            className={inputClasses}
          />
        </div>

        {/* Suburb + State row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="loc-suburb" className={labelClasses}>
              Suburb
            </label>
            <input
              id="loc-suburb"
              type="text"
              value={form.suburb}
              onChange={(e) => update('suburb', e.target.value)}
              placeholder="Surry Hills"
              required
              className={inputClasses}
            />
          </div>
          <div>
            <label htmlFor="loc-state" className={labelClasses}>
              State
            </label>
            <select
              id="loc-state"
              value={form.state}
              onChange={(e) => update('state', e.target.value)}
              className={inputClasses}
            >
              {AU_STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.value} &mdash; {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Postcode + Phone row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="loc-postcode" className={labelClasses}>
              Postcode
            </label>
            <input
              id="loc-postcode"
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={form.postcode}
              onChange={(e) => update('postcode', e.target.value.replace(/\D/g, ''))}
              placeholder="2000"
              required
              className={inputClasses}
            />
          </div>
          <div>
            <label htmlFor="loc-phone" className={labelClasses}>
              Phone
            </label>
            <input
              id="loc-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="02 9000 0000"
              className={inputClasses}
            />
          </div>
        </div>

        {/* Timezone */}
        <div>
          <label htmlFor="loc-timezone" className={labelClasses}>
            Timezone
          </label>
          <select
            id="loc-timezone"
            value={form.timezone}
            onChange={(e) => update('timezone', e.target.value)}
            className={inputClasses}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace('Australia/', '')} ({tz})
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex justify-between pt-2">
          <button
            type="button"
            onClick={() => router.push('/setup')}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </>
            ) : (
              'Continue'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
