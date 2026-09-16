import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../lib/auth';
import { db } from '../../../../lib/db';
import { issueLicense } from '../../../../lib/core/licenses';

export async function POST(request: Request) {
  if (!integrationAuthorized(request)) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const product = String(body?.product ?? '').trim().toLowerCase();
  if (!product) return NextResponse.json({ error: 'product is required' }, { status: 400 });
  const p = (await db().query("select id from products where slug=$1 and status='active'", [product])).rows[0];
  if (!p) return NextResponse.json({ error: 'PRODUCT_NOT_FOUND' }, { status: 404 });
  let expiresAt: Date | null = null;
  if (body?.expires_at) { expiresAt = new Date(String(body.expires_at)); if (Number.isNaN(expiresAt.getTime())) return NextResponse.json({ error: 'INVALID_EXPIRY' }, { status: 400 }); }
  const result = await issueLicense({ productId: p.id, customerExternalId: body?.customer_external_id ? String(body.customer_external_id) : null, externalReference: body?.external_reference ? String(body.external_reference) : null, expiresAt, actor: 'integration-api', metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : {} });
  return NextResponse.json({ id: result.id, license_key: result.key, status: result.status, expires_at: result.expires_at ?? null });
}
