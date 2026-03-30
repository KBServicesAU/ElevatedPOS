import { Suspense } from 'react';
import { QrOrderClient } from './qr-order-client';

interface PageProps {
  params: { tableId: string };
}

export default function QrOrderPage({ params }: PageProps) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      }>
        <QrOrderClient tableId={params.tableId} />
      </Suspense>
    </div>
  );
}

export function generateMetadata({ params }: PageProps) {
  return { title: `Order — Table ${params.tableId}` };
}
