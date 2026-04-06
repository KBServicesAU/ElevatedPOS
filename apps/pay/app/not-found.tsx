import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-indigo-500 mb-2">404</h1>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Page not found</h2>
        <p className="text-gray-500 text-sm mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition text-sm inline-block"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
