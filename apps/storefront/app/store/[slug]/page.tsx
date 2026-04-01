import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

interface Product {
  id: string;
  name: string;
  sku: string;
  basePrice: number;
  webDescription?: string;
  webSlug?: string;
  webImages?: { url: string; alt: string }[];
  webFeatured?: boolean;
  category?: { name: string };
  tags?: string[];
}

interface StorefrontConfig {
  orgId: string;
  slug: string;
  businessName: string;
  primaryColor: string;
  logoUrl?: string;
  description?: string;
}

async function getStorefront(slug: string): Promise<StorefrontConfig | null> {
  // In production: fetch from auth/org service by slug
  const stores: Record<string, StorefrontConfig> = {
    demo: {
      orgId: '00000000-0000-0000-0000-000000000001',
      slug: 'demo',
      businessName: 'Demo Cafe',
      primaryColor: '#0a0a0a',
      description: 'Fresh coffee and food, order online for pickup.',
    },
  };
  return stores[slug] ?? null;
}

async function getProducts(orgId: string): Promise<Product[]> {
  try {
    const catalogUrl = process.env['CATALOG_SERVICE_URL'] ?? 'http://localhost:4002';
    const res = await fetch(`${catalogUrl}/api/v1/products/storefront?orgId=${encodeURIComponent(orgId)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = await res.json() as { products?: Product[] };
    return data.products ?? [];
  } catch {
    return [];
  }
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);
}

function ProductCard({
  product,
  slug,
  primaryColor,
}: {
  product: Product;
  slug: string;
  primaryColor: string;
}) {
  const image = product.webImages?.[0];
  return (
    <Link
      href={`/store/${slug}/products/${product.webSlug ?? product.id}`}
      className="group rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">
            🛍️
          </div>
        )}
      </div>
      <div className="p-4">
        {product.category && (
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            {product.category.name}
          </p>
        )}
        <h3 className="font-semibold text-gray-900 mb-2 group-hover:text-black">{product.name}</h3>
        <p className="font-bold text-lg" style={{ color: primaryColor }}>
          {formatPrice(product.basePrice)}
        </p>
      </div>
    </Link>
  );
}

export default async function StorefrontPage({ params }: { params: { slug: string } }) {
  const store = await getStorefront(params.slug);
  if (!store) notFound();

  const products = await getProducts(store.orgId);
  const featured = products.filter((p) => p.webFeatured);

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
              style={{ backgroundColor: store.primaryColor }}
            >
              {store.businessName[0]}
            </div>
            <span className="font-semibold text-lg">{store.businessName}</span>
          </div>
          <Link
            href={`/store/${params.slug}/cart`}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: store.primaryColor }}
          >
            🛒 Cart
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section
        className="py-16 px-4 text-center"
        style={{ backgroundColor: store.primaryColor + '10' }}
      >
        <h1 className="text-4xl font-bold mb-3">{store.businessName}</h1>
        {store.description && (
          <p className="text-gray-600 max-w-xl mx-auto">{store.description}</p>
        )}
      </section>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {featured.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Featured</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  slug={params.slug}
                  primaryColor={store.primaryColor}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-2xl font-bold mb-6">
            {featured.length > 0 ? 'All Products' : 'Products'}
          </h2>
          {products.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <p className="text-xl mb-2">No products available yet.</p>
              <p className="text-sm">Check back soon!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  slug={params.slug}
                  primaryColor={store.primaryColor}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="mt-20 border-t border-gray-200 py-8 text-center text-sm text-gray-500">
        <p>
          Powered by{' '}
          <a href="https://elevatedpos.com.au" className="font-medium hover:underline">
            ElevatedPOS
          </a>
        </p>
      </footer>
    </main>
  );
}
