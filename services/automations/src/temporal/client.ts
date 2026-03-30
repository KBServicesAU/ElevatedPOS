import { Client, Connection } from '@temporalio/client';

let cachedClient: Client | null = null;
let connectionAttempted = false;

/**
 * Returns a cached Temporal Client, or null if Temporal is unavailable.
 *
 * Graceful degradation: if TEMPORAL_ADDRESS is not set or the connection
 * fails, returns null so callers can fall back to a queued strategy.
 */
export async function getTemporalClient(): Promise<Client | null> {
  if (cachedClient) return cachedClient;

  // Avoid repeated connection attempts after the first failure
  if (connectionAttempted) return null;
  connectionAttempted = true;

  const temporalAddress = process.env['TEMPORAL_ADDRESS'];

  if (!temporalAddress) {
    console.warn(
      '[temporal/client] TEMPORAL_ADDRESS not set — Temporal client disabled.',
    );
    return null;
  }

  try {
    const connection = await Connection.connect({ address: temporalAddress });
    cachedClient = new Client({ connection, namespace: 'default' });
    console.log(
      `[temporal/client] Connected to Temporal at ${temporalAddress}`,
    );
    return cachedClient;
  } catch (err) {
    console.warn(
      `[temporal/client] Failed to connect to Temporal at ${temporalAddress}: ${String(err)}`,
    );
    return null;
  }
}

/**
 * Reset the cached client (useful for testing).
 */
export function resetTemporalClient(): void {
  cachedClient = null;
  connectionAttempted = false;
}
