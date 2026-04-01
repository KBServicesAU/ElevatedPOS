import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Store not found</h1>
        <p className="text-gray-500 mb-8">This store doesn&apos;t exist or has been removed.</p>
        <Link href="/" className="px-6 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800">
          Go home
        </Link>
      </div>
    </main>
  );
}
