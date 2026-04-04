import type { Metadata } from 'next';
import { ProductForm } from '../../product-form';

export const metadata: Metadata = { title: 'Edit Product' };

export default function EditProductPage({ params }: { params: { id: string } }) {
  return <ProductForm productId={params.id} />;
}
