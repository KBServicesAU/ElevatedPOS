// NOTE: Real API credentials required — this will return 401 in development without valid tokens
import { BaseConnector, type SyncResult } from './base';

interface UberTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface UberStoreResponse {
  store_id?: string;
  name?: string;
  status?: string;
}

interface UberOrdersResponse {
  orders?: UberRawOrder[];
}

interface UberRawOrder {
  id: string;
  display_id: string;
  current_state: string;
  placed_at: string;
  estimated_ready_for_pickup_at: string;
  cart: {
    items: Array<{
      title: string;
      quantity: number;
      price: { unit_price: { total_price: number } };
      special_instructions?: string;
    }>;
  };
  payment: {
    charges: {
      sub_total: { total_price: number };
      total: { total_price: number };
    };
  };
  eater: { first_name: string; last_name?: string; phone?: string };
  delivery?: {
    location: { address: string; city: string };
  };
}

export interface UberEatsOrder {
  orderId: string;
  displayOrderId: string;
  status: string;
  placedAt: string;
  estimatedReadyTime: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    specialInstructions?: string;
  }>;
  subtotal: number;
  total: number;
  customer: { name: string; phone?: string };
  deliveryAddress?: { address: string; city: string };
}

export class UberEatsConnector extends BaseConnector {
  private get clientId(): string {
    return this.config.credentials['clientId'] ?? '';
  }

  private get clientSecret(): string {
    return this.config.credentials['clientSecret'] ?? '';
  }

  private get storeId(): string {
    return this.config.credentials['storeId'] ?? '';
  }

  private get accessToken(): string {
    return this.config.credentials['accessToken'] ?? '';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(`https://api.uber.com/v1/eats/stores/${this.storeId}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const data = (await response.json()) as UberStoreResponse;
        const storeName = data.name ?? 'Unknown Store';
        return { ok: true, message: `Connected to Uber Eats store: ${storeName}` };
      }

      if (response.status === 401) {
        return { ok: false, message: 'Uber Eats access token is invalid or expired. Please reconnect.' };
      }

      const errorText = await response.text();
      return { ok: false, message: `Uber Eats API error ${response.status}: ${errorText}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Failed to connect to Uber Eats: ${message}` };
    }
  }

  async getAccessToken(): Promise<string> {
    const response = await fetch('https://auth.uber.com/oauth/v2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
        scope: 'eats.pos_provisioning eats.store eats.order',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Uber Eats token request failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as UberTokenResponse;
    return data.access_token;
  }

  async getOrders(status?: 'created' | 'accepted' | 'cancelled'): Promise<UberEatsOrder[]> {
    const url = new URL('https://api.uber.com/v1/eats/orders');
    url.searchParams.set('filter', status ? status.toUpperCase() : 'ACTIVE');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Uber Eats getOrders failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as UberOrdersResponse;
    const rawOrders = data.orders ?? [];

    return rawOrders.map((order): UberEatsOrder => ({
      orderId: order.id,
      displayOrderId: order.display_id,
      status: order.current_state,
      placedAt: order.placed_at,
      estimatedReadyTime: order.estimated_ready_for_pickup_at,
      items: (order.cart?.items ?? []).map((item) => ({
        name: item.title,
        quantity: item.quantity,
        price: item.price?.unit_price?.total_price ?? 0,
        ...(item.special_instructions !== undefined ? { specialInstructions: item.special_instructions } : {}),
      })),
      subtotal: order.payment?.charges?.sub_total?.total_price ?? 0,
      total: order.payment?.charges?.total?.total_price ?? 0,
      customer: {
        name: [order.eater?.first_name, order.eater?.last_name].filter(Boolean).join(' '),
        ...(order.eater?.phone !== undefined ? { phone: order.eater.phone } : {}),
      },
      ...(order.delivery?.location
        ? { deliveryAddress: { address: order.delivery.location.address, city: order.delivery.location.city } }
        : {}),
    }));
  }

  async acceptOrder(orderId: string, prepTime: number): Promise<void> {
    const response = await fetch(
      `https://api.uber.com/v1/eats/orders/${orderId}/accept_pos_order`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: { description: 'Accepted' },
          prep_time: prepTime,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Uber Eats acceptOrder failed (${response.status}): ${errorText}`);
    }
  }

  async denyOrder(orderId: string, reason: string): Promise<void> {
    const response = await fetch(
      `https://api.uber.com/v1/eats/orders/${orderId}/deny_pos_order`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: { description: reason } }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Uber Eats denyOrder failed (${response.status}): ${errorText}`);
    }
  }

  async updateMenu(menu: {
    categories: Array<{
      name: string;
      items: Array<{ name: string; price: number; available: boolean }>;
    }>;
  }): Promise<void> {
    const response = await fetch(
      `https://api.uber.com/v1/eats/stores/${this.storeId}/menus`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(menu),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Uber Eats updateMenu failed (${response.status}): ${errorText}`);
    }
  }

  async sync(): Promise<SyncResult> {
    try {
      const orders = await this.getOrders('created');
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
