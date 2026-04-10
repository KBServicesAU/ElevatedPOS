const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? '';

export interface PairResult {
  deviceId: string; deviceToken: string; role: 'pos' | 'kds' | 'kiosk' | 'dashboard';
  locationId: string; registerId: string | null; orgId: string; label: string | null;
}

export async function pairDevice(params: { code: string; platform: string; appVersion: string }): Promise<PairResult> {
  const res = await fetch(`${BASE_URL}/api/v1/devices/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (res.status === 422) throw new Error('Invalid or expired code. Codes are valid for 15 minutes.');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ title: 'Pairing failed' })) as { title?: string };
    throw new Error(err.title ?? 'Pairing failed');
  }
  const json = await res.json() as { data: PairResult };
  return json.data;
}
