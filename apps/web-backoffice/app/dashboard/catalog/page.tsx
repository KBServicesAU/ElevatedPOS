import type { Metadata } from 'next';
import { CatalogClient } from './catalog-client';

export const metadata: Metadata = { title: 'Catalog' };

export default function CatalogPage() {
  return <CatalogClient />;
}
