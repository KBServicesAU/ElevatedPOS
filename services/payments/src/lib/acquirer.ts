import { AnzWorldlineClient, mapAnzStatusCode, mapProductIdToScheme } from './anzworldline';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';

export type AcquirerName = 'tyro' | 'stripe' | 'anz' | 'westpac' | 'nab' | 'cba' | 'windcave';

export interface AcquirerConfig {
  name:       AcquirerName;
  priority:   number;
  cardTypes?: string[];
}

export interface PaymentRequest {
  amount:       number;         // in dollars (e.g. 10.00)
  currency:     string;
  tipAmount?:   number;
  referenceId:  string;
  terminalId?:  string;
  acquirer:     AcquirerName;
  /** Required for acquirers that need per-org credentials (e.g. ANZ Worldline) */
  orgId?:       string;
  /** Raw card data — only supply when card-present or MOTO */
  cardData?: {
    cardholderName: string;
    cardNumber:     string;
    cvv:            string;
    expiryDate:     string;     // MMYY
  };
  /** Use a stored token instead of raw card data */
  token?: string;
}

export interface PaymentResult {
  success:                boolean;
  acquirerTransactionId?: string;
  cardScheme?:            string;
  cardLast4?:             string;
  authCode?:              string;
  errorCode?:             string;
  errorMessage?:          string;
}

// ─── Main dispatcher ───────────────────────────────────────────────────────

export async function processPayment(req: PaymentRequest): Promise<PaymentResult> {
  switch (req.acquirer) {
    case 'anz':
      return processAnzPayment(req);
    default:
      return stubPayment(req);
  }
}

export async function processRefund(
  originalTransactionId: string,
  amount:                number,
  acquirer:              AcquirerName,
  orgId?:                string,
  currency =             'AUD',
): Promise<PaymentResult> {
  if (acquirer === 'anz' && orgId) {
    return processAnzRefund(originalTransactionId, amount, orgId, currency);
  }
  // Stub for other acquirers
  await delay(100);
  return { success: true, acquirerTransactionId: `REF-${Date.now()}` };
}

// ─── ANZ Worldline ─────────────────────────────────────────────────────────

async function getAnzClient(orgId: string): Promise<AnzWorldlineClient | null> {
  const creds = await db.query.terminalCredentials.findFirst({
    where: and(
      eq(schema.terminalCredentials.orgId, orgId),
      eq(schema.terminalCredentials.provider, 'anz'),
      eq(schema.terminalCredentials.isActive, true),
    ),
  });
  if (!creds?.merchantId || !creds?.apiKey || !creds?.apiSecret) return null;

  return new AnzWorldlineClient({
    merchantId:  creds.merchantId,
    apiKey:      creds.apiKey,
    apiSecret:   creds.apiSecret,
    environment: (creds.environment ?? 'preprod') as 'preprod' | 'production',
  });
}

async function processAnzPayment(req: PaymentRequest): Promise<PaymentResult> {
  if (!req.orgId) {
    return { success: false, errorMessage: 'orgId is required for ANZ Worldline payments' };
  }

  const client = await getAnzClient(req.orgId);
  if (!client) {
    return { success: false, errorMessage: 'ANZ Worldline credentials not configured for this organisation' };
  }

  const totalDollars = (req.amount ?? 0) + (req.tipAmount ?? 0);
  const amountCents  = Math.round(totalDollars * 100);

  try {
    const { data, httpStatus } = await client.createPayment({
      amountCents,
      currency:          req.currency,
      merchantReference: req.referenceId,
      skipAuthentication: true,   // card-present / MOTO — skip 3DS
      ...(req.cardData ? { card: req.cardData } : {}),
      ...(req.token    ? { token: req.token }   : {}),
    });

    if (httpStatus === 201 || httpStatus === 200) {
      const statusCode = data.status?.statusCode ?? 0;
      const mapped     = mapAnzStatusCode(statusCode);
      const cardOut    = data.paymentOutput?.cardPaymentMethodSpecificOutput;

      if (mapped === 'approved') {
        return {
          success:               true,
          acquirerTransactionId: data.id,
          cardScheme:            mapProductIdToScheme(cardOut?.paymentProductId),
          cardLast4:             cardOut?.card?.cardNumber?.slice(-4),
          authCode:              cardOut?.authorisationCode,
        };
      }

      return {
        success:      false,
        errorMessage: `Payment declined by ANZ Worldline (status ${statusCode})`,
      };
    }

    const err = data as unknown as { errors?: { message: string }[] };
    const msg = err?.errors?.[0]?.message ?? `ANZ API returned HTTP ${httpStatus}`;
    return { success: false, errorMessage: msg };

  } catch (e) {
    return { success: false, errorMessage: e instanceof Error ? e.message : 'Unknown ANZ error' };
  }
}

async function processAnzRefund(
  transactionId: string,
  amount:        number,
  orgId:         string,
  currency:      string,
): Promise<PaymentResult> {
  const client = await getAnzClient(orgId);
  if (!client) {
    return { success: false, errorMessage: 'ANZ Worldline credentials not configured' };
  }

  try {
    const amountCents         = Math.round(amount * 100);
    const { data, httpStatus } = await client.refundPayment(transactionId, amountCents, currency);

    if (httpStatus === 201) {
      return { success: true, acquirerTransactionId: data.id };
    }
    return { success: false, errorMessage: `ANZ refund returned HTTP ${httpStatus}` };
  } catch (e) {
    return { success: false, errorMessage: e instanceof Error ? e.message : 'Unknown ANZ error' };
  }
}

// ─── Stub (used when no real SDK is wired up) ───────────────────────────────

async function stubPayment(_req: PaymentRequest): Promise<PaymentResult> {
  await delay(100);
  return {
    success:               true,
    acquirerTransactionId: `ACQ-${Date.now()}`,
    cardScheme:            'visa',
    cardLast4:             '4242',
    authCode:              String(Math.floor(Math.random() * 999999)).padStart(6, '0'),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
