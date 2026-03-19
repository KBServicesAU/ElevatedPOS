import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://nexus:nexus_dev@localhost:5432/nexus_dev',
  min: Number(process.env['DATABASE_POOL_MIN'] ?? 2),
  max: Number(process.env['DATABASE_POOL_MAX'] ?? 10),
});

export const db = drizzle(pool, { schema });
export { schema };
