'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Search, X, UserPlus, User, Phone, Mail, Loader2, CreditCard,
} from 'lucide-react';
import { fetchWithDeviceAuth } from '@/lib/device-auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  loyaltyPoints?: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  return (
    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
      {initials}
    </div>
  );
}

function CustomerRow({
  customer,
  onSelect,
}: {
  customer: Customer;
  onSelect: (c: Customer) => void;
}) {
  return (
    <button
      onClick={() => onSelect(customer)}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#2a2a3a]"
    >
      <Avatar firstName={customer.firstName} lastName={customer.lastName} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">
          {customer.firstName} {customer.lastName}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {customer.phone && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Phone className="h-3 w-3" />
              {customer.phone}
            </span>
          )}
          {customer.email && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Mail className="h-3 w-3" />
              {customer.email}
            </span>
          )}
        </div>
      </div>
      {customer.loyaltyPoints != null && customer.loyaltyPoints > 0 && (
        <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-indigo-900 px-2 py-0.5 text-xs font-medium text-indigo-300">
          <CreditCard className="h-3 w-3" />
          {customer.loyaltyPoints} pts
        </span>
      )}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CustomerSearchModal({
  onSelect,
  onClose,
}: {
  onSelect: (customer: Customer) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Add-form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on open
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetchWithDeviceAuth(
          `/api/proxy/customers?search=${encodeURIComponent(q)}&limit=20`,
        );
        if (!res.ok) {
          setResults([]);
          return;
        }
        const json = (await res.json()) as { data: Customer[] } | Customer[];
        const list = Array.isArray(json) ? json : (json.data ?? []);
        setResults(list);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const handleSelect = (customer: Customer) => {
    onSelect(customer);
    onClose();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setAddError('First and last name are required.');
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setAddError('Please provide at least a phone number or email.');
      return;
    }

    setAddLoading(true);
    try {
      const body: Record<string, string> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      };
      if (phone.trim()) body.phone = phone.trim();
      if (email.trim()) body.email = email.trim();

      const res = await fetchWithDeviceAuth('/api/proxy/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({})) as { message?: string };
        setAddError(errJson.message ?? 'Failed to create customer.');
        return;
      }

      const json = (await res.json()) as { data?: Customer } | Customer;
      const created = ('data' in json && json.data != null) ? json.data : json as Customer;
      handleSelect(created);
    } catch {
      setAddError('Network error — please try again.');
    } finally {
      setAddLoading(false);
    }
  };

  const hasSearched = search.trim().length >= 2;
  const showEmptyState = !hasSearched && !showAddForm;
  const showNoResults = hasSearched && !loading && results.length === 0 && !showAddForm;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="w-full max-w-md rounded-2xl bg-[#1a1a2e] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white">Select Customer</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a2a3a] text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search bar */}
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#2a2a3a] px-3 py-2">
          {loading ? (
            <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-gray-500" />
          ) : (
            <Search className="h-4 w-4 flex-shrink-0 text-gray-500" />
          )}
          <input
            ref={searchInputRef}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
            placeholder="Search by name, phone or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search">
              <X className="h-3.5 w-3.5 text-gray-500 hover:text-gray-300" />
            </button>
          )}
        </div>

        {/* Results / empty states */}
        <div className="mb-3 min-h-[6rem] max-h-64 overflow-y-auto">
          {showEmptyState && (
            <div className="flex h-24 flex-col items-center justify-center gap-1 text-gray-500">
              <Search className="h-6 w-6 opacity-40" />
              <p className="text-sm">Search by name, phone or email</p>
            </div>
          )}

          {showNoResults && (
            <div className="flex h-24 flex-col items-center justify-center gap-1 text-gray-500">
              <User className="h-6 w-6 opacity-40" />
              <p className="text-sm">No customers found — add new?</p>
            </div>
          )}

          {results.length > 0 && !showAddForm && (
            <div className="space-y-0.5">
              {results.map((c) => (
                <CustomerRow key={c.id} customer={c} onSelect={handleSelect} />
              ))}
            </div>
          )}
        </div>

        {/* Add-new toggle / form */}
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#3a3a4a] py-2.5 text-sm text-gray-400 transition-colors hover:border-indigo-500 hover:text-indigo-300"
          >
            <UserPlus className="h-4 w-4" />
            Add new customer
          </button>
        ) : (
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">New Customer</span>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setAddError(null);
                }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-gray-400">First Name *</label>
                <input
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-xl bg-[#2a2a3a] px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Jane"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Last Name *</label>
                <input
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-xl bg-[#2a2a3a] px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-400">
                Phone <span className="text-gray-600">(phone or email required)</span>
              </label>
              <div className="flex items-center gap-2 rounded-xl bg-[#2a2a3a] px-3 py-2">
                <Phone className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
                  placeholder="+61 400 000 000"
                  type="tel"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-400">Email</label>
              <div className="flex items-center gap-2 rounded-xl bg-[#2a2a3a] px-3 py-2">
                <Mail className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
                  placeholder="jane@example.com"
                  type="email"
                />
              </div>
            </div>

            {addError && (
              <p className="rounded-lg bg-red-900/40 px-3 py-2 text-xs text-red-400">
                {addError}
              </p>
            )}

            <button
              type="submit"
              disabled={addLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
            >
              {addLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {addLoading ? 'Creating…' : 'Create & Select'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
