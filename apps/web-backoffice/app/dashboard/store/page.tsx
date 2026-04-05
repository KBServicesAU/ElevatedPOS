'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const FALLBACK_STORE_URL = 'https://shop.elevatedpos.com.au';

export default function WebStorePage() {
  const [copied, setCopied] = useState(false);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [storeEnabled, setStoreEnabled] = useState(true);

  useEffect(() => {
    fetch('/api/proxy/settings/organisation')
      .then((r) => r.ok ? r.json() : null)
      .then((data: { storeUrl?: string; storeSlug?: string; slug?: string; onlineStoreEnabled?: boolean } | null) => {
        if (!data) return;
        const slug = data.storeSlug ?? data.slug;
        const url = data.storeUrl ?? (slug ? `${FALLBACK_STORE_URL}/${slug}` : null);
        if (url) setStoreUrl(url);
        if (data.onlineStoreEnabled !== undefined) setStoreEnabled(data.onlineStoreEnabled);
      })
      .catch(() => {});
  }, []);

  const displayUrl = storeUrl ?? FALLBACK_STORE_URL;

  function copyLink() {
    void navigator.clipboard.writeText(displayUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Web Store</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {storeEnabled ? 'Your online store is live.' : 'Your online store is currently disabled.'} Customers can browse and purchase products directly.
        </p>
      </div>

      {/* Store URL */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h2 className="font-semibold mb-3 text-gray-900 dark:text-white">Your store URL</h2>
        <div className="flex gap-2">
          <div className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-mono text-gray-700 dark:text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap">
            {displayUrl}
          </div>
          <button
            onClick={copyLink}
            className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors min-w-[80px]"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <a
            href={displayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-3 bg-gray-900 dark:bg-gray-700 text-white rounded-xl text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors"
          >
            Visit ↗
          </a>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Link
          href="/dashboard/catalog"
          className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all group"
        >
          <div className="text-2xl mb-3">📦</div>
          <h3 className="font-semibold mb-1 text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">Manage Products</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Set which products appear on your web store vs POS only.
          </p>
        </Link>

        <Link
          href="/dashboard/payments"
          className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all group"
        >
          <div className="text-2xl mb-3">💳</div>
          <h3 className="font-semibold mb-1 text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">Payment Settings</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Connect or manage your Stripe account for online payments.
          </p>
        </Link>

        <Link
          href="/dashboard/subscriptions"
          className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all group"
        >
          <div className="text-2xl mb-3">🔄</div>
          <h3 className="font-semibold mb-1 text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">Subscriptions</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Offer recurring memberships or service plans to your customers.
          </p>
        </Link>

        <Link
          href="/dashboard/invoices"
          className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all group"
        >
          <div className="text-2xl mb-3">🧾</div>
          <h3 className="font-semibold mb-1 text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">Invoices</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Send professional invoices to customers for any amount.
          </p>
        </Link>
      </div>

      {/* How product channels work */}
      <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-2xl p-6">
        <h2 className="font-semibold mb-2 text-indigo-900 dark:text-indigo-200">How product channels work</h2>
        <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-4">
          When adding or editing a product in Catalog, choose where it appears:
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-indigo-100 dark:border-indigo-900">
            <div className="font-medium mb-1 text-gray-900 dark:text-white">🖥️ POS only</div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Visible in your in-store POS terminal. Not listed on the web store.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-indigo-100 dark:border-indigo-900">
            <div className="font-medium mb-1 text-gray-900 dark:text-white">🌐 Web Store</div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Listed on your public online store. Customers can add to cart and checkout.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-indigo-100 dark:border-indigo-900 col-span-2">
            <div className="font-medium mb-1 text-gray-900 dark:text-white">📦 Both (POS + Web)</div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Available everywhere. Inventory is shared — a web sale reduces POS stock automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
