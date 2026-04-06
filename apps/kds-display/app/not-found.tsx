import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#0f0f0f] text-center">
      <div className="text-5xl mb-4">🔍</div>
      <h1 className="text-2xl font-bold text-white mb-2">Page Not Found</h1>
      <p className="text-gray-500 mb-6 max-w-sm">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-yellow-500 px-6 py-2.5 text-sm font-bold text-black hover:bg-yellow-400"
      >
        Go home
      </Link>
    </div>
  );
}
