import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const PAYMENTS_API_URL = process.env['PAYMENTS_API_URL'] ?? process.env['AUTH_API_URL'] ?? 'http://payments:4005';
const TYRO_TEST_MODE = process.env['TYRO_TEST_MODE'] !== 'false'; // default to test mode

/**
 * GET /api/tyro/config
 *
 * Fetches the Tyro iClient configuration for the current device.
 * The API key flows from the server-side payments service to the client
 * only through this route, keeping it out of client bundles.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('deviceId');

  const token = (await cookies()).get('elevatedpos_token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch device payment config to get terminalCredentialId
    let credentialId: string | null = null;

    if (deviceId) {
      const configRes = await fetch(`${PAYMENTS_API_URL}/api/v1/terminal/device-config/${deviceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (configRes.ok) {
        const configData = await configRes.json();
        credentialId = configData.terminalCredentialId ?? null;
      }
    }

    // If no device-specific config, try fetching the org's active Tyro credential
    if (!credentialId) {
      const credsRes = await fetch(`${PAYMENTS_API_URL}/api/v1/terminal/credentials`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (credsRes.ok) {
        const creds = await credsRes.json();
        const tyroCredential = (creds.data ?? creds)
          .find((c: { provider: string; isActive: boolean }) => c.provider === 'tyro' && c.isActive);
        if (tyroCredential) {
          credentialId = tyroCredential.id;
          const metadata = tyroCredential.metadata ?? {};
          return NextResponse.json({
            configured: true,
            testMode: TYRO_TEST_MODE,
            apiKey: metadata.apiKey ?? '',
            merchantId: metadata.merchantId ?? '',
            terminalId: metadata.terminalId ?? '',
            tyroHandlesSurcharge: metadata.tyroHandlesSurcharge ?? false,
          });
        }
      }
    }

    // No Tyro configuration found
    return NextResponse.json({
      configured: false,
      testMode: TYRO_TEST_MODE,
    });
  } catch (err) {
    console.error('[tyro/config] Error:', err);
    return NextResponse.json({
      configured: false,
      testMode: TYRO_TEST_MODE,
      error: 'Failed to fetch Tyro configuration',
    });
  }
}
