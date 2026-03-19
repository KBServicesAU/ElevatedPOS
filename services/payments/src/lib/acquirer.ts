export type AcquirerName = 'tyro' | 'stripe' | 'anz' | 'westpac' | 'nab' | 'cba' | 'windcave';

export interface AcquirerConfig {
  name: AcquirerName;
  priority: number;
  cardTypes?: string[];
}

export interface PaymentRequest {
  amount: number;
  currency: string;
  tipAmount?: number;
  referenceId: string;
  terminalId?: string;
  acquirer: AcquirerName;
}

export interface PaymentResult {
  success: boolean;
  acquirerTransactionId?: string;
  cardScheme?: string;
  cardLast4?: string;
  authCode?: string;
  errorCode?: string;
  errorMessage?: string;
}

// Stub acquirer adapters — real SDK integration per acquirer goes here
export async function processPayment(req: PaymentRequest): Promise<PaymentResult> {
  // In production: route to Tyro SDK / Stripe Terminal SDK / etc.
  // For now, simulate approval
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    success: true,
    acquirerTransactionId: `ACQ-${Date.now()}`,
    cardScheme: 'visa',
    cardLast4: '4242',
    authCode: String(Math.floor(Math.random() * 999999)).padStart(6, '0'),
  };
}

export async function processRefund(originalTransactionId: string, amount: number, acquirer: AcquirerName): Promise<PaymentResult> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    success: true,
    acquirerTransactionId: `REF-${Date.now()}`,
  };
}
