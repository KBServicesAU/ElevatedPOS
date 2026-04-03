import { notFound } from 'next/navigation';
import { PortalClient } from './portal-client';

const AUTH_URL = process.env.AUTH_API_URL ?? 'http://auth:4001';

async function getOrgBySlug(slug: string) {
  try {
    const res = await fetch(`${AUTH_URL}/api/v1/organisations/by-slug/${slug}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json() as Promise<{ id: string; name: string; slug: string }>;
  } catch { return null; }
}

export default async function PortalPage({ params }: { params: { slug: string } }) {
  const org = await getOrgBySlug(params.slug);
  if (!org) notFound();

  return (
    <PortalClient orgId={org.id} orgName={org.name} />
  );
}
