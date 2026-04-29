/**
 * Retail template — product grid with featured items, "Add to cart" buttons.
 * Cart and checkout reuse the existing /store/[slug]/cart and /store/[slug]/checkout
 * routes (already shipped) so we don't duplicate the Stripe integration.
 */

import Link from 'next/link';
import { fetchProducts, formatPrice, themeColors, type OrgInfo, type CatalogProduct } from '../_lib/fetch';
import { Hero, StorefrontShell, AboutBlock, ContactAndHoursBlock } from './_shared';

export default async function RetailTemplate({ org }: { org: OrgInfo }) {
  const { primary } = themeColors(org.webStore.theme, org.webStore.primaryColor);
  const products = await fetchProducts(org.id);
  const featured = products.filter((p) => p.webFeatured);

  return (
    <StorefrontShell
      org={org}
      rightSlot={
        <Link
          href={`/store/${org.slug}/cart`}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90"
          style={{ backgroundColor: primary }}
        >
          Cart
        </Link>
      }
    >
      <Hero
        title={org.name}
        subtitle={org.webStore.description}
        primary={primary}
        imageUrl={org.webStore.heroImageUrl}
        {...(products.length > 0
          ? { cta: { label: org.webStore.heroCtaText ?? 'Shop now', href: '#products' } }
          : {})}
      />

      <AboutBlock text={org.webStore.aboutText} primary={primary} />

      <div id="products" className="max-w-6xl mx-auto px-4 py-12">
        {featured.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Featured</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map((p) => (
                <ProductCard key={p.id} product={p} slug={org.slug} primary={primary} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-2xl font-bold mb-6">{featured.length > 0 ? 'All Products' : 'Products'}</h2>
          {products.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <p className="text-xl mb-2">No products available yet.</p>
              <p className="text-sm">Check back soon!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} slug={org.slug} primary={primary} />
              ))}
            </div>
          )}
        </section>

        {org.webStore.shippingFlatRateCents !== null && (
          <p className="mt-12 text-center text-sm text-gray-500">
            Flat-rate shipping: {formatPrice(org.webStore.shippingFlatRateCents, org.currency)}
          </p>
        )}
      </div>

      <ContactAndHoursBlock
        contact={org.webStore.contact}
        hours={org.webStore.hours}
        primary={primary}
      />
    </StorefrontShell>
  );
}

function ProductCard({
  product,
  slug,
  primary,
}: {
  product: CatalogProduct;
  slug: string;
  primary: string;
}) {
  const image = product.webImages?.[0];
  return (
    <Link
      href={`/store/${slug}/products/${product.webSlug ?? product.id}`}
      className="group rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow bg-white"
    >
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={image.alt}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
        <p className="font-bold text-lg" style={{ color: primary }}>
          {formatPrice(product.basePrice)}
        </p>
      </div>
    </Link>
  );
}
