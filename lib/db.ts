import { Pool } from 'pg';

let pool: Pool | undefined;

function connectionString() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not configured');

  // Supabase direct database hostnames can require IPv6 and are unreliable from
  // some serverless environments. When the configured URL is a Supabase direct
  // URL, transparently use the regional Supavisor transaction pooler instead.
  // An explicit SUPABASE_POOLER_HOST always wins, so this remains portable.
  try {
    const url = new URL(raw);
    if (url.hostname.startsWith('db.') && url.hostname.endsWith('.supabase.co')) {
      const ref = url.hostname.slice(3, -'.supabase.co'.length);
      const poolerHost = process.env.SUPABASE_POOLER_HOST || 'aws-0-ap-southeast-2.pooler.supabase.com';
      url.hostname = poolerHost;
      url.port = '6543';
      if (url.username === 'postgres') url.username = `postgres.${ref}`;
      return url.toString();
    }
  } catch {
    // Let pg report an invalid DATABASE_URL rather than hiding configuration errors.
  }
  return raw;
}

export function db() {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionString(),
      max: 5,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}
