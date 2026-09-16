import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../lib/auth';
import { validateLicense } from '../../../../lib/core/licenses';

export async function POST(request: Request) {
  const auth = await integrationAuthorized(request, 'license.validate');
  if (!auth) return NextResponse.json({ valid: false, code: 'UNAUTHORIZED' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const key = String(body?.licenseKey ?? body?.license_key ?? '').trim();
  const product = String(body?.product ?? body?.product_code ?? '').trim().toLowerCase();
  const installationId = String(body?.installationId ?? body?.installation_id ?? '').trim();
  if (!key || !product) return NextResponse.json({ valid: false, code: 'INVALID_REQUEST' }, { status: 400 });
  try {
    const result = await validateLicense({
      key,
      productSlug: product,
      installationId: installationId || undefined,
      productVersion: body?.productVersion ?? body?.product_version ? String(body?.productVersion ?? body?.product_version) : undefined,
      metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
    });
    return NextResponse.json({
      valid: result.valid,
      code: result.code,
      expires_at: result.expires_at ?? null,
      expiresAt: result.expires_at ?? null,
      metadata: result.metadata ?? {},
    }, { status: result.status });
  } catch {
    return NextResponse.json({ valid: false, code: 'SERVER_ERROR' }, { status: 500 });
  }
}
