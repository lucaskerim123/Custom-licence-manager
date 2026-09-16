import { NextResponse } from 'next/server';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { integrationAuthorized } from '../../../../lib/auth';
import { db } from '../../../../lib/db';

const VERCEL_API = 'https://api.vercel.com';
const MAX_MANIFEST_BYTES = 50 * 1024 * 1024;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

type ManifestFile = { file: string; data: string; encoding?: 'base64' | 'utf8' };

function teamPath(path: string, teamId?: string | null) {
  if (!teamId) return path;
  const url = new URL(path, VERCEL_API);
  url.searchParams.set('teamId', teamId);
  return url.pathname + url.search;
}

async function vercelRequest(path: string, token: string, teamId: string | null, init: RequestInit = {}) {
  const response = await fetch(`${VERCEL_API}${teamPath(path, teamId)}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || data?.error || `Vercel API ${response.status}`), { status: response.status, data });
  return data;
}

async function uploadFile(token: string, teamId: string | null, file: ManifestFile) {
  const bytes = file.encoding === 'base64' ? Buffer.from(file.data, 'base64') : Buffer.from(file.data, 'utf8');
  if (bytes.length > MAX_FILE_BYTES) throw new Error(`Release file is too large: ${file.file}`);
  const sha = createHash('sha1').update(bytes).digest('hex');
  const response = await fetch(`${VERCEL_API}${teamPath('/v2/files', teamId)}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.length),
      'x-vercel-digest': sha,
    },
    body: new Uint8Array(bytes),
  });
  if (!response.ok && response.status !== 409) {
    throw new Error(`Vercel file upload failed for ${file.file}: ${await response.text()}`);
  }
  return { file: file.file, sha, size: bytes.length };
}

async function loadRelease(id: string) {
  const result = await db().query(
    `select r.*,p.slug product from releases r join products p on p.id=r.product_id where r.id=$1 limit 1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function POST(request: Request) {
  const actor = await integrationAuthorized(request, 'deployment.write');
  if (!actor) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const settings = (await db().query('select system_enabled,deployment_enabled from system_settings where id=true')).rows[0];
  if (!settings?.system_enabled || !settings.deployment_enabled) return NextResponse.json({ error: 'AUTHORITY_UNAVAILABLE' }, { status: 503 });

  try {
    const input = await request.json();
    const releaseId = String(input.releaseId || '').trim();
    const vercelAccessToken = String(input.vercelAccessToken || '').trim();
    const vercelProjectId = String(input.vercelProjectId || '').trim();
    const vercelProjectName = String(input.vercelProjectName || '').trim();
    const vercelTeamId = input.vercelTeamId ? String(input.vercelTeamId) : null;
    const action = String(input.action || 'deploy');
    if (!releaseId || !vercelAccessToken || (!vercelProjectId && !vercelProjectName)) {
      return NextResponse.json({ error: 'RELEASE_AND_VERCEL_TARGET_REQUIRED' }, { status: 400 });
    }

    const release = await loadRelease(releaseId);
    if (!release) return NextResponse.json({ error: 'RELEASE_NOT_FOUND' }, { status: 404 });
    if (release.status !== 'published' || release.review_status !== 'approved') return NextResponse.json({ error: 'RELEASE_NOT_DEPLOYABLE' }, { status: 409 });
    if (!release.artifact_url) return NextResponse.json({ error: 'RELEASE_ARTIFACT_NOT_CONFIGURED' }, { status: 409 });

    const artifactResponse = await fetch(release.artifact_url, { redirect: 'follow', cache: 'no-store' });
    if (!artifactResponse.ok) return NextResponse.json({ error: `RELEASE_ARTIFACT_FETCH_FAILED_${artifactResponse.status}` }, { status: 502 });
    const compressed = Buffer.from(await artifactResponse.arrayBuffer());
    if (compressed.length > MAX_MANIFEST_BYTES) return NextResponse.json({ error: 'RELEASE_ARTIFACT_TOO_LARGE' }, { status: 413 });
    const manifest: any = JSON.parse(gunzipSync(compressed).toString('utf8'));
    const files: ManifestFile[] = Array.isArray(manifest.files) ? manifest.files : [];
    if (!files.length) return NextResponse.json({ error: 'RELEASE_ARTIFACT_HAS_NO_FILES' }, { status: 422 });

    await db().query(`update releases set deployment_status='deploying' where id=$1`, [releaseId]);

    const uploaded = [];
    for (const file of files) {
      if (!file?.file || typeof file.data !== 'string') continue;
      uploaded.push(await uploadFile(vercelAccessToken, vercelTeamId, file));
    }
    if (!uploaded.length) throw new Error('Release artifact contained no deployable files');

    const deployment = await vercelRequest('/v13/deployments', vercelAccessToken, vercelTeamId, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: vercelProjectName || undefined,
        project: vercelProjectId || undefined,
        target: 'production',
        files: uploaded,
        env: input.env || {},
        projectSettings: manifest.projectSettings || {},
      }),
    });

    await db().query(`update releases set deployment_status='deployed',vercel_ready=true where id=$1`, [releaseId]);
    return NextResponse.json({
      ok: true,
      result: {
        projectId: vercelProjectId || deployment.projectId || null,
        projectName: vercelProjectName || deployment.name || null,
        deploymentId: deployment.id || deployment.uid || null,
        deploymentUrl: deployment.url ? `https://${deployment.url}` : (deployment.alias?.[0] ? `https://${deployment.alias[0]}` : null),
        state: deployment.readyState || deployment.state || 'BUILDING',
        action,
        releaseId,
        version: release.version,
      },
    });
  } catch (error: any) {
    const message = String(error?.message || 'Deployment failed');
    try {
      const input = await request.clone().json();
      if (input?.releaseId) await db().query(`update releases set deployment_status='failed' where id=$1`, [String(input.releaseId)]);
    } catch {}
    return NextResponse.json({ error: message }, { status: Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 502 });
  }
}

export async function GET(request: Request) {
  const actor = await integrationAuthorized(request, 'deployment.read');
  if (!actor) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const url = new URL(request.url);
  const releaseId = url.searchParams.get('releaseId');
  const result = releaseId
    ? await db().query(`select id,version,release_type,deployment_status,vercel_ready,supabase_ready,published_at from releases where id=$1`, [releaseId])
    : await db().query(`select id,version,release_type,deployment_status,vercel_ready,supabase_ready,published_at from releases order by created_at desc limit 100`);
  return NextResponse.json({ deployments: result.rows });
}
