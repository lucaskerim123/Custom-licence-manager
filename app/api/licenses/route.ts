import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../lib/auth';
import { db } from '../../../lib/db';
import { issueLicense } from '../../../lib/core/licenses';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await integrationAuthorized(request, 'license.manage') || await integrationAuthorized(request, 'license.issue');
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' }, { status: 401 });
  const url = new URL(request.url);
  const product = url.searchParams.get('product')?.toLowerCase();
  const params: any[] = [];
  let where = 'where 1=1';
  if (product) { params.push(product); where += ' and p.slug=$1'; }
  try {
    const licenses = (await db().query(`select l.id,l.status,l.expires_at,l.external_reference,p.slug product,p.name product_name,l.customer_external_id,l.created_at,l.license_key_last4 from licenses l join products p on p.id=l.product_id ${where} order by l.created_at desc limit 200`, params)).rows;
    return NextResponse.json({ licenses });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'LICENSE_LIST_FAILED', code: 'LICENSE_LIST_FAILED' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await integrationAuthorized(request, 'license.issue') || await integrationAuthorized(request, 'license.manage');
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const product = String(body?.product ?? body?.product_code ?? body?.productCode ?? '').trim().toLowerCase();
  if (!product) return NextResponse.json({ error: 'product is required', code: 'PRODUCT_REQUIRED' }, { status: 400 });
  try {
    const p = (await db().query("select id from products where slug=$1 and status='active'", [product])).rows[0];
    if (!p) return NextResponse.json({ error: 'PRODUCT_NOT_FOUND', code: 'PRODUCT_NOT_FOUND', product }, { status: 404 });
    const expiresAt = body?.expires_at || body?.expiresAt ? new Date(String(body.expires_at ?? body.expiresAt)) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) return NextResponse.json({ error: 'INVALID_EXPIRY', code: 'INVALID_EXPIRY' }, { status: 400 });
    const result = await issueLicense({
      productId: p.id,
      customerExternalId: body?.customer_external_id ?? body?.customerRef ?? null,
      customerOverride: Boolean(body?.customer_override ?? body?.customerOverride),
      externalReference: body?.external_reference ?? body?.orderRef ?? null,
      expiresAt,
      actor: `api:${auth.name}`,
      metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    });
    const license = { id: result.id, license_key: result.key, license_id: result.id, status: result.status, issued_at: result.issued_at, expires_at: result.expires_at, already_issued: Boolean((result as any).alreadyIssued) };
    return NextResponse.json({ ...license, license });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'LICENSE_ISSUE_FAILED', code: 'LICENSE_ISSUE_FAILED' }, { status: 500 });
  }
}
