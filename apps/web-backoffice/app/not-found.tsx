import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center dark:bg-gray-950">
      {/* Logo */}
      <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-3xl font-bold text-white shadow-lg">
        N
      </div>

      {/* 404 */}
      <p className="text-8xl font-extrabold text-indigo-600 dark:text-indigo-400">404</p>

      <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div className="mt-8 flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          Go to Dashboard
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
