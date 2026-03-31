'use client';

// Global Cmd+K / Ctrl+K command palette

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingCart,
  ClipboardList,
  Package,
  Users,
  Boxes,
  BarChart2,
  Star,
  Megaphone,
  Zap,
  Plug,
  Users2,
  Settings,
  Bell,
  Building2,
  Search,
  X,
} from 'lucide-react';

// ─── Command definitions ───────────────────────────────────────────────────────

const ICON_MAP = {
  ShoppingCart,
  ClipboardList,
  Package,
  Users,
  Boxes,
  BarChart2,
  Star,
  Megaphone,
  Zap,
  Plug,
  Users2,
  Settings,
  Bell,
  Building2,
} as const;

type IconName = keyof typeof ICON_MAP;

interface Command {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  shortcut?: string;
}

const COMMANDS: Command[] = [
  { id: 'new-sale', label: 'New Sale', icon: 'ShoppingCart', href: '/pos', shortcut: 'N' },
  { id: 'orders', label: 'View Orders', icon: 'ClipboardList', href: '/dashboard/orders' },
  { id: 'catalog', label: 'Product Catalog', icon: 'Package', href: '/dashboard/catalog' },
  { id: 'customers', label: 'Customers', icon: 'Users', href: '/dashboard/customers' },
  { id: 'inventory', label: 'Inventory', icon: 'Boxes', href: '/dashboard/inventory' },
  { id: 'reports', label: 'Reports', icon: 'BarChart2', href: '/dashboard/reports' },
  { id: 'loyalty', label: 'Loyalty Programs', icon: 'Star', href: '/dashboard/loyalty' },
  { id: 'campaigns', label: 'Campaigns', icon: 'Megaphone', href: '/dashboard/campaigns' },
  { id: 'automations', label: 'Automations', icon: 'Zap', href: '/dashboard/automations' },
  { id: 'integrations', label: 'Integrations', icon: 'Plug', href: '/dashboard/integrations' },
  { id: 'staff', label: 'Staff Management', icon: 'Users2', href: '/dashboard/staff' },
  { id: 'settings', label: 'Settings', icon: 'Settings', href: '/dashboard/settings' },
  { id: 'alerts', label: 'Alert Center', icon: 'Bell', href: '/dashboard/alerts' },
  { id: 'franchise', label: 'Franchise Portal', icon: 'Building2', href: '/dashboard/franchise' },
];

// ─── Component ─────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredCommands = COMMANDS.filter((cmd) =>
    query.trim() === '' || cmd.label.toLowerCase().includes(query.toLowerCase()),
  );

  const handleOpen = useCallback(() => {
    setOpen(true);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const handleSelect = useCallback(
    (cmd: Command) => {
      handleClose();
      router.push(cmd.href);
    },
    [handleClose, router],
  );

  // Global keyboard shortcut: Cmd+K (Mac) or Ctrl+K (Windows/Linux)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (open) {
          handleClose();
        } else {
          handleOpen();
        }
      }
    },
    [open, handleOpen, handleClose],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Focus input when palette opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Keyboard navigation within the palette
  const handlePaletteKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredCommands[selectedIndex];
        if (cmd) handleSelect(cmd);
        return;
      }
    },
    [filteredCommands, selectedIndex, handleClose, handleSelect],
  );

  // Reset selectedIndex when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]') as HTMLElement | null;
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onKeyDown={handlePaletteKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Palette card */}
      <div
        className="relative z-10 w-full max-w-xl mx-4 rounded-xl bg-white shadow-2xl dark:bg-gray-900 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none dark:text-white"
            aria-autocomplete="list"
            aria-haspopup="listbox"
          />
          <button
            onClick={handleClose}
            className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            aria-label="Close command palette"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Commands list */}
        <div
          ref={listRef}
          className="max-h-96 overflow-y-auto py-2"
          role="listbox"
          aria-label="Commands"
        >
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No commands found for &quot;{query}&quot;
            </div>
          ) : (
            filteredCommands.map((cmd, i) => {
              const Icon = ICON_MAP[cmd.icon];
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  role="option"
                  aria-selected={isSelected}
                  data-selected={isSelected}
                  onClick={() => handleSelect(cmd)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-elevatedpos-50 text-elevatedpos-700 dark:bg-elevatedpos-950/30 dark:text-elevatedpos-300'
                      : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isSelected ? 'text-elevatedpos-500' : 'text-gray-400 dark:text-gray-500'
                    }`}
                  />
                  <span className="flex-1 text-sm font-medium">{cmd.label}</span>
                  {cmd.shortcut && (
                    <kbd
                      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-xs ${
                        isSelected
                          ? 'border-elevatedpos-200 bg-elevatedpos-100 text-elevatedpos-600 dark:border-elevatedpos-700 dark:bg-elevatedpos-900 dark:text-elevatedpos-400'
                          : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-gray-200 px-4 py-2 dark:border-gray-700">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-gray-200 bg-gray-100 px-1 py-0.5 font-mono dark:border-gray-600 dark:bg-gray-700">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-gray-200 bg-gray-100 px-1 py-0.5 font-mono dark:border-gray-600 dark:bg-gray-700">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-gray-200 bg-gray-100 px-1 py-0.5 font-mono dark:border-gray-600 dark:bg-gray-700">Esc</kbd>
              close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
