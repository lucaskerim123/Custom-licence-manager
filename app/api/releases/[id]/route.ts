import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../lib/auth';
import { updateReleasePresentation } from '../../../../lib/core/releases';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await integrationAuthorized(request, 'releases.write');
  if (!auth) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const release = await updateReleasePresentation(id, body);
    if (!release) return NextResponse.json({ error: 'RELEASE_NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ release });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update release' }, { status: 400 });
  }
}
