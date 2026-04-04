import { AnzWorldlineTIMClient, isApproved, mapCardType } from './anzworldline';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';

export type AcquirerName = 'tyro' | 'stripe' | 'anz' | 'westpac' | 'nab' | 'cba' | 'windcave';

export interface AcquirerConfig {
  name:       AcquirerName;
  priority:   number;
  cardTypes?: string[];
}

export interface PaymentRequest {
  amount:      number;   // in dollars (e.g. 10.00)
  currency:    string;
  tipAmount?:  number;
  referenceId: string;
  terminalId?: string;
  acquirer:    AcquirerName;
  /** Required for acquirers that need per-org terminal lookup (e.g. ANZ TIM) */
  orgId?:      string;
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
      return processAnzTIMPayment(req);
    default:
      return stubPayment(req);
  }
}

export async function processRefund(
  originalTransactionId: string,
  amount:                number,
  acquirer:              AcquirerName,
  orgId?:                string,
): Promise<PaymentResult> {
  if (acquirer === 'anz' && orgId) {
    return processAnzTIMRefund(originalTransactionId, amount, orgId);
  }
  return {
    success:      false,
    errorCode:    'ACQUIRER_NOT_CONFIGURED',
    errorMessage: `Refund acquirer '${acquirer}' is not configured for this installation.`,
  };
}

// ─── ANZ Worldline TIM ─────────────────────────────────────────────────────

async function getTIMClient(orgId: string): Promise<AnzWorldlineTIMClient | null> {
  const creds = await db.query.terminalCredentials.findFirst({
    where: and(
      eq(schema.terminalCredentials.orgId,    orgId),
      eq(schema.terminalCredentials.provider, 'anz'),
      eq(schema.terminalCredentials.isActive, true),
    ),
  });
  if (!creds?.terminalIp) return null;

  return new AnzWorldlineTIMClient({
    terminalIp:   creds.terminalIp,
    terminalPort: creds.terminalPort ?? 8080,
  });
}

async function processAnzTIMPayment(req: PaymentRequest): Promise<PaymentResult> {
  if (!req.orgId) {
    return { success: false, errorMessage: 'orgId is required for ANZ Worldline payments' };
  }

  const client = await getTIMClient(req.orgId);
  if (!client) {
    return {
      success:      false,
      errorMessage: 'ANZ Worldline terminal not configured — please set the terminal IP and port',
    };
  }

  const totalDollars = (req.amount ?? 0) + (req.tipAmount ?? 0);
  const amountCents  = Math.round(totalDollars * 100);

  try {
    const { data } = await client.purchase(amountCents, req.referenceId);

    if (isApproved(data)) {
      return {
        success: true,
        ...(data.transactionId     ? { acquirerTransactionId: data.transactionId }            : {}),
        ...(data.cardType          ? { cardScheme: mapCardType(data.cardType)! }               : {}),
        ...(data.maskedPan         ? { cardLast4: data.maskedPan.slice(-4) }                  : {}),
        ...(data.authorizationCode ? { authCode: data.authorizationCode }                     : {}),
      };
    }

    return {
      success:      false,
      errorCode:    data.responseCode,
      errorMessage: data.responseText ?? `Terminal declined (${data.responseCode})`,
    };

  } catch (e) {
    return {
      success:      false,
      errorMessage: e instanceof Error ? e.message : 'Could not reach the ANZ Worldline terminal',
    };
  }
}

async function processAnzTIMRefund(
  transactionId: string,
  amount:        number,
  orgId:         string,
): Promise<PaymentResult> {
  const client = await getTIMClient(orgId);
  if (!client) {
    return { success: false, errorMessage: 'ANZ Worldline terminal not configured' };
  }

  try {
    const amountCents = Math.round(amount * 100);
    const { data }    = await client.refund(amountCents, transactionId);

    if (isApproved(data)) {
      return { success: true, ...(data.transactionId ? { acquirerTransactionId: data.transactionId } : {}) };
    }
    return { success: false, ...(data.responseCode ? { errorCode: data.responseCode } : {}), ...(data.responseText ? { errorMessage: data.responseText } : {}) };
  } catch (e) {
    return { success: false, errorMessage: e instanceof Error ? e.message : 'Unknown ANZ error' };
  }
}

// ─── Stub (returns error — acquirer not configured) ─────────────────────────

async function stubPayment(req: PaymentRequest): Promise<PaymentResult> {
  return {
    success:      false,
    errorCode:    'ACQUIRER_NOT_CONFIGURED',
    errorMessage: `Payment acquirer '${req.acquirer}' is not configured for this installation. Only ANZ Worldline TIM is supported.`,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
