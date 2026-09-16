import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { publishRelease } from '../../../../../lib/core/releases';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await integrationAuthorized(request, 'releases.write');
  if (!auth) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  try {
    const release = await publishRelease(id);
    if (!release) return NextResponse.json({ error: 'RELEASE_NOT_FOUND_OR_NOT_APPROVED' }, { status: 409 });
    return NextResponse.json({ release });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to publish release' }, { status: 400 });
  }
}
