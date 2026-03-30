// NOTE: Real API credentials required — this will return 401 in development without valid tokens
import { BaseConnector, type SyncResult } from './base';

interface MYOBCompanyFilesResponse {
  Id?: string;
  Name?: string;
}

interface MYOBTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

interface MYOBSaleResponse {
  UID?: string;
}

export interface MYOBSaleInput {
  date: string;
  customerId?: string;
  lines: Array<{
    accountCode: string;
    amount: number;
    taxCode: string;
    description: string;
  }>;
  reference: string;
}

export class MYOBConnector extends BaseConnector {
  private get accessToken(): string {
    return this.config.credentials['accessToken'] ?? '';
  }

  private get refreshTokenValue(): string {
    return this.config.credentials['refreshToken'] ?? '';
  }

  private get clientId(): string {
    return this.config.credentials['clientId'] ?? '';
  }

  private get clientSecret(): string {
    return this.config.credentials['clientSecret'] ?? '';
  }

  private get companyFileUri(): string {
    return this.config.credentials['companyFileUri'] ?? '';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch('https://api.myob.com/accountright/', {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'x-myobapi-key': this.clientId,
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const data = (await response.json()) as MYOBCompanyFilesResponse[];
        const fileName = Array.isArray(data) ? (data[0]?.Name ?? 'Unknown') : 'Unknown';
        return { ok: true, message: `Connected to MYOB company file: ${fileName}` };
      }

      if (response.status === 401) {
        return { ok: false, message: 'MYOB access token is invalid or expired. Please reconnect.' };
      }

      const errorText = await response.text();
      return { ok: false, message: `MYOB API error ${response.status}: ${errorText}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Failed to connect to MYOB: ${message}` };
    }
  }

  async refreshToken(): Promise<string> {
    const response = await fetch('https://secure.myob.com/oauth2/v1/authorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshTokenValue,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MYOB token refresh failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as MYOBTokenResponse;
    return data.access_token;
  }

  async pushSale(sale: MYOBSaleInput): Promise<{ saleId: string }> {
    if (!this.companyFileUri) {
      throw new Error('MYOB companyFileUri credential is required to push sales');
    }

    const lines = sale.lines.map((line) => ({
      Account: { DisplayID: line.accountCode },
      Amount: line.amount,
      TaxCode: { Code: line.taxCode },
      Description: line.description,
    }));

    const body: Record<string, unknown> = {
      Date: sale.date,
      ReferenceNumber: sale.reference,
      Lines: lines,
    };

    if (sale.customerId) {
      body['Customer'] = { UID: sale.customerId };
    }

    const response = await fetch(`${this.companyFileUri}/Sale/Order`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'x-myobapi-key': this.clientId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MYOB Sale/Order POST failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as MYOBSaleResponse;
    const saleId = data.UID;
    if (!saleId) {
      throw new Error('MYOB did not return a sale UID');
    }

    return { saleId };
  }

  async sync(): Promise<SyncResult> {
    const { ok, message } = await this.testConnection();
    return {
      success: ok,
      recordsProcessed: 0,
      errors: ok ? [] : [message],
      lastSyncAt: new Date().toISOString(),
    };
  }
}
