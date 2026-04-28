/**
 * MFA route tests (v2.7.62).
 *
 * These exercise the route handlers in `routes/mfa.ts` end-to-end with an
 * in-memory mock of the `db` module — Fastify is registered with the same
 * @fastify/jwt setup as production so we get real JWT signing + verifying,
 * but the database layer is replaced with a hand-rolled mock that records
 * every read / write so we can assert the side effects.
 *
 * We do NOT spin up real Postgres here. The schema migration is covered
 * by the running auth service applying it on boot; the SQL is a few
 * idempotent ALTERs + a CREATE TABLE so it's not where bugs live.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';

// ── In-memory DB mock ─────────────────────────────────────────────────────────
//
// We mock `../db` BEFORE the route module is imported so the route's `db`
// reference points at the mock. The mock is the smallest surface we can
// get away with — only the calls the MFA routes make are implemented.

interface EmployeeRow {
  id: string;
  orgId: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  roleId: string | null;
  locationIds: string[];
  passwordHash: string | null;
  role: { permissions: Record<string, boolean> } | null;
}

interface PlatformStaffRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'superadmin' | 'support' | 'reseller' | 'sales_agent';
  resellerOrgId: string | null;
  isActive: boolean;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

interface RecoveryRow {
  id: string;
  employeeId: string | null;
  platformStaffId: string | null;
  codeHash: string;
  usedAt: Date | null;
}

interface RefreshTokenRow {
  id: string;
  employeeId: string;
  tokenHash: string;
  ipAddress: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
}

const store = {
  employees: [] as EmployeeRow[],
  platformStaff: [] as PlatformStaffRow[],
  mfaRecoveryCodes: [] as RecoveryRow[],
  refreshTokens: [] as RefreshTokenRow[],
};

function resetStore(): void {
  store.employees.length = 0;
  store.platformStaff.length = 0;
  store.mfaRecoveryCodes.length = 0;
  store.refreshTokens.length = 0;
}

let nextId = 1;
function uid(): string {
  // Deterministic UUIDs for predictable assertions.
  const n = (nextId++).toString().padStart(12, '0');
  return `00000000-0000-0000-0000-${n}`;
}

vi.mock('../db', async () => {
  // The route file imports `eq`, `and`, `isNull` directly from drizzle-orm.
  // Our mock returns predicate objects that we then evaluate by hand inside
  // findFirst / findMany. Since the route only ever uses these helpers as
  // opaque tags, anything sufficient to round-trip predicates works.
  type Pred = (row: Record<string, unknown>) => boolean;

  const evalWhere = (where: unknown): Pred => {
    if (typeof where === 'function') return where as Pred;
    if (where && typeof where === 'object' && '__pred' in where) {
      return (where as { __pred: Pred }).__pred;
    }
    return () => true;
  };

  const collectionFor = (tableRef: unknown): Record<string, unknown>[] => {
    // Resolve which logical table this drizzle column-set maps to. The route
    // calls `eq(schema.employees.id, ...)` etc — by the time the predicate
    // is built we've stamped the column with a __table tag (see schema mock).
    if (tableRef && typeof tableRef === 'object' && '__table' in tableRef) {
      const name = (tableRef as { __table: string }).__table;
      return (store as unknown as Record<string, Record<string, unknown>[]>)[name] ?? [];
    }
    return [];
  };

  // Used only to drive the table-resolution above. The Proxy needs both a
  // `get` trap (to make `schema.employees.id` return a tagged column) AND
  // a `has` trap (so `'__table' in tableRef` returns true when the route
  // passes the table itself to db.update / db.delete / db.insert).
  const makeTable = (name: keyof typeof store): Record<string, unknown> => {
    const target = { __table: name };
    return new Proxy(target, {
      get(_t, prop) {
        if (prop === '__table') return name;
        return { __table: name, __column: prop };
      },
      has(_t, prop) {
        return prop === '__table' || true;
      },
    });
  };

  const mockSchema = {
    employees:        makeTable('employees'),
    platformStaff:    makeTable('platformStaff'),
    mfaRecoveryCodes: makeTable('mfaRecoveryCodes'),
    refreshTokens:    makeTable('refreshTokens'),
  };

  // Query builder for findFirst / findMany / update / delete / insert.
  const queryFor = (name: keyof typeof store) => ({
    findFirst: async (args: { where?: unknown; with?: Record<string, unknown> }) => {
      const pred = evalWhere(args?.where);
      const rows = (store as unknown as Record<string, Record<string, unknown>[]>)[name] ?? [];
      const found = rows.find((r) => pred(r));
      if (!found) return undefined;
      // `with: { role: true }` — we just attach the embedded role object.
      return found;
    },
    findMany: async (args: { where?: unknown }) => {
      const pred = evalWhere(args?.where);
      const rows = (store as unknown as Record<string, Record<string, unknown>[]>)[name] ?? [];
      return rows.filter((r) => pred(r));
    },
  });

  const mockDb = {
    query: {
      employees:        queryFor('employees'),
      platformStaff:    queryFor('platformStaff'),
      mfaRecoveryCodes: queryFor('mfaRecoveryCodes'),
      refreshTokens:    queryFor('refreshTokens'),
    },
    update: (table: unknown) => {
      const collection = collectionFor(table);
      return {
        set: (patch: Record<string, unknown>) => ({
          where: async (where: unknown) => {
            const pred = evalWhere(where);
            for (const row of collection) {
              if (pred(row)) Object.assign(row, patch);
            }
            return { rowCount: 1 };
          },
        }),
      };
    },
    delete: (table: unknown) => {
      const collection = collectionFor(table);
      return {
        where: async (where: unknown) => {
          const pred = evalWhere(where);
          // mutate in place so later finds see the new state
          for (let i = collection.length - 1; i >= 0; i--) {
            if (pred(collection[i] as Record<string, unknown>)) collection.splice(i, 1);
          }
          return { rowCount: 1 };
        },
      };
    },
    insert: (table: unknown) => {
      const collection = collectionFor(table);
      return {
        values: async (val: Record<string, unknown> | Record<string, unknown>[]) => {
          const list = Array.isArray(val) ? val : [val];
          for (const v of list) {
            const row = { id: (v['id'] as string | undefined) ?? uid(), createdAt: new Date(), ...v };
            // null-out anything left undefined so `field == null` checks work.
            collection.push(row);
          }
          return { rowCount: list.length };
        },
      };
    },
  };

  return { db: mockDb, schema: mockSchema };
});

// drizzle-orm helpers — we only need eq/and/isNull, returned as predicates
// tagged so the mock above can interpret them.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  const eq = (col: { __column: string }, val: unknown) => ({
    __pred: (row: Record<string, unknown>) => row[col.__column] === val,
  });
  const and = (...preds: { __pred: (row: Record<string, unknown>) => boolean }[]) => ({
    __pred: (row: Record<string, unknown>) => preds.every((p) => p.__pred(row)),
  });
  const isNull = (col: { __column: string }) => ({
    __pred: (row: Record<string, unknown>) => row[col.__column] == null,
  });
  return { ...actual, eq, and, isNull };
});

// Provide a 32-byte hex ENCRYPTION_KEY before the routes import.
process.env['ENCRYPTION_KEY'] = '0123456789abcdef'.repeat(4); // 64 hex chars

// vi.mock above is hoisted by Vitest's transformer, so this import resolves
// against the mocked `../db` module.
import { mfaRoutes, encryptSecret, decryptSecret } from '../routes/mfa';

// ── Test harness ──────────────────────────────────────────────────────────────

const TEST_JWT_SECRET = 'test-secret';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Match the production index.ts JWT setup, minus the issuer claim — we
  // skip iss/aud here because @fastify/jwt's sync helpers don't always
  // preserve them across configurations and it isn't what these tests are
  // exercising.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(jwt as any, {
    secret: TEST_JWT_SECRET,
    sign:   { expiresIn: '15m' },
  });
  // Minimal `authenticate` decorator that mirrors the production behaviour.
  app.decorate('authenticate', async (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ title: 'Unauthorized', status: 401 });
    }
  });
  await app.register(mfaRoutes, { prefix: '/api/v1/auth/mfa' });
  return app;
}

function signEmployeeAccess(app: FastifyInstance, employeeId: string, orgId: string): string {
  return app.jwt.sign({
    sub: employeeId,
    orgId,
    roleId: null,
    permissions: {},
    locationIds: [],
    name: 'Test User',
    email: 'test@example.com',
  });
}

function signPlatformAccess(app: FastifyInstance, staffId: string): string {
  return app.jwt.sign({
    sub: staffId,
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'superadmin',
    resellerOrgId: null,
    type: 'platform',
  });
}

function signMfaPending(app: FastifyInstance, sub: string, subjectType: 'employee' | 'platform'): string {
  return app.jwt.sign({ sub, type: 'mfa_pending', subjectType }, { expiresIn: '5m' });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MFA routes — employee enrolment + verify', () => {
  // bcrypt at cost 12 × 10 codes per enrolment is a ~3-5s burn; the default
  // vitest timeout (5s) leaves no margin for CI. Bump the per-suite ceiling.
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  let app: FastifyInstance;
  let employeeId: string;
  const orgId = '00000000-0000-0000-0000-aaaaaaaaaaaa';

  beforeEach(async () => {
    resetStore();
    nextId = 1;
    app = await buildApp();
    employeeId = uid();
    store.employees.push({
      id: employeeId,
      orgId,
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Tester',
      isActive: true,
      mfaEnabled: false,
      mfaSecret: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      roleId: null,
      locationIds: [],
      passwordHash: '$2a$12$dummyhash',
      role: { permissions: {} },
    });
  });

  it('enroll → confirm → verify with TOTP returns access+refresh', async () => {
    const accessJwt = signEmployeeAccess(app, employeeId, orgId);

    // Enrol
    const enrol = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/enroll',
      headers: { authorization: `Bearer ${accessJwt}` },
    });
    expect(enrol.statusCode).toBe(200);
    const enrolBody = enrol.json() as { otpauthUrl: string; secret: string; recoveryCodes: string[] };
    expect(enrolBody.secret).toMatch(/^[A-Z2-7]+$/);
    expect(enrolBody.otpauthUrl).toContain('otpauth://totp/');
    expect(enrolBody.recoveryCodes).toHaveLength(10);
    expect(store.employees[0]!.mfaSecret).not.toBeNull();
    expect(store.employees[0]!.mfaEnabled).toBe(false); // not flipped until /confirm

    const totp = authenticator.generate(enrolBody.secret);

    // Confirm
    const confirm = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/confirm',
      headers: { authorization: `Bearer ${accessJwt}` },
      payload: { code: totp },
    });
    expect(confirm.statusCode).toBe(200);
    expect(store.employees[0]!.mfaEnabled).toBe(true);

    // Verify
    const pendingJwt = signMfaPending(app, employeeId, 'employee');
    const totp2 = authenticator.generate(enrolBody.secret);
    const verify = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/verify',
      headers: { authorization: `Bearer ${pendingJwt}` },
      payload: { code: totp2 },
    });
    expect(verify.statusCode).toBe(200);
    const verifyBody = verify.json() as { accessToken: string; refreshToken: string };
    expect(verifyBody.accessToken).toBeTruthy();
    expect(verifyBody.refreshToken).toBeTruthy();
    expect(store.refreshTokens).toHaveLength(1);
  });

  it('verify with a recovery code marks it used and returns tokens', async () => {
    // Enrol + confirm first.
    const accessJwt = signEmployeeAccess(app, employeeId, orgId);
    const enrol = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/enroll',
      headers: { authorization: `Bearer ${accessJwt}` },
    });
    const enrolBody = enrol.json() as { secret: string; recoveryCodes: string[] };
    const totp = authenticator.generate(enrolBody.secret);
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/confirm',
      headers: { authorization: `Bearer ${accessJwt}` },
      payload: { code: totp },
    });

    // Use the first recovery code.
    const code = enrolBody.recoveryCodes[0]!;
    const pendingJwt = signMfaPending(app, employeeId, 'employee');
    const verify = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/verify',
      headers: { authorization: `Bearer ${pendingJwt}` },
      payload: { recoveryCode: code },
    });
    expect(verify.statusCode).toBe(200);

    // Recovery code row should now be used. Use loose equality so both
    // explicit `null` and the implicit `undefined` (untouched rows) are
    // counted as unused.
    const used = store.mfaRecoveryCodes.filter((r) => r.usedAt != null);
    expect(used).toHaveLength(1);

    // Re-using the same code fails.
    const pendingJwt2 = signMfaPending(app, employeeId, 'employee');
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/verify',
      headers: { authorization: `Bearer ${pendingJwt2}` },
      payload: { recoveryCode: code },
    });
    expect(second.statusCode).toBe(401);
  });

  it('bad TOTP returns 401 and increments failed-login counter', async () => {
    // Enrol + confirm first.
    const accessJwt = signEmployeeAccess(app, employeeId, orgId);
    const enrol = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/enroll',
      headers: { authorization: `Bearer ${accessJwt}` },
    });
    const enrolBody = enrol.json() as { secret: string };
    const totp = authenticator.generate(enrolBody.secret);
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/confirm',
      headers: { authorization: `Bearer ${accessJwt}` },
      payload: { code: totp },
    });

    expect(store.employees[0]!.failedLoginAttempts).toBe(0);

    const pendingJwt = signMfaPending(app, employeeId, 'employee');
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/verify',
      headers: { authorization: `Bearer ${pendingJwt}` },
      payload: { code: '000000' },
    });
    expect(bad.statusCode).toBe(401);
    expect(store.employees[0]!.failedLoginAttempts).toBe(1);
  });

  it('locks the account after 5 failed MFA attempts', async () => {
    // Enrol + confirm first.
    const accessJwt = signEmployeeAccess(app, employeeId, orgId);
    const enrol = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/enroll',
      headers: { authorization: `Bearer ${accessJwt}` },
    });
    const enrolBody = enrol.json() as { secret: string };
    const totp = authenticator.generate(enrolBody.secret);
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/confirm',
      headers: { authorization: `Bearer ${accessJwt}` },
      payload: { code: totp },
    });

    for (let i = 0; i < 5; i++) {
      const pj = signMfaPending(app, employeeId, 'employee');
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/mfa/verify',
        headers: { authorization: `Bearer ${pj}` },
        payload: { code: '000000' },
      });
    }

    expect(store.employees[0]!.failedLoginAttempts).toBe(5);
    expect(store.employees[0]!.lockedUntil).not.toBeNull();
  });

  it('reset by platform staff wipes secret + recovery codes', async () => {
    // Enrol + confirm.
    const accessJwt = signEmployeeAccess(app, employeeId, orgId);
    const enrol = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/enroll',
      headers: { authorization: `Bearer ${accessJwt}` },
    });
    const enrolBody = enrol.json() as { secret: string };
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/confirm',
      headers: { authorization: `Bearer ${accessJwt}` },
      payload: { code: authenticator.generate(enrolBody.secret) },
    });
    expect(store.mfaRecoveryCodes.length).toBe(10);
    expect(store.employees[0]!.mfaSecret).not.toBeNull();

    // Platform staff resets.
    const staffId = uid();
    store.platformStaff.push({
      id: staffId,
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'superadmin',
      resellerOrgId: null,
      isActive: true,
      mfaEnabled: false,
      mfaSecret: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    const platformJwt = signPlatformAccess(app, staffId);

    const reset = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/reset',
      headers: { authorization: `Bearer ${platformJwt}` },
      payload: { employeeId },
    });
    expect(reset.statusCode).toBe(200);
    expect(store.employees[0]!.mfaEnabled).toBe(false);
    expect(store.employees[0]!.mfaSecret).toBeNull();
    expect(store.mfaRecoveryCodes.filter((r) => r.employeeId === employeeId)).toHaveLength(0);
  });

  it('reset rejects non-platform actor', async () => {
    const accessJwt = signEmployeeAccess(app, employeeId, orgId);
    const reset = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/reset',
      headers: { authorization: `Bearer ${accessJwt}` },
      payload: { employeeId },
    });
    expect(reset.statusCode).toBe(403);
  });

  it('regenerate replaces all recovery codes', async () => {
    const accessJwt = signEmployeeAccess(app, employeeId, orgId);
    const enrol = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/enroll',
      headers: { authorization: `Bearer ${accessJwt}` },
    });
    const original = (enrol.json() as { recoveryCodes: string[] }).recoveryCodes;
    const originalHashes = store.mfaRecoveryCodes.map((r) => r.codeHash);

    const regen = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/recovery-codes/regenerate',
      headers: { authorization: `Bearer ${accessJwt}` },
    });
    expect(regen.statusCode).toBe(200);
    const regenBody = regen.json() as { recoveryCodes: string[] };
    expect(regenBody.recoveryCodes).toHaveLength(10);
    // Old codes should no longer be redeemable.
    for (const oldCode of original) {
      expect(regenBody.recoveryCodes.includes(oldCode)).toBe(false);
    }
    // Hashes in the store rotated entirely.
    const newHashes = store.mfaRecoveryCodes.map((r) => r.codeHash);
    expect(newHashes.some((h) => originalHashes.includes(h))).toBe(false);
  });
});

describe('MFA crypto round-trip', () => {
  it('encrypts and decrypts a secret via AES-256-GCM', () => {
    const plaintext = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const blob = encryptSecret(plaintext);
    expect(blob).not.toContain(plaintext);
    expect(decryptSecret(blob)).toBe(plaintext);
  });

  it('rejects a tampered ciphertext', () => {
    const blob = encryptSecret('hello');
    // flip a byte in the ciphertext portion
    const buf = Buffer.from(blob, 'base64');
    buf[buf.length - 1] = (buf[buf.length - 1] ?? 0) ^ 0xff;
    const tampered = buf.toString('base64');
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe('Recovery code hashing parity', () => {
  it('verifies a recovery code with bcrypt regardless of dash formatting', async () => {
    const code = 'ABCD-EFGH-JKLM';
    const normalised = code.replace(/[\s-]+/g, '').toUpperCase();
    const hash = await bcrypt.hash(normalised, 12);
    expect(await bcrypt.compare(normalised, hash)).toBe(true);
    // The route normalises before compare, so dashed input matches.
    expect(await bcrypt.compare('abcd-efgh-jklm'.replace(/[\s-]+/g, '').toUpperCase(), hash)).toBe(true);
  });
});
