import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../../lib/auth';
import { db } from '../../../../../../lib/db';
import { gunzipSync } from 'node:zlib';

export const runtime = 'nodejs';

function githubAssetUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname !== 'api.github.com') return null;
    const match = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases\/assets\/(\d+)$/);
    if (!match) return null;
    return { owner: match[1], repo: match[2], assetId: match[3] };
  } catch { return null; }
}

async function githubRequest(path: string, init: RequestInit = {}) {
  const token = String(process.env.GITHUB_RELEASE_TOKEN || '').trim();
  if (!token) throw new Error('GITHUB_RELEASE_TOKEN_NOT_CONFIGURED');
  const response = await fetch(`https://api.github.com${path}`, {
    ...init, cache: 'no-store',
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2026-03-10', 'user-agent': 'OrbitFS-License-Master', ...(init.headers || {}) }
  });
  const text = await response.text();
  let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) throw new Error(data?.message || `GitHub API failed (${response.status})`);
  return data;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await integrationAuthorized(request, 'releases.read'))) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const result = await db().query(`select r.id,r.artifact_url,r.status,r.review_status,r.product_id,r.release_type,r.artifact_name from releases r where r.id=$1 limit 1`, [id]);
  const release = result.rows[0];
  if (!release) return NextResponse.json({ error: 'RELEASE_NOT_FOUND' }, { status: 404 });
  if (release.status !== 'published' || release.review_status !== 'approved') return NextResponse.json({ error: 'RELEASE_NOT_AVAILABLE' }, { status: 409 });
  if (!release.artifact_url) return NextResponse.json({ error: 'RELEASE_ARTIFACT_NOT_CONFIGURED' }, { status: 404 });
  const github = githubAssetUrl(String(release.artifact_url));
  if (!github) return NextResponse.redirect(release.artifact_url, 302);
  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(github.owner)}/${encodeURIComponent(github.repo)}/releases/assets/${github.assetId}`, { headers: { accept: 'application/octet-stream', authorization: `Bearer ${String(process.env.GITHUB_RELEASE_TOKEN || '').trim()}`, 'x-github-api-version': '2026-03-10', 'user-agent': 'OrbitFS-License-Master' }, cache: 'no-store', redirect: 'follow' });
    if (!response.ok) return NextResponse.json({ error: 'GITHUB_ARTIFACT_UNAVAILABLE', status: response.status }, { status: 502 });
    const headers = new Headers(); headers.set('content-type', response.headers.get('content-type') || 'application/octet-stream');
    const length = response.headers.get('content-length'); if (length) headers.set('content-length', length);
    headers.set('cache-control', 'private, no-store');
    headers.set('content-disposition', `attachment; filename="${String(release.artifact_name || `orbitfs-release-${id}.bin`).replace(/[^A-Za-z0-9._-]/g, '_')}"`);
    return new Response(response.body, { status: 200, headers });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Artifact unavailable' }, { status: 503 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await integrationAuthorized(request, 'releases.write'))) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  try {
    const result = await db().query(`select r.id,r.version,r.artifact_repo,r.artifact_name,r.status,r.review_status from releases r where r.id=$1 limit 1`, [id]);
    const release = result.rows[0];
    if (!release) return NextResponse.json({ error: 'RELEASE_NOT_FOUND' }, { status: 404 });
    if (release.status !== 'draft' || release.review_status === 'rejected') return NextResponse.json({ error: 'RELEASE_NOT_UPLOADABLE' }, { status: 409 });
    const repo = String(release.artifact_repo || '').trim();
    const match = repo.match(/^([^/]+)\/([^/]+)$/);
    if (!match) return NextResponse.json({ error: 'ARTIFACT_REPO_NOT_CONFIGURED' }, { status: 400 });
    const [owner, name] = match;
    const bytes = Buffer.from(await request.arrayBuffer());
    if (!bytes.length) return NextResponse.json({ error: 'EMPTY_ARTIFACT' }, { status: 400 });
    let artifactManifest: any = null;
    try {
      artifactManifest = JSON.parse(gunzipSync(bytes).toString('utf8'));
      if (!artifactManifest || typeof artifactManifest !== 'object' || !Array.isArray(artifactManifest.files)) throw new Error('INVALID_ARTIFACT_MANIFEST');
    } catch {
      return NextResponse.json({ error: 'INVALID_ARTIFACT_MANIFEST' }, { status: 400 });
    }
    const tag = `orbitfs-${release.release_type}-${release.version}-${String(release.id).slice(0,8)}`;
    let ghRelease: any;
    try {
      ghRelease = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/tags/${encodeURIComponent(tag)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Not Found|404/i.test(message)) throw error;
      ghRelease = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tag_name: tag, name: `OrbitFS ${release.release_type} ${release.version}`, draft: false, prerelease: false }) });
    }
    const filename = String(request.headers.get('x-artifact-name') || release.artifact_name || `orbitfs-${release.release_type}-${release.version}.bin`).replace(/[^A-Za-z0-9._-]/g, '_');
    const uploadUrl = String(ghRelease.upload_url || '').replace(/\{\?name,label\}$/, '');
    if (!uploadUrl) throw new Error('GITHUB_UPLOAD_URL_MISSING');
    const uploadResponse = await fetch(`${uploadUrl}?name=${encodeURIComponent(filename)}`, { method: 'POST', headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${String(process.env.GITHUB_RELEASE_TOKEN || '').trim()}`, 'content-type': request.headers.get('content-type') || 'application/octet-stream', 'content-length': String(bytes.length), 'x-github-api-version': '2026-03-10', 'user-agent': 'OrbitFS-License-Master' }, body: bytes, cache: 'no-store' });
    const uploadText = await uploadResponse.text(); let asset: any = null; try { asset = uploadText ? JSON.parse(uploadText) : null; } catch {}
    if (!uploadResponse.ok) return NextResponse.json({ error: asset?.message || 'GITHUB_ARTIFACT_UPLOAD_FAILED' }, { status: 502 });
    await db().query(`update releases set artifact_url=$1,artifact_name=$2,manifest=$3 where id=$4`, [asset.browser_download_url ? `https://api.github.com/repos/${owner}/${name}/releases/assets/${asset.id}` : asset.url, filename, JSON.stringify(artifactManifest), id]);
    const updated = (await db().query(`select r.*,p.slug product,p.name product_name from releases r join products p on p.id=r.product_id where r.id=$1`, [id])).rows[0];
    return NextResponse.json({ ok: true, release: updated, artifact: { name: filename, size: bytes.length, url: updated.artifact_url } }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to upload release artifact' }, { status: 503 }); }
}
