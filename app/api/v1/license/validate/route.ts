import { NextResponse } from 'next/server';
import { validateLicense, recordInstallationCheckIn } from '../../../../lib/core/licenses';

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
  const installationId = String(body?.installation_id ?? body?.installationId ?? '').trim();

  if (!key || !product) {
    return NextResponse.json({ valid: false, code: 'INVALID_REQUEST' }, { status: 400 });
  }

  try {
    const result = await validateLicense({
      key,
      productSlug: product,
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

    if (result.valid && String(body?.action || 'validate').toLowerCase() === 'check_in') {
      if (!result.license_id || !installationId) {
        return NextResponse.json({ valid: false, code: 'INSTALLATION_ID_REQUIRED' }, { status: 400 });
      }

      await recordInstallationCheckIn({
        licenseId: String(result.license_id),
        installationId,
        action:
          ['deploy', 'update', 'redeploy', 'rollback', 'check_in'].includes(
            String(body?.deployment_action || body?.action_name || 'check_in').toLowerCase(),
          )
            ? (String(body?.deployment_action || body?.action_name || 'check_in').toLowerCase() as any)
            : 'check_in',
        phase:
          ['started', 'completed', 'failed'].includes(String(body?.phase || 'completed').toLowerCase())
            ? (String(body?.phase || 'completed').toLowerCase() as any)
            : 'completed',
        product,
        productVersion:
          body?.product_version ?? body?.productVersion
            ? String(body?.product_version ?? body?.productVersion)
            : null,
        previousVersion:
          body?.previous_version ?? body?.previousVersion
            ? String(body?.previous_version ?? body?.previousVersion)
            : null,
        releaseId:
          body?.release_id ?? body?.releaseId
            ? String(body?.release_id ?? body?.releaseId)
            : null,
        deploymentId:
          body?.deployment_id ?? body?.deploymentId
            ? String(body?.deployment_id ?? body?.deploymentId)
            : null,
        deploymentUrl:
          body?.deployment_url ?? body?.deploymentUrl
            ? String(body?.deployment_url ?? body?.deploymentUrl)
            : null,
        projectId:
          body?.project_id ?? body?.projectId
            ? String(body?.project_id ?? body?.projectId)
            : null,
        projectName:
          body?.project_name ?? body?.projectName
            ? String(body?.project_name ?? body?.projectName)
            : null,
        provider: body?.provider ? String(body.provider) : 'vercel',
        region: body?.region ? String(body.region) : null,
        platform: body?.platform ? String(body.platform) : 'vercel',
        architecture: body?.architecture ? String(body.architecture) : null,
        hostname: body?.hostname ? String(body.hostname) : null,
        client: body?.client ? String(body.client) : 'orbitfs-client',
        clientVersion:
          body?.client_version ?? body?.clientVersion
            ? String(body?.client_version ?? body?.clientVersion)
            : null,
        customerIdentity: body?.customer_identity ?? body?.customerIdentity ?? null,
        details: body?.details && typeof body.details === 'object' ? body.details : {},
      });
    }

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
