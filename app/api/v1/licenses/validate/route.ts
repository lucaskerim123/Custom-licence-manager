import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { validateLicense } from '../../../../../lib/core/licenses';

function requestIp(request: Request) {
  return request.headers.get('x-real-ip')?.trim() || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}

function telemetry(body: any) {
  const source = body?.telemetry && typeof body.telemetry === 'object' ? body.telemetry : {};
  const allowed = ['hostname', 'platform', 'architecture', 'client', 'clientVersion', 'provider', 'region', 'components'];
  return Object.fromEntries(
    allowed
      .filter((key) => source[key] !== undefined && source[key] !== null && source[key] !== '')
      .map((key) => [key, source[key]]),
  );
}

/**
 * Public customer/runtime license validation endpoint.
 *
 * Authentication is the license key in the request body. This endpoint must
 * not require a License Master integration token because every OrbitFS
 * installation is an independent client of the central authority.
 *
 * Administrative, issuance, release, and control endpoints remain protected
 * by the License Master integration/admin authentication layer.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const key = String(body?.license_key ?? body?.licenseKey ?? '').trim();
  const product = String(body?.product ?? body?.product_code ?? '').trim().toLowerCase();
  const component = String(body?.component ?? body?.component_code ?? '').trim().toLowerCase();
  const installationId = String(body?.installation_id ?? body?.installationId ?? '').trim();

  if (!key || !product || (product === 'orbitfs' && !component)) {
    return NextResponse.json({ valid: false, code: 'INVALID_REQUEST' }, { status: 400 });
  }

  try {
    const result = await validateLicense({
      key,
      productSlug: product,
      componentSlug: component || undefined,
      installationId: installationId || undefined,
      productVersion:
        body?.product_version ?? body?.productVersion
          ? String(body?.product_version ?? body?.productVersion)
          : undefined,
      metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
      requestIp: requestIp(request),
      userAgent: request.headers.get('user-agent'),
      telemetry: telemetry(body),
    });

    return NextResponse.json(
      {
        valid: result.valid,
        code: result.code,
        expires_at: result.expires_at ?? null,
        expiresAt: result.expires_at ?? null,
        metadata: result.metadata ?? {},
        license_id: result.license_id ?? null,
      },
      { status: result.status },
    );
  } catch {
    return NextResponse.json({ valid: false, code: 'SERVER_ERROR' }, { status: 500 });
  }
}
