/**
 * Stub for Stripe Terminal hook.
 *
 * @stripe/stripe-react-native does not include Terminal SDK functionality.
 * This stub satisfies TypeScript during development/CI until
 * @stripe/stripe-terminal-react-native is added as a dependency.
 */

export interface StripeTerminalReader {
  serialNumber: string;
  deviceType: string;
  label?: string;
  location?: string;
}

export interface StripeTerminalError {
  code?: number | string;
  message: string;
}

export interface StripeTerminalPaymentIntent {
  id?: string;
  amount?: number;
  charges?: { data: { payment_method_details?: { card_present?: { brand?: string; last4?: string } } }[] };
}

export interface UseStripeTerminalOptions {
  onUpdateDiscoveredReaders?: (readers: StripeTerminalReader[]) => void | Promise<void>;
}

export interface UseStripeTerminalReturn {
  initialize: (opts: { fetchConnectionToken: () => Promise<string> }) => Promise<{ error?: StripeTerminalError }>;
  discoverReaders: (opts: { discoveryMethod: string; simulated?: boolean }) => Promise<{ error?: StripeTerminalError }>;
  connectLocalMobileReader: (opts: { reader: StripeTerminalReader }) => Promise<{ error?: StripeTerminalError }>;
  createPaymentIntent: (opts: Record<string, unknown>) => Promise<{ paymentIntent?: StripeTerminalPaymentIntent; error?: StripeTerminalError }>;
  collectPaymentMethod: (opts: { paymentIntentId: string }) => Promise<{ paymentIntent?: StripeTerminalPaymentIntent; error?: StripeTerminalError }>;
  confirmPaymentIntent: (opts: { paymentIntent: StripeTerminalPaymentIntent }) => Promise<{ paymentIntent?: StripeTerminalPaymentIntent; error?: StripeTerminalError }>;
  cancelCollectPaymentMethod: () => Promise<{ error?: StripeTerminalError }>;
  connectedReader: StripeTerminalReader | null;
}

/**
 * Stub implementation — returns no-op functions.
 * Replace with @stripe/stripe-terminal-react-native when the package is added.
 */
export function useStripeTerminal(_opts?: UseStripeTerminalOptions): UseStripeTerminalReturn {
  return {
    initialize: async () => ({ error: { message: 'Stripe Terminal SDK not installed' } }),
    discoverReaders: async () => ({ error: { message: 'Stripe Terminal SDK not installed' } }),
    connectLocalMobileReader: async () => ({ error: { message: 'Stripe Terminal SDK not installed' } }),
    createPaymentIntent: async () => ({ error: { message: 'Stripe Terminal SDK not installed' } }),
    collectPaymentMethod: async () => ({ error: { message: 'Stripe Terminal SDK not installed' } }),
    confirmPaymentIntent: async () => ({ error: { message: 'Stripe Terminal SDK not installed' } }),
    cancelCollectPaymentMethod: async () => ({}),
    connectedReader: null,
  };
}
