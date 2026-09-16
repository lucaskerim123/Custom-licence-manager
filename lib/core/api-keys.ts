import crypto from 'node:crypto';
import { db } from '../db';

export type ApiScope = 'license.issue' | 'license.validate' | 'license.manage' | 'releases.read' | 'releases.write' | 'deployment.read' | 'deployment.write';

function hashKey(value: string) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function generateApiKey() {
  return `lm_${crypto.randomBytes(32).toString('base64url')}`;
}

export async function createApiKey(input: { name: string; scopes: ApiScope[]; actorUserId: string }) {
  const key = generateApiKey();
  const scopes = Array.from(new Set(input.scopes));
  const result = await db().query(`insert into api_keys(name,key_hash,key_last4,scopes,created_by) values($1,$2,$3,$4,$5) returning id,name,key_last4,scopes,status,created_at`, [input.name.trim(), hashKey(key), key.slice(-4), JSON.stringify(scopes), input.actorUserId]);
  return { ...result.rows[0], key };
}

function scopeAllows(granted: ApiScope[], required: ApiScope) {
  if (granted.includes(required)) return true;
  if (granted.includes('license.manage') && ['license.issue', 'license.validate'].includes(required)) return true;
  // Compatibility for API keys created by the old Billing Store form, which
  // incorrectly defaulted to license.validate. Those keys must be able to
  // provision a paid order, but do not receive license.manage privileges.
  if (granted.includes('license.validate') && required === 'license.issue') return true;
  if (granted.includes('releases.write') && required === 'releases.read') return true;
  if (granted.includes('deployment.write') && required === 'deployment.read') return true;
  return false;
}

export async function authenticateApiKey(request: Request, requiredScope?: ApiScope) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const key = header.slice(7).trim();
  if (!key) return null;
  const result = await db().query(`select id,name,scopes,status from api_keys where key_hash=$1 limit 1`, [hashKey(key)]);
  const client = result.rows[0];
  if (!client || client.status !== 'active') return null;
  const scopes: ApiScope[] = Array.isArray(client.scopes) ? client.scopes : [];
  if (requiredScope && !scopeAllows(scopes, requiredScope)) return null;
  await db().query(`update api_keys set last_used_at=now() where id=$1`, [client.id]);
  return { ...client, scopes };
}

export async function revokeApiKey(id: string, actorUserId: string) {
  const result = await db().query(`update api_keys set status='revoked',revoked_at=now(),revoked_by=$2 where id=$1 and status='active' returning id`, [id, actorUserId]);
  return Boolean(result.rowCount);
}

export async function listApiKeys() {
  return (await db().query(`select id,name,key_last4,scopes,status,created_at,last_used_at,revoked_at from api_keys order by created_at desc`)).rows;
}
