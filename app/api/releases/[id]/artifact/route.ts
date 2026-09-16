import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await integrationAuthorized(request, 'releases.read');
  if (!auth) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const row = (await db().query(`select artifact_url,status,review_status,artifact_name from releases where id=$1 limit 1`, [id])).rows[0];
  if (!row) return NextResponse.json({ error: 'RELEASE_NOT_FOUND' }, { status: 404 });
  if (row.status !== 'published' || row.review_status !== 'approved') return NextResponse.json({ error: 'RELEASE_NOT_PUBLISHED' }, { status: 409 });
  if (!row.artifact_url) return NextResponse.json({ error: 'ARTIFACT_NOT_CONFIGURED' }, { status: 404 });
  const headers = new Headers({ accept: 'application/octet-stream', 'user-agent': 'OrbitFS-License-Master/2' });
  const token = String(process.env.GITHUB_TOKEN || '').trim();
  if (token) headers.set('authorization', `Bearer ${token}`);
  try {
    const upstream = await fetch(row.artifact_url, { headers, redirect: 'follow', cache: 'no-store' });
    if (!upstream.ok) return NextResponse.json({ error: `ARTIFACT_FETCH_FAILED_${upstream.status}` }, { status: 502 });
    const responseHeaders = new Headers();
    responseHeaders.set('content-type', upstream.headers.get('content-type') || 'application/octet-stream');
    responseHeaders.set('cache-control', 'private, no-store');
    if (row.artifact_name) responseHeaders.set('content-disposition', `attachment; filename="${String(row.artifact_name).replace(/[^A-Za-z0-9._-]/g, '_')}"`);
    const length = upstream.headers.get('content-length');
    if (length) responseHeaders.set('content-length', length);
    return new NextResponse(upstream.body, { status: 200, headers: responseHeaders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to fetch artifact' }, { status: 502 });
  }
}
