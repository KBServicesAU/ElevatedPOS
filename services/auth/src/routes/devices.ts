import type { FastifyInstance } from 'fastify';
import { eq, and, gt, isNull, count } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';
import { db, schema } from '../db';
import { generateRefreshToken, hashToken } from '../lib/tokens';

// Pairing code character set — uppercase alphanumeric, ambiguous chars removed (O, 0, I, 1)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePairingCode(length = 6): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes).map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

const createCodeSchema = z.object({
  role: z.enum(['pos', 'kds', 'kiosk']),
  locationId: z.string().uuid(),
  registerId: z.string().uuid().optional(),
  label: z.string().max(100).optional(),
});

const pairSchema = z.object({
  code: z.string().min(4).max(8).toUpperCase(),
  platform: z.string().max(20).optional(),
  appVersion: z.string().max(20).optional(),
});

export async function deviceRoutes(app: FastifyInstance) {
  // POST /api/v1/devices/pairing-codes — generate a pairing code (staff auth required)
  app.post('/pairing-codes', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string; sub: string };
    const body = createCodeSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ title: 'Validation Error', errors: body.error.flatten() });

    // Verify location belongs to org
    const location = await db.query.locations.findFirst({
      where: and(eq(schema.locations.id, body.data.locationId), eq(schema.locations.orgId, user.orgId)),
    });
    if (!location) return reply.status(404).send({ title: 'Location not found', status: 404 });

    // Enforce device limit
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, user.orgId),
      columns: { maxDevices: true },
    });
    if (org) {
      const countRows = await db
        .select({ value: count() })
        .from(schema.devices)
        .where(and(eq(schema.devices.orgId, user.orgId), eq(schema.devices.status, 'active')));
      const deviceCount = countRows[0]?.value ?? 0;
      if (deviceCount >= org.maxDevices) {
        return reply.status(403).send({ error: 'Device limit reached', limit: org.maxDevices, current: deviceCount });
      }
    }

    // Generate unique code (retry on collision, max 5 attempts)
    let code = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generatePairingCode();
      const existing = await db.query.devicePairingCodes.findFirst({
        where: eq(schema.devicePairingCodes.code, candidate),
      });
      if (!existing) { code = candidate; break; }
    }
    if (!code) return reply.status(500).send({ title: 'Could not generate unique code', status: 500 });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const recordRows = await db.insert(schema.devicePairingCodes).values({
      orgId: user.orgId,
      code,
      role: body.data.role,
      locationId: body.data.locationId,
      registerId: body.data.registerId ?? null,
      label: body.data.label ?? null,
      createdBy: user.sub,
      expiresAt,
    }).returning();
    const record = recordRows[0]!;

    return reply.status(201).send({
      data: {
        code: record.code,
        role: record.role,
        locationId: record.locationId,
        label: record.label,
        expiresAt: record.expiresAt,
      },
    });
  });

  // GET /api/v1/devices/pairing-codes — list recent unexpired/unused codes (staff auth)
  app.get('/pairing-codes', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const now = new Date();
    const codes = await db.query.devicePairingCodes.findMany({
      where: and(
        eq(schema.devicePairingCodes.orgId, user.orgId),
        gt(schema.devicePairingCodes.expiresAt, now),
        isNull(schema.devicePairingCodes.usedAt),
      ),
    });
    return reply.send({ data: codes });
  });

  // POST /api/v1/devices/pair — unauthenticated, called by mobile app
  app.post('/pair', async (request, reply) => {
    const body = pairSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ title: 'Validation Error', errors: body.error.flatten() });

    const now = new Date();
    const pairingRecord = await db.query.devicePairingCodes.findFirst({
      where: and(
        eq(schema.devicePairingCodes.code, body.data.code.toUpperCase()),
        gt(schema.devicePairingCodes.expiresAt, now),
        isNull(schema.devicePairingCodes.usedAt),
      ),
    });

    if (!pairingRecord) {
      return reply.status(422).send({
        title: 'Invalid or expired pairing code',
        status: 422,
        detail: 'The code may have expired (codes are valid for 15 minutes) or already been used.',
      });
    }

    // Plan gating: KDS and Kiosk are paid addons
    const pairOrg = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, pairingRecord.orgId),
      columns: { plan: true, planStatus: true, maxDevices: true },
    });
    if (pairingRecord.role === 'kds' || pairingRecord.role === 'kiosk') {
      if (!pairOrg || pairOrg.planStatus !== 'active' || pairOrg.plan === 'starter') {
        return reply.status(403).send({
          title: 'Plan upgrade required',
          status: 403,
          detail: `The ${pairingRecord.role.toUpperCase()} addon requires a Professional or Enterprise plan. Please upgrade at your account settings.`,
        });
      }
    }

    // Enforce device limit
    if (pairOrg) {
      const countRows2 = await db
        .select({ value: count() })
        .from(schema.devices)
        .where(and(eq(schema.devices.orgId, pairingRecord.orgId), eq(schema.devices.status, 'active')));
      const deviceCount = countRows2[0]?.value ?? 0;
      if (deviceCount >= pairOrg.maxDevices) {
        return reply.status(403).send({ error: 'Device limit reached', limit: pairOrg.maxDevices, current: deviceCount });
      }
    }

    // Generate device token
    const deviceToken = generateRefreshToken();
    const tokenHash = hashToken(deviceToken);

    const deviceRows = await db.insert(schema.devices).values({
      orgId: pairingRecord.orgId,
      tokenHash,
      role: pairingRecord.role,
      locationId: pairingRecord.locationId,
      registerId: pairingRecord.registerId ?? null,
      label: pairingRecord.label ?? null,
      platform: body.data.platform ?? null,
      appVersion: body.data.appVersion ?? null,
      lastSeenAt: now,
      status: 'active',
    }).returning();
    const device = deviceRows[0]!;

    // Mark pairing code as used
    await db.update(schema.devicePairingCodes)
      .set({ usedAt: now })
      .where(eq(schema.devicePairingCodes.id, pairingRecord.id));

    return reply.status(200).send({
      data: {
        deviceId: device.id,
        deviceToken,
        role: device.role,
        locationId: device.locationId,
        registerId: device.registerId,
        orgId: device.orgId,
        label: device.label,
      },
    });
  });

  // GET /api/v1/devices — list paired devices (staff auth)
  app.get('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const q = request.query as { locationId?: string; role?: string; status?: string };

    const conditions = [eq(schema.devices.orgId, user.orgId)];
    if (q.locationId) conditions.push(eq(schema.devices.locationId, q.locationId));
    if (q.role && ['pos', 'kds', 'kiosk'].includes(q.role)) {
      conditions.push(eq(schema.devices.role, q.role as 'pos' | 'kds' | 'kiosk'));
    }
    if (q.status && ['active', 'revoked'].includes(q.status)) {
      conditions.push(eq(schema.devices.status, q.status as 'active' | 'revoked'));
    }

    const deviceList = await db.query.devices.findMany({
      where: and(...conditions),
      orderBy: (d, { desc }) => [desc(d.createdAt)],
    });

    return reply.send({ data: deviceList });
  });

  // DELETE /api/v1/devices/:id — revoke a device (staff auth)
  app.delete('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };

    const device = await db.query.devices.findFirst({
      where: and(eq(schema.devices.id, id), eq(schema.devices.orgId, user.orgId)),
    });
    if (!device) return reply.status(404).send({ title: 'Device not found', status: 404 });

    const [updated] = await db.update(schema.devices)
      .set({ status: 'revoked', revokedAt: new Date(), revokedBy: user.sub })
      .where(eq(schema.devices.id, id))
      .returning();

    return reply.send({ data: updated });
  });

  // GET /api/v1/devices/employees — list active employees for this device's org (device token auth)
  app.get('/employees', async (request, reply) => {
    const header = request.headers['authorization'];
    if (!header?.startsWith('Bearer ')) return reply.status(401).send({ title: 'Unauthorized', status: 401 });
    const token = header.slice(7);
    const tokenHash = hashToken(token);

    const device = await db.query.devices.findFirst({
      where: and(eq(schema.devices.tokenHash, tokenHash), eq(schema.devices.status, 'active')),
    });
    if (!device) return reply.status(401).send({ title: 'Device not found or revoked', status: 401 });

    const employees = await db.query.employees.findMany({
      where: and(eq(schema.employees.orgId, device.orgId), eq(schema.employees.isActive, true)),
      columns: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        roleId: true,
        locationIds: true,
      },
      with: { role: { columns: { id: true, name: true } } },
      orderBy: (e, { asc }) => [asc(e.firstName), asc(e.lastName)],
    });

    return reply.send({ data: employees });
  });

  // PATCH /api/v1/devices/heartbeat — update lastSeenAt + appVersion (device token auth)
  app.patch('/heartbeat', async (request, reply) => {
    const header = request.headers['authorization'];
    if (!header?.startsWith('Bearer ')) return reply.status(401).send({ title: 'Unauthorized', status: 401 });
    const token = header.slice(7);
    const tokenHash = hashToken(token);

    const device = await db.query.devices.findFirst({
      where: and(eq(schema.devices.tokenHash, tokenHash), eq(schema.devices.status, 'active')),
    });
    if (!device) return reply.status(401).send({ title: 'Device not found or revoked', status: 401 });

    const body = request.body as { appVersion?: string } | null;
    await db.update(schema.devices)
      .set({ lastSeenAt: new Date(), ...(body?.appVersion ? { appVersion: body.appVersion } : {}) })
      .where(eq(schema.devices.id, device.id));

    return reply.send({ data: { deviceId: device.id, role: device.role, locationId: device.locationId } });
  });

  // POST /api/v1/devices/heartbeat — alias for PATCH (mobile clients use POST)
  app.post('/heartbeat', async (request, reply) => {
    const header = request.headers['authorization'];
    if (!header?.startsWith('Bearer ')) return reply.status(401).send({ title: 'Unauthorized', status: 401 });
    const token = header.slice(7);
    const tokenHash = hashToken(token);

    const device = await db.query.devices.findFirst({
      where: and(eq(schema.devices.tokenHash, tokenHash), eq(schema.devices.status, 'active')),
    });
    if (!device) return reply.status(401).send({ title: 'Device not found or revoked', status: 401 });

    const body = request.body as { appVersion?: string } | null;
    await db.update(schema.devices)
      .set({ lastSeenAt: new Date(), ...(body?.appVersion ? { appVersion: body.appVersion } : {}) })
      .where(eq(schema.devices.id, device.id));

    return reply.send({ data: { deviceId: device.id, role: device.role, locationId: device.locationId } });
  });

  // GET /api/v1/devices/locations — list locations for the device's org (device token auth)
  // Used by KDS for runtime location switching in multi-location orgs.
  app.get('/locations', async (request, reply) => {
    const header = request.headers['authorization'];
    if (!header?.startsWith('Bearer ')) return reply.status(401).send({ title: 'Unauthorized', status: 401 });
    const token = header.slice(7);
    const tokenHash = hashToken(token);

    const device = await db.query.devices.findFirst({
      where: and(eq(schema.devices.tokenHash, tokenHash), eq(schema.devices.status, 'active')),
    });
    if (!device) return reply.status(401).send({ title: 'Device not found or revoked', status: 401 });

    const locations = await db.query.locations.findMany({
      where: and(
        eq(schema.locations.orgId, device.orgId),
        eq(schema.locations.isActive, true),
      ),
    });

    return reply.send({
      data: locations.map((l) => ({
        id: l.id,
        name: l.name,
        type: l.type,
      })),
    });
  });

  // ── Device config (unified settings for mobile app) ───────────────────────

  /**
   * GET /api/v1/devices/config
   *
   * Returns the complete server-side config for this device so the mobile app
   * does not need to store payment/printer settings locally:
   *  - terminal: which EFTPOS provider + IP/port/credentials
   *  - networkPrinters: receipt + order printers configured in the dashboard
   *  - customerDisplay: messages and display preferences
   *
   * Auth: device token (Bearer)
   *
   * The terminal config is fetched from the payments service using a
   * short-lived service JWT signed with the shared JWT_SECRET.
   */
  app.get('/config', async (request, reply) => {
    const header = request.headers['authorization'];
    if (!header?.startsWith('Bearer ')) return reply.status(401).send({ title: 'Unauthorized', status: 401 });
    const token = header.slice(7);
    const tokenHash = hashToken(token);

    const device = await db.query.devices.findFirst({
      where: and(eq(schema.devices.tokenHash, tokenHash), eq(schema.devices.status, 'active')),
    });
    if (!device) return reply.status(401).send({ title: 'Device not found or revoked', status: 401 });

    // ── Network printers (receipt + order) for the device's location ─────
    const printerRows = await db.query.printers.findMany({
      where: and(
        eq(schema.printers.orgId, device.orgId),
        eq(schema.printers.locationId, device.locationId),
        eq(schema.printers.isActive, true),
        eq(schema.printers.connectionType, 'ip'),
      ),
    });

    const receiptPrinter = printerRows.find((p) => p.printerType === 'receipt') ?? null;
    const orderPrinter   = printerRows.find((p) => p.printerType === 'kitchen_order') ?? null;

    // ── Terminal config (from payments service) ──────────────────────────
    const PAYMENTS_URL = process.env['PAYMENTS_API_URL'] ?? 'http://payments:4005';
    let terminal: Record<string, unknown> | null = null;

    try {
      // Sign a short-lived service JWT (same secret — payments service will accept it)
      const serviceToken = app.jwt.sign(
        { sub: 'service:auth', orgId: device.orgId, iss: 'elevatedpos-auth' },
        { expiresIn: '60s' },
      );

      // Fetch device-specific terminal credential assignment
      const configRes = await fetch(`${PAYMENTS_URL}/api/v1/terminal/device-config/${device.id}`, {
        headers: { Authorization: `Bearer ${serviceToken}` },
      });

      let credentialId: string | null = null;
      if (configRes.ok) {
        const configData = await configRes.json() as { data?: { terminalCredentialId?: string } | null };
        credentialId = configData.data?.terminalCredentialId ?? null;
      }

      // Fetch the terminal credential list to find the right credential
      const credsRes = await fetch(`${PAYMENTS_URL}/api/v1/terminal/credentials`, {
        headers: { Authorization: `Bearer ${serviceToken}` },
      });

      if (credsRes.ok) {
        const credsData = await credsRes.json() as { data?: unknown[] } | unknown[];
        const creds: Record<string, unknown>[] = (
          Array.isArray(credsData) ? credsData : (credsData as { data?: unknown[] }).data ?? []
        ) as Record<string, unknown>[];

        // Use the device-specific credential, or fall back to the first active one
        const credential = credentialId
          ? (creds.find((c) => c['id'] === credentialId && c['isActive']) ?? creds.find((c) => !!c['isActive']))
          : creds.find((c) => !!c['isActive']);

        if (credential) {
          const meta = (credential['metadata'] as Record<string, unknown>) ?? {};
          if (credential['provider'] === 'anz') {
            terminal = {
              provider: 'anz',
              terminalIp:   credential['terminalIp'],
              terminalPort: credential['terminalPort'] ?? 8080,
              enableSurcharge: meta['enableSurcharge'] ?? false,
              enableTipping:   meta['enableTipping']   ?? false,
            };
          } else if (credential['provider'] === 'tyro') {
            terminal = {
              provider:           'tyro',
              apiKey:             process.env['TYRO_API_KEY'] ?? '',
              merchantId:         meta['merchantId']         ?? '',
              terminalId:         meta['terminalId']         ?? '',
              testMode:           process.env['TYRO_TEST_MODE'] !== 'false',
              tyroHandlesSurcharge: meta['tyroHandlesSurcharge'] ?? false,
              enableTipping:      meta['tippingEnabled']     ?? false,
            };
          }
        }
      }
    } catch (err) {
      // Non-fatal: mobile app will fall back to no terminal configured
      console.warn('[devices/config] Could not fetch terminal config from payments service:', err);
    }

    // ── Customer display settings (from device.settings) ─────────────────
    const deviceSettings = (device.settings as Record<string, unknown> | null) ?? {};
    const customerDisplay = {
      welcomeMessage: (deviceSettings['welcomeMessage'] as string) ?? 'Welcome!',
      thankYouMessage: (deviceSettings['thankYouMessage'] as string) ?? 'Thank you for your order!',
      showLogo:       (deviceSettings['showLogo']       as boolean) ?? false,
      showLineItems:  (deviceSettings['showLineItems']  as boolean) ?? true,
      showGst:        (deviceSettings['showGst']        as boolean) ?? true,
    };

    return reply.send({
      data: {
        terminal,
        networkPrinters: {
          receipt: receiptPrinter
            ? { id: receiptPrinter.id, name: receiptPrinter.name, host: receiptPrinter.host, port: receiptPrinter.port ?? 9100, paperWidth: 80 }
            : null,
          order: orderPrinter
            ? { id: orderPrinter.id, name: orderPrinter.name, host: orderPrinter.host, port: orderPrinter.port ?? 9100, paperWidth: 80 }
            : null,
        },
        customerDisplay,
      },
    });
  });

  /**
   * PUT /api/v1/devices/:id/settings
   *
   * Saves per-device settings (customer display, etc.) from the dashboard.
   * Auth: staff JWT.
   */
  app.put('/:id/settings', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    // Verify device belongs to this org
    const device = await db.query.devices.findFirst({
      where: and(eq(schema.devices.id, id), eq(schema.devices.orgId, user.orgId)),
    });
    if (!device) return reply.status(404).send({ title: 'Device not found', status: 404 });

    const body = request.body as Record<string, unknown>;
    const current = (device.settings as Record<string, unknown>) ?? {};
    const updated = { ...current, ...body };

    await db.update(schema.devices)
      .set({ settings: updated, updatedAt: new Date() })
      .where(eq(schema.devices.id, id));

    return reply.send({ data: updated });
  });
}
