import { drizzle } from 'drizzle-orm/node-postgres';
import * as pg from 'pg';
import * as schema from './schema';

const { Pool } = pg;

// Use environment variable or default to a local dev db
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/trading_db',
});

export const db = drizzle(pool, { schema });