import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../lib/auth';
import { db } from '../../../../lib/db';
import { createRelease, getLatestRelease } from '../../../../lib/core/releases';

export async function GET(request: Request) {
  if (!integrationAuthorized(request)) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const url = new URL(request.url);
  const product = url.searchParams.get('product')?.toLowerCase();
  if (!product) return NextResponse.json({ error: 'product is required' }, { status: 400 });
  const channel = url.searchParams.get('channel') || 'stable';
  const type = (url.searchParams.get('type') || 'update') as 'base' | 'update';
  if (type !== 'base' && type !== 'update') return NextResponse.json({ error: 'INVALID_TYPE' }, { status: 400 });
  const settings = (await db().query('select system_enabled,release_system_enabled,deployment_enabled from system_settings where id=true')).rows[0];
  if (!settings?.system_enabled || !settings.release_system_enabled || (type === 'base' && !settings.deployment_enabled)) return NextResponse.json({ error: 'AUTHORITY_UNAVAILABLE' }, { status: 503 });
  const release = await getLatestRelease(product, channel, type);
  if (!release) return NextResponse.json({ error: 'RELEASE_NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ release });
}

export async function POST(request: Request) {
  if (!integrationAuthorized(request)) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const product = String(body?.product ?? '').toLowerCase();
  const p = (await db().query("select id from products where slug=$1 and status='active'", [product])).rows[0];
  if (!p) return NextResponse.json({ error: 'PRODUCT_NOT_FOUND' }, { status: 404 });
  if (!body?.version || !body?.artifact_url) return NextResponse.json({ error: 'version and artifact_url are required' }, { status: 400 });
  const type = body?.release_type === 'base' ? 'base' : 'update';
  const row = await createRelease({ productId:p.id, channel:String(body?.channel||'stable').toLowerCase(), version:String(body.version), releaseType:type, sourceRepo:body?.source_repo?String(body.source_repo):null, sourceRef:body?.source_ref?String(body.source_ref):null, artifactUrl:String(body.artifact_url), checksum:body?.checksum?String(body.checksum):null, notes:body?.notes?String(body.notes):null, publish:Boolean(body?.publish) });
  return NextResponse.json({ release: row }, { status: 201 });
}
