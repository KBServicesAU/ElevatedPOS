import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

type PreviewRow = Record<string, string>;

interface EntityPreview {
  count: number;
  preview: PreviewRow[];
}

interface PreviewResult {
  products: EntityPreview;
  categories: EntityPreview;
  customers: EntityPreview;
  staff: EntityPreview;
}

const EMPTY_RESULT: PreviewResult = {
  products: { count: 0, preview: [] },
  categories: { count: 0, preview: [] },
  customers: { count: 0, preview: [] },
  staff: { count: 0, preview: [] },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { provider: string } },
) {
  const cookieStore = cookies();
  const token = cookieStore.get(`easy_move_token_${params.provider}`)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Not connected' }, { status: 401 });
  }

  try {
    if (params.provider === 'square') {
      type SquareCatalogObject = {
        id: string;
        type: string;
        item_data?: { name?: string; description?: string; category_id?: string };
        category_data?: { name?: string };
      };
      type SquareCustomer = {
        id: string;
        given_name?: string;
        family_name?: string;
        email_address?: string;
        phone_number?: string;
      };

      const [itemsRes, categoriesRes, customersRes] = await Promise.all([
        fetch('https://connect.squareup.com/v2/catalog/list?types=ITEM', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Square-Version': '2024-01-17',
          },
        }),
        fetch('https://connect.squareup.com/v2/catalog/list?types=CATEGORY', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Square-Version': '2024-01-17',
          },
        }),
        fetch('https://connect.squareup.com/v2/customers', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Square-Version': '2024-01-17',
          },
        }),
      ]);

      const itemsData = (await itemsRes.json()) as {
        objects?: SquareCatalogObject[];
      };
      const categoriesData = (await categoriesRes.json()) as {
        objects?: SquareCatalogObject[];
      };
      const customersData = (await customersRes.json()) as {
        customers?: SquareCustomer[];
      };

      const products = (itemsData.objects ?? []).map((o) => ({
        name: o.item_data?.name ?? '',
        description: o.item_data?.description ?? '',
        id: o.id,
      }));
      const categories = (categoriesData.objects ?? []).map((o) => ({
        name: o.category_data?.name ?? '',
        id: o.id,
      }));
      const customers = (customersData.customers ?? []).map((c) => ({
        name: `${c.given_name ?? ''} ${c.family_name ?? ''}`.trim(),
        email: c.email_address ?? '',
        phone: c.phone_number ?? '',
      }));

      return NextResponse.json({
        products: { count: products.length, preview: products.slice(0, 5) },
        categories: {
          count: categories.length,
          preview: categories.slice(0, 5),
        },
        customers: { count: customers.length, preview: customers.slice(0, 5) },
        staff: { count: 0, preview: [] },
      } satisfies PreviewResult);
    }

    if (params.provider === 'lightspeed') {
      type LightspeedAccount = { Account?: { accountID?: string } };
      type LightspeedItem = {
        itemID: string;
        description: string;
        defaultCost?: string;
        defaultPrice?: string;
      };
      type LightspeedCategory = { categoryID: string; name: string };
      type LightspeedCustomer = {
        customerID: string;
        firstName: string;
        lastName: string;
        Contact?: {
          Emails?: {
            ContactEmail?: Array<{ address: string }>;
          };
        };
      };

      const accountRes = await fetch(
        'https://api.lightspeedapp.com/API/V3/Account.json',
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const accountData = (await accountRes.json()) as LightspeedAccount;
      const accountId = accountData.Account?.accountID ?? '';

      const [itemsRes, categoriesRes, customersRes] = await Promise.all([
        fetch(
          `https://api.lightspeedapp.com/API/V3/Account/${accountId}/Item.json?limit=250`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
        fetch(
          `https://api.lightspeedapp.com/API/V3/Account/${accountId}/Category.json?limit=250`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
        fetch(
          `https://api.lightspeedapp.com/API/V3/Account/${accountId}/Customer.json?limit=250`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      ]);

      const itemsData = (await itemsRes.json()) as {
        Item?: LightspeedItem | LightspeedItem[];
      };
      const categoriesData = (await categoriesRes.json()) as {
        Category?: LightspeedCategory | LightspeedCategory[];
      };
      const customersData = (await customersRes.json()) as {
        Customer?: LightspeedCustomer | LightspeedCustomer[];
      };

      const toArray = <T>(v: T | T[] | undefined): T[] =>
        !v ? [] : Array.isArray(v) ? v : [v];

      const products = toArray(itemsData.Item).map((i) => ({
        name: i.description,
        id: i.itemID,
      }));
      const categories = toArray(categoriesData.Category).map((c) => ({
        name: c.name,
        id: c.categoryID,
      }));
      const customers = toArray(customersData.Customer).map((c) => ({
        name: `${c.firstName} ${c.lastName}`.trim(),
        email: c.Contact?.Emails?.ContactEmail?.[0]?.address ?? '',
      }));

      return NextResponse.json({
        products: { count: products.length, preview: products.slice(0, 5) },
        categories: {
          count: categories.length,
          preview: categories.slice(0, 5),
        },
        customers: { count: customers.length, preview: customers.slice(0, 5) },
        staff: { count: 0, preview: [] },
      } satisfies PreviewResult);
    }

    if (params.provider === 'eposnow') {
      type EposProduct = { Id: number; Name: string; Description?: string; SalePrice?: number; SKUCode?: string };
      type EposCategory = { Id: number; Name: string; Description?: string };
      type EposCustomer = { Id: number; Forename?: string; Surname?: string; EmailAddress?: string; MobileNumber?: string };
      type EposStaff = { Id: number; Forename?: string; Surname?: string; EmailAddress?: string };

      const eposHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      const [productsRes, categoriesRes, customersRes, staffRes] = await Promise.all([
        fetch('https://api.eposnow.com/api/product', { headers: eposHeaders }),
        fetch('https://api.eposnow.com/api/category', { headers: eposHeaders }),
        fetch('https://api.eposnow.com/api/customer', { headers: eposHeaders }),
        fetch('https://api.eposnow.com/api/staff', { headers: eposHeaders }),
      ]);

      const productsData = productsRes.ok ? (await productsRes.json()) as EposProduct[] : [];
      const categoriesData = categoriesRes.ok ? (await categoriesRes.json()) as EposCategory[] : [];
      const customersData = customersRes.ok ? (await customersRes.json()) as EposCustomer[] : [];
      const staffData = staffRes.ok ? (await staffRes.json()) as EposStaff[] : [];

      const products = productsData.map((p) => ({
        name: p.Name,
        sku: p.SKUCode ?? '',
        price: p.SalePrice != null ? `$${p.SalePrice.toFixed(2)}` : '',
      }));
      const categories = categoriesData.map((c) => ({
        name: c.Name,
        description: c.Description ?? '',
      }));
      const customers = customersData.map((c) => ({
        name: `${c.Forename ?? ''} ${c.Surname ?? ''}`.trim(),
        email: c.EmailAddress ?? '',
        phone: c.MobileNumber ?? '',
      }));
      const staff = staffData.map((s) => ({
        name: `${s.Forename ?? ''} ${s.Surname ?? ''}`.trim(),
        email: s.EmailAddress ?? '',
      }));

      return NextResponse.json({
        products:   { count: products.length,   preview: products.slice(0, 5)   },
        categories: { count: categories.length, preview: categories.slice(0, 5) },
        customers:  { count: customers.length,  preview: customers.slice(0, 5)  },
        staff:      { count: staff.length,      preview: staff.slice(0, 5)      },
      } satisfies PreviewResult);
    }

    // For other providers, return empty preview (not yet fully implemented)
    return NextResponse.json(EMPTY_RESULT);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch data from provider' },
      { status: 500 },
    );
  }
}
