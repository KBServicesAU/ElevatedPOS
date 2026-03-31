'use client';

import { useState } from 'react';
import {
  CreditCard, Monitor, Smartphone, Download, ExternalLink,
  RefreshCw, Maximize2, Terminal, CheckCircle2, AlertCircle,
} from 'lucide-react';

const POS_WEB_URL = 'http://localhost:8081';

export default function POSClientPage() {
  const [iframeKey, setIframeKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">POS Client</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Point-of-sale terminal — accessible in browser or as an Android app
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={POS_WEB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <ExternalLink className="h-4 w-4" />
            Open in new tab
          </a>
          <button
            onClick={() => setFullscreen((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-elevatedpos-500 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-elevatedpos-600"
          >
            <Maximize2 className="h-4 w-4" />
            {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>

      <div className={fullscreen ? 'fixed inset-0 z-50 flex flex-col bg-gray-950' : 'grid grid-cols-1 gap-6 xl:grid-cols-3'}>

        {/* ── POS Iframe ─────────────────────────────────────────────────── */}
        <div className={fullscreen ? 'flex flex-1 flex-col' : 'xl:col-span-2'}>
          <div className="flex h-10 items-center justify-between rounded-t-xl border border-b-0 border-gray-200 bg-gray-100 px-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <span className="h-3 w-3 rounded-full bg-green-400" />
              </div>
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{POS_WEB_URL}</span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setIframeKey((k) => k + 1)}
                title="Reload POS"
                className="rounded p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              {fullscreen && (
                <button
                  onClick={() => setFullscreen(false)}
                  className="rounded p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <iframe
            key={iframeKey}
            src={POS_WEB_URL}
            title="ElevatedPOS"
            className={`
              w-full rounded-b-xl border border-gray-200 bg-gray-950
              dark:border-gray-700
              ${fullscreen ? 'flex-1' : 'h-[640px]'}
            `}
            allow="camera; microphone; clipboard-read; clipboard-write"
          />
        </div>

        {/* ── Right panel ──────────────────────────────────────────────── */}
        {!fullscreen && (
          <div className="space-y-4">

            {/* Access methods */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Access Methods</h2>
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-3 dark:bg-emerald-900/20">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500">
                    <Monitor className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Web Browser</p>
                    <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                      Customers open <strong>localhost:8081</strong> in any browser. Works on tablets, PCs, and phones.
                    </p>
                    <a
                      href={POS_WEB_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 underline dark:text-emerald-400"
                    >
                      Open POS <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500">
                    <Smartphone className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Android APK</p>
                    <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-400">
                      Build and distribute a native Android app directly to customers&apos; devices.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Build Android APK */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Build Android APK</h2>
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                Use EAS Build to generate a distributable APK you can send to customers.
              </p>
              <div className="space-y-2">
                {[
                  { step: 1, label: 'Install EAS CLI', cmd: 'npm install -g eas-cli' },
                  { step: 2, label: 'Login to Expo', cmd: 'eas login' },
                  { step: 3, label: 'Build preview APK', cmd: 'eas build -p android --profile preview' },
                ].map(({ step, label, cmd }) => (
                  <div key={step} className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-elevatedpos-500 text-[10px] font-bold text-white">
                        {step}
                      </span>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
                    </div>
                    <div className="flex items-center gap-2 rounded bg-gray-900 px-2 py-1 dark:bg-gray-950">
                      <Terminal className="h-3 w-3 shrink-0 text-gray-500" />
                      <code className="text-[11px] text-green-400">{cmd}</code>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
                Run commands from <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">apps/pos-client/</code>. EAS config is already set up in <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">eas.json</code>.
              </p>
            </div>

            {/* Status */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Platform Support</h2>
              <div className="space-y-2">
                {[
                  { label: 'Web (Browser)', ok: true },
                  { label: 'Android (APK)', ok: true },
                  { label: 'iOS', ok: false, note: 'Requires Apple Developer account' },
                  { label: 'Offline mode', ok: true },
                  { label: 'Multi-location', ok: true },
                ].map(({ label, ok, note }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                    <div className="flex items-center gap-1">
                      {ok
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        : <AlertCircle className="h-4 w-4 text-amber-500" />
                      }
                      {note && <span className="text-[10px] text-gray-400">{note}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
