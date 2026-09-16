import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../../lib/auth';
import { db } from '../../../../../../lib/db';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await integrationAuthorized(request, 'releases.read'))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;
  const result = await db().query(
    `select r.id,r.artifact_url,r.status,r.review_status,r.product_id,r.release_type
       from releases r where r.id=$1 limit 1`,
    [id]
  );
  const release = result.rows[0];
  if (!release) return NextResponse.json({ error: 'RELEASE_NOT_FOUND' }, { status: 404 });
  if (release.status !== 'published' || release.review_status !== 'approved') {
    return NextResponse.json({ error: 'RELEASE_NOT_AVAILABLE' }, { status: 409 });
  }
  if (!release.artifact_url) return NextResponse.json({ error: 'RELEASE_ARTIFACT_NOT_CONFIGURED' }, { status: 404 });

  return NextResponse.redirect(release.artifact_url, 302);
}
