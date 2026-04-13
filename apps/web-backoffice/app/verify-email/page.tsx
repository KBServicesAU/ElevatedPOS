'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type Status = 'loading' | 'success' | 'already' | 'error';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = searchParams?.get('token');
    const emp = searchParams?.get('emp');

    if (!token || !emp) {
      setStatus('error');
      setErrorMsg('Invalid verification link. Please check your email and try again.');
      return;
    }

    const AUTH_API = process.env.NEXT_PUBLIC_AUTH_API_URL ?? '';

    fetch(`${AUTH_API}/api/v1/auth/verify-email?token=${encodeURIComponent(token)}&emp=${encodeURIComponent(emp)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setStatus('error');
          setErrorMsg(data.error ?? 'Verification failed. The link may have expired.');
          return;
        }
        if (data.alreadyVerified) {
          setStatus('already');
        } else {
          setStatus('success');
          // Redirect to login after 3 s
          setTimeout(() => router.push('/login'), 3000);
        }
      })
      .catch(() => {
        setStatus('error');
        setErrorMsg('Unable to connect. Please check your internet connection and try again.');
      });
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-xl">
            <span className="text-3xl font-bold text-zinc-900" style={{ fontFamily: 'Georgia, serif' }}>E</span>
          </div>
          <h1 className="text-xl font-bold text-white">ElevatedPOS</h1>
        </div>

        <div className="rounded-2xl border border-zinc-700/50 bg-zinc-800/60 p-8 shadow-2xl backdrop-blur text-center">
          {status === 'loading' && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-700/50">
                <svg className="h-8 w-8 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Verifying your email…</h2>
              <p className="mt-2 text-sm text-zinc-400">Just a moment</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Email verified!</h2>
              <p className="mt-2 text-sm text-zinc-400">Your account is now active. Redirecting you to sign in…</p>
              <Link href="/login" className="mt-6 inline-block rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100">
                Sign In Now
              </Link>
            </>
          )}

          {status === 'already' && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/20">
                <svg className="h-8 w-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Already verified</h2>
              <p className="mt-2 text-sm text-zinc-400">Your email address has already been confirmed.</p>
              <Link href="/login" className="mt-6 inline-block rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100">
                Sign In
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
                <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Verification failed</h2>
              <p className="mt-2 text-sm text-zinc-400">{errorMsg}</p>
              <Link href="/login" className="mt-6 inline-block rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100">
                Back to Sign In
              </Link>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Need help?{' '}
          <a href="mailto:support@elevatedpos.com.au" className="text-zinc-400 hover:text-zinc-200">
            support@elevatedpos.com.au
          </a>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
