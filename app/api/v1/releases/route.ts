import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../lib/auth';
import { db } from '../../../../lib/db';
import { createRelease } from '../../../../lib/core/releases';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    if (!(await integrationAuthorized(request, 'releases.read'))) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    const url = new URL(request.url);
    const product = url.searchParams.get('product')?.toLowerCase();
    if (!product) return NextResponse.json({ error: 'product is required' }, { status: 400 });
    const channel = url.searchParams.get('channel') || 'stable';
    const type = (url.searchParams.get('type') || 'update') as 'base' | 'update';
    if (type !== 'base' && type !== 'update') return NextResponse.json({ error: 'INVALID_TYPE' }, { status: 400 });
    const settings = (await db().query('select system_enabled,release_system_enabled,deployment_enabled from system_settings where id=true')).rows[0];
    if (!settings?.system_enabled || !settings.release_system_enabled || (type === 'base' && !settings.deployment_enabled)) return NextResponse.json({ error: 'AUTHORITY_UNAVAILABLE' }, { status: 503 });
    const result = await db().query(`select r.*,p.slug product,p.name product_name from releases r join products p on p.id=r.product_id where p.slug=$1 and r.channel=$2 and r.release_type=$3 order by r.published_at desc nulls last,r.created_at desc limit 100`, [product, channel, type]);
    const releases = result.rows;
    return NextResponse.json({ releases, release: releases[0] || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to list releases' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await integrationAuthorized(request, 'releases.write'))) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
    const product = String(body.product ?? '').trim().toLowerCase();
    const version = String(body.version ?? '').trim();
    const artifactUrl = String(body.artifact_url ?? '').trim() || null;
    const releaseType = String(body.release_type ?? 'update').trim().toLowerCase();
    const channel = String(body.channel ?? 'stable').trim().toLowerCase();
    if (!product || !version) return NextResponse.json({ error: 'product and version are required' }, { status: 400 });
    if (releaseType !== 'base' && releaseType !== 'update') return NextResponse.json({ error: 'INVALID_RELEASE_TYPE' }, { status: 400 });
    const pool = db();
    const settings = (await pool.query('select system_enabled,release_system_enabled,deployment_enabled from system_settings where id=true')).rows[0];
    if (!settings?.system_enabled || !settings.release_system_enabled || (releaseType === 'base' && !settings.deployment_enabled)) return NextResponse.json({ error: 'AUTHORITY_UNAVAILABLE' }, { status: 503 });
    const p = (await pool.query("select id from products where slug=$1 and status='active'", [product])).rows[0];
    if (!p) return NextResponse.json({ error: 'PRODUCT_NOT_FOUND', product }, { status: 404 });
    const existing = (await pool.query(`select id,status,review_status,artifact_url from releases where product_id=$1 and channel=$2 and version=$3 and release_type=$4`, [p.id, channel, version, releaseType])).rows[0];
    if (existing) return NextResponse.json({ ok: true, duplicate: true, release: existing }, { status: 200 });
    const row = await createRelease({
      productId: p.id, channel, version, releaseType,
      sourceRepo: body.source_repo ? String(body.source_repo) : null,
      sourceRef: body.source_ref ? String(body.source_ref) : 'release',
      artifactUrl,
      checksum: body.checksum ? String(body.checksum) : null,
      notes: body.notes ? String(body.notes) : null,
      publish: false, reviewStatus: 'pending', deploymentStatus: 'not_started',
      sourceSha: body.source_sha ? String(body.source_sha) : null,
      artifactName: body.artifact_name ? String(body.artifact_name) : null,
      artifactRepo: body.artifact_repo ? String(body.artifact_repo) : (releaseType === 'base' ? 'lucaskerim123/V1-vercel-base' : 'lucaskerim123/V1-vercel-engine'),
      artifactRunId: body.artifact_run_id ? Number(body.artifact_run_id) : null,
      vercelReady: Boolean(body.vercel_ready), supabaseReady: Boolean(body.supabase_ready),
      customerPublicationRepo: body.customer_publication_repo ? String(body.customer_publication_repo) : 'lucaskerim123/V2_Billing_Store',
      manifest: body.manifest && typeof body.manifest === 'object' ? body.manifest : {},
      actor: 'orbitfs-release-api'
    });
    return NextResponse.json({ ok: true, release: row, status: row.status, review_status: row.review_status }, { status: 201 });
  } catch (error) {
    console.error('POST /api/v1/releases failed', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create release' }, { status: 503 });
  }
}
