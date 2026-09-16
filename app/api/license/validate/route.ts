import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '../../../../lib/db';

function hash(value: string) { return crypto.createHash('sha256').update(value).digest('hex'); }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const key = String(body.license_key ?? '');
    const product = String(body.product ?? '');
    const installationId = String(body.installation_id ?? '');
    if (!key || !product) return NextResponse.json({ valid:false, code:'INVALID_REQUEST' }, { status:400 });
    const pool = db();
    const system = await pool.query('select system_enabled, licensing_enabled, maintenance_mode from system_settings where id=true');
    const state = system.rows[0];
    if (!state?.system_enabled || !state?.licensing_enabled || state?.maintenance_mode) return NextResponse.json({ valid:false, code:'AUTHORITY_UNAVAILABLE' }, { status:503 });
    const result = await pool.query(`select l.id,l.status,l.expires_at,l.metadata,p.slug product from licenses l join products p on p.id=l.product_id where l.license_key_hash=$1 and p.slug=$2 limit 1`, [hash(key), product]);
    if (!result.rowCount) return NextResponse.json({ valid:false, code:'LICENSE_NOT_FOUND' }, { status:404 });
    const l = result.rows[0];
    const expired = l.expires_at && new Date(l.expires_at).getTime() < Date.now();
    const valid = l.status === 'active' && !expired;
    if (installationId && valid) await pool.query(`insert into activations(license_id,installation_id,product_version) values($1,$2,$3) on conflict(license_id,installation_id) do update set last_seen_at=now(),product_version=excluded.product_version`, [l.id, installationId, body.product_version ?? null]);
    return NextResponse.json({ valid, code: valid ? 'LICENSE_VALID' : (expired ? 'LICENSE_EXPIRED' : `LICENSE_${String(l.status).toUpperCase()}`), expires_at:l.expires_at ?? null, metadata:l.metadata ?? {} });
  } catch { return NextResponse.json({ valid:false, code:'SERVER_ERROR' }, { status:500 }); }
}
