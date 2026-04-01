// NOTE: Real API credentials required — this will return 401 in development without valid tokens
import { BaseConnector, type SyncResult } from './base';

interface ShopifyShopResponse {
  shop?: { name: string; domain: string };
}

interface ShopifyProductsResponse {
  products?: ShopifyProduct[];
}


interface ShopifyProduct {
  id: number;
  title: string;
  variants: Array<{
    id: number;
    sku: string;
    price: string;
    inventory_item_id: number;
  }>;
}

interface ShopifyOrdersResponse {
  orders?: ShopifyRawOrder[];
}

interface ShopifyRawOrder {
  id: number;
  order_number: number;
  financial_status: string;
  created_at: string;
  fulfillment_status: string | null;
  current_total_price: string;
  line_items: Array<{
    sku: string;
    quantity: number;
    price: string;
    title: string;
  }>;
  customer?: {
    email: string;
    first_name: string;
    last_name: string;
    phone?: string;
  };
}

export interface ShopifyProductInput {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  description?: string;
  imageUrl?: string;
}

export interface ShopifyOrder {
  shopifyOrderId: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  lineItems: Array<{ sku: string; quantity: number; price: number; title: string }>;
  customer: { email: string; firstName: string; lastName: string; phone?: string };
  total: number;
  fulfillmentStatus: string;
}

export class ShopifyConnector extends BaseConnector {
  private get baseUrl(): string {
    return `https://${this.config.credentials['shopDomain']}/admin/api/2024-01`;
  }

  private get headers(): Record<string, string> {
    return {
      'X-Shopify-Access-Token': this.config.credentials['accessToken'] ?? '',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/shop.json`, {
        headers: this.headers,
      });

      if (response.ok) {
        const data = (await response.json()) as ShopifyShopResponse;
        const shopName = data.shop?.name ?? 'Unknown Shop';
        return { ok: true, message: `Connected to Shopify store: ${shopName}` };
      }

      if (response.status === 401) {
        return { ok: false, message: 'Shopify access token is invalid. Please reconnect.' };
      }

      const errorText = await response.text();
      return { ok: false, message: `Shopify API error ${response.status}: ${errorText}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Failed to connect to Shopify: ${message}` };
    }
  }

  async syncProducts(products: ShopifyProductInput[]): Promise<{
    created: number;
    updated: number;
    errors: string[];
  }> {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const product of products) {
      try {
        // Search for existing product by SKU
        const searchResponse = await fetch(
          `${this.baseUrl}/products.json?fields=id,title,variants&limit=1`,
          { headers: this.headers },
        );

        if (!searchResponse.ok) {
          errors.push(`Failed to search for product ${product.sku}: HTTP ${searchResponse.status}`);
          continue;
        }

        const searchData = (await searchResponse.json()) as ShopifyProductsResponse;
        const existingProduct = (searchData.products ?? []).find((p) =>
          p.variants.some((v) => v.sku === product.sku),
        );

        if (existingProduct) {
          // Update existing product price
          const variant = existingProduct.variants.find((v) => v.sku === product.sku);
          if (variant) {
            const updateResponse = await fetch(
              `${this.baseUrl}/products/${existingProduct.id}.json`,
              {
                method: 'PUT',
                headers: this.headers,
                body: JSON.stringify({
                  product: {
                    id: existingProduct.id,
                    variants: [{ id: variant.id, price: product.price.toFixed(2) }],
                  },
                }),
              },
            );

            if (updateResponse.ok) {
              updated++;
            } else {
              const errText = await updateResponse.text();
              errors.push(`Failed to update product ${product.sku}: ${errText}`);
            }
          }
        } else {
          // Create new product
          const createBody: Record<string, unknown> = {
            product: {
              title: product.name,
              body_html: product.description ?? '',
              variants: [
                {
                  sku: product.sku,
                  price: product.price.toFixed(2),
                  inventory_management: 'shopify',
                  inventory_quantity: product.stock,
                },
              ],
            },
          };

          if (product.imageUrl) {
            (createBody['product'] as Record<string, unknown>)['images'] = [{ src: product.imageUrl }];
          }

          const createResponse = await fetch(`${this.baseUrl}/products.json`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(createBody),
          });

          if (createResponse.ok) {
            created++;
          } else {
            const errText = await createResponse.text();
            errors.push(`Failed to create product ${product.sku}: ${errText}`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Error processing product ${product.sku}: ${message}`);
      }
    }

    return { created, updated, errors };
  }

  async updateInventory(
    updates: Array<{ sku: string; locationId: string; available: number }>,
  ): Promise<void> {
    for (const update of updates) {
      // Find variant by SKU to get inventory_item_id
      const searchResponse = await fetch(
        `${this.baseUrl}/products.json?fields=id,variants&limit=250`,
        { headers: this.headers },
      );

      if (!searchResponse.ok) {
        throw new Error(`Failed to fetch products for inventory update: HTTP ${searchResponse.status}`);
      }

      const searchData = (await searchResponse.json()) as ShopifyProductsResponse;
      let inventoryItemId: number | undefined;

      for (const product of searchData.products ?? []) {
        const variant = product.variants.find((v) => v.sku === update.sku);
        if (variant) {
          inventoryItemId = variant.inventory_item_id;
          break;
        }
      }

      if (!inventoryItemId) {
        throw new Error(`No Shopify variant found for SKU: ${update.sku}`);
      }

      const response = await fetch(`${this.baseUrl}/inventory_levels/set.json`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          location_id: update.locationId,
          inventory_item_id: inventoryItemId,
          available: update.available,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify inventory update failed for SKU ${update.sku} (${response.status}): ${errorText}`);
      }
    }
  }

  async getOrders(since?: string): Promise<ShopifyOrder[]> {
    const url = new URL(`${this.baseUrl}/orders.json`);
    url.searchParams.set('status', 'open');
    url.searchParams.set('limit', '250');
    if (since) {
      url.searchParams.set('created_at_min', since);
    }

    const response = await fetch(url.toString(), { headers: this.headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify getOrders failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as ShopifyOrdersResponse;
    const rawOrders = data.orders ?? [];

    return rawOrders.map((order): ShopifyOrder => ({
      shopifyOrderId: String(order.id),
      orderNumber: String(order.order_number),
      status: order.financial_status,
      createdAt: order.created_at,
      lineItems: (order.line_items ?? []).map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        price: parseFloat(item.price),
        title: item.title,
      })),
      customer: {
        email: order.customer?.email ?? '',
        firstName: order.customer?.first_name ?? '',
        lastName: order.customer?.last_name ?? '',
        ...(order.customer?.phone !== undefined ? { phone: order.customer.phone } : {}),
      },
      total: parseFloat(order.current_total_price),
      fulfillmentStatus: order.fulfillment_status ?? 'unfulfilled',
    }));
  }

  async sync(): Promise<SyncResult> {
    try {
      // Fetch orders from last 24 hours
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const orders = await this.getOrders(since);
      return {
        success: true,
        recordsProcessed: orders.length,
        errors: [],
        lastSyncAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        recordsProcessed: 0,
        errors: [message],
        lastSyncAt: new Date().toISOString(),
      };
    }
  }
}
