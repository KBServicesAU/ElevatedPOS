import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://elevatedpos:elevatedpos_dev@localhost:5432/elevatedpos_dev',
  min: Number(process.env['DATABASE_POOL_MIN'] ?? 2),
  max: Number(process.env['DATABASE_POOL_MAX'] ?? 10),
  ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
export { schema };
