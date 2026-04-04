import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } },
) {
  const cookieStore = cookies();
  const token = cookieStore.get(`easy_move_token_${params.provider}`)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Not connected' }, { status: 401 });
  }

  const body = (await req.json()) as { include?: string[] };
  const include = body.include ?? ['products', 'categories', 'customers'];

  const results: Record<string, number> = {};
  const errors: string[] = [];

  // Get our internal API base
  const internalBase =
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.elevatedpos.com.au';

  // Get auth cookie to pass to internal API
  const authToken = cookieStore.get('nexus_token')?.value ?? '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  };

  if (params.provider === 'square') {
    type SquareCatalogObject = {
      id: string;
      type: string;
      item_data?: {
        name?: string;
        description?: string;
        category_id?: string;
        variations?: Array<{
          item_variation_data?: {
            price_money?: { amount?: number };
          };
        }>;
      };
      category_data?: { name?: string };
    };
    type SquareCustomer = {
      id: string;
      given_name?: string;
      family_name?: string;
      email_address?: string;
      phone_number?: string;
    };

    // Import categories first
    if (include.includes('categories')) {
      try {
        const catRes = await fetch(
          'https://connect.squareup.com/v2/catalog/list?types=CATEGORY',
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Square-Version': '2024-01-17',
            },
          },
        );
        const catData = (await catRes.json()) as {
          objects?: SquareCatalogObject[];
        };
        let count = 0;
        for (const obj of catData.objects ?? []) {
          if (!obj.category_data?.name) continue;
          try {
            await fetch(`${internalBase}/api/proxy/catalog/categories`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                name: obj.category_data.name,
                description: '',
              }),
            });
            count++;
          } catch {
            // continue on individual record errors
          }
        }
        results.categories = count;
      } catch (e) {
        errors.push(`categories: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }

    // Import products
    if (include.includes('products')) {
      try {
        const itemsRes = await fetch(
          'https://connect.squareup.com/v2/catalog/list?types=ITEM',
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Square-Version': '2024-01-17',
            },
          },
        );
        const itemsData = (await itemsRes.json()) as {
          objects?: SquareCatalogObject[];
        };
        let count = 0;
        for (const obj of itemsData.objects ?? []) {
          if (!obj.item_data?.name) continue;
          const price =
            obj.item_data.variations?.[0]?.item_variation_data?.price_money
              ?.amount ?? 0;
          try {
            await fetch(`${internalBase}/api/proxy/products`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                name: obj.item_data.name,
                description: obj.item_data.description ?? '',
                basePrice: (price / 100).toFixed(2),
                status: 'active',
              }),
            });
            count++;
          } catch {
            // continue on individual record errors
          }
        }
        results.products = count;
      } catch (e) {
        errors.push(`products: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }

    // Import customers
    if (include.includes('customers')) {
      try {
        const cusRes = await fetch(
          'https://connect.squareup.com/v2/customers?limit=100',
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Square-Version': '2024-01-17',
            },
          },
        );
        const cusData = (await cusRes.json()) as {
          customers?: SquareCustomer[];
        };
        let count = 0;
        for (const c of cusData.customers ?? []) {
          if (!c.given_name && !c.family_name) continue;
          try {
            await fetch(`${internalBase}/api/proxy/customers`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                firstName: c.given_name ?? '',
                lastName: c.family_name ?? '',
                email: c.email_address ?? '',
                phone: c.phone_number ?? '',
              }),
            });
            count++;
          } catch {
            // continue on individual record errors
          }
        }
        results.customers = count;
      } catch (e) {
        errors.push(`customers: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }
  }

  if (params.provider === 'eposnow') {
    type EposProduct = { Id: number; Name: string; Description?: string; SalePrice?: number; SKUCode?: string; Barcode?: string };
    type EposCategory = { Id: number; Name: string; Description?: string };
    type EposCustomer = { Id: number; Forename?: string; Surname?: string; EmailAddress?: string; MobileNumber?: string };
    type EposStaff = { Id: number; Forename?: string; Surname?: string; EmailAddress?: string; Role?: string };

    const eposHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Categories first (products may reference them)
    if (include.includes('categories')) {
      try {
        const res = await fetch('https://api.eposnow.com/api/category', { headers: eposHeaders });
        const data = res.ok ? (await res.json()) as EposCategory[] : [];
        let count = 0;
        for (const cat of data) {
          if (!cat.Name) continue;
          try {
            await fetch(`${internalBase}/api/proxy/catalog/categories`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ name: cat.Name, description: cat.Description ?? '' }),
            });
            count++;
          } catch { /* continue */ }
        }
        results.categories = count;
      } catch (e) {
        errors.push(`categories: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    // Products
    if (include.includes('products')) {
      try {
        const res = await fetch('https://api.eposnow.com/api/product', { headers: eposHeaders });
        const data = res.ok ? (await res.json()) as EposProduct[] : [];
        let count = 0;
        for (const p of data) {
          if (!p.Name) continue;
          try {
            await fetch(`${internalBase}/api/proxy/products`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                name: p.Name,
                description: p.Description ?? '',
                sku: p.SKUCode ?? '',
                barcodes: p.Barcode ? [p.Barcode] : [],
                basePrice: (p.SalePrice ?? 0).toFixed(2),
                status: 'active',
              }),
            });
            count++;
          } catch { /* continue */ }
        }
        results.products = count;
      } catch (e) {
        errors.push(`products: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    // Customers
    if (include.includes('customers')) {
      try {
        const res = await fetch('https://api.eposnow.com/api/customer', { headers: eposHeaders });
        const data = res.ok ? (await res.json()) as EposCustomer[] : [];
        let count = 0;
        for (const c of data) {
          if (!c.Forename && !c.Surname) continue;
          try {
            await fetch(`${internalBase}/api/proxy/customers`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                firstName: c.Forename ?? '',
                lastName: c.Surname ?? '',
                email: c.EmailAddress ?? '',
                phone: c.MobileNumber ?? '',
              }),
            });
            count++;
          } catch { /* continue */ }
        }
        results.customers = count;
      } catch (e) {
        errors.push(`customers: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    // Staff
    if (include.includes('staff')) {
      try {
        const res = await fetch('https://api.eposnow.com/api/staff', { headers: eposHeaders });
        const data = res.ok ? (await res.json()) as EposStaff[] : [];
        let count = 0;
        for (const s of data) {
          if (!s.Forename && !s.Surname) continue;
          try {
            await fetch(`${internalBase}/api/proxy/staff`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                firstName: s.Forename ?? '',
                lastName: s.Surname ?? '',
                email: s.EmailAddress ?? '',
                role: (s.Role ?? 'staff').toLowerCase(),
              }),
            });
            count++;
          } catch { /* continue */ }
        }
        results.staff = count;
      } catch (e) {
        errors.push(`staff: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ results, errors }, { status: 207 });
  }

  return NextResponse.json({ results });
}
