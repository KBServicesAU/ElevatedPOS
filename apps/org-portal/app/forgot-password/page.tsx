'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setStatus('loading');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? 'Failed to send reset email');
        setStatus('error');
        return;
      }

      setStatus('success');
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-900 mb-4">
              <span className="text-white text-xl font-bold">S</span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Reset your password</h1>
            <p className="mt-1 text-sm text-gray-500">
              Enter your email and we'll send you a reset link
            </p>
          </div>

          {status === 'success' ? (
            <div className="text-center space-y-4">
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-4 text-sm text-green-700">
                If an account with that email exists, you'll receive a password reset link shortly.
              </div>
              <Link
                href="/login"
                className="block text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                  placeholder="support@elevatedpos.com.au"
                />
              </div>

              {status === 'error' && errorMsg && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full py-2.5 px-4 bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
              >
                {status === 'loading' ? 'Sending…' : 'Send reset link'}
              </button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-gray-400">
          ElevatedPOS Support — Restricted access
        </p>
      </div>
    </div>
  );
}
