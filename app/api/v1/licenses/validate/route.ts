import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { validateLicense } from '../../../../../lib/core/licenses';

export async function POST(request: Request) {
  if (!integrationAuthorized(request)) return NextResponse.json({ valid: false, code: 'UNAUTHORIZED' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const key = String(body?.license_key ?? '').trim();
  const product = String(body?.product ?? '').trim().toLowerCase();
  const installationId = String(body?.installation_id ?? '').trim();
  if (!key || !product) return NextResponse.json({ valid: false, code: 'INVALID_REQUEST' }, { status: 400 });
  const result = await validateLicense({ key, productSlug: product, installationId: installationId || undefined, productVersion: body?.product_version ? String(body.product_version) : undefined, metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : undefined });
  return NextResponse.json({ valid: result.valid, code: result.code, expires_at: result.expires_at ?? null, metadata: result.metadata ?? {} }, { status: result.status });
}
