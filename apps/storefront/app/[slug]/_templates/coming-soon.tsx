/**
 * Shown when the merchant has saved a slug but hasn't enabled the web store yet.
 * Avoids 404s while they're configuring.
 */
export default function ComingSoon({
  businessName,
  primaryColor,
}: {
  businessName: string;
  primaryColor: string | null;
}) {
  const tint = primaryColor ?? '#0a0a0a';
  return (
    <main className="min-h-screen flex items-center justify-center bg-white text-gray-900 px-6">
      <div className="max-w-md text-center">
        <div
          className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center text-white text-3xl font-bold"
          style={{ backgroundColor: tint }}
        >
          {businessName[0]?.toUpperCase() ?? 'E'}
        </div>
        <h1 className="text-3xl font-bold mb-3">{businessName}</h1>
        <p className="text-gray-600 mb-8">
          Our online store is coming soon. Visit us in store in the meantime!
        </p>
        <p className="text-xs text-gray-400">
          Powered by{' '}
          <a href="https://elevatedpos.com.au" className="underline">
            ElevatedPOS
          </a>
        </p>
      </div>
    </main>
  );
}
