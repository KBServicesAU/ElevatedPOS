'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Location {
  id: string;
  name: string;
  suburb?: string;
  state?: string;
}

export function LocationPicker() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selected, setSelected] = useState<Location | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<{ data?: Location[] } | Location[]>('locations')
      .then((res) => {
        const list: Location[] = Array.isArray(res) ? res : (res.data ?? []);
        setLocations(list);
        if (list.length > 0) setSelected(list[0]);
      })
      .catch(() => { /* stay blank — user not logged in yet or API down */ });
  }, []);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const subtitle = selected
    ? [selected.suburb, selected.state].filter(Boolean).join(', ')
    : null;

  return (
    <div ref={ref} className="relative mx-3 mt-3">
      <button
        onClick={() => locations.length > 1 && setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-700 dark:text-gray-200">
              {selected?.name ?? 'Loading…'}
            </p>
            {subtitle && (
              <p className="truncate text-xs text-gray-400">{subtitle}</p>
            )}
          </div>
        </div>
        {locations.length > 1 && (
          <ChevronDown className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && locations.length > 1 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => { setSelected(loc); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 first:rounded-t-lg last:rounded-b-lg ${
                selected?.id === loc.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-200'
              }`}
            >
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
              <div>
                <p className="font-medium">{loc.name}</p>
                {(loc.suburb || loc.state) && (
                  <p className="text-xs text-gray-400">{[loc.suburb, loc.state].filter(Boolean).join(', ')}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
