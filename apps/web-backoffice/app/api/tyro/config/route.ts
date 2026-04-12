import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const PAYMENTS_API_URL = process.env['PAYMENTS_API_URL'] ?? process.env['AUTH_API_URL'] ?? 'http://payments:4005';
const TYRO_TEST_MODE = process.env['TYRO_TEST_MODE'] !== 'false'; // default to test mode
// API key belongs to ElevatedPOS as integration partner — set via env, never exposed to merchants
const TYRO_API_KEY = process.env['TYRO_API_KEY'] ?? '';
// ANZ Worldline integrator ID — issued by ANZ Worldline to ElevatedPOS as a POS vendor
const ANZ_INTEGRATOR_ID = process.env['ANZ_INTEGRATOR_ID'] ?? '';

/**
 * GET /api/tyro/config?deviceId=xxx
 *
 * Fetches the EFTPOS terminal configuration for a specific device.
 * Returns the provider type and config so the POS payment page knows
 * whether to use Tyro, Stripe, ANZ, etc.
 *
 * Flow:
 * 1. Look up device's terminalCredentialId from device_payment_configs
 * 2. Fetch that specific credential
 * 3. Return provider + config (Tyro: apiKey, merchantId, terminalId)
 * 4. Fallback: search org's active credentials if no device config
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('deviceId');

  const token = (await cookies()).get('elevatedpos_token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Step 1: Look up device-specific terminal assignment
    let credential: any = null;

    if (deviceId) {
      const configRes = await fetch(`${PAYMENTS_API_URL}/api/v1/terminal/device-config/${deviceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (configRes.ok) {
        const configData = await configRes.json();
        const credId = configData.terminalCredentialId;
        if (credId) {
          // Fetch the specific credential
          const credsRes = await fetch(`${PAYMENTS_API_URL}/api/v1/terminal/credentials`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (credsRes.ok) {
            const creds = await credsRes.json();
            credential = (creds.data ?? creds).find((c: any) => c.id === credId && c.isActive);
          }
        }
      }
    }

    // Step 2: Fallback — find the first active terminal credential for the org (no provider preference)
    if (!credential) {
      const credsRes = await fetch(`${PAYMENTS_API_URL}/api/v1/terminal/credentials`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (credsRes.ok) {
        const creds = await credsRes.json();
        credential = (creds.data ?? creds).find((c: any) => c.isActive);
      }
    }

    if (!credential) {
      return NextResponse.json({
        configured: false,
        provider: null,
        testMode: TYRO_TEST_MODE,
      });
    }

    const metadata = credential.metadata ?? {};

    // Return provider-specific config
    if (credential.provider === 'tyro') {
      return NextResponse.json({
        configured: true,
        provider: 'tyro',
        testMode: TYRO_TEST_MODE,
        apiKey: TYRO_API_KEY, // From server env, not merchant config
        merchantId: metadata.merchantId ?? '',
        terminalId: metadata.terminalId ?? '',
        tyroHandlesSurcharge: metadata.tyroHandlesSurcharge ?? false,
        credentialId: credential.id,
      });
    }

    if (credential.provider === 'anz') {
      return NextResponse.json({
        configured: true,
        provider: 'anz',
        terminalIp:   credential.terminalIp,
        terminalPort: credential.terminalPort ?? 80,
        integratorId: ANZ_INTEGRATOR_ID,
        credentialId: credential.id,
      });
    }

    // Stripe or other providers
    return NextResponse.json({
      configured: true,
      provider: credential.provider,
      credentialId: credential.id,
      metadata,
    });
  } catch (err) {
    console.error('[tyro/config] Error:', err);
    return NextResponse.json({
      configured: false,
      provider: null,
      testMode: TYRO_TEST_MODE,
      error: 'Failed to fetch terminal configuration',
    });
  }
}
