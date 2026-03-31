// NOTE: Real API credentials required — this will return 401 in development without valid tokens
import { BaseConnector, type SyncResult } from './base';

interface XeroOrganisationResponse {
  Organisations?: Array<{ Name: string; OrganisationID: string }>;
}

interface XeroTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

interface XeroManualJournalResponse {
  ManualJournals?: Array<{ ManualJournalID: string }>;
}

interface XeroInvoiceResponse {
  Invoices?: Array<{ InvoiceID: string; InvoiceNumber: string }>;
}

export interface XeroJournalEntry {
  accountCode: string;
  description: string;
  lineAmount: number;
  taxType: string;
}

export interface XeroInvoiceInput {
  contactId: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    accountCode: string;
  }>;
  date: string;
  dueDate: string;
  reference: string;
}

export class XeroConnector extends BaseConnector {
  private get accessToken(): string {
    return this.config.credentials['accessToken'] ?? '';
  }

  private get refreshToken(): string {
    return this.config.credentials['refreshToken'] ?? '';
  }

  private get tenantId(): string {
    return this.config.credentials['tenantId'] ?? '';
  }

  private get clientId(): string {
    return this.config.credentials['clientId'] ?? '';
  }

  private get clientSecret(): string {
    return this.config.credentials['clientSecret'] ?? '';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch('https://api.xero.com/api.xro/2.0/Organisation', {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Xero-Tenant-Id': this.tenantId,
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const data = (await response.json()) as XeroOrganisationResponse;
        const orgName = data.Organisations?.[0]?.Name ?? 'Unknown Organisation';
        return { ok: true, message: `Connected to Xero organisation: ${orgName}` };
      }

      if (response.status === 401) {
        return { ok: false, message: 'Xero access token is invalid or expired. Please reconnect.' };
      }

      const errorText = await response.text();
      return { ok: false, message: `Xero API error ${response.status}: ${errorText}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Failed to connect to Xero: ${message}` };
    }
  }

  async refreshAccessToken(): Promise<string> {
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Xero token refresh failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as XeroTokenResponse;
    return data.access_token;
  }

  async pushSalesJournal(
    date: string,
    entries: XeroJournalEntry[],
  ): Promise<{ journalId: string }> {
    const journalLines = entries.map((entry) => ({
      LineAmount: entry.lineAmount,
      AccountCode: entry.accountCode,
      Description: entry.description,
      TaxType: entry.taxType,
    }));

    const response = await fetch('https://api.xero.com/api.xro/2.0/ManualJournals', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Xero-Tenant-Id': this.tenantId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        ManualJournals: [
          {
            Narration: `ElevatedPOS Sales Journal — ${date}`,
            Date: date,
            JournalLines: journalLines,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Xero ManualJournals POST failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as XeroManualJournalResponse;
    const journalId = data.ManualJournals?.[0]?.ManualJournalID;
    if (!journalId) {
      throw new Error('Xero did not return a ManualJournalID');
    }

    return { journalId };
  }

  async pushInvoice(invoice: XeroInvoiceInput): Promise<{ invoiceId: string; invoiceNumber: string }> {
    const lineItems = invoice.lineItems.map((item) => ({
      Description: item.description,
      Quantity: item.quantity,
      UnitAmount: item.unitAmount,
      AccountCode: item.accountCode,
    }));

    const response = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Xero-Tenant-Id': this.tenantId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        Invoices: [
          {
            Type: 'ACCREC',
            Contact: { ContactID: invoice.contactId },
            Date: invoice.date,
            DueDate: invoice.dueDate,
            Reference: invoice.reference,
            LineItems: lineItems,
            Status: 'DRAFT',
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Xero Invoices POST failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as XeroInvoiceResponse;
    const xeroInvoice = data.Invoices?.[0];
    if (!xeroInvoice?.InvoiceID) {
      throw new Error('Xero did not return an InvoiceID');
    }

    return { invoiceId: xeroInvoice.InvoiceID, invoiceNumber: xeroInvoice.InvoiceNumber ?? '' };
  }

  async sync(): Promise<SyncResult> {
    // In real implementation: fetch yesterday's orders, push as journal entries
    // For now: test connection, return mock sync result
    const { ok, message } = await this.testConnection();
    return {
      success: ok,
      recordsProcessed: 0,
      errors: ok ? [] : [message],
      lastSyncAt: new Date().toISOString(),
    };
  }
}
