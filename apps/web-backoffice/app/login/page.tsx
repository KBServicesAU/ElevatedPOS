import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Sign In' };

export default function LoginPage() {
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
          <form className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-nexus-200">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@yourstore.com"
                className="w-full rounded-lg border border-nexus-600/50 bg-nexus-900/60 px-3.5 py-2.5 text-sm text-white placeholder-nexus-500 outline-none ring-nexus-500 transition focus:border-nexus-500 focus:ring-2"
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
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-lg border border-nexus-600/50 bg-nexus-900/60 px-3.5 py-2.5 text-sm text-white placeholder-nexus-500 outline-none ring-nexus-500 transition focus:border-nexus-500 focus:ring-2"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-nexus-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-nexus-500/25 transition hover:bg-nexus-400 active:scale-95"
            >
              Sign In
            </button>
          </form>

          <div className="mt-4">
            <div className="relative flex items-center">
              <div className="flex-1 border-t border-nexus-700" />
              <span className="mx-3 text-xs text-nexus-500">or</span>
              <div className="flex-1 border-t border-nexus-700" />
            </div>
            <button className="mt-3 w-full rounded-lg border border-nexus-600/50 bg-nexus-900/40 px-4 py-2.5 text-sm font-medium text-nexus-200 transition hover:bg-nexus-800">
              Sign in with PIN
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
