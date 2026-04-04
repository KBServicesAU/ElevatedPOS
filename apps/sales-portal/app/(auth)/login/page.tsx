'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Login failed');
        return;
      }

      router.push('/dashboard');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-md px-4">
        <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 p-8">
          {/* Logo / branding */}
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-emerald-600 mb-4">
              <span className="text-white text-xl font-bold">S</span>
            </div>
            <h1 className="text-2xl font-semibold text-white">ElevatedPOS Sales Portal</h1>
            <p className="mt-1 text-sm text-gray-400">Sign in to manage your clients</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-700 bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                placeholder="agent@elevatedpos.com.au"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-700 bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-gray-600">
          ElevatedPOS Sales Portal — Authorised agents only
        </p>
      </div>
    </div>
  );
}
