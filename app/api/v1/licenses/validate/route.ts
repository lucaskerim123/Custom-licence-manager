import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { validateLicense } from '../../../../../lib/core/licenses';
import { normalizeProductSlug } from '../../../../../lib/core/products';

function requestIp(request: Request) {
  return request.headers.get('x-real-ip')?.trim() || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}

function telemetry(body: any) {
  const source=body?.telemetry && typeof body.telemetry==='object' ? body.telemetry : {};
  const allowed=['hostname','platform','architecture','client','clientVersion','provider','region','components'];
  return Object.fromEntries(allowed.filter((key)=>source[key]!==undefined&&source[key]!==null&&source[key]!=='').map((key)=>[key,source[key]]));
}

export async function POST(request: Request) {
  if (!(await integrationAuthorized(request))) return NextResponse.json({ valid: false, code: 'UNAUTHORIZED' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const key = String(body?.license_key ?? '').trim();
  const product = normalizeProductSlug(String(body?.product ?? ''));
  const installationId = String(body?.installation_id ?? '').trim();
  if (!key || !product) return NextResponse.json({ valid: false, code: 'INVALID_REQUEST' }, { status: 400 });
  const result = await validateLicense({ key, productSlug: product, installationId: installationId || undefined, productVersion: body?.product_version ? String(body.product_version) : undefined, metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : undefined, requestIp: requestIp(request), userAgent: request.headers.get('user-agent'), telemetry: telemetry(body) });
  return NextResponse.json({ valid: result.valid, code: result.code, expires_at: result.expires_at ?? null, metadata: result.metadata ?? {}, license_id: result.license_id ?? null }, { status: result.status });
}
