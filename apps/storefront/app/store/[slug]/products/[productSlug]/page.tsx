import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { AddToCartButton } from './add-to-cart-button';

interface Product {
  id: string;
  name: string;
  sku: string;
  basePrice: number;
  webDescription?: string;
  webSlug?: string;
  webImages?: { url: string; alt: string }[];
  category?: { name: string };
  tags?: string[];
}

async function getProduct(slugOrId: string): Promise<Product | null> {
  try {
    const catalogUrl = process.env['CATALOG_SERVICE_URL'] ?? 'http://localhost:4002';
    const res = await fetch(`${catalogUrl}/api/v1/products/storefront/${encodeURIComponent(slugOrId)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as Product;
  } catch {
    return null;
  }
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
    cents / 100
  );
}

export default async function ProductPage({
  params,
}: {
  params: { slug: string; productSlug: string };
}) {
  const product = await getProduct(params.productSlug);
  if (!product) notFound();

  const images = product.webImages ?? [];
  const mainImage = images[0];

  return (
    <main className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Link
          href={`/store/${params.slug}`}
          className="text-sm text-gray-500 hover:text-gray-900 mb-6 inline-flex items-center gap-1"
        >
          ← Back to store
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-4">
          {/* Images */}
          <div>
            <div className="aspect-square rounded-2xl overflow-hidden bg-gray-100 relative mb-4">
              {mainImage ? (
                <Image src={mainImage.url} alt={mainImage.alt} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl text-gray-300">
                  🛍️
                </div>
              )}
            </div>
            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {images.slice(1).map((img, i) => (
                  <div key={i} className="aspect-square rounded-lg overflow-hidden bg-gray-100 relative">
                    <Image src={img.url} alt={img.alt} fill className="object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div>
            {product.category && (
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                {product.category.name}
              </p>
            )}
            <h1 className="text-3xl font-bold mb-4">{product.name}</h1>
            <p className="text-3xl font-bold text-gray-900 mb-6">{formatPrice(product.basePrice)}</p>

            {product.webDescription && (
              <p className="text-gray-600 mb-8 leading-relaxed">{product.webDescription}</p>
            )}

            <AddToCartButton
              product={{ id: product.id, name: product.name, price: product.basePrice }}
            />

            {product.tags && product.tags.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <span key={tag} className="px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-600">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
