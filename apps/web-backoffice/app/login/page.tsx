'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<'password' | 'pin'>('password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const body = mode === 'pin' ? { pin } : { email, password };
      const endpoint = mode === 'pin' ? '/api/auth/pin-login' : '/api/auth/login';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Invalid credentials. Please try again.');
        return;
      }

      // Cookie is set server-side — redirect to original destination or dashboard
      const next = searchParams.get('next') ?? '/dashboard';
      router.push(next);
      router.refresh();
    } catch {
      setError('Unable to connect. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-nexus-950 via-nexus-900 to-nexus-800 p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-nexus-500 shadow-xl shadow-nexus-500/30">
            <span className="text-3xl font-bold text-white">N</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="mt-1 text-sm text-nexus-400">Sign in to your NEXUS account</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-nexus-700/50 bg-nexus-800/60 p-6 shadow-2xl backdrop-blur">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'password' ? (
              <>
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-nexus-200">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@yourstore.com"
                    required
                    disabled={loading}
                    className="w-full rounded-lg border border-nexus-600/50 bg-nexus-900/60 px-3.5 py-2.5 text-sm text-white placeholder-nexus-500 outline-none ring-nexus-500 transition focus:border-nexus-500 focus:ring-2 disabled:opacity-50"
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium text-nexus-200">
                      Password
                    </label>
                    <Link href="/forgot-password" className="text-xs text-nexus-400 hover:text-nexus-200">
                      Forgot password?
                    </Link>
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    className="w-full rounded-lg border border-nexus-600/50 bg-nexus-900/60 px-3.5 py-2.5 text-sm text-white placeholder-nexus-500 outline-none ring-nexus-500 transition focus:border-nexus-500 focus:ring-2 disabled:opacity-50"
                  />
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="pin" className="mb-1.5 block text-sm font-medium text-nexus-200">
                  PIN
                </label>
                <input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  required
                  disabled={loading}
                  className="w-full rounded-lg border border-nexus-600/50 bg-nexus-900/60 px-3.5 py-2.5 text-center text-2xl tracking-[0.5em] text-white placeholder-nexus-500 outline-none ring-nexus-500 transition focus:border-nexus-500 focus:ring-2 disabled:opacity-50"
                />
                <p className="mt-1.5 text-xs text-nexus-500">Enter your staff PIN</p>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-nexus-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-nexus-500/25 transition hover:bg-nexus-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-4">
            <div className="relative flex items-center">
              <div className="flex-1 border-t border-nexus-700" />
              <span className="mx-3 text-xs text-nexus-500">or</span>
              <div className="flex-1 border-t border-nexus-700" />
            </div>
            <button
              type="button"
              onClick={() => { setMode(mode === 'pin' ? 'password' : 'pin'); setError(''); }}
              className="mt-3 w-full rounded-lg border border-nexus-600/50 bg-nexus-900/40 px-4 py-2.5 text-sm font-medium text-nexus-200 transition hover:bg-nexus-800"
            >
              {mode === 'pin' ? 'Sign in with Email & Password' : 'Sign in with PIN'}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-nexus-600">
          Need access?{' '}
          <Link href="mailto:support@nexus.app" className="text-nexus-400 hover:text-nexus-200">
            Contact your administrator
          </Link>
        </p>
      </div>
    </div>
  );
}
