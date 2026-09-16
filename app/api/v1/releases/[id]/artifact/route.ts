import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../../lib/auth';
import { db } from '../../../../../../lib/db';

export const runtime = 'nodejs';

function githubAssetUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname !== 'api.github.com') return null;
    const match = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases\/assets\/(\d+)$/);
    if (!match) return null;
    return { owner: match[1], repo: match[2], assetId: match[3] };
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await integrationAuthorized(request, 'releases.read'))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;
  const result = await db().query(
    `select r.id,r.artifact_url,r.status,r.review_status,r.product_id,r.release_type,r.artifact_name
       from releases r where r.id=$1 limit 1`,
    [id]
  );
  const release = result.rows[0];
  if (!release) return NextResponse.json({ error: 'RELEASE_NOT_FOUND' }, { status: 404 });
  if (release.status !== 'published' || release.review_status !== 'approved') {
    return NextResponse.json({ error: 'RELEASE_NOT_AVAILABLE' }, { status: 409 });
  }
  if (!release.artifact_url) return NextResponse.json({ error: 'RELEASE_ARTIFACT_NOT_CONFIGURED' }, { status: 404 });

  const github = githubAssetUrl(String(release.artifact_url));
  if (!github) return NextResponse.redirect(release.artifact_url, 302);

  const token = String(process.env.GITHUB_RELEASE_TOKEN || '').trim();
  if (!token) return NextResponse.json({ error: 'GITHUB_RELEASE_TOKEN_NOT_CONFIGURED' }, { status: 503 });

  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(github.owner)}/${encodeURIComponent(github.repo)}/releases/assets/${github.assetId}`, {
    headers: {
      accept: 'application/octet-stream',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2026-03-10',
      'user-agent': 'OrbitFS-License-Master'
    },
    cache: 'no-store',
    redirect: 'follow'
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'GITHUB_ARTIFACT_UNAVAILABLE', status: response.status }, { status: 502 });
  }

  const headers = new Headers();
  headers.set('content-type', response.headers.get('content-type') || 'application/octet-stream');
  const length = response.headers.get('content-length');
  if (length) headers.set('content-length', length);
  headers.set('cache-control', 'private, no-store');
  headers.set('content-disposition', `attachment; filename="${String(release.artifact_name || `orbitfs-release-${id}.bin`).replace(/[^A-Za-z0-9._-]/g, '_')}"`);

  return new Response(response.body, { status: 200, headers });
}
