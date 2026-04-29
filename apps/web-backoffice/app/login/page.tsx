'use client';

import { useState, Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<'password' | 'pin'>('password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const registered = searchParams?.get('registered') === 'true';

  // Handle impersonation token from Godmode — auto-login support staff as a merchant.
  // Uses a ref guard so this runs exactly once even under React Strict Mode double-invoke.
  const impersonateFired = useRef(false);
  useEffect(() => {
    const impersonateToken = searchParams?.get('impersonate');
    if (impersonateToken && !impersonateFired.current) {
      impersonateFired.current = true;
      fetch('/api/auth/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: impersonateToken }),
      })
        .then((res) => { if (res.ok) router.replace('/dashboard?impersonation=1'); })
        .catch(() => null);
    }
  }, [searchParams, router]);

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

      // Cookie is set server-side — check onboarding status before redirecting.
      //
      // v2.7.68 — clamp `next` to internal paths only. Was previously
      // `?next=https://attacker.com` → router.push to attacker site, an
      // open-redirect that turned this login page into a phishing-redirect
      // helper. We now only honour `next` if it's a single-leading-slash
      // path with no protocol-relative `//attacker` trick. Malformed input
      // falls back to /dashboard rather than failing the login.
      const explicitNextRaw = searchParams?.get('next');
      const explicitNext =
        explicitNextRaw &&
        explicitNextRaw.startsWith('/') &&
        !explicitNextRaw.startsWith('//') &&
        !explicitNextRaw.startsWith('/\\')
          ? explicitNextRaw
          : null;
      let destination = explicitNext ?? '/dashboard';

      // For default dashboard redirects, check if onboarding is complete
      if (!explicitNext || explicitNext === '/dashboard') {
        try {
          const onboardingRes = await fetch('/api/proxy/organisations/onboarding');
          if (onboardingRes.ok) {
            const onboarding = await onboardingRes.json();
            if (onboarding.step && onboarding.step !== 'completed') {
              destination = '/setup';
            }
          }
          // If the call fails, fall through to dashboard
        } catch {
          // Onboarding endpoint unavailable — continue to dashboard
        }
      }

      router.push(destination);
      router.refresh();
    } catch {
      setError('Unable to connect. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-elevatedpos-950 via-elevatedpos-900 to-elevatedpos-800 p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-elevatedpos-500 shadow-xl shadow-elevatedpos-500/30">
            <span className="text-3xl font-bold text-white">E</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="mt-1 text-sm text-elevatedpos-400">Sign in to your ElevatedPOS account</p>
        </div>

        {/* Registration success banner */}
        {registered && (
          <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400 text-center">
            Account created! Please check your email to verify your address, then sign in.
          </div>
        )}

        {/* Card */}
        <div className="rounded-2xl border border-elevatedpos-700/50 bg-elevatedpos-800/60 p-6 shadow-2xl backdrop-blur">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'password' ? (
              <>
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-elevatedpos-200">
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
                    className="w-full rounded-lg border border-elevatedpos-600/50 bg-elevatedpos-900/60 px-3.5 py-2.5 text-sm text-white placeholder-elevatedpos-500 outline-none ring-elevatedpos-500 transition focus:border-elevatedpos-500 focus:ring-2 disabled:opacity-50"
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium text-elevatedpos-200">
                      Password
                    </label>
                    <Link href="/forgot-password" className="text-xs text-elevatedpos-400 hover:text-elevatedpos-200">
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
                    className="w-full rounded-lg border border-elevatedpos-600/50 bg-elevatedpos-900/60 px-3.5 py-2.5 text-sm text-white placeholder-elevatedpos-500 outline-none ring-elevatedpos-500 transition focus:border-elevatedpos-500 focus:ring-2 disabled:opacity-50"
                  />
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="pin" className="mb-1.5 block text-sm font-medium text-elevatedpos-200">
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
                  className="w-full rounded-lg border border-elevatedpos-600/50 bg-elevatedpos-900/60 px-3.5 py-2.5 text-center text-2xl tracking-[0.5em] text-white placeholder-elevatedpos-500 outline-none ring-elevatedpos-500 transition focus:border-elevatedpos-500 focus:ring-2 disabled:opacity-50"
                />
                <p className="mt-1.5 text-xs text-elevatedpos-500">Enter your staff PIN</p>
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
              className="w-full rounded-lg bg-elevatedpos-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-elevatedpos-500/25 transition hover:bg-elevatedpos-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
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
              <div className="flex-1 border-t border-elevatedpos-700" />
              <span className="mx-3 text-xs text-elevatedpos-500">or</span>
              <div className="flex-1 border-t border-elevatedpos-700" />
            </div>
            <button
              type="button"
              onClick={() => { setMode(mode === 'pin' ? 'password' : 'pin'); setError(''); }}
              className="mt-3 w-full rounded-lg border border-elevatedpos-600/50 bg-elevatedpos-900/40 px-4 py-2.5 text-sm font-medium text-elevatedpos-200 transition hover:bg-elevatedpos-800"
            >
              {mode === 'pin' ? 'Sign in with Email & Password' : 'Sign in with PIN'}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-elevatedpos-600">
          Need access?{' '}
          <Link href="mailto:support@elevatedpos.com.au" className="text-elevatedpos-400 hover:text-elevatedpos-200">
            Contact your administrator
          </Link>
          {' · '}
          <Link href="/signup" className="text-elevatedpos-400 hover:text-elevatedpos-200">
            Create an account
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-elevatedpos-700">
          <Link href="/privacy" className="hover:text-elevatedpos-500">
            Privacy
          </Link>
          {' · '}
          <Link href="/terms" className="hover:text-elevatedpos-500">
            Terms
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
